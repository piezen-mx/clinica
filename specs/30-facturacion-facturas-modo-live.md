# 30 — Facturación: emisión de facturas y modo Live

## Header

- **Estado:** Implementado
- **Depende de:** Spec 28 (`BILLING.organizations`, `BILLING.audit_log`, `getOrgClient` sin parámetro
  `mode`, `lib/billing/schemas.ts`, `lib/billing/errors.ts`, `lib/auth/session.ts`, `ConfirmModal`),
  Spec 29 (clientes y productos de la organización, que son los insumos de una factura). No modifica base
  de datos.
- **Fecha:** 2026-08-26
- **Objetivo:** Habilitar la pestaña **Facturas** (listar por mes y estado, buscar, crear, ver y descargar
  el PDF, enviar por correo y cancelar con motivo) y **activar el modo Live**, que hasta aquí no existía.
  Es el spec de mayor riesgo del módulo: una factura timbrada en Live es un comprobante fiscal real ante el
  SAT, irreversible, que solo puede cancelarse con motivo. Todas las decisiones de este spec se ordenan
  alrededor de que eso no ocurra por accidente.

## Alcance

**Incluye:**

### Pantalla `/dashboard/facturacion/[id]/invoices`

- Listado de facturas de la organización, filtrable por mes y por estado, con buscador.
- Crear factura de ingreso (tipo `I`): seleccionar cliente, agregar renglones desde los productos de la
  organización, método y forma de pago, uso del CFDI, serie y folio.
- Ver y descargar el PDF de una factura.
- Enviar la factura por correo.
- Cancelar una factura con motivo del SAT.

### Modo Live

- `ModeSwitch` en el encabezado de la organización, que escribe `is_live` en base de datos.
- **El modo deja de ser un parámetro.** Se elimina el query param `?mode=` y el argumento `mode` de todas
  las actions; el modo se resuelve siempre dentro de `getOrgClient` leyendo `is_live` de la fila.
- Precondiciones para activar Live: certificado CSD cargado y `live_key` presente. Confirmación explícita
  con `ConfirmModal` antes de activar.
- Indicador permanente e inconfundible de modo Live, visible en **todas** las pestañas de la organización,
  no solo en el encabezado.
- Confirmación previa al timbrado en Live, mostrando cliente, RFC receptor y total.

### Route handler `app/api/facturacion/organizations/[orgId]/invoices/[invoiceId]/pdf`

- Stream binario del PDF, portado de la ruta homónima del proyecto original (maneja `Blob` y stream de
  Node; su `await params` ya es correcto en Next 16).
- **Se le agregan `requireBillingAccess()` y scoping por `id_empresa`**, y el modo se deriva de la base de
  datos en vez del query param.

### Validación

- Schemas nuevos en `lib/billing/schemas.ts`: `CreateInvoiceSchema`, `CancelInvoiceSchema`,
  `SendInvoiceEmailSchema`, `SetOrgModeSchema`, `InvoicePdfParamsSchema`.
- Cantidades y precios pasan por el parser `money()` del spec 29: nada de `parseFloat`/`parseInt` sin
  verificar `NaN` (`invoices.ts:47,51,57`).
- `CancelInvoiceSchema` restringe el motivo al conjunto de claves válidas del SAT (`01`, `02`, `03`, `04`),
  no a una cadena libre.

### Bitácora

Se amplía el catálogo de `BILLING.audit_log` con `invoice.create`, `invoice.cancel`, `invoice.email`,
`invoice.pdf`, `mode.set_live` y `mode.set_test`. Todos registran `mode`, y los de factura registran el
folio en `target_id`.

**No incluye (para specs futuras):**

- **Personalización del PDF.** Spec 31.
- **Complementos de pago, notas de crédito y carta porte.** Solo se emiten facturas de ingreso (tipo `I`).
- **Facturar automáticamente desde ventas o consultas.** El enlace entre `[ventas]`/`[consultas]` y la
  generación del CFDI sigue pendiente; este spec entrega la emisión manual.
