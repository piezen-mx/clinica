# 33 — Facturación: refrescar el RFC local tras subir/eliminar el CSD

## Header

- **Estado:** Aprobado
- **Depende de:** Spec 28 (`BILLING.organizations`, `organizationsRepository.ts` — `updateOrganizationLegal`, `insertOrganization`; `uploadCertificate`/`deleteCertificate` en `app/dashboard/facturacion/actions.ts`; `OrganizationCertificateSection.tsx`). Sustituye al spec 32 (`Obsoleto` — ver su nota de implementación), que intentaba resolver el mismo problema con un campo de formulario que Facturapi rechaza.
- **Fecha:** 2026-08-27
- **Objetivo:** Mantener sincronizada la copia local (`BILLING.organizations.tax_id`/`country`, y el resto de los datos legales) con lo que Facturapi realmente tiene después de subir o eliminar el certificado de sello digital (CSD) de una organización — que es, confirmado con soporte de Facturapi, el mecanismo real por el que cada organización obtiene su propio RFC en una cuenta con el add-on multi-RFC contratado.

## Contexto — por qué este spec y no el 32

El spec 32 asumía que `tax_id` se podía enviar como campo de formulario a `organizations.updateLegal`. Se implementó, se probó en vivo contra la cuenta real y Facturapi lo rechazó (`400 organization_settings_invalid`, `path: "tax_id"`), igual que `address.country`. Soporte de Facturapi confirmó por escrito:

> El RFC (`tax_id`) no se envía manualmente en ese endpoint. El RFC se asigna automáticamente cuando subes el Certificado de Sello Digital (CSD) de la organización... En cuentas multi-RFC, cada organización tiene su propio CSD y su RFC se infiere de ese certificado.

Se verificó manualmente: subir un CSD con un RFC distinto a "Spec 29 Test Org" cambió el RFC mostrado en el detalle y el listado de `XIA190128J61` a `AUWE980427HF5`, **sin ningún cambio de código** — porque `getOrganizationDetail` y `listOrganizations` ya leen los datos legales en vivo desde Facturapi (`organizations.retrieve`/`organizations.list`), no de la copia local.

El multi-RFC, como funcionalidad visible en la UI, **ya existe** desde el spec 28. Lo único que no está sincronizado es la copia local en `BILLING.organizations`, que se llena al crear la organización y nunca se vuelve a tocar — ni siquiera cuando cambia el CSD.

## Alcance

**Incluye:**

- **`uploadCertificate`** (`app/dashboard/facturacion/actions.ts`): después de que Facturapi confirma la subida del CSD, refrescar en la misma operación los campos legales de la fila local (`tax_id`, `country`, y el resto de `OrganizationLegalInput`) con lo que devuelve `organizations.uploadCertificate` en `org.legal`.
- **`deleteCertificate`**: mismo refresco, con lo que devuelve `organizations.deleteCertificate` en `org.legal`, sea cual sea el RFC que Facturapi reporte tras quitar el certificado.
- **Extraer un mapeo compartido** `Organization["legal"]` (de Facturapi) → `OrganizationLegalInput` (local), hoy duplicado a mano dentro de `createOrganization` y `updateOrganizationLegal`, para no triplicarlo/cuadruplicarlo al agregar estos dos nuevos call sites.
- **Verificación manual** de que el RFC local queda sincronizado tras subir y tras eliminar un CSD, sin depender de otra edición manual de los datos legales.

**No incluye (fuera de alcance):**

- **Ningún cambio a la UI.** `OrganizationCertificateSection.tsx` no cambia — ya funciona y ya dispara `revalidatePath`, que es lo que hace visible el RFC actualizado (leído en vivo de Facturapi, no de la BD).
- **Ningún cambio a `createOrganization`/`updateOrganizationLegal` más allá del refactor de extraer el mapeo compartido.** Sus flujos ya quedaron correctos tras revertir el spec 32 (no envían `tax_id`/`country` a Facturapi).
- **Validar o alertar sobre el RFC que Facturapi reporte tras eliminar un CSD.** Sea cual sea el valor (el de la cuenta, vacío, u otro), este spec solo lo persiste tal cual — no juzga si es "correcto" fiscalmente.
- **Backfill de organizaciones existentes cuya copia local ya esté desincronizada.** Solo se corrige hacia adelante, en la siguiente subida/eliminación de CSD de cada organización. Si se necesita corregir el histórico, es un spec aparte (mismo criterio que spec 32 aplicó a la migración de RFC).

