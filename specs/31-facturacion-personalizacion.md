# 31 — Facturación: personalización del comprobante

## Header

- **Estado:** Implementado
- **Depende de:** Spec 28 (`getOrgClient`, `lib/billing/schemas.ts` con la validación de archivo por magic
  bytes, `lib/billing/errors.ts`, `lib/auth/session.ts`, `BILLING.audit_log`, `OrgTabs`), Spec 30
  (indicador de modo Live en el layout de la organización). No modifica base de datos.
- **Fecha:** 2026-08-26
- **Objetivo:** Habilitar la pestaña **Personalizar** del detalle de organización: logo, color de marca,
  series de folios por defecto y opciones del PDF del comprobante. Es la última pieza del módulo y la de
  menor riesgo — no toca credenciales ni emite comprobantes.

## Alcance

**Incluye:**

### Pantalla `/dashboard/facturacion/[id]/customize`

- **Logo**: subir y reemplazar el logo que Facturapi imprime en el PDF, con vista previa.
- **Apariencia**: color de marca y opciones de presentación del PDF (`pdf_extra`).
- **Series por defecto**: serie de facturas y siguiente folio.
- Server actions en `app/dashboard/facturacion/[id]/customize/actions.ts`, portando
  `uploadOrganizationLogo` (`organizations.ts:257-270`) y `updateOrganizationCustomization`
  (`organizations.ts:293-305`) del proyecto original, que hoy viven en el `actions.ts` de organizaciones.

### Validación

- Schemas nuevos en `lib/billing/schemas.ts`: `UploadLogoSchema` y `OrganizationCustomizationSchema`.
- `UploadLogoSchema` valida tipo real y tamaño del archivo reusando el validador por magic bytes que el
  spec 28 creó para el CSD (a su vez tomado de `app/api/upload/route.ts`). El original acepta cualquier
  archivo de cualquier tamaño (`organizations.ts:261-262`, con casts `as File`).
- `OrganizationCustomizationSchema` valida el color como hexadecimal y el folio como entero positivo.

### Bitácora

Se amplía el catálogo de `BILLING.audit_log` con `org.upload_logo` y `org.update_customization`.

**No incluye (para specs futuras):**

- **Plantillas de PDF propias.** Solo se exponen las opciones que Facturapi ofrece; no se genera un PDF
  propio.
- **Logo o color por sucursal.** La personalización es de la organización fiscal, coherente con el filtro
  por `id_empresa` sin `id_sucursal` del spec 28.
- **Subir el logo a Cloudinary.** El logo lo aloja Facturapi, que es quien imprime el PDF; pasarlo por
  `app/api/upload` no aportaría nada.
- **Vista previa del PDF con los cambios aplicados** antes de guardar.

## Modelo de datos

No hay cambios de base de datos. Se agrega un tipo de formulario a `interfaces/organization.ts`:

```ts
/** Opciones de personalización del comprobante que expone Facturapi. */
export interface IOrganizationCustomizationInput {
  color:        string | null;   // hexadecimal, validado
  next_folio:   number | null;   // entero positivo
  invoice_series: string | null;
  pdf_extra:    Record<string, string | boolean | null>;
}
```

## Plan de implementación

### 1. Schemas de validación — `lib/billing/schemas.ts` (modificado)

Agregar `UploadLogoSchema` (extensión, tamaño máximo y tipo real por magic bytes, reusando el validador de
archivo del spec 28) y `OrganizationCustomizationSchema` (color hexadecimal, folio entero positivo, serie
alfanumérica corta, `pdf_extra` con claves conocidas).

*Verificación:* un `.txt` renombrado a `.png` es rechazado; un color `"rojo"` es rechazado; un folio `0` o
`-1` es rechazado.

### 2. Server actions — `app/dashboard/facturacion/[id]/customize/actions.ts` (archivo nuevo)

Mover aquí `uploadOrganizationLogo` y `updateOrganizationCustomization`, que en el original viven en
`app/actions/organizations.ts`. Quedan en su propia carpeta porque la pestaña tiene su `actions.ts`, igual
que las sub-pestañas del expediente de empleado (`empleados/[id]/documentos/actions.ts`).

Cambios obligatorios, los mismos del resto del módulo:

1. `requireBillingAccess()` al inicio; el `id_empresa` sale del JWT.
2. `safeParse` antes de tocar Facturapi; nada de casts `as File` / `as string` sobre `FormData`.
3. Cliente vía `getOrgClient(uid, id_empresa)`, que valida pertenencia y resuelve el modo.
4. Retorno `ActionResult<T>`; los `catch` pasan por `toUserMessage`.
5. `revalidatePath("/dashboard/facturacion/[id]/customize")` tras cada mutación.
6. Registrar `org.upload_logo` y `org.update_customization` en `audit_log`.

*Verificación:* subir un archivo de 10 MB es rechazado por el schema, no por Facturapi ni por el límite de
`bodySizeLimit` que fijó el spec 28.

### 3. UI — pestaña Personalizar

