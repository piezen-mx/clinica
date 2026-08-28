# 35 — Ventas con múltiples productos por ticket

## Header

- **Estado:** Aprobado
- **Depende de:** [[16-ventas-descuentan-stock-sucursal]] (`ISaleProduct`, `getSaleProducts`, `applyStockMovement`, movimientos `6`/`7`, `inventory.kardex.id_venta`)
- **Modifica base de datos:** `dbo.Ventas` se recrea como tabla encabezado (antes era una fila por producto); nueva tabla `dbo.VentasDetalle` para las líneas. Sin backfill — se confirmó que no hay datos reales que preservar (mismo criterio que spec 16).
- **Fecha:** 2026-08-28
- **Objetivo:** Permitir capturar una venta como un ticket con uno o más productos (encabezado `dbo.Ventas` + líneas `dbo.VentasDetalle`), con un solo método de pago y un total autocalculado, en vez del modelo actual de una fila por producto.

## Alcance

**Incluye:**

- `dbo.Ventas` se recrea como tabla **encabezado**: `id_venta` (ahora `IDENTITY`), `id_sucursal`, `idMetodoPago`, `total` (autocalculado, suma de líneas), `created_at`, `id_usuario`, `status`, `webid`, `facturado`, `uuid_cfdi`. Deja de tener `id_producto`/`cantidad` propios.
- Nueva tabla `dbo.VentasDetalle` (líneas): `id_venta_detalle` (`IDENTITY`), `id_venta` (FK a `dbo.Ventas`), `id_producto`, `cantidad`, `precio_unitario` (snapshot del precio efectivo al momento de guardar), `subtotal` (`cantidad × precio_unitario`), `created_at`.
- `interfaces/venta.ts`: `IVenta` pasa a ser el encabezado con un arreglo `lineas: IVentaDetalle[]`; nueva interfaz `IVentaDetalle` (`id_venta_detalle`, `id_producto`, `nombre_producto`, `cantidad`, `precio_unitario`, `subtotal`).
- `app/dashboard/ventas/actions.ts`:
  - `getVentas` devuelve un ticket por fila (encabezado) con sus líneas anidadas.
  - `saveVenta` recibe el encabezado + un arreglo de líneas. Al crear, inserta el encabezado y una fila de `VentasDetalle` por línea, aplicando un `applyStockMovement` (movimiento `6`) por cada línea. Al editar, calcula el ajuste de stock por línea (nueva, eliminada, o con cantidad/producto distinto) usando la misma lógica de movimiento `6`/`7` que hoy usa spec 16, ahora aplicada por línea en vez de una sola vez por venta.
  - `deleteVenta` revierte con movimiento `7` el stock de **todas** las líneas del ticket antes del soft-delete.
- `VentaModal.tsx` se rediseña como carrito: agregar producto + cantidad a una lista de líneas, cada línea removible; seleccionar el mismo producto dos veces suma la cantidad a su línea existente en vez de duplicarla; un solo selector de método de pago para todo el ticket; total de solo lectura, autocalculado como la suma de subtotales de las líneas visibles; mínimo una línea para poder guardar.
- `VentaFila.tsx` pasa a mostrar **una fila por ticket** (fecha, método de pago, total, facturado, acciones), con los productos del ticket resumidos de forma compacta dentro de la fila (ej. "Curitas x2, Alcohol x1").
- La advertencia de stock insuficiente (spec 16) se evalúa **por línea**, contra el `stock_quantity` de `ISaleProduct` de ese producto.
- Anexar los `DROP`/`CREATE TABLE`/`ALTER` a `queries.txt`, bajo un encabezado `-- spec 35 — ventas con múltiples productos por ticket`.

**No incluye:**

- **Facturación de ventas.** Spec 34 ya dejó esto para un spec posterior que reusará `lib/billing/billableOperations.ts`; este spec solo deja `facturado`/`uuid_cfdi` en el encabezado (una vez por ticket) para que ese spec futuro los use, sin implementar ninguna lógica de timbrado.
- **Descuentos** por ticket o por línea — el total sigue siendo estrictamente la suma de subtotales, sin mecanismo de ajuste manual.
- **Métodos de pago distintos por línea** (pago mixto) — un solo método por ticket, ya decidido.
- **Selector de sucursal dentro del modal** — sigue tomándose de `SucursalContext`, igual que hoy.
- **Conversión de unidades (paquete → pieza) al vender** — sigue fuera de alcance, mismo criterio que spec 16.
- **Impresión o generación de un ticket/recibo para el cliente** — no se pidió, y es una superficie nueva (formato, layout) que amerita su propio spec si se necesita.
- **Reporte de productos más vendidos o valuación de inventario** — fuera de alcance.
- **Migración o backfill de las filas actuales de `dbo.Ventas`** — se confirmó que no hay datos reales que preservar.

