# 40 — Gasto de envío en la revisión de orden de pedidos

## Header

- **Estado:** Aprobado
- **Depende de:** [09-pedidos-compra-recepcion](09-pedidos-compra-recepcion.md) (crea `inventory.purchase_orders.shipping_cost`, ya existente en el esquema pero hardcodeado a `0` al insertar) y [35-ventas-multiples-productos-ticket](35-ventas-multiples-productos-ticket.md) como referencia de convención (aunque no depende de ventas).
- **Modifica base de datos:** No. La columna `inventory.purchase_orders.shipping_cost` ya existe; solo deja de insertarse fija en `0`.
- **Fecha:** 2026-09-04
- **Objetivo:** Permitir capturar, en la pantalla de Revisión de Orden, un gasto de envío opcional por cada proveedor/orden a generar, que se suma sin IVA al total de esa orden y se guarda en `shipping_cost`.

## Alcance

**Incluye:**

- En `/dashboard/pedidos/nuevo/revision`, cada grupo de proveedor (`SupplierOrderGroup.tsx`) gana un campo numérico **"Gasto de envío"**, junto al selector de método de pago existente, que edita `shippingCostBySupplier[id_supplier]`.
- `PurchaseCartContext.tsx` gana el estado `shippingCostBySupplier: Record<number, number>` (mismo patrón que `paymentMethodBySupplier`) y el setter `setSupplierShippingCost(id_supplier, shipping_cost)`. Se persiste en `sessionStorage` junto con el resto del carrito.
- El resumen lateral (`Resumen del pedido`) agrega una línea **"Envío"** (suma de `shippingCostBySupplier` de los proveedores con líneas en el carrito) entre "IVA" y "Total estimado", y el total pasa a ser `subtotal + tax + envío`.
- Dentro de cada `SupplierOrderGroup`, se agrega un renglón de total de grupo (subtotal de sus líneas + su envío), que hoy no existe.
- `createPurchaseOrders` (`app/dashboard/pedidos/actions.ts`) recibe `shippingCostBySupplier` en `ICreatePurchaseOrdersInput`, valida que cada valor sea `>= 0`, y lo usa (en vez de `0` fijo) al insertar cada `purchase_orders`, sumándolo también al `total` que hoy solo es `subtotal + tax`.
- Un proveedor sin gasto de envío capturado (campo vacío) se trata como `0`, sin bloquear la generación de la orden.

**No incluye:**

- **Cambios al esquema de base de datos.** `shipping_cost` ya existe en `inventory.purchase_orders` desde la spec 09; esta spec solo deja de ignorarlo.
- **IVA sobre el envío.** `shipping_cost` se suma directo al total, sin pasar por `tax_rate` ni afectar `tax`.
- **Reparto/prorrateo de un envío global entre proveedores.** Se descartó explícitamente — cada proveedor/orden captura su propio envío.
- **Edición del gasto de envío después de generada la orden** (en `/dashboard/pedidos/[id]`). Esa pantalla ya muestra `shipping_cost` de solo lectura cuando es mayor a 0; editarlo post-creación queda fuera.
- **Plantillas de pedido (`OrderTemplatesTab`, `EditOrderTemplateModal`).** No capturan ni recuerdan envío; el campo solo vive en la revisión final.
- **Validación de tope máximo o razonabilidad del monto de envío.**

## Modelo de datos

No hay cambios en base de datos — `inventory.purchase_orders.shipping_cost` ya existe (spec 09). Solo se amplían tipos TypeScript ya existentes, ninguno se rompe:

```ts
// contexts/PurchaseCartContext.tsx

interface PurchaseCartContextType {
  // ...existentes...
  /** id_supplier -> gasto de envío de esa orden. Ausente o 0 = sin envío. */
  shippingCostBySupplier: Record<number, number>;
  setSupplierShippingCost: (id_supplier: number, shipping_cost: number) => void;
  // ...
}
```

```ts
// app/dashboard/pedidos/actions.ts

export interface ICreatePurchaseOrdersInput {
  // ...existentes...
  /** id_supplier -> gasto de envío. Proveedor ausente = 0. */
  shippingCostBySupplier: Record<number, number>;
}
```

