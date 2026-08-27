# 32 — Facturación: RFC propio por organización (multi-RFC)

## Nota de implementación (2026-08-27) — spec bloqueado, revertido

Al implementar el plan se probó en vivo contra la cuenta real de Facturapi (modo Test):
`organizations.updateLegal` rechaza **tanto `tax_id` como `address.country`** con
`400 organization_settings_invalid` (`"El campo \"tax_id\" no está permitido"` /
`"El campo \"address.country\" no está permitido"`), contradiciendo la premisa del spec
de que el add-on multi-RFC ya contratado en la cuenta habilita `tax_id` editable por
organización vía este endpoint. No se encontró en el SDK (`facturapi@4.20.0`) ningún
endpoint alternativo para fijar el RFC por organización.

Se abortó la implementación y se revirtieron todos los cambios de código de este spec
(`lib/billing/schemas.ts`, `app/dashboard/facturacion/actions.ts`,
`CreateOrganizationModal.tsx`, `OrganizationLegalSection.tsx`, `docs/facturacion.md`) —
el módulo queda en el mismo estado que antes de este spec (RFC de solo lectura, heredado
de la cuenta, tal como documentaba el spec 28 originalmente).

**Antes de reabrir este spec:** confirmar con soporte de Facturapi o su dashboard de
cuenta si el add-on multi-RFC está realmente activo y, si lo está, qué endpoint/flujo
específico expone para fijarlo (no es `organizations.create` + `organizations.updateLegal`,
que es lo único que expone el SDK usado por este módulo).

## Header

- **Estado:** Obsoleto — bloqueado en implementación, ver nota abajo.
- **Depende de:** Spec 28 (`CreateOrganizationSchema`, `UpdateOrganizationLegalSchema`, `organizationsRepository.ts`, `createOrganization`/`updateOrganizationLegal` en `app/dashboard/facturacion/actions.ts`, `CreateOrganizationModal.tsx`, `OrganizationLegalSection.tsx`), Spec 29 (`RFC_REGEX` de `CustomerSchema`). No depende de las specs 30-31 salvo por convención (no las modifica).
- **Fecha:** 2026-08-27
- **Objetivo:** Permitir que cada organización de Facturapi tenga su propio RFC (`tax_id`), aprovechando el add-on multi-RFC ya contratado en la cuenta, en vez de heredarlo fijo de la cuenta como asume hoy el módulo.

## Alcance

**Incluye:**

- **Alta de organización** (`CreateOrganizationModal.tsx` / `createOrganization`): el formulario pide RFC (`tax_id`) como campo obligatorio, junto con los datos que ya pedía. `country` se envía fijo como `"MEX"`, sin ser un input.
- **Edición de datos fiscales** (`OrganizationLegalSection.tsx` / `updateOrganizationLegal`): el RFC pasa de solo-lectura (derivado de la respuesta de Facturapi) a campo editable, con la misma validación que en la creación.
- **Validación**: `tax_id` se valida con el mismo `RFC_REGEX` que ya usa `CustomerSchema` (persona moral/física mexicana), normalizado a mayúsculas.
- **Actualizar `docs/facturacion.md`**: corregir la nota "RFC and country are shared across every organization in the account, not unique per organization" — ahora depende de si el add-on multi-RFC está contratado; documentar que en esta cuenta sí lo está y que `tax_id` es editable por organización.
- **Actualizar comentarios en código** que hoy afirman que Facturapi v2 rechaza `tax_id`/`country` (en `CreateOrganizationSchema`, `UpdateOrganizationLegalSchema`, ambos componentes) para que reflejen el comportamiento real.

**No incluye (para specs futuras):**