## Modelo de datos

### `dbo.Ventas` (encabezado, se recrea)

Sin backfill — se confirmó que no hay datos reales que preservar. Se dropea y se vuelve a crear con las columnas de encabezado; mantiene el mismo patrón de `id_venta` manual (`MAX+1` dentro de la transacción) que ya usan tablas hermanas como `dbo.pagos`, en vez de `IDENTITY`, para no desviarse del patrón existente en tablas `dbo.*` legadas.

```sql
DROP TABLE [CentroPodologico].[dbo].[Ventas];
GO
CREATE TABLE [CentroPodologico].[dbo].[Ventas](
	[id_venta]     [int] NOT NULL,
	[id_sucursal]  [int] NOT NULL,
	[idMetodoPago] [int] NOT NULL,
	[total]        [decimal](18, 2) NOT NULL DEFAULT 0,
	[created_at]   [datetime] NOT NULL,
	[id_usuario]   [int] NOT NULL,
	[status]       [bit] NOT NULL DEFAULT 1,
	[webid]        [varchar](50) NOT NULL,
	[facturado]    [bit] NOT NULL DEFAULT 0,
	[uuid_cfdi]    [varchar](50) NULL,
 CONSTRAINT [PK_Ventas] PRIMARY KEY CLUSTERED ([id_venta] ASC)
) ON [PRIMARY]
GO
CREATE UNIQUE INDEX [UQ_Ventas_webid] ON [CentroPodologico].[dbo].[Ventas] ([webid] ASC)
GO
```

### `dbo.VentasDetalle` (líneas, tabla nueva)

Tabla nueva de verdad, sigue el patrón `IDENTITY` + FK que ya usa `inventory.purchase_order_items`.

```sql
CREATE TABLE [CentroPodologico].[dbo].[VentasDetalle](
	[id_venta_detalle] [int] IDENTITY(1,1) NOT NULL,
	[id_venta]         [int] NOT NULL,
	[id_producto]      [int] NOT NULL,
	[cantidad]         [decimal](18, 4) NOT NULL,
	[precio_unitario]  [decimal](18, 2) NOT NULL,  -- snapshot de ISaleProduct.effective_price al guardar
	[subtotal]         [decimal](18, 2) NOT NULL,  -- cantidad * precio_unitario
	[created_at]       [datetime] NOT NULL,
 CONSTRAINT [PK_VentasDetalle] PRIMARY KEY CLUSTERED ([id_venta_detalle] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [CentroPodologico].[dbo].[VentasDetalle] WITH CHECK ADD CONSTRAINT [FK_VentasDetalle_Ventas]
	FOREIGN KEY([id_venta]) REFERENCES [CentroPodologico].[dbo].[Ventas] ([id_venta])
GO
ALTER TABLE [CentroPodologico].[dbo].[VentasDetalle] CHECK CONSTRAINT [FK_VentasDetalle_Ventas]
GO
CREATE INDEX [IX_VentasDetalle_id_venta] ON [CentroPodologico].[dbo].[VentasDetalle] ([id_venta] ASC)
GO
```

**`inventory.kardex.id_venta` no cambia de tipo ni de índice** (columna ya agregada en spec 16) — sigue siendo el id del encabezado; junto con `id_product` de cada fila de kardex identifica a qué línea del ticket corresponde ese movimiento, sin necesitar `id_venta_detalle` en el kardex.

### `interfaces/venta.ts` (reescrita)

```ts
export interface IVentaDetalle {
  id_venta_detalle: number;
  id_producto:      number;
  nombre_producto?: string;   // joined
  cantidad:         number;
  precio_unitario:  number;
  subtotal:         number;
}

export interface IVenta {
  id_venta:            number;
  id_sucursal:         number;
  idMetodoPago:        number;
  total:               number;
  created_at:          string;
  id_usuario:          number;
  status:              number;
  webid:               string | null;
  facturado:           number | null;
  uuid_cfdi:           string | null;
  lineas:              IVentaDetalle[];
  // joined
  descripcion_metodo?: string;
}
```