`app/dashboard/facturacion/[id]/customize/page.tsx` (Server Component, lee la organización de Facturapi con
`organizations.retrieve`) y en `componentes/`: `LogoSection.tsx` (ex 89 líneas) y
`CustomizationSection.tsx` (ex 151 líneas), reescritos con las clases del repo.

La vista previa del logo usa `next/image`, no un `<img>` crudo (`CLAUDE.md`). Al ser una URL remota de
Facturapi, hay que agregar su host a `images.remotePatterns` en `next.config.ts` (modificado).

Se agrega la pestaña "Personalizar" a `OrgTabs.tsx` (modificado), que con esto queda completa: General,
Clientes, Productos, Facturas, Personalizar.

*Verificación:* subir un logo lo muestra en la vista previa; cambiar el color y guardar persiste en
Facturapi; el PDF de una factura nueva refleja los cambios.

### 4. Cierre del módulo

Actualizar `docs/facturacion.md` con las pestañas completas y el catálogo final de acciones de
`audit_log`. Revisar que la entrada de `CLAUDE.md` siga siendo exacta.

### 5. Verificación manual completa

Con Facturapi en **modo Test**, sobre la organización de los specs anteriores:

- Subir un logo PNG → aparece en la vista previa → aparece en el PDF de una factura nueva.
- Intentar subir un `.txt` renombrado a `.png` → rechazado con mensaje claro.
- Cambiar el color de marca → persiste tras recargar → se refleja en el PDF.
- Cambiar la serie y el siguiente folio → la factura siguiente los usa.
- `SELECT action, id_user FROM [BILLING].[audit_log] WHERE action LIKE 'org.u%'` muestra los registros de
  logo y personalización.
- Recorrer las cinco pestañas en claro y en oscuro y confirmar que se ven consistentes con el resto del
  dashboard.
- `npm run build` y `npm run lint` sin errores ni warnings nuevos.

## Criterios de aceptación

- [x] La pestaña Personalizar aparece en `OrgTabs` y permite subir logo, cambiar color, opciones de PDF y
      series.
- [x] La subida de logo valida extensión, tamaño y tipo real por magic bytes, reusando el validador del
      spec 28; no queda ningún cast `as File` / `as string` sobre `FormData`.
- [x] `OrganizationCustomizationSchema` rechaza colores no hexadecimales y folios no positivos.
- [x] Ambas actions abren con `requireBillingAccess()` y `safeParse`, y usan `getOrgClient` sin parámetro
      `mode`.
- [x] `org.upload_logo` y `org.update_customization` quedan registrados en `BILLING.audit_log`.
- [x] Ningún error crudo de Facturapi llega al cliente.
- [x] La vista previa del logo usa `next/image` y el host de Facturapi está en `images.remotePatterns`.
- [x] Ningún archivo importa `@/components/ui/*` ni `cn`; la pestaña se ve consistente en claro y oscuro.
- [x] `"use client"` solo donde hace falta; la página es Server Component.
- [x] `docs/facturacion.md` refleja el módulo completo.
- [x] `npm run build` y `npm run lint` compilan sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **La personalización se deja al final.** Es la única pestaña que no toca credenciales, no emite
  comprobantes y no expone datos de clientes: si algo del módulo tenía que esperar, es esta.

- **`actions.ts` propio en vez de dejarlas en el `actions.ts` de organizaciones.** En el original ambas
  funciones viven en `app/actions/organizations.ts`, junto a las de CSD y API keys. Aquí siguen la
  convención del repo: cada pestaña con su propio `actions.ts`, como
  `empleados/[id]/documentos/actions.ts`.

- **Validar el archivo del logo aunque sea "solo un logo".** El original acepta cualquier archivo de
  cualquier tamaño. El validador ya existe desde el spec 28 (para el CSD) y reusarlo cuesta una línea; no
  hacerlo dejaría la única subida sin validar del módulo.

- **El logo lo aloja Facturapi, no Cloudinary.** El repo ya tiene `app/api/upload` para Cloudinary, pero
  quien imprime el PDF es Facturapi y necesita el archivo de su lado; pasarlo por Cloudinary agregaría un
  salto y un lugar más donde el logo puede quedar desincronizado.

- **Sin vista previa del PDF antes de guardar.** Requeriría emitir una factura de muestra o construir un
  render propio. Se descarta por costo frente a un beneficio menor: el efecto se comprueba con la siguiente
  factura de prueba.

## Riesgos identificados

- **Cambiar el siguiente folio puede colisionar con folios ya emitidos.** Facturapi rechaza duplicados en
  Live, pero un folio mal capturado deja un hueco en la numeración, que es visible en una auditoría fiscal.
  *Mitigación:* el campo se valida como entero positivo y la interfaz muestra el folio actual junto al
  campo; no se impide bajarlo, porque a veces es lo correcto.

- **La personalización afecta a los comprobantes en modo Live.** Es la única pestaña de este spec con
  consecuencia externa: un logo o un color mal puestos aparecen en comprobantes fiscales reales. El
  indicador de modo Live del spec 30 es visible también aquí, que es justamente por qué se renderiza desde
  el layout y no desde la pestaña de facturas.

- **`images.remotePatterns` amplía la superficie de `next/image`.** Se agrega solo el host de Facturapi, no
  un comodín.