- **Migración/backfill de organizaciones existentes.** No hay paso automático para asignarles un RFC propio; se edita a mano desde General si hace falta.
- **Columna de RFC en el listado de organizaciones** (`OrganizationsTable.tsx`). El listado no cambia; el RFC se ve al entrar al detalle de cada organización.
- **RFC de extranjero / país distinto a México.** `country` queda fijo a `"MEX"`; no se contempla el RFC genérico `XEXX010101000` ni direcciones fuera de México.
- **Cambios en Clientes, Productos, Facturas o Personalizar.** Ninguna de esas pestañas referencia el RFC de la organización emisora directamente; Facturapi ya usa el RFC correcto de cada organización al timbrar, sin cambios en esos módulos.
- **Validación de unicidad de RFC entre organizaciones.** Si Facturapi permite o rechaza RFC duplicados entre organizaciones de la misma cuenta, se deja a su propia validación — no se agrega un chequeo local.

## Modelo de datos

No hay cambios de base de datos ni de `interfaces/organization.ts`. `[BILLING].[organizations].[tax_id]` y `[country]` ya existen como columnas (spec 28) y ya se escriben en `insertOrganization`/`updateOrganizationLegal`; hoy se llenan con el valor que Facturapi devuelve (`org.legal.tax_id`, fijo a nivel de cuenta), y con este spec pasan a llenarse con el valor que Facturapi devuelve **después de aceptar el `tax_id` enviado por el usuario** — la escritura a SQL Server no cambia, solo cambia qué manda el formulario a Facturapi.

Cambian dos schemas en `lib/billing/schemas.ts`:

```ts
// CreateOrganizationSchema — agrega tax_id, quita la nota de "no incluye tax_id ni country"
export const CreateOrganizationSchema = z.object({
  name: requiredText("El nombre comercial"),
  legal_name: requiredText("La razón social"),
  tax_id: requiredText("El RFC", 13)
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(RFC_REGEX, "El RFC no tiene un formato válido")),
  tax_system: requiredText("El régimen fiscal", 10).regex(TAX_SYSTEM_REGEX, /* ... */),
  street: requiredText("La calle"),
  exterior: requiredText("El número exterior", 50),
  neighborhood: requiredText("La colonia"),
  zip: requiredText("El código postal", 10).regex(ZIP_REGEX, /* ... */),
  city: requiredText("La ciudad"),
  municipality: requiredText("El municipio"),
  state: requiredText("El estado"),
  // country ya no es un campo del schema: se fija a "MEX" en la action, no en el formulario
});

// UpdateOrganizationLegalSchema sigue siendo CreateOrganizationSchema.extend({...}) sin cambios ahí
```

`RFC_REGEX` se mueve (o se reexporta) desde la sección de Clientes/Productos hacia el bloque compartido del archivo, ya que ahora lo usan dos secciones distintas del mismo módulo.

## Plan de implementación

### 1. `lib/billing/schemas.ts` — mover `RFC_REGEX` y actualizar `CreateOrganizationSchema`

Mover la constante `RFC_REGEX` (hoy definida junto a `CustomerSchema`) al bloque de constantes compartidas al inicio del archivo, junto a `ZIP_REGEX`/`TAX_SYSTEM_REGEX`. Agregar `tax_id` a `CreateOrganizationSchema` con la misma validación que `CustomerSchema.tax_id`. Reescribir el comentario del schema: ya no dice que Facturapi v2 rechaza `tax_id`/`country`, sino que el RFC es editable por organización gracias al add-on multi-RFC contratado en la cuenta, y que `country` se fija a `"MEX"` fuera del formulario.

*Verificación:* un RFC con formato inválido (`"123"`) es rechazado por el schema; `npm run build` compila.

### 2. `app/dashboard/facturacion/actions.ts` — `createOrganization` y `updateOrganizationLegal`

- `createOrganization`: en la llamada a `getRootClient().organizations.updateLegal(...)`, agregar `tax_id: data.tax_id` y `address: { ..., country: "MEX" }`.
- `updateOrganizationLegal`: mismo cambio — agregar `tax_id: data.tax_id` y `country: "MEX"` en el payload enviado a Facturapi. Eliminar el comentario `// Sin tax_id ni address.country: Facturapi v2 los rechaza en updateLegal…`; el resto de la función (guardar en BD lo que Facturapi confirma en su respuesta) no cambia.
- Actualizar el comentario de cabecera del archivo y el de `assertOwnedOrganization`/sección "Filtro por tenant" si hacen referencia al RFC compartido.