### `app/dashboard/ventas/actions.ts` — formas nuevas/modificadas

```ts
export type VentaLineaForm = {
  id_venta_detalle?: number;   // presente = línea existente; ausente = línea nueva
  id_producto:       number;
  cantidad:          number;
};

export type VentaForm = {
  id_venta:     number;        // 0 = nueva venta
  id_sucursal:  number;
  idMetodoPago: number;
  lineas:       VentaLineaForm[];
};
```

`getVentas` corre dos consultas (encabezados filtrados por sucursal/rango, luego `VentasDetalle` con `LEFT JOIN inventory.Products` filtrado por `id_venta IN (...)`) y arma `IVenta[]` con `lineas` anidadas en JS — no se usa `FOR JSON`, siguiendo el estilo de raw SQL del resto del repo.

### Cálculo del ajuste de stock al editar (por línea, dentro de `db.transaction`)

Se leen las líneas actuales del ticket (`WITH (UPDLOCK, HOLDLOCK)`), comparadas contra `form.lineas`:

- **Línea nueva** (`id_venta_detalle` ausente en el form): `INSERT` a `VentasDetalle` + `applyStockMovement` movimiento `6`, `quantity = cantidad`.
- **Línea eliminada** (`id_venta_detalle` existente en BD, ausente en el form): `applyStockMovement` movimiento `7`, `quantity = cantidad` (reversa completa) + `DELETE` de la fila de `VentasDetalle`.
- **Línea que permanece con la misma cantidad**: sin movimiento, sin `UPDATE`.
- **Línea que permanece con cantidad distinta**: `delta = cantidadNueva - cantidadVieja`; `delta > 0` → movimiento `6` por `delta`; `delta < 0` → movimiento `7` por `abs(delta)`; luego `UPDATE` de `cantidad`/`precio_unitario`/`subtotal`.

**Cambiar el producto de una línea existente no es una operación soportada por el modal** — la interacción de carrito es agregar/quitar líneas, no "editar el producto" de una línea ya creada; el usuario logra el mismo resultado quitando la línea y agregando el producto correcto (ver Decisiones).

Al eliminar el ticket completo: un movimiento `7` por cada línea existente (reversa completa), igual que hoy pero iterado.

## Plan de implementación

1. **BD.** Ejecutar el `DROP TABLE`/`CREATE TABLE [dbo].[Ventas]`, el `CREATE TABLE [dbo].[VentasDetalle]` con su FK e índice de "Modelo de datos", y anexarlos a `queries.txt` bajo el encabezado `-- spec 35 — ventas con múltiples productos por ticket`.

2. **`interfaces/venta.ts`.** Reemplazar `IVenta` por la versión de encabezado con `lineas: IVentaDetalle[]`, agregar `IVentaDetalle`, tal como se definieron en "Modelo de datos".

3. **`app/dashboard/ventas/actions.ts`:**
   - `getVentas`: reescribir para traer encabezados (filtrados por `id_sucursal`/rango de fechas, igual que hoy) y, con los `id_venta` resultantes, una segunda consulta a `VentasDetalle LEFT JOIN inventory.Products` para `nombre_producto`; ensamblar `IVenta[]` con `lineas` anidadas en JS.
   - `saveVenta(form: VentaForm)`: reescribir dentro de `db.transaction`.
     - **Creación (`id_venta === 0`):** calcular `total` como suma de `cantidad × effective_price` resuelto server-side por cada línea (nunca confiar en un total que mande el cliente — mismo criterio que spec 34 aplicó al importe), insertar el encabezado, insertar una fila de `VentasDetalle` por línea, y un `applyStockMovement` (movimiento `6`) por línea.
     - **Edición (`id_venta !== 0`):** `SELECT` de las líneas actuales `WITH (UPDLOCK, HOLDLOCK)`, aplicar el diff descrito en "Modelo de datos" (líneas nuevas/eliminadas/cambiadas), recalcular `total`, y `UPDATE` del encabezado (`idMetodoPago`, `total`).
   - `deleteVenta(id_venta)`: `SELECT` de todas las líneas del ticket `WITH (UPDLOCK, HOLDLOCK)`, un `applyStockMovement` movimiento `7` por cada una, luego `UPDATE ... SET status = 0` en el encabezado.
   - `VentaForm`/`VentaLineaForm` como se definieron en "Modelo de datos". `getSaleProducts` y `getMetodosPagos` no cambian.

