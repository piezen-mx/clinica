# 34 — Facturación de consultas y tratamientos

## Header

- **Estado:** Implementado
- **Depende de:**
  - **Spec 28** — `BILLING.organizations`, `getOrgClient(uid, id_empresa)`, `lib/billing/schemas.ts`, `lib/billing/errors.ts`, `requireBillingAccess()` (`lib/auth/session.ts`), `ConfirmModal`, `BILLING.audit_log`, y el patrón de pestañas de `facturacion/[id]/` con un `actions.ts` por pestaña.
  - **Spec 29** — padrón de clientes de la organización en Facturapi (`[id]/customers`): este spec reusa su selección y su alta de clientes, no crea un padrón nuevo.
  - **Spec 30** — emisión de facturas de ingreso (tipo `I`), modo Live y su bitácora (`invoice.create`, `invoice.cancel`). Este spec es exactamente el enlace que el spec 30 dejó fuera de alcance: *"Facturar automáticamente desde ventas o consultas… sigue pendiente"*.
  - Dominio existente: `dbo.consultas` (`costo_total`), `dbo.pagos`, `dbo.Tratamiento_onicomicosis_pagos`, `dbo.Tratamiento_onicomicosis_pagos_tipos`, `dbo.MetodosPagos` (`clave` ya trae la clave SAT de forma de pago).
- **Modifica base de datos:** una columna nueva, `[BILLING].[organizations].[default_product_id]`. Todo lo demás reusa columnas existentes (`facturado`, `uuid_cfdi`). El cambio se aplica directo contra la BD y se registra en `queries.txt`, como el resto del repo (no hay herramienta de migraciones).
- **Fecha:** 2026-08-27
- **Objetivo:** Agregar una sexta pestaña a la organización de facturación que liste los cobros de consultas y de tratamientos que ya están totalmente pagados y aún no facturados, y permita timbrarlos como un CFDI de ingreso de un solo concepto por operación, estampando el UUID de vuelta en los pagos que lo originaron.

> **Nota de alcance general:** las ventas de productos (`dbo.Ventas`) quedan explícitamente fuera de este spec — van en uno posterior que reusará toda la mecánica que este establece.

## Alcance

**Incluye:**

### Pestaña nueva `/dashboard/facturacion/[id]/pending` — "Por facturar"

- Sexta pestaña de la organización, con su propio `page.tsx`, `actions.ts` y `componentes/`, misma convención que las cinco existentes. Se agrega a `OrgTabs.tsx`.
- Hereda el `LiveModeBanner` y la restricción de `proxy.ts` a `id_role` 1 y 4 — **solo admin factura**.
- Listado unificado de **operaciones cobrables completas y no facturadas**, de dos orígenes:
  - **Consulta** — `costo_total > 0`, con al menos un pago activo, y `SUM(pagos activos) >= costo_total`.
  - **Tratamiento, revisión** — pagos de `id_tratamiento_pago_tipo = 1` cuya suma alcanza el `total` de ese tipo en el catálogo.
  - **Tratamiento, tratamiento** — pagos de `id_tratamiento_pago_tipo = 2` cuya suma alcanza el `total` de ese tipo en el catálogo (puede venir de una o varias exhibiciones).
  - Los tres totales esperados se leen del catálogo o de `consultas.costo_total`; **ningún importe se codifica en el código**.
- Filtros: **rango de fechas**, **podólogo**, y buscador por **nombre de paciente o WhatsApp**. Acotado por la sucursal activa (`SucursalContext`) y por `id_empresa`.

### Timbrado desde el listado

- Botón "Facturar" por renglón, que abre un modal con:
  - **Receptor**: selección de un cliente del padrón de la organización en Facturapi (spec 29), **con la opción de dar de alta un cliente nuevo sin salir del modal**.
  - **Concepto único**, con descripción precargada y **editable**: `"Consulta podológica"`, `"Revisión de especialista"` o `"Tratamiento de onicomicosis"` según el origen.
  - **Forma de pago**: se deriva de `MetodosPagos.clave` del pago **de mayor monto** de la operación; se muestra y no se captura a mano.
  - **Uso del CFDI**: `D01 — Honorarios médicos, dentales y gastos hospitalarios` por defecto, cambiable en el modal.
  - **Método de pago**: `PUE` siempre (la operación está totalmente pagada).