- **Pantalla de bitácora.** `BILLING.audit_log` se sigue escribiendo sin lectura desde la UI.
- **Descarga del XML.** Solo PDF, como el original. El XML es lo que exige el SAT para conservación, así
  que es candidato prioritario para un spec siguiente.
- **Paginación real.** El listado sigue con `limit: 50` acotado por el filtro de mes.
- **Reintento idempotente del timbrado.** Ver Riesgos.

## Modelo de datos

No hay cambios de base de datos. Se agregan tipos de formulario a `interfaces/organization.ts`:

```ts
/** Renglón de una factura en el formulario de captura. */
export interface IInvoiceLineInput {
  product_id: string;    // id del producto en Facturapi
  quantity:   number;    // validado: nunca NaN, > 0
}

/** Datos de captura de una factura de ingreso. */
export interface ICreateInvoiceInput {
  customer_id:    string;
  lines:          IInvoiceLineInput[];
  payment_form:   string;   // clave SAT
  payment_method: string;   // "PUE" | "PPD"
  use:            string;   // uso del CFDI
  series:         string | null;
  folio_number:   number | null;   // validado: nunca NaN
}

/** Motivos de cancelación admitidos por el SAT. */
export type InvoiceCancellationMotive = "01" | "02" | "03" | "04";
```

**El tipo `FacturapiMode` sigue existiendo (spec 28), pero ya no aparece en la firma de ninguna función
que pueda invocarse desde el cliente.** Solo circula dentro de `lib/billing/`.

## Plan de implementación

### 1. Schemas de validación — `lib/billing/schemas.ts` (modificado)

Agregar `CreateInvoiceSchema` (cliente, renglones con cantidad `> 0` vía `money()`, formas y métodos de
pago contra listas cerradas, folio entero opcional), `CancelInvoiceSchema` (motivo en `["01","02","03","04"]`),
`SendInvoiceEmailSchema`, `SetOrgModeSchema` e `InvoicePdfParamsSchema`.

**Ninguno de estos schemas incluye un campo `mode`.** Es deliberado: si el modo no está en el schema, no
puede llegar del cliente.

*Verificación:* `CreateInvoiceSchema.safeParse` falla con cantidad `0`, con cantidad `"abc"` y con un
motivo de cancelación fuera del catálogo.

### 2. Cambio de modo — `app/dashboard/facturacion/actions.ts` (modificado)

Se agrega `setOrgMode(uid, isLive)`, que el spec 28 dejó fuera a propósito. Reglas:

1. `requireBillingAccess()` y `SetOrgModeSchema.safeParse`.
2. Para activar Live, verificar contra Facturapi que la organización **tiene certificado CSD cargado**, y
   contra la base de datos que **tiene `live_key`**. Si falta cualquiera de los dos, devuelve
   `{ ok: false, message }` explicando cuál — no se activa un modo que no puede funcionar.
3. Escribe `is_live` con `setLiveMode(uid, id_empresa, isLive)`.
4. Registra `mode.set_live` / `mode.set_test` en `audit_log`.

*Verificación:* intentar activar Live en una organización sin CSD devuelve error y `is_live` sigue en `0`.

### 3. Server actions de facturas — `app/dashboard/facturacion/[id]/invoices/actions.ts` (archivo nuevo)

Porta `app/actions/invoices.ts` (114 líneas, 3 exports + un `getOrgClient` privado). Cambios obligatorios:

1. **Eliminar el parámetro `mode` de las tres firmas.** El original las declara como
   `createInvoiceAction(orgId, mode, data)`, `cancelInvoiceAction(orgId, invoiceId, motive, mode)` y
   `sendInvoiceByEmailAction(orgId, invoiceId, mode, email?)`. Las nuevas son
   `createInvoiceAction(uid, data)`, `cancelInvoiceAction(uid, invoiceId, motive)` y
   `sendInvoiceByEmailAction(uid, invoiceId)`.