*Verificación:* crear una organización con un RFC de prueba distinto al de otras organizaciones existentes; `SELECT tax_id FROM [BILLING].[organizations]` muestra el RFC correcto para cada una.

### 3. UI — `CreateOrganizationModal.tsx`

Agregar `tax_id` a `FormState`/`buildEmptyForm`, un input de texto (`* RFC`, `maxLength={13}`, mayúsculas) en la sección "Datos fiscales", y eliminar el párrafo "El RFC y el país quedan fijos...".

*Verificación:* crear una organización sin RFC muestra el error de campo requerido antes de tocar Facturapi.

### 4. UI — `OrganizationLegalSection.tsx`

Agregar `tax_id` a `FormState` y a `organizationToForm` (ya no se omite). Agregar el input de RFC en el modo edición, junto a "Razón social". Eliminar el párrafo "El RFC y el país quedan fijos…" del modo edición. La vista de solo-lectura ya muestra `legal.tax_id` (`InfoRow label="RFC"`), no cambia.

*Verificación:* editar el RFC de una organización existente, guardar, recargar y confirmar que persiste tanto en Facturapi (`organizations.retrieve`) como en `SELECT tax_id` de la BD.

### 5. Documentación

Actualizar `docs/facturacion.md`: reemplazar la nota "RFC and country are shared across every organization in the account, not unique per organization" por una que explique que esto depende de si la cuenta tiene el add-on multi-RFC de Facturapi contratado (esta cuenta sí lo tiene), y que `tax_id` es editable por organización mientras que `country` sigue fijo a `"MEX"` por decisión de producto, no por limitación de la API.

### 6. Verificación manual completa

Con Facturapi en modo Test:

- Crear dos organizaciones con RFC distintos → ambas se crean sin error, cada una muestra su propio RFC en General.
- Editar el RFC de una organización existente a uno distinto → persiste tras recargar.
- Intentar crear una organización con un RFC de formato inválido → rechazado por el schema, sin llegar a Facturapi.
- `SELECT uid, tax_id FROM [BILLING].[organizations]` confirma RFC distintos por fila.
- Recorrer el modal de alta y la pestaña General en claro/oscuro.
- `npm run build` y `npm run lint` sin errores ni warnings nuevos.

## Criterios de aceptación

- [ ] `CreateOrganizationSchema` exige `tax_id` con el mismo formato que `RFC_REGEX` de `CustomerSchema` (normalizado a mayúsculas); un RFC inválido se rechaza antes de llamar a Facturapi.
- [ ] `RFC_REGEX` vive en un solo lugar de `lib/billing/schemas.ts`, reutilizado por `CustomerSchema` y `CreateOrganizationSchema`.
- [ ] `createOrganization` envía `tax_id` (del formulario) y `country: "MEX"` (fijo) en la llamada a `organizations.updateLegal`.
- [ ] `updateOrganizationLegal` envía `tax_id` y `country: "MEX"` de la misma forma, y permite cambiar el RFC de una organización existente.
- [ ] `CreateOrganizationModal.tsx` incluye un campo de RFC obligatorio; ya no muestra el aviso de "RFC y país fijos".
- [ ] `OrganizationLegalSection.tsx` permite editar el RFC en modo edición; ya no muestra el aviso de "RFC y país fijos".
- [ ] Crear dos organizaciones con RFC distintos deja cada una con su propio `tax_id` tanto en Facturapi como en `[BILLING].[organizations]`.
- [ ] Ningún archivo del módulo sigue afirmando en comentarios que Facturapi v2 rechaza `tax_id`/`country` por organización.
- [ ] `docs/facturacion.md` refleja que el RFC es editable por organización (dependiente del add-on multi-RFC contratado) y que `country` se fija a `"MEX"` por decisión de producto.
- [ ] No hay cambios de esquema de base de datos ni en `interfaces/organization.ts`.
- [ ] `npm run build` y `npm run lint` compilan sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **Verificar el add-on multi-RFC contra la cuenta real antes de tocar código.** La documentación pública de Facturapi y el propio `docs/facturacion.md` de este repo se contradecían (spec 28 documentó que `tax_id`/`country` son rechazados por Facturapi v2; la guía pública dice que multi-RFC es una función estándar de la API). En vez de adivinar cuál era cierto, se confirmó con el usuario que el add-on está contratado en la cuenta — el rechazo original era una limitación de plan, no de la API v2 en sí.