- El timbrado reusa la mecánica del spec 30 (`getOrgClient`, tipo `I`, confirmación previa en modo Live, `invoice.create` en bitácora). **Un CFDI por operación, sin agrupar.**

### Estampado y reversión

- Timbrado exitoso → `facturado = 1` y `uuid_cfdi = <uuid>` en **todas** las filas de pago que componen la operación (`dbo.pagos` de la consulta, o los pagos del tipo correspondiente del tratamiento), dentro de la misma transacción.
- **Cancelar la factura devuelve los cobros a pendientes**: `cancelInvoiceAction` (`[id]/invoices/actions.ts`, spec 30) se amplía para limpiar `facturado = 0` y `uuid_cfdi = NULL` en las filas que referencian ese UUID, en ambas tablas.

**No incluye (fuera de alcance):**

- **Ventas de productos (`dbo.Ventas`).** Spec posterior, que reusará esta misma mecánica.
- **Un CFDI por pago parcial, y complementos de pago (PPD).** Se factura la operación completa en `PUE`; el esquema PPD + complemento sigue siendo su propio spec, como ya declaró el spec 30.
- **Agrupar varias consultas o tratamientos en un solo CFDI.** Siempre una factura por operación.
- **Renglones detallados** (un concepto por `consulta_servicios` / `consulta_productos`). Un solo concepto por factura; el detalle por servicio exigiría clave SAT ProdServ y de unidad en cada opción de servicio y producto, que hoy no existen.
- **Datos fiscales en `Pacientes`.** No se agrega RFC ni régimen a la tabla de pacientes; el receptor sale del padrón de Facturapi.
- **Consultas de cortesía (`costo_total = 0`) y consultas sin pagos.** No aparecen en el listado.
- **Facturar desde la pantalla de la consulta o del tratamiento.** El único punto de entrada es esta pestaña.
- **Cambios de esquema más allá de `default_product_id`.**

## Modelo de datos

### Cambio de esquema

```sql
ALTER TABLE [CentroPodologico].[BILLING].[organizations]
  ADD [default_product_id] NVARCHAR(50) NULL;
```

Guarda el `id` del producto de Facturapi que se usa como concepto único de toda factura emitida desde esta pestaña. Es `NULL` mientras no se configure, y **sin él la pestaña no puede timbrar**: muestra un aviso que remite a Personalizar. Se configura en la pestaña **Personalizar** (`[id]/customize`), que ya es la pestaña de ajustes de la organización; el selector se llena con el padrón de productos de la organización (spec 29).

### `interfaces/organization.ts` (modificado)

```ts
/** Producto de Facturapi usado como concepto único al facturar cobros. */
default_product_id: string | null;   // se agrega a IOrganization
```

### Tipos nuevos en `interfaces/organization.ts`

```ts
/** Origen de una operación cobrable. */
export type BillableSource =
  | "consulta"
  | "tratamiento_revision"   // pagos id_tratamiento_pago_tipo = 1
  | "tratamiento";           // pagos id_tratamiento_pago_tipo = 2

/** Renglón del listado "Por facturar". */
export interface IBillableOperation {
  source:             BillableSource;
  source_id:          number;         // id_consulta o id_tratamiento
  patient_name:       string;
  patient_whatsapp:   string | null;
  podologist_name:    string | null;
  last_payment_date:  string;         // "YYYY-MM-DD HH:mm:ss", vía CONVERT(varchar(19), …, 120)
  total:              number;         // suma de los pagos que componen la operación
  payment_form:       string;         // clave SAT del pago de mayor monto
  payment_form_label: string;         // descripción del método, para mostrar
}

/** Captura del modal de facturación de un cobro. */
export interface ICreateBillableInvoiceInput {
  source:      BillableSource;
  source_id:   number;
  customer_id: string;   // id del cliente en Facturapi
  description: string;   // concepto, precargado y editable
  use:         string;   // uso del CFDI, default "D01"
}
```

**`IBillableOperation` no expone los ids de las filas de pago.** El cliente manda solo `source` + `source_id`; la action **vuelve a resolver en el servidor** cuáles son los pagos, su suma y su forma de pago antes de timbrar. Así el importe facturado nunca llega del cliente, y la operación se revalida como "completa y no facturada" en el momento del timbrado, no en el momento en que se pintó la lista.

### Schema de validación — `lib/billing/schemas.ts` (modificado)