4. **`VentaModal.tsx`.** Rediseñar como carrito:
   - Selector de producto + cantidad para agregar una línea; al agregar un producto ya presente en `lineas`, suma la cantidad a esa línea en vez de crear una nueva.
   - Lista de líneas agregadas (producto, cantidad editable, subtotal, botón quitar).
   - Un solo selector de método de pago para el ticket completo.
   - Total de solo lectura: suma de `cantidad × effective_price` de las líneas visibles (usando `ISaleProduct.effective_price`, igual que hoy calcula `page.tsx`).
   - Advertencia de stock insuficiente evaluada por línea (misma lógica que hoy, repetida por cada línea cuya cantidad exceda su `stock_quantity`).
   - Botón "Guardar" deshabilitado si `lineas.length === 0`, no hay método de pago, o no hay productos/métodos cargados.

5. **`app/dashboard/ventas/page.tsx`.** Adaptar el estado del formulario a `VentaForm` (encabezado + `lineas`): reemplazar `handleChange` (pensado para un solo producto) por manejadores de carrito (`addLinea`, `removeLinea`, `updateLineaCantidad`, `setMetodoPago`) pasados al modal; `openNew` inicia con `lineas: []`; `openEdit(v: IVenta)` mapea `v.lineas` a `VentaLineaForm[]` (con `id_venta_detalle` presente en cada una).

6. **`VentaFila.tsx`.** Reescribir para mostrar una fila por ticket: fecha, resumen compacto de `v.lineas` (ej. `"Curitas x2, Alcohol x1"`), método de pago, total, facturado, acciones. `ConfirmModal` de eliminación describe el ticket por su resumen de productos en vez de `nombre_producto` único.

7. **Verificación manual:** crear un ticket con 3 líneas de productos distintos y confirmar 3 filas de kardex (mov. `6`) y que `inventory.stock` baja en cada producto; agregar el mismo producto dos veces en el modal y confirmar que se fusiona en una sola línea; editar un ticket agregando una línea nueva, quitando otra, y cambiando la cantidad de una tercera, y confirmar los movimientos `6`/`7` correspondientes a cada caso; eliminar un ticket completo y confirmar que el stock de todas sus líneas se restaura; vender más cantidad que el stock disponible en una línea y confirmar que la advertencia aparece solo en esa línea sin bloquear el guardado; confirmar que el listado muestra un renglón por ticket con el resumen de productos correcto.

8. `npm run build` sin errores de TypeScript.

## Criterios de aceptación

- [ ] `dbo.Ventas` existe como tabla encabezado (sin `id_producto`/`cantidad` propios) y `dbo.VentasDetalle` existe con FK a `dbo.Ventas`, ambas registradas en `queries.txt`.
- [ ] `IVenta` incluye `lineas: IVentaDetalle[]`; `IVentaDetalle` existe con `id_producto`, `cantidad`, `precio_unitario`, `subtotal`.
- [ ] El modal "Nueva venta" permite agregar dos o más productos distintos a un mismo ticket antes de guardar.
- [ ] Agregar un producto ya presente en el ticket suma su cantidad a la línea existente, sin crear una segunda línea del mismo producto.
- [ ] El total del ticket es de solo lectura y siempre igual a la suma de `cantidad × precio efectivo` de sus líneas visibles; no existe forma de editarlo a mano.
- [ ] El botón "Guardar" está deshabilitado si el ticket no tiene ninguna línea.
- [ ] Un solo método de pago se captura por ticket completo, no por línea.
- [ ] Registrar un ticket nuevo con N líneas inserta el encabezado, N filas en `VentasDetalle`, y genera exactamente N filas de kardex con movimiento `6` ("Salida por venta"), cada una con `id_venta` ligado al encabezado y `quantity` igual a la cantidad de su línea.
- [ ] `inventory.stock` de cada producto del ticket baja exactamente en la cantidad de su línea tras registrar la venta.
- [ ] `precio_unitario` y `subtotal` de cada línea quedan grabados como snapshot al momento de guardar; si el precio del producto cambia después, un ticket ya guardado no se altera.
- [ ] Editar un ticket agregando una línea nueva genera un movimiento `6` para esa línea; quitando una línea genera un movimiento `7` que revierte su cantidad completa y elimina la fila de `VentasDetalle`; cambiando la cantidad de una línea existente genera el movimiento `6`/`7` correspondiente a la diferencia — todo dentro de una sola transacción junto con los `UPDATE`/`INSERT`/`DELETE` de `VentasDetalle` y del encabezado.
- [ ] Eliminar (soft-delete) un ticket revierte con movimiento `7` el stock de **todas** sus líneas antes de marcar `status = 0` en el encabezado.
- [ ] Si la cantidad de una línea (al crear o aumentar en edición) deja su stock por debajo de cero, el modal muestra la advertencia solo en esa línea, sin bloquear el guardado.
- [ ] El listado de `/dashboard/ventas` muestra una fila por ticket, con sus productos resumidos de forma compacta, no una fila por línea de producto.
- [ ] `id_sucursal`, `id_empresa`, `id_usuario` se resuelven igual que hoy (sucursal desde `SucursalContext` en cliente, empresa/usuario desde el JWT en el server action); el total y el `precio_unitario` de cada línea se recalculan en el servidor, nunca se confía en un total mandado por el cliente.
- [ ] La página se ve correctamente en modo claro y oscuro, consistente con el resto de Ventas.
- [ ] `npm run build` sin errores de TypeScript.