- **`country` fijo a `"MEX"`, no un campo del formulario.** Se descartó exponerlo como input libre (como en `CustomerSchema`) porque todas las organizaciones de esta cuenta son entidades fiscales mexicanas; agregar un campo sin catálogo ni validación real solo abriría la puerta a errores de captura sin beneficio actual. Si en el futuro se necesita un emisor extranjero, es un spec aparte.

- **Reusar `RFC_REGEX` de `CustomerSchema` en vez de un patrón nuevo.** Evita dos definiciones de "qué es un RFC válido" en el mismo módulo, que podrían divergir con el tiempo.

- **Sin migración/backfill de organizaciones existentes.** Las organizaciones creadas antes de este spec conservan el RFC que Facturapi les haya asignado hasta que alguien las edite manualmente desde General. Un backfill automático requeriría decidir qué RFC asignarle a cada una sin que el usuario lo haya pedido — decisión de negocio, no técnica, que no corresponde tomar aquí.

- **Sin columna de RFC en el listado de organizaciones.** El listado (`OrganizationsTable.tsx`) ya identifica cada organización por nombre; agregar el RFC ahí es una mejora de UX independiente que no bloquea la funcionalidad de este spec — se deja fuera para no ensanchar el alcance.

- **Sin validación local de unicidad de RFC entre organizaciones.** Se delega en Facturapi (que sabe si su plan permite RFC duplicados o no) en vez de duplicar esa regla de negocio en `zod`, que podría divergir de lo que Facturapi realmente permite.

## Riesgos identificados

- **El add-on multi-RFC podría no cubrir todas las llamadas del módulo de la misma forma.** Se confirmó que la cuenta lo tiene contratado, pero no se verificó a nivel de cada endpoint (p. ej. si `organizations.create` en un solo paso también lo acepta, o si sigue siendo obligatorio el flujo en dos pasos `create` + `updateLegal` que ya usa el módulo). *Mitigación:* el plan mantiene el flujo en dos pasos ya existente (spec 28), que es el que se sabe que funciona contra esta cuenta; no se intenta colapsarlo en una sola llamada sin haberlo probado.

- **Cambiar el RFC de una organización con facturas ya emitidas puede ser fiscalmente inconsistente.** Facturapi no impide editar `tax_id` después de timbrar comprobantes con el RFC anterior, y esto podría generar confusión sobre qué RFC emitió qué factura. *Mitigación:* se acepta el riesgo tal como ya se acepta para el resto de datos legales editables (razón social, régimen fiscal); no se agrega una advertencia especial en este spec porque el resto del módulo tampoco las tiene para cambios igualmente sensibles.

- **`country` fijo a `"MEX"` bloquea silenciosamente el caso de un emisor extranjero.** Si en el futuro la clínica necesita facturar desde una entidad no mexicana, el formulario no lo permite y no hay mensaje explicativo de por qué. *Mitigación:* aceptado — no es un caso de uso actual; documentado en la sección "No incluye".

- **La cuenta de Facturapi podría revocar o cambiar las condiciones del add-on.** Si el add-on se da de baja, las llamadas con `tax_id` distinto volverían a fallar como documentaba el spec 28 originalmente. *Mitigación:* el mensaje de error de Facturapi pasa por `toUserMessage`, que ya registra el error completo en el log del servidor — si esto ocurre, aparecerá ahí con detalle suficiente para diagnosticarlo.