2. Eliminar el `getOrgClient` privado (`invoices.ts:67-83`) y usar el compartido, que resuelve el modo.
3. `requireBillingAccess()` + `safeParse` al inicio de cada una.
4. **`sendInvoiceByEmailAction` deja de aceptar un destinatario arbitrario.** El original recibe `email?`
   del cliente (`invoices.ts:101`) y se lo pasa a Facturapi: sin autenticación eso era un primitivo de
   exfiltración, y con autenticación sigue permitiendo mandar comprobantes fiscales a cualquier dirección
   sin dejar rastro. La versión nueva llama a Facturapi sin destinatario, que usa el correo registrado del
   cliente del comprobante.
5. Sustituir `parseFloat`/`parseInt` (`invoices.ts:47,51,57`) por los valores ya validados.
6. Retorno `ActionResult<T>`; los `catch` pasan por `toUserMessage`.
7. Registrar `invoice.create`, `invoice.cancel` e `invoice.email` en `audit_log`, con el `mode` resuelto y
   el folio en `target_id`. El registro se escribe **después** de que Facturapi confirma la operación, para
   que la bitácora no afirme timbrados que no ocurrieron.

*Verificación:* `grep -n "mode" app/dashboard/facturacion/\[id\]/invoices/actions.ts` no encuentra ningún
parámetro de modo en las firmas exportadas.

### 4. Route handler del PDF — `app/api/facturacion/organizations/[orgId]/invoices/[invoiceId]/pdf/route.ts` (archivo nuevo)

Porta la ruta del original conservando el manejo de `Blob` y stream de Node. Cambios:

1. `await requireBillingAccess()`; sin sesión, `401`.
2. `orgId` e `invoiceId` validados con `InvoicePdfParamsSchema`.
3. El cliente sale de `getOrgClient(orgId, id_empresa)`, que valida pertenencia y resuelve el modo.
   **Se elimina el `?mode=` con su cast `as 'test' | 'live'`** (`pdf/route.ts:20`).
4. Errores por `toUserMessage`; no se devuelve el `message` crudo en el cuerpo del 500.
5. Registrar `invoice.pdf` en `audit_log`: una descarga de comprobante fiscal es un acceso que conviene
   poder rastrear.
6. Recordar que el `matcher` de `proxy.ts` no cubre `/api/*`.

En el original esta ruta es pública: cualquiera que conozca o adivine un `orgId` y un `invoiceId` descarga
el PDF fiscal real, incluidos los de modo Live.

*Verificación:* sin cookie de sesión responde `401`; con sesión de otra empresa, error de organización no
encontrada; el PDF descargado corresponde al entorno que indica `is_live`.

### 5. `ModeSwitch` y el indicador de Live

`app/dashboard/facturacion/[id]/componentes/ModeSwitch.tsx` (archivo nuevo, ex `ModeSwitch.tsx` de 52
líneas). Cambios respecto al original:

1. **No escribe ni lee `?mode=`.** El original hace `router.push('?mode=live')` además de persistir, y las
   páginas leen el query param con prioridad sobre la base de datos (`invoices/page.tsx:39`), de modo que
   `?mode=live` escrito a mano en la URL pone la pestaña en producción sin tocar el switch ni la BD. Aquí
   el switch solo llama a `setOrgMode` y hace `router.refresh()`.
2. Activar Live abre un `ConfirmModal` con un mensaje explícito sobre lo que implica (comprobantes fiscales
   reales ante el SAT, cancelables solo con motivo). Desactivarlo no requiere confirmación.
3. El estado inicial viene del `is_live` que el `layout.tsx` ya lee de la base de datos.