`CreateBillableInvoiceSchema`: `source` contra el enum cerrado, `source_id` entero positivo, `customer_id` no vacío, `description` no vacía y acotada en longitud, `use` contra el catálogo de usos del CFDI. **No incluye importe, forma de pago, producto ni `mode`** — los cuatro se resuelven en el servidor.

### Sin tabla puente

El enlace CFDI ↔ cobros vive en las columnas que ya existen: `dbo.pagos.uuid_cfdi` / `facturado` y `dbo.Tratamiento_onicomicosis_pagos.uuid_cfdi` / `facturado`. Revertir una cancelación es un `UPDATE … WHERE uuid_cfdi = @uuid` en ambas tablas.

### Criterios de fecha y de podólogo

- El **rango de fechas filtra por la fecha del último pago** de la operación (cuando se volvió facturable), no por `consultas.fecha`.
- El **podólogo** de un tratamiento se resuelve vía su `id_consulta` → `consultas.id_podologo`, no vía `Tratamiento_onicomicosis.id_especialista`, para que el filtro signifique lo mismo en los tres tipos de renglón.

## Plan de implementación

### 1. Esquema, tipos y lectura de `default_product_id`

- `ALTER TABLE` de la sección anterior, aplicado a mano contra la BD y anotado en `queries.txt`.
- `interfaces/organization.ts`: agregar `default_product_id` a `IOrganization` y los tres tipos nuevos (`BillableSource`, `IBillableOperation`, `ICreateBillableInvoiceInput`).
- `lib/billing/organizationsRepository.ts`: incluir `[default_product_id]` en los `SELECT` de organización y agregar `setDefaultProduct(uid, id_empresa, productId)`.

*Verificación:* `npx tsc --noEmit` compila; `SELECT default_product_id FROM [BILLING].[organizations]` existe y devuelve `NULL` en todas las filas.

### 2. Pestaña Personalizar — selector de producto por defecto

En `[id]/customize/`: una sección nueva que lista los productos de la organización y guarda el elegido vía `setDefaultProduct`. Sigue la regla del spec 31 — esa pestaña valida pertenencia con `assertOwnedOrganization` porque usa `getRootClient()`; **la lista de productos sí sale de `getOrgClient(uid, id_empresa)`**, que es el cliente correcto para llamadas de dominio.

Registra `org.update_customization` en `audit_log` (acción ya existente, no se amplía el catálogo).

*Verificación:* elegir un producto y recargar → sigue seleccionado; `SELECT default_product_id` trae el id de Facturapi.

### 3. `lib/billing/billableOperations.ts` (archivo nuevo)

Concentra el SQL de los cobros facturables, porque lo necesitan dos pestañas distintas (Por facturar y Facturas, esta última para revertir al cancelar). Cuatro funciones:

- **`listBillableOperations(filters)`** → `IBillableOperation[]`. Tres consultas unidas por `UNION ALL`:

  ```sql
  -- Consultas totalmente pagadas y no facturadas
  SELECT 'consulta' AS source, c.[id_consulta] AS source_id, ...
    FROM [dbo].[consultas] c
    JOIN (SELECT [id_consulta], SUM([monto]) AS paid, MAX([created_at]) AS last_paid
            FROM [dbo].[pagos] WHERE [status] = 1 GROUP BY [id_consulta]) p
      ON p.[id_consulta] = c.[id_consulta]
   WHERE c.[costo_total] > 0
     AND p.paid >= c.[costo_total]
     AND c.[deleted_at] IS NULL AND c.[cancelada] = 0
     AND c.[id_sucursal] = @id_sucursal AND c.[id_empresa] = @id_empresa
     AND NOT EXISTS (SELECT 1 FROM [dbo].[pagos] f
                      WHERE f.[id_consulta] = c.[id_consulta] AND f.[status] = 1
                        AND f.[facturado] = 1)
  ```

  Los dos bloques de tratamiento son análogos, agrupando `Tratamiento_onicomicosis_pagos` por `id_tratamiento` y `id_tratamiento_pago_tipo`, comparando contra `Tratamiento_onicomicosis_pagos_tipos.[total]` (tipo 1 y tipo 2 respectivamente) y llegando al paciente y al podólogo por `id_consulta`.

  Todas las fechas salen con `CONVERT(varchar(19), …, 120)`. Los filtros de rango, podólogo y búsqueda se aplican por `queryParams`, nunca por concatenación.