## Modelo de datos

No hay cambios de esquema ni de `interfaces/organization.ts`. `OrganizationLegalInput` ya cubre todos los campos que se van a refrescar; `updateOrganizationLegal` (repositorio) ya acepta ese shape completo y ya es lo que usa `app/dashboard/facturacion/actions.ts:updateOrganizationLegal` para escribir la copia local — se reutiliza tal cual, sin tocar el repositorio.

## Plan de implementación

### 1. `app/dashboard/facturacion/actions.ts` — extraer el mapeo `Organization["legal"]` → `OrganizationLegalInput`

Agregar una función privada (no exportada) cerca de `assertOwnedOrganization`:

```ts
function organizationLegalFromFacturapi(org: Organization): OrganizationLegalInput {
  const { legal } = org;
  return {
    name: legal.name,
    legal_name: legal.legal_name,
    tax_id: legal.tax_id,
    tax_system: legal.tax_system,
    phone: legal.phone ?? null,
    website: legal.website ?? null,
    support_email: legal.support_email ?? null,
    street: legal.address.street ?? null,
    exterior: legal.address.exterior ?? null,
    interior: legal.address.interior ?? null,
    neighborhood: legal.address.neighborhood ?? null,
    zip: legal.address.zip ?? null,
    city: legal.address.city ?? null,
    municipality: legal.address.municipality ?? null,
    state: legal.address.state ?? null,
    country: legal.address.country ?? null,
  };
}
```

Reemplazar el mapeo manual que hoy hace `updateOrganizationLegal` (la action) al llamar a `updateOrganizationLegalRecord` — hoy escribe `{ ...data, tax_id: org.legal.tax_id, country: org.legal.address.country }`, mezclando lo que mandó el formulario con lo que confirmó Facturapi. Pasa a ser `organizationLegalFromFacturapi(org)` completo, para que la copia local siempre refleje exactamente lo que Facturapi tiene, no una mezcla.

`createOrganization` (`insertOrganization`) puede seguir como está — inserta con un mapeo ligeramente distinto (incluye `uid`/`id_empresa`/`testKey`) que no vale la pena forzar dentro del mismo helper; no es su objetivo revisarlo aquí.

*Verificación:* `npx tsc --noEmit` compila; el comportamiento de `updateOrganizationLegal` (la action) no cambia observablemente — sigue guardando lo que confirma Facturapi, ahora también para los campos que antes tomaba de `data` sin pasar por Facturapi (p. ej. si Facturapi normaliza algún campo, la copia local ahora lo refleja).

### 2. `app/dashboard/facturacion/actions.ts` — `uploadCertificate` refresca la copia local

Después de `const org = await getRootClient().organizations.uploadCertificate(orgId, cerFile, keyFile, password);`, envolver el resto de la función en `db.transaction` (como ya hacen `createOrganization`/`updateOrganizationLegal`) para persistir el refresco y la entrada de auditoría juntos:

```ts
await db.transaction(async (tx) => {
  await updateOrganizationLegalRecord(tx, orgId, id_empresa, organizationLegalFromFacturapi(org));
  await writeAuditEntry(tx, {
    id_empresa,
    id_user,
    action: "cert.upload",
    org_uid: orgId,
  });
});
```

*Verificación:* subir un CSD con RFC distinto al que tiene la organización → `SELECT tax_id FROM [BILLING].[organizations] WHERE uid = '<uid>'` muestra el RFC nuevo inmediatamente después, sin necesidad de editar los datos legales por separado.

### 3. `app/dashboard/facturacion/actions.ts` — `deleteCertificate` refresca la copia local

Mismo cambio, con el `org` que devuelve `organizations.deleteCertificate(uid)`:

```ts
await db.transaction(async (tx) => {
  await updateOrganizationLegalRecord(tx, uid, id_empresa, organizationLegalFromFacturapi(org));
  await writeAuditEntry(tx, {
    id_empresa,
    id_user,
    action: "cert.delete",
    org_uid: uid,
  });
});
```

*Verificación:* eliminar el CSD de una organización → `SELECT tax_id` refleja lo que Facturapi reporte tras la eliminación (sea cual sea ese valor — ver "No incluye").