`app/dashboard/facturacion/[id]/componentes/LiveModeBanner.tsx` (archivo nuevo): franja permanente,
renderizada desde `[id]/layout.tsx` para que aparezca en **todas** las pestañas, no solo en la de facturas.
Usa el token `error` de `references/DESIGN.md` (`#ba1a1a`) con su equivalente oscuro, y dice sin ambigüedad
que la organización está emitiendo comprobantes fiscales reales. En el original el único indicio es una
etiqueta verde "Live" en el encabezado (`ModeSwitch.tsx:46`) — verde, del mismo color que un estado
saludable.

*Verificación:* con `is_live = 1`, la franja aparece en General, Clientes, Productos, Facturas y
Personalizar. Escribir `?mode=live` en la URL de una organización con `is_live = 0` no cambia nada.

### 6. UI — pestaña Facturas

`app/dashboard/facturacion/[id]/invoices/page.tsx` (Server Component, resuelve el modo desde la BD) y en
`componentes/`: `InvoicesSection.tsx` (ex 175 líneas), `InvoiceRow.tsx` (ex 125), `CreateInvoiceModal.tsx`
(ex 465, el componente más grande del módulo) y `SendEmailModal.tsx` (ex 117). El
`CancelInvoiceModal.tsx` del original (107 líneas) **se sustituye por `ConfirmModal`** más un selector de
motivo.

Comportamientos del original que hay que conservar explícitamente al reescribir:

- Filtro por mes y por estado del listado.
- Buscador de facturas.
- El aviso cuando falta la `live_key` (`InvoicesSection.tsx:113-118`).
- El armado de renglones a partir de los productos de la organización.

Comportamiento nuevo: **en modo Live, el submit de `CreateInvoiceModal` pasa por una confirmación** que
muestra cliente, RFC receptor y total antes de timbrar. El original dispara `createInvoiceAction`
directamente en `handleSubmit` (`:186-198`), sin ningún paso intermedio.

Se agrega la pestaña "Facturas" a `OrgTabs.tsx` (modificado).

*Verificación:* crear, listar, filtrar, descargar PDF, enviar por correo y cancelar funcionan en modo Test.

### 7. Verificación manual completa

**Fase A — modo Test**, sobre la organización de los specs 28 y 29:

- Crear factura con un cliente y un producto existentes → aparece en el listado con su folio.
- Filtrar por mes y por estado → el listado responde.
- Abrir el PDF → se descarga y corresponde a la factura.
- Enviar por correo → llega al correo registrado del cliente; comprobar que la action **no acepta** un
  destinatario distinto.
- Cancelar con motivo `02` → la factura queda cancelada.
- Intentar cantidad `0` y cantidad `"abc"` → rechazadas por el schema, sin llamada a Facturapi.
- `SELECT action, mode, target_id, id_user FROM [BILLING].[audit_log] WHERE action LIKE 'invoice%'` muestra
  un registro por operación, con `mode = 'test'`.
- Escribir `?mode=live` en la URL de la pestaña de facturas → **no cambia nada**; el listado sigue siendo
  el de Test.

**Fase B — gate de modo Live**, con una organización dedicada a esta prueba:

- Intentar activar Live sin CSD → error explicando qué falta; `is_live` sigue en `0`.
- Intentar activar Live sin `live_key` → error; `is_live` sigue en `0`.
- Con CSD y `live_key` presentes, activar Live → pide confirmación → `is_live = 1` y queda
  `mode.set_live` en la bitácora.
- La franja de modo Live aparece en las cinco pestañas.
- Crear una factura en Live pide confirmación con cliente, RFC y total antes de timbrar.

> Esta fase emite un CFDI real. Ejecutarla solo con la organización de prueba acordada, con datos
> reales de la empresa, sabiendo que el comprobante existe ante el SAT y hay que cancelarlo después.

- `npm run build` y `npm run lint` sin errores ni warnings nuevos.

## Criterios de aceptación

- [x] **Ninguna server action ni route handler del módulo acepta un parámetro `mode`.** Verificable
      revisando las firmas exportadas de `invoices/actions.ts` y la ausencia de lectura de `?mode=` en las
      páginas.