- **`resolveBillableOperation(source, source_id, id_empresa, id_sucursal)`** → la misma operación, recalculada en el servidor, o `null` si ya no es facturable (se pagó de menos, se canceló, o alguien la facturó entre el render y el clic). Devuelve además los `id` de las filas de pago que la componen y la `clave` SAT del pago de mayor monto.

- **`markOperationInvoiced(tx, source, source_id, uuid)`** → `UPDATE` de `facturado = 1` y `uuid_cfdi = @uuid` sobre esas filas, en la tabla que corresponda.

- **`clearInvoiceStamp(tx, uuid)`** → `UPDATE … SET facturado = 0, uuid_cfdi = NULL WHERE uuid_cfdi = @uuid` en `dbo.pagos` y en `dbo.Tratamiento_onicomicosis_pagos`.

*Verificación:* con una consulta pagada al 100% y sin facturar, `listBillableOperations` la devuelve; al bajar un pago para que la suma no alcance, desaparece.

### 4. Validación — `lib/billing/schemas.ts` (modificado)

`CreateBillableInvoiceSchema` como se definió en el modelo de datos. **Sin importe, sin forma de pago, sin producto, sin `mode`.**

*Verificación:* `safeParse` rechaza `source: "venta"`, `source_id: 0` y `description: ""`.

### 5. `app/dashboard/facturacion/[id]/pending/actions.ts` (archivo nuevo)

- **`getBillableOperationsAction(uid, filters)`** — `requireBillingAccess()`, valida pertenencia de la organización, y delega en `listBillableOperations`.
- **`createBillableInvoiceAction(uid, input)`**:
  1. `requireBillingAccess()` + `CreateBillableInvoiceSchema.safeParse`.
  2. Leer la organización; si `default_product_id` es `NULL`, devolver `{ ok: false, message }` remitiendo a Personalizar. **No se timbra sin producto configurado.**
  3. `resolveBillableOperation(...)`; si devuelve `null`, `{ ok: false, message: "Este cobro ya no está pendiente de facturar" }`.
  4. Timbrar con `getOrgClient(uid, id_empresa)`: tipo `I`, un renglón con `product: default_product_id`, `quantity: 1`, `price` = el total recalculado, `description` = la del formulario; `payment_form` = la clave SAT resuelta en el paso 3; `payment_method: "PUE"`; `use` del formulario.
  5. En una `db.transaction`: `markOperationInvoiced(tx, …)` con el UUID que devolvió Facturapi, más `writeAuditEntry(tx, { action: "invoice.create", target_id: folio, detail: { source, source_id } })`.

  El orden importa: se timbra primero y se estampa después, igual que el spec 30 escribe la bitácora después de que Facturapi confirma. Si el `UPDATE` falla, la factura existe y el cobro sigue apareciendo como pendiente — falso pendiente, no falso facturado (ver Riesgos).

**No se amplía el catálogo de `BILLING.audit_log`.** `invoice.create` ya cubre el timbrado; el origen viaja en `detail`.

*Verificación:* timbrar una consulta en modo Test → aparece en la pestaña Facturas, desaparece de Por facturar, y `SELECT facturado, uuid_cfdi FROM [dbo].[pagos] WHERE id_consulta = …` muestra el UUID en todas sus filas.

### 6. Reversión al cancelar — `[id]/invoices/actions.ts` (modificado)

`cancelInvoiceAction` pasa a envolver su post-proceso en `db.transaction` y llamar a `clearInvoiceStamp(tx, uuid)` junto al `writeAuditEntry` de `invoice.cancel` que ya escribe. Una factura cancelada que no vino de esta pestaña simplemente no afecta ninguna fila — el `UPDATE` no encuentra nada.

*Verificación:* cancelar la factura del paso anterior → la consulta reaparece en Por facturar y sus pagos vuelven a `facturado = 0`, `uuid_cfdi = NULL`.

### 7. UI — pestaña Por facturar

- `[id]/pending/page.tsx` — **Server Component**; resuelve organización y `default_product_id`, y muestra el aviso de "configura el producto por defecto" si falta.
- `[id]/pending/componentes/`:
  - `BillableOperationsSection.tsx` (cliente) — filtros de rango de fechas, podólogo y buscador; depende del `SucursalContext`, que es estado de cliente, así que la lista se pide por server action al cambiar filtros.
  - `BillableOperationRow.tsx` — paciente, WhatsApp, podólogo, tipo de operación, fecha del último pago, total, forma de pago y botón "Facturar".
  - `BillableInvoiceModal.tsx` — receptor, concepto editable, uso del CFDI (`D01` por defecto), resumen no editable de importe y forma de pago. En modo Live, confirmación previa con cliente, RFC receptor y total, igual que `CreateInvoiceModal` (spec 30). Botón deshabilitado mientras la action corre.