**Persistencia en `sessionStorage`:** `shippingCostBySupplier` se guarda dentro del mismo objeto `JSON.stringify({ lines, estimatedDate, notes, paymentMethodBySupplier, shippingCostBySupplier })`; al leer, si la clave no existe (carrito guardado antes de esta spec), se usa `{}` como default — mismo patrón que ya usa `paymentMethodBySupplier ?? {}`.

**Cálculo del total por orden, en `createPurchaseOrders`:**

```
subtotal = round2(Σ line.quantity * line.unit_price)
tax      = round2(Σ (line.applies_iva ? line.quantity * line.unit_price * TAX_RATE/100 : 0))
shipping = round2(shippingCostBySupplier[id_supplier] ?? 0)
total    = round2(subtotal + tax + shipping)
```

`shipping_cost` se inserta con ese valor en vez del `0` fijo actual; el resto de columnas (`discount`, etc.) no cambia.

## Plan de implementación

1. **`contexts/PurchaseCartContext.tsx`.** Agregar `shippingCostBySupplier` al estado (`useState<Record<number, number>>({})`), el setter `setSupplierShippingCost`, incluirlo en la lectura/escritura de `sessionStorage` (con default `{}`) y en el reset de `clearCart()`. Exponerlo en el value del provider y en `PurchaseCartContextType`.

   *Verificación:* `npm run build` compila; recargar `/dashboard/pedidos/nuevo/revision` con un carrito ya guardado (sin la clave nueva) no rompe la hidratación.

2. **`app/dashboard/pedidos/nuevo/revision/componentes/SupplierOrderGroup.tsx`.** Agregar prop `shippingCost: number` y `onShippingCostChange: (value: number) => void` (solo cuando `id_supplier !== null`, igual que `onPaymentMethodChange`). Renderizar un input numérico "Gasto de envío" junto al selector de método de pago, en el mismo encabezado del grupo. Agregar un renglón de total de grupo (subtotal de líneas + envío) al pie de la tabla de productos del grupo.

   *Verificación:* capturar un envío en un grupo no afecta a los demás grupos; dejar el campo vacío se comporta como 0 sin errores en consola.

3. **`app/dashboard/pedidos/nuevo/revision/page.tsx`.** Leer `shippingCostBySupplier`/`setSupplierShippingCost` del contexto; pasar `shippingCost`/`onShippingCostChange` a cada `SupplierOrderGroup`. Sumar el envío de los proveedores presentes en `groupedBySupplier` para una nueva línea "Envío" en el resumen lateral, y ajustar `total = subtotal + tax + envío`. Incluir `shippingCostBySupplier` en el payload de `createPurchaseOrders`.

   *Verificación:* el total del resumen lateral coincide con la suma manual de subtotal + IVA + envío de todos los grupos.

4. **`app/dashboard/pedidos/actions.ts` — `createPurchaseOrders`.** Agregar `shippingCostBySupplier` a `ICreatePurchaseOrdersInput`; validar `shippingCostBySupplier[id_supplier] >= 0` cuando esté presente (mismo estilo de validación que ya existe para `unit_price`/`quantity`); calcular `shipping` y `total` por proveedor según el modelo de datos; usar `shipping` en el `INSERT` en vez de `0` fijo.

   *Verificación:* generar una orden con envío > 0 para un proveedor y sin envío para otro; confirmar en BD que `shipping_cost` y `total` de cada orden son correctos, y que la orden sin envío queda en `0` igual que antes.

5. **Verificación manual completa:** armar un carrito con líneas de 2 proveedores distintos, capturar envío solo en uno, generar las órdenes, y confirmar en `/dashboard/pedidos/[id]` de cada una que `shipping_cost` se muestra (o no) igual que hoy ya lo hace la pantalla de detalle. Confirmar que un carrito sin envío capturado en ningún proveedor genera órdenes con `shipping_cost = 0`, sin cambio de comportamiento respecto a hoy.

6. `npm run build` sin errores de TypeScript.

Cada paso deja el sistema compilable y funcional; el envío no se refleja en la UI hasta el paso 3, y no se persiste en BD hasta el paso 4.

## Criterios de aceptación