- [x] El modo se deriva siempre de `is_live` en base de datos, dentro de `getOrgClient`. Escribir
      `?mode=live` en cualquier URL del módulo no cambia el entorno con el que se opera.
- [x] Activar el modo Live exige confirmación explícita y falla si falta el certificado CSD o la
      `live_key`; `is_live` no cambia cuando falla.
- [x] Con `is_live = 1`, el indicador de modo Live es visible en las cinco pestañas de la organización, con
      color de error, no de éxito.
- [x] En modo Live, crear una factura exige una confirmación que muestra cliente, RFC receptor y total.
- [x] `sendInvoiceByEmailAction` no acepta un destinatario desde el cliente; la factura se envía al correo
      registrado del cliente del comprobante.
- [x] `cancelInvoiceAction` solo acepta motivos del catálogo del SAT (`01`-`04`).
- [x] No queda ningún `parseFloat`/`parseInt` sin validar en el flujo de facturas; cantidades y precios
      pasan por `money()` y se rechaza `NaN`, cero y negativos.
- [x] El route handler del PDF exige sesión (`401` sin ella), valida pertenencia por `id_empresa` y no lee
      el modo del query string.
- [x] `invoice.create`, `invoice.cancel`, `invoice.email`, `invoice.pdf`, `mode.set_live` y `mode.set_test`
      quedan en `BILLING.audit_log` con `id_user`, `id_empresa`, `mode` y folio; los de factura se escriben
      después de que Facturapi confirma.
- [x] Ningún error crudo de Facturapi llega al cliente ni al cuerpo de una respuesta HTTP.
- [x] Ningún `new Facturapi(...)` suelto queda en la pestaña de facturas ni en el route handler del PDF.
- [x] El listado conserva el filtro por mes, el filtro por estado, el buscador y el aviso de `live_key`
      faltante.
- [x] Los modales destructivos reusan `ConfirmModal`; ningún archivo importa `@/components/ui/*` ni `cn`.
- [x] `"use client"` solo donde hace falta; la página de facturas es Server Component.
- [x] `npm run build` y `npm run lint` compilan sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **El modo no es un parámetro, en ninguna capa.** Es la decisión central del spec. En el original el modo
  llega de dos fuentes que el cliente controla: el argumento `mode` de las tres actions y el query param
  `?mode=`, que además **gana sobre la base de datos** (`invoices/page.tsx:39`). Ninguna de las dos se
  contrasta contra `is_live` en el servidor, así que `createInvoiceAction(orgId, 'live', …)` timbra en
  producción con el flag de BD en `false`. Se consideró validar el `mode` recibido contra `is_live` y se
  descartó: mientras el parámetro exista, alguien lo volverá a propagar. Quitarlo de las firmas hace que
  el error sea imposible de escribir.

- **El indicador de Live es rojo y permanente, no una etiqueta verde en el encabezado.** El original marca
  Live con una etiqueta verde (`ModeSwitch.tsx:46`), el mismo color que el resto del dashboard usa para
  "todo bien", y solo aparece arriba. Modo Live no es un estado saludable: es un estado en el que cada
  acción tiene consecuencias externas irreversibles.

- **Precondiciones antes de activar Live, no solo un aviso.** El original permite poner `is_live = 1` sin
  CSD y sin `live_key` (`setOrgMode` escribe directo), y el error aparece después, al intentar timbrar. Es
  peor: el usuario cree estar en producción, opera, y descubre el problema en el momento equivocado.

- **Confirmación antes de timbrar en Live, no antes de cada factura.** Se descartó pedir confirmación
  también en Test: ahí el comprobante no existe fiscalmente y el diálogo se vuelve ruido que la gente
  aprende a despachar sin leer — justo el hábito que arruina la confirmación de Live.