- **Alta de cliente desde el modal:** reusar `createCustomerAction` de `[id]/customers/actions.ts`. Si su formulario está acoplado a esa pestaña, **extraerlo a `[id]/componentes/CustomerFormModal.tsx`** y consumirlo desde ambas — no duplicarlo.
- `OrgTabs.tsx` (modificado): sexta pestaña "Por facturar".
- Sin `@/components/ui/*` ni `cn`; modales destructivos con `ConfirmModal`; tokens de `references/DESIGN.md`.

*Verificación:* los tres tipos de renglón aparecen y se distinguen; los filtros responden; cambiar de sucursal en el `SucursalContext` cambia el listado.

### 8. Documentación — `docs/facturacion.md` (modificado)

Actualizar la tabla de pestañas con la sexta fila, documentar `default_product_id` y la regla de "un CFDI por operación completa, en `PUE`, con concepto único", y dejar anotado que el catálogo de `audit_log` sigue completo (no se agregaron acciones).

### 9. Verificación manual completa

En modo **Test**, sobre la organización de los specs 28-31:

- Sin `default_product_id` → la pestaña avisa y no permite timbrar.
- Configurar el producto por defecto en Personalizar → la pestaña habilita el botón.
- Consulta pagada al 100% → aparece; timbrar con un cliente existente → sale del listado, aparece en Facturas, y sus pagos quedan estampados.
- Timbrar con un cliente **creado desde el modal** → funciona sin salir de la pantalla.
- Tratamiento con el pago de revisión completo pero el de tratamiento a medias → aparece **solo** el renglón de revisión.
- Completar la segunda exhibición del tratamiento → aparece el segundo renglón, con el total del catálogo.
- Consulta con `costo_total = 0` y consulta sin pagos → no aparecen.
- Cancelar una factura emitida desde aquí → el cobro reaparece como pendiente.
- Abrir el modal, y desde otra pestaña del navegador facturar el mismo cobro; volver y confirmar → error "ya no está pendiente de facturar", **sin segundo CFDI**.
- Filtros de fecha, podólogo y búsqueda por nombre y por WhatsApp → responden.
- Entrar con un usuario de rol distinto de 1 y 4 → `proxy.ts` lo redirige.
- `npm run build` y `npm run lint` sin errores ni warnings nuevos.

## Criterios de aceptación