## Decisiones tomadas y descartadas

- **Encabezado + líneas (`dbo.Ventas` + `dbo.VentasDetalle`), no una tabla plana con columna de agrupación ni N `saveVenta` independientes.** Se descartó agrupar filas planas con un `id_carrito` porque el total, el método de pago y `facturado`/`uuid_cfdi` tendrían que repetirse o vivir en un lugar ambiguo (¿en la primera fila del grupo?). Se descartó también disparar un `saveVenta` por línea porque el ticket dejaría de ser una sola operación atómica (una línea podría guardarse y otra fallar) y no habría un solo `id_venta` para facturar más adelante. El patrón encabezado + líneas ya es el que usa el repo para casos análogos (`purchase_orders`/`purchase_order_items`, `consulta_servicios`/`consulta_productos`).

- **Un solo método de pago por ticket, no por línea.** Coincide con cómo se cobra en mostrador en la práctica (spec 34 tomó la misma decisión para forma de pago SAT). Modelar pago mixto por línea es una funcionalidad real pero distinta, que además complicaría "una operación = un CFDI" para la facturación futura de ventas.

- **Total de solo lectura, autocalculado.** El total editable a mano del modelo anterior permitía que quedara inconsistente con `cantidad × precio` de la única línea. Con varias líneas ese riesgo se multiplica; se prefiere que el total sea siempre una función pura de las líneas, sin mecanismo de descuento manual (que queda fuera de alcance).

- **Seleccionar un producto ya agregado fusiona la cantidad en su línea existente, en vez de permitir líneas duplicadas.** Dos líneas del mismo producto en un mismo ticket no aportan información nueva (mismo snapshot de precio, mismo producto) y solo complicarían el diff de edición y el resumen del listado.

- **`precio_unitario`/`subtotal` como snapshot por línea, no recalculados en vivo.** Mismo criterio que `purchase_order_items.unit_price` y que las recepciones: una vez cobrado, el ticket no debe cambiar de total porque alguien edite el precio del producto en `/dashboard/productos` después.

- **Cambiar el producto de una línea existente no es una operación soportada; el usuario quita la línea y agrega la correcta.** Se consideró permitir "editar el producto" de una línea (como hacía el modelo anterior de una sola línea) y se descartó: en un carrito de varias líneas, quitar+agregar es la interacción natural y evita un tercer caso en el diff de edición (además de línea nueva/eliminada) que no aporta nada que quitar+agregar no resuelva ya.

- **`dbo.VentasDetalle` usa `IDENTITY`, `dbo.Ventas` conserva el patrón manual `MAX+1`.** `VentasDetalle` es una tabla genuinamente nueva y sigue el patrón ya establecido en tablas de líneas del repo (`purchase_order_items`). `dbo.Ventas` se recrea pero es la misma tabla legada que ya usaba `MAX+1` (como su hermana `dbo.pagos`); cambiar a `IDENTITY` ahí es una mejora posible pero fuera del propósito de este spec, que es agregar líneas, no modernizar el patrón de ids del encabezado.