### 4. Verificación manual completa

Con Facturapi en modo Test:

- Subir un CSD con RFC distinto al actual de una organización → el listado y el detalle ya lo mostraban (comportamiento existente, sin cambios); ahora además `SELECT tax_id FROM [BILLING].[organizations]` coincide, sin editar nada más.
- Eliminar ese CSD → `SELECT tax_id` se actualiza otra vez al valor que Facturapi reporte.
- Editar los datos legales desde el formulario (flujo existente, spec 28) sigue funcionando igual que antes.
- `npm run build` y `npm run lint` sin errores ni warnings nuevos.

## Criterios de aceptación

- [ ] `organizationLegalFromFacturapi` centraliza el mapeo `Organization["legal"]` → `OrganizationLegalInput`, usado por `updateOrganizationLegal`, `uploadCertificate` y `deleteCertificate`.
- [ ] Subir un CSD con un RFC distinto actualiza `[BILLING].[organizations].[tax_id]` (y el resto de los campos legales) sin necesidad de editar los datos legales por separado.
- [ ] Eliminar un CSD actualiza `[BILLING].[organizations]` con lo que Facturapi reporte después de la eliminación.
- [ ] `uploadCertificate` y `deleteCertificate` persisten el refresco y su entrada de auditoría dentro de la misma `db.transaction`, igual que `createOrganization`/`updateOrganizationLegal`.
- [ ] Ningún cambio de UI, esquema de base de datos, ni de `interfaces/organization.ts`.
- [ ] `npm run build` y `npm run lint` compilan sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **Refrescar toda la fila legal, no solo `tax_id`/`country`.** Facturapi es la autoridad sobre todos esos campos una vez que confirma la operación (mismo criterio que ya aplicaba `updateOrganizationLegal`); refrescar solo dos columnas dejaría la fila local parcialmente desincronizada si Facturapi normaliza o ajusta algo más al procesar el CSD.
- **Extraer `organizationLegalFromFacturapi` en vez de duplicar el mapeo una tercera y cuarta vez.** El mapeo `org.legal` → `OrganizationLegalInput` ya estaba escrito a mano dos veces (`createOrganization`, `updateOrganizationLegal`); agregarlo sin extraerlo en `uploadCertificate`/`deleteCertificate` lo hubiera dejado cuadruplicado.
- **Sin backfill de organizaciones ya desincronizadas.** Mismo criterio que el spec 32 aplicó a la migración de RFC: se corrige hacia adelante: la siguiente vez que se suba/elimine un CSD (o se editen los datos legales) en cada organización, su fila local se sincroniza. No hay un paso automático para las que no vuelvan a tocarse.
- **No se valida el RFC que Facturapi devuelva tras eliminar un CSD.** No se conoce de antemano si Facturapi lo deja vacío, lo revierte al de la cuenta, o algo distinto — este spec simplemente persiste lo que sea que reporte, sin agregar lógica especial para ese caso.

## Riesgos identificados

- **No se ha verificado qué RFC exacto devuelve Facturapi al eliminar un CSD.** Si el valor resultante no es el esperado por el negocio (p. ej. si vuelve a ser el de la cuenta compartida en vez de quedar vacío), la fila local lo reflejará tal cual — no es un bug de este spec, pero puede sorprender si nadie lo prueba antes de depender de ese dato. *Mitigación:* el paso de verificación manual (sección 4) incluye explícitamente probar la eliminación, no solo la subida.
- **El refactor de `updateOrganizationLegal` cambia sutilmente qué se persiste.** Antes se guardaba `{ ...data, tax_id: org.legal.tax_id, country: org.legal.address.country }` (mezcla de formulario + Facturapi); después de este spec se guarda `organizationLegalFromFacturapi(org)` completo (todo de Facturapi). Si Facturapi normalizara algún campo de forma inesperada (mayúsculas, espacios, etc.), la copia local podría diferir ligeramente de lo que el usuario tecleó — aunque siempre coincidirá con lo que Facturapi realmente tiene, que es la fuente de verdad ya declarada en el resto del módulo. *Mitigación:* el criterio de aceptación de verificación manual (sección 4) incluye reprobar la edición de datos legales existente para confirmar que no regresiona.