- [ ] La pestaña **Por facturar** existe como sexta pestaña de `/dashboard/facturacion/[id]/`, aparece en `OrgTabs.tsx`, muestra el `LiveModeBanner` cuando `is_live = 1` y solo es accesible con `id_role` 1 o 4.
- [ ] `[BILLING].[organizations].[default_product_id]` existe, se configura desde la pestaña Personalizar y el `ALTER TABLE` queda anotado en `queries.txt`.
- [ ] Con `default_product_id` en `NULL`, la pestaña muestra un aviso que remite a Personalizar y **`createBillableInvoiceAction` devuelve `{ ok: false }` sin llamar a Facturapi**.
- [ ] El listado incluye una consulta si y solo si `costo_total > 0`, no está cancelada ni borrada, `SUM(pagos activos) >= costo_total`, y ninguno de sus pagos activos tiene `facturado = 1`.
- [ ] Una consulta con `costo_total = 0` y una consulta sin pagos **no aparecen** en el listado.
- [ ] El listado muestra la revisión (tipo 1) y el tratamiento (tipo 2) como **renglones independientes**, cada uno facturable cuando la suma de sus pagos alcanza el `total` de su tipo en `Tratamiento_onicomicosis_pagos_tipos`.
- [ ] **Ningún importe esperado está codificado en el código.** Los totales salen de `consultas.costo_total` y del catálogo de tipos de pago.
- [ ] El listado se acota por `id_empresa` y por la sucursal activa del `SucursalContext`, y responde a los filtros de rango de fechas (por fecha del último pago), podólogo y búsqueda por nombre o WhatsApp.
- [ ] El podólogo mostrado y filtrado es `consultas.id_podologo` en los tres tipos de renglón.
- [ ] `ICreateBillableInvoiceInput` y `CreateBillableInvoiceSchema` **no aceptan importe, forma de pago, producto ni `mode`**; los cuatro se resuelven en el servidor.
- [ ] `createBillableInvoiceAction` recalcula la operación con `resolveBillableOperation` antes de timbrar y falla con mensaje explícito si dejó de ser facturable, **sin emitir CFDI**.
- [ ] El CFDI emitido es de tipo `I`, con **un solo renglón** (`quantity: 1`, precio = el total recalculado, producto = `default_product_id`), `payment_method: "PUE"` y `payment_form` = la clave SAT de `MetodosPagos` del pago de mayor monto de la operación.
- [ ] La descripción del concepto viene precargada según el origen y **es editable** antes de timbrar.
- [ ] El uso del CFDI es `D01` por defecto y se puede cambiar en el modal.
- [ ] Se puede dar de alta un cliente nuevo **sin salir del modal**, reusando `createCustomerAction`; el formulario de cliente **no queda duplicado** entre la pestaña Clientes y este modal.
- [ ] Un timbrado exitoso estampa `facturado = 1` y `uuid_cfdi` en **todas** las filas de pago que componen la operación, dentro de la misma `db.transaction` que su entrada de `audit_log`.
- [ ] Cancelar la factura desde la pestaña Facturas devuelve `facturado = 0` y `uuid_cfdi = NULL` a esas filas, y el cobro **reaparece** en Por facturar. Cancelar una factura ajena a esta pestaña no altera ninguna fila.
- [ ] **Un CFDI por operación**: no existe forma de agrupar varias consultas o tratamientos en una sola factura.
- [ ] No se agrega ninguna acción nueva a `BILLING.audit_log`; el timbrado registra `invoice.create` con `source` y `source_id` en `detail`.
- [ ] `page.tsx` es Server Component; `"use client"` solo en los componentes que necesitan interactividad o `SucursalContext`.
- [ ] Ningún archivo nuevo importa `@/components/ui/*` ni `cn`; los modales destructivos reusan `ConfirmModal`.
- [ ] Ningún error crudo de Facturapi llega al cliente; todos pasan por `toUserMessage`.
- [ ] No se agregan columnas fiscales a `Pacientes` ni se emiten CFDI desde la pantalla de consulta o de tratamiento.
- [ ] `docs/facturacion.md` refleja la sexta pestaña, `default_product_id` y la regla de facturación de cobros.
- [ ] `npm run build` y `npm run lint` compilan sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **Se factura la operación completa en `PUE`, no cada pago parcial.** Las tres tablas de cobro guardan pagos parciales (`pagos.monto`, `Tratamiento_onicomicosis_pagos.total`), y las columnas `facturado`/`uuid_cfdi` viven en la fila del pago, lo que sugería un CFDI por pago. Se descartó: emitir varias facturas de ingreso por el mismo servicio es fiscalmente confuso, y lo que el SAT contempla para cobros diferidos es `PPD` + complemento de pago, que el spec 30 dejó explícitamente fuera. Facturar solo cuando la operación está completa entrega el caso real de la clínica sin abrir el complemento de pago, que sigue siendo su propio spec.

- **La revisión del especialista y el tratamiento son dos operaciones facturables distintas.** El tratamiento de onicomicosis cobra la revisión (tipo 1) y el tratamiento (tipo 2, en una o dos exhibiciones), separados por semanas. Se descartó un solo CFDI por la suma de ambos: haría esperar al paciente hasta el final del tratamiento para deducir una revisión que ya pagó. Se descartó también facturar cada exhibición por separado, por el mismo criterio del punto anterior.

- **Los totales esperados se leen del catálogo, nunca del código.** `Tratamiento_onicomicosis_pagos_tipos.total` es la fuente para ambos tipos, y `consultas.costo_total` para las consultas. Es la razón por la que el spec no menciona ningún importe concreto en sus consultas SQL: esos precios cambian con los años.

- **Concepto único, no renglones detallados.** La consulta tiene renglones reales (`consulta_servicios`, `consulta_productos`), pero facturarlos por separado exigiría clave SAT ProdServ y clave de unidad en cada opción de servicio y en cada producto de inventario, que hoy no existen en ninguna tabla. Ese mapeo es un proyecto propio; aquí se emite un concepto con descripción editable, que es lo que el paciente necesita para deducir.

- **El producto del concepto se guarda en la organización, no se elige en cada factura.** Se consideró elegirlo del padrón dentro del modal (cero esquema) y se descartó: es un clic más en cada factura sobre una decisión que no cambia, y expone a que alguien elija el producto equivocado bajo prisa. La columna `default_product_id` es un cambio chico y contenido dentro de `BILLING`, esquema del que este módulo ya es dueño.