- [ ] Cada grupo de proveedor en `/dashboard/pedidos/nuevo/revision` muestra un campo "Gasto de envío" independiente de los demás grupos.
- [ ] Dejar el campo de envío vacío o en `0` no bloquea el botón "Generar Orden de Compra".
- [ ] El resumen lateral muestra una línea "Envío" con la suma de los envíos capturados, y "Total estimado" = subtotal + IVA + envío.
- [ ] El envío capturado **no** afecta el cálculo de "IVA (16%)" del resumen ni de ningún grupo.
- [ ] Generar la orden guarda `shipping_cost` de cada `purchase_orders` con el valor capturado para su proveedor, y `total` de esa orden = `subtotal + tax + shipping_cost`.
- [ ] Un proveedor sin envío capturado genera su orden con `shipping_cost = 0`, igual que el comportamiento actual.
- [ ] El servidor rechaza (`ActionResult` con `ok: false`) un `shippingCostBySupplier` con un valor negativo para algún proveedor con líneas en el carrito.
- [ ] `/dashboard/pedidos/[id]` sigue mostrando "Envío" solo cuando `shipping_cost > 0`, sin cambios en esa pantalla.
- [ ] Un carrito guardado en `sessionStorage` antes de esta spec (sin la clave `shippingCostBySupplier`) sigue cargando sin errores, con envío `0` por defecto.
- [ ] Recargar `/dashboard/pedidos/nuevo/revision` conserva el envío capturado por proveedor (persistido en `sessionStorage`), igual que ya ocurre con el método de pago.
- [ ] La pantalla se ve correctamente en modo claro y oscuro, consistente con el resto de Pedidos.
- [ ] `npm run build` compila sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **Envío por proveedor/orden, no un envío global prorrateado.** Cada orden generada ya es una unidad independiente (folio, método de pago, `id_supplier` propios); prorratear un envío global obligaría a definir una regla de reparto (¿proporcional al subtotal? ¿partes iguales?) para un caso que en la práctica ya se resuelve mejor capturando el envío real de cada proveedor, que es el dato que efectivamente se factura por separado.

- **Opcional, default 0.** Coincide con "en caso de existir" del pedido original: no todo proveedor cobra envío, y obligar a capturarlo (aunque sea escribiendo `0`) es fricción sin beneficio — el campo vacío ya es indistinguible de `0` para el cálculo.

- **Sin IVA sobre el envío.** Se descartó gravarlo al 16% como las líneas de producto porque el envío no es un producto de la orden — es un cargo del proveedor cuya política de IVA no se conoce ni se está capturando en esta spec (podría ir gravado o no según el proveedor, según su propia factura). Sumarlo directo al total sin inventar una tasa evita reportar un IVA que después no coincida con la factura real; si en el futuro se necesita, es un ajuste de una sola línea de código (`shipping * TAX_RATE/100`) cuando se decida explícitamente.

- **Se agrega un renglón de total por grupo de proveedor.** Hoy `SupplierOrderGroup` no muestra un total propio (solo subtotales por línea), y con dos o más proveedores en el carrito el usuario no tenía forma de ver cuánto costaría cada orden individualmente antes de generar. Con envío por proveedor, mostrar solo el total combinado en el resumen lateral oscurecería cuánto aporta el envío a cada orden en particular.

- **No se toca `[id]/page.tsx` (detalle de orden).** Ya muestra `shipping_cost` condicionalmente (`> 0`) desde que existe la columna (spec 09); esta spec solo deja de forzarlo a `0` al crear la orden, así que el detalle empieza a mostrar valores reales sin necesitar cambios.

- **No se agrega a plantillas de pedido.** Las plantillas (`OrderTemplatesTab`, `EditOrderTemplateModal`) representan un conjunto de productos recurrente, no una orden con proveedor/método de pago/envío ya decididos — el envío es una decisión de la revisión final, no de la plantilla reutilizable.

## Riesgos identificados

- **El campo numérico de envío no tiene un tope máximo ni validación de "razonabilidad" en el cliente.** Un valor capturado por error (p. ej. un cero de más) no se detecta antes de generar la orden. *Mitigación:* el servidor sigue siendo la única fuente de verdad del total (ya recalculado ahí, nunca confiado del cliente); si se vuelve un problema real, se puede agregar una advertencia visual cuando el envío exceda cierto porcentaje del subtotal de la orden.

- **Carritos ya guardados en `sessionStorage` de sesiones abiertas antes del despliegue** no tendrán la clave `shippingCostBySupplier` hasta que se recargue la página con el código nuevo. Ya cubierto por el default `?? {}` al leer, pero vale la pena confirmarlo explícitamente en la verificación manual (paso 5 del plan).