- **El correo va al destinatario registrado del cliente.** El original acepta `email?` del cliente. Se
  consideró permitir un destinatario alterno validado por `zod` y registrado en bitácora, y se descartó
  para este spec: nadie lo ha pedido, y mientras exista es una vía para sacar comprobantes fiscales del
  sistema. Si hace falta, se agrega después con su propio registro en bitácora.

- **`CancelInvoiceModal` se sustituye por `ConfirmModal` más un selector de motivo.** Es el cuarto modal
  destructivo del original que colapsa en el componente compartido del repo.

- **Autenticar el route handler del PDF.** En el original es público (no había auth en toda la app). Dentro
  de un sistema con sesión, dejarlo abierto expondría comprobantes fiscales completos a quien adivine dos
  identificadores. Se le agrega `requireBillingAccess()` + scoping por empresa, propio, porque el `matcher`
  de `proxy.ts` no cubre `/api/*`.

- **Registrar también la descarga del PDF.** Es una lectura, no una mutación, y el resto de lecturas no se
  registran; se hace excepción porque es el punto por el que un comprobante fiscal sale del sistema.

- **Solo facturas de ingreso (tipo `I`).** Igual que el original. Complementos de pago y notas de crédito
  tienen reglas propias del SAT y merecen su spec.

- **No se implementa idempotencia en el timbrado.** Sería lo correcto, pero requiere una tabla local de
  intentos y un identificador de idempotencia que Facturapi respete; es un spec propio. Aquí se acota con
  el `disabled` del botón durante el envío y se documenta como riesgo.

## Riesgos identificados

- **El modo Live emite comprobantes fiscales reales e irreversibles.** Es el riesgo de fondo del módulo, y
  este spec lo acota (modo solo desde servidor, precondiciones, confirmación, indicador permanente,
  bitácora) sin eliminarlo: un usuario con rol 1 o 4 decidido puede emitir una factura equivocada. La
  cancelación existe, pero es un trámite ante el SAT con motivo, no un deshacer.

- **Doble timbrado por doble envío.** Sin idempotencia, un doble clic o un reintento tras un timeout de red
  puede generar dos CFDI. *Mitigación parcial:* deshabilitar el botón mientras la action corre, y revisar el
  listado antes de reintentar. *Mitigación pendiente:* clave de idempotencia, en un spec propio.

- **La bitácora puede quedar corta si Facturapi responde y el `INSERT` local falla.** El registro se escribe
  después de la confirmación de Facturapi, así que el orden protege contra registrar timbrados que no
  ocurrieron, pero no contra timbrados que sí ocurrieron y no quedaron registrados. No hay transacción
  distribuida posible. Se prefiere el falso negativo al falso positivo.

- **Clientes y productos cambian de entorno junto con el modo.** Como `getOrgClient` resuelve el modo desde
  `is_live`, activar Live hace que las pestañas de clientes y productos muestren el padrón de producción,
  que normalmente está vacío al principio — en el original seguían mostrando los de prueba (ver Riesgos del
  spec 29). El comportamiento nuevo es el correcto, pero es un cambio visible: hay que dar de alta los
  clientes reales antes de facturar en Live, y conviene decirlo en la interfaz cuando el listado está vacío
  y `is_live = 1`.

- **No se descarga el XML.** El SAT exige conservar el XML, no el PDF. Este spec porta solo lo que el
  original tenía. *Mitigación pendiente:* agregar la descarga del XML, prioritaria para el siguiente spec
  del módulo.

- **`limit: 50` en el listado de facturas.** Acotado por el filtro de mes, una organización con más de 50
  facturas mensuales verá un listado truncado. Mismo riesgo y misma mitigación pendiente que en el spec 29.

- **Volumen del port de UI.** `CreateInvoiceModal` es el componente más grande del módulo (465 líneas) y
  concentra la lógica de captura de renglones, formas de pago y uso del CFDI. Es donde es más fácil perder
  un detalle de comportamiento del original al reescribirlo con las clases del repo.