- **Sin producto por defecto, la pestaña no timbra.** Se descartó caer a un producto genérico creado al vuelo: dejaría facturas emitidas con claves SAT que nadie eligió, y el error se descubriría cuando el contador las revise, no cuando se puedan corregir.

- **La forma de pago es la del pago de mayor monto, no `99 — Por definir`.** Se consideró `99` para pagos mixtos, que es lo que el SAT contempla, y se eligió el mayor monto: en la práctica los mixtos son raros y el `99` obliga al receptor a preguntar cómo pagó. Queda anotado en Riesgos que un pago genuinamente mixto informará una forma de pago que no cubre el total.

- **El importe nunca llega del cliente.** `ICreateBillableInvoiceInput` manda solo `source` + `source_id`; la action recalcula pagos, suma y forma de pago con `resolveBillableOperation`. Es el mismo criterio que el spec 30 aplicó al `mode`: si el dato no está en el schema, no puede llegar del cliente. Además convierte el recálculo en la verificación de que la operación **sigue** siendo facturable, cerrando la ventana entre el render de la lista y el clic.

- **Cancelar devuelve el cobro a pendientes.** Se descartó dejar el `facturado = 1` permanente: un timbrado equivocado dejaría el cobro imposible de refacturar sin un `UPDATE` a mano contra producción. El `clearInvoiceStamp` va dentro de `cancelInvoiceAction`, no como acción separada, para que no exista un estado en que la factura está cancelada y el cobro sigue marcado.

- **Sin tabla puente; se reusan `facturado` y `uuid_cfdi`.** Las columnas existen desde antes en las tres tablas de cobro y hasta hoy no tenían lógica. Una tabla `BILLING.invoice_links` sería más auditable, pero el enlace es 1:N desde el UUID y `UPDATE … WHERE uuid_cfdi = @uuid` lo resuelve sin esquema nuevo ni dos fuentes de verdad que puedan divergir.

- **Sin datos fiscales en `Pacientes`.** Se consideró agregar `rfc`, `razon_social`, `regimen_fiscal`, `cp` y `email` al paciente y crear el cliente en Facturapi automáticamente. Se descartó para este spec: mete cambio de esquema, cambio en la pantalla de pacientes y una política de sincronización paciente ↔ cliente de Facturapi. El padrón de clientes del spec 29 ya existe y ya resuelve el receptor; el alta desde el modal cubre el caso del paciente nuevo que pide factura.

- **Un solo punto de entrada: la pestaña.** Se descartó poner el botón "Facturar" también en la pantalla de la consulta y en el detalle del tratamiento. Facturar es una tarea de administración, restringida a roles 1 y 4; recepción cobra pero no timbra. Un botón visible donde no se puede usar solo genera preguntas.

- **Sin agrupar varias operaciones en un CFDI.** Un paciente con cuatro consultas en el mes recibe cuatro facturas. Agrupar obliga a decidir qué pasa al cancelar una factura que cubre operaciones que ya no están todas en el mismo estado, y a un modelo de enlace que las columnas actuales no soportan.

- **No se amplía el catálogo de `audit_log`.** El timbrado ya es `invoice.create`; el origen (`source`, `source_id`) viaja en `detail`. Agregar una acción nueva duplicaría el registro del mismo hecho.

- **Las ventas de productos quedan para otro spec.** `dbo.Ventas` tiene las mismas dos columnas y el mismo problema, pero además carece de `id_paciente` (venta de mostrador sin receptor natural) y descuenta stock, lo que abre la pregunta de qué pasa al cancelar. Se hace después, reusando `lib/billing/billableOperations.ts`.

## Riesgos identificados

- **Timbrado confirmado y estampado fallido.** Se timbra en Facturapi y después se hace el `UPDATE` local. Si el `UPDATE` falla (caída de BD, timeout), la factura existe ante el SAT y el cobro sigue apareciendo en Por facturar, invitando a un segundo CFDI del mismo servicio. No hay transacción distribuida posible; se prefiere el falso pendiente al falso facturado, igual que el spec 30 prefiere la bitácora corta al registro de timbrados que no ocurrieron. *Mitigación:* el error se muestra al usuario incluyendo el folio ya emitido, para que verifique en la pestaña Facturas antes de reintentar. *Mitigación pendiente:* clave de idempotencia en el timbrado, el mismo spec propio que el 30 dejó anotado.