- **Sin tabla puente adicional para el enlace de kardex.** `inventory.kardex.id_venta` (agregado en spec 16) ya identifica el encabezado; junto con `id_product` de cada fila de kardex es suficiente para saber a qué línea corresponde un movimiento, sin necesitar una columna `id_venta_detalle` nueva en el kardex.

- **Sin backfill de las filas actuales de `dbo.Ventas`.** Confirmado por el usuario que no hay datos reales que preservar, mismo criterio que spec 16 aplicó a la misma tabla hace dos semanas.

- **Facturación de ventas queda fuera, pero el encabezado ya deja `facturado`/`uuid_cfdi` listos.** Se consideró omitir esas columnas del encabezado y agregarlas en el spec de facturación de ventas, y se descartó: como spec 34 ya estableció el patrón de "una operación completa = un CFDI" reusando columnas existentes (no una tabla puente), dejarlas listas aquí evita otro `ALTER TABLE` en ese spec futuro sin implementar ninguna lógica de timbrado ahora.

## Riesgos identificados

- **`DROP TABLE [dbo].[Ventas]` contra la BD real sin verificar dependencias no registradas en `queries.txt`.** `queries.txt` no tiene el `CREATE TABLE` original de `dbo.Ventas` (es una tabla legada de antes de que el repo trackeara DDL), así que no hay certeza completa de que no exista una FK, vista o trigger externo que la referencie. *Mitigación:* antes de ejecutar el `DROP`, revisar en la BD real (`sys.foreign_keys`, `sys.sql_dependencies` o el catálogo del motor) si algo más apunta a `dbo.Ventas`; si aparece algo, resolverlo antes de continuar en vez de ejecutar el `DROP` a ciegas.

- **Ediciones con varias líneas cambiando a la vez son más fáciles de equivocar que el caso de una sola línea.** El diff de "Modelo de datos" tiene tres ramas (nueva, eliminada, cantidad distinta) que se evalúan por cada línea en la misma transacción; un ticket con 5 líneas donde 2 se quitan, 1 se agrega y 2 cambian de cantidad ejercita las tres ramas simultáneamente. *Mitigación:* el paso 7 del plan de implementación exige probar explícitamente ese escenario combinado, no solo casos aislados.

- **Reversas encadenadas quedan ruidosas en el kardex, ahora multiplicadas por línea.** Igual que el riesgo ya aceptado en spec 16, pero un ticket de 5 productos editado varias veces puede generar decenas de filas `6`/`7` en el kardex antes de estabilizarse. El saldo final es correcto; el historial es más difícil de leer.

- **Concurrencia en edición de un ticket con varias líneas.** El `SELECT ... WITH (UPDLOCK, HOLDLOCK)` de las líneas actuales serializa ediciones simultáneas del mismo ticket (igual que spec 16), pero con más líneas por ticket la ventana de bloqueo por edición es ligeramente mayor.

- **`dbo.Ventas` sigue con el patrón `MAX+1` en vez de `IDENTITY`.** Bajo alta concurrencia de escritura (varias cajas registrando tickets al mismo tiempo), ese patrón es más propenso a colisiones que un `IDENTITY` — riesgo preexistente que este spec no resuelve (ver Decisiones), heredado de `dbo.pagos` y del propio `dbo.Ventas` anterior.

- **El total y el `precio_unitario` se recalculan en el servidor a partir del precio efectivo vigente al momento de guardar, no del que se mostró al abrir el modal.** Si el precio de un producto cambia mientras el modal está abierto (edición concurrente en `/dashboard/productos`), el total guardado puede diferir del que el usuario vio en pantalla antes de dar clic en Guardar. Mismo tipo de ventana que spec 34 aceptó para el catálogo de precios de tratamientos; no bloquea el guardado.

- **Ningún mecanismo evita registrar un ticket con líneas de cantidad 0 o negativa si el cliente se manipula fuera del formulario.** El modal exige `cantidad ≥ 1` por línea, pero el server action debe validar lo mismo (no confiar solo en el `input min` del HTML) — queda como responsabilidad de implementación, no cubierto explícitamente por un criterio de aceptación separado.