- **Doble timbrado por doble envío.** Sin idempotencia, un doble clic o un reintento tras un timeout puede generar dos CFDI de la misma operación. `resolveBillableOperation` cierra la ventana larga (dos usuarios, dos pestañas, minutos de diferencia) porque revalida contra la BD, pero **no cierra la ventana de milisegundos** entre dos envíos simultáneos: ambos resuelven la operación como pendiente antes de que ninguno estampe. *Mitigación parcial:* `disabled` en el botón mientras la action corre. *Mitigación pendiente:* la misma clave de idempotencia.

- **Pago mixto con forma de pago incompleta.** Una consulta pagada en parte en efectivo y en parte con tarjeta se factura con la clave del pago mayor, aunque esa forma no cubre el total. Es una decisión consciente (ver Decisiones), pero un CFDI con forma de pago que no corresponde a lo realmente cobrado es una observación posible en una revisión fiscal. *Mitigación:* el modal muestra la forma de pago que se va a informar antes de timbrar, así que es visible; no se corrige automáticamente.

- **El precio del catálogo cambia con un cobro completo sin facturar.** Si el `total` de un tipo de pago de tratamiento sube, un tratamiento cobrado completo al precio anterior y todavía no facturado deja de aparecer en el listado, porque la suma de sus pagos ya no alcanza el total vigente. Solo muerde en la ventana entre cobrar y facturar, que normalmente es corta. Se descartó congelar el precio en el tratamiento (columna nueva) por no justificar el cambio de esquema. *Mitigación:* ninguna en este spec; si el caso ocurre en la práctica, se resuelve con la columna congelada en un spec siguiente.

- **Modo Live sobre datos de operación real.** Esta pestaña convierte cobros reales de la clínica en CFDI reales e irreversibles con dos clics. Es el mismo riesgo de fondo del spec 30, pero con más volumen: ahí las facturas se capturaban una por una a mano, aquí hay una lista de cobros listos para timbrar. *Mitigación:* el `LiveModeBanner` permanente, la confirmación previa con cliente, RFC y total en modo Live, y la restricción a roles 1 y 4.

- **Clientes y productos cambian de entorno junto con el modo.** Heredado del spec 29/30: al activar Live, el padrón de clientes y el `default_product_id` apuntan al entorno de producción, que normalmente está vacío al principio. Si `default_product_id` guarda el id de un producto de Test, **en Live no existe** y el timbrado falla. *Mitigación:* el error de Facturapi se traduce con `toUserMessage`; conviene reconfigurar el producto por defecto al activar Live. *Riesgo residual:* nada impide guardar un id de un entorno y facturar en el otro.

- **Sin paginación.** El listado devuelve todas las operaciones facturables del rango y la sucursal. Una clínica con meses sin facturar y un rango amplio puede traer cientos de renglones. Mismo riesgo y misma mitigación pendiente que los listados de los specs 29 y 30. *Mitigación parcial:* el filtro de rango de fechas y el de sucursal acotan por defecto.

- **Costo de la consulta editable después de facturar.** `updateConsultaCosto` puede bajar el `costo_total` de una consulta ya facturada; la factura queda emitida por un importe que ya no corresponde al registro local. No es nuevo de este spec, pero este spec es el que hace que ese importe tenga consecuencia fiscal. *Mitigación:* ninguna aquí; bloquear la edición de consultas facturadas es candidato a spec propio.

- **Eliminación de pagos ya facturados.** `eliminarPago` marca `status = 0` sin consultar `facturado`. Eliminar un pago de una consulta ya facturada deja el CFDI sin respaldo en los cobros locales. Mismo caso que el anterior: preexistente, pero ahora con consecuencia fiscal. *Mitigación pendiente:* impedir eliminar un pago con `facturado = 1`, en un spec siguiente.

- **Volumen de superficie tocada.** El spec modifica tres archivos del módulo de facturación (`customize`, `invoices/actions.ts`, `OrgTabs`), agrega una capa nueva en `lib/billing/`, y consulta tres tablas del dominio clínico que hasta ahora el módulo de facturación no tocaba. El SQL de `listBillableOperations` (tres bloques en `UNION ALL`, con filtros y agregaciones) es la pieza más fácil de equivocar y la que más merece verificarse contra datos reales antes de confiar en el listado.
