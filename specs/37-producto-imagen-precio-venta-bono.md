# 37 — Modal de Producto: Imagen, Precio de Venta y Bono de Venta

**Estado:** Implementado
**Dependencias:** spec 08 (productos-inventario-crud), spec 12 (precio-venta-productos-paquete)
**Fecha:** 2026-09-04

**Objetivo:** Reemplazar el campo de URL manual del producto por una subida de imagen (redimensionada a 400px), permitir capturar precio de venta en cualquier producto de categoría Venta sin requerir "dividir unidad", agregar el campo `bono_venta`, y añadir una acción de "Ver" en `ProductRow.tsx` con un modal de solo lectura.

## Alcance

**Incluye:**

- En `ProductModal.tsx`: reemplazar el input de texto "URL Producto" por un uploader de imagen (selección de archivo → redimensionado en el navegador a max-width 400px → subida a Cloudinary vía `/api/upload?folder=clinica/productos` → la URL resultante se guarda en `url_product`). Preview de la imagen actual/subida; solo se puede reemplazar (subir otra sobrescribe), no hay botón "quitar" independiente.
- En `ProductModal.tsx`: mostrar y requerir el campo "Precio de Venta" (`sale_price`) siempre que `id_category === 4` (Venta), sin importar el valor de `split`. El label de `price` no cambia ("Precio Unitario" cuando no hay split, "Precio de Compra (paquete/caja)" cuando sí lo hay — comportamiento actual sin modificar).
- Nueva columna `bono_venta` (decimal, nullable) en `[CentroPodologico].[inventory].[Products]`, vía `ALTER TABLE`.
- En `ProductModal.tsx`: nuevo input `bono_venta` (numérico decimal), visible únicamente cuando `id_category === 4` (Venta).
- `saveProduct` (`actions.ts`): persistir `url_product` (ahora siempre URL de Cloudinary) y `bono_venta`; validar `sale_price` obligatorio cuando `id_category === 4` (ya no condicionado a `split`).
- `getProducts` (`actions.ts`): incluir `bono_venta` en el SELECT.
- `IProduct` (`interfaces/product.ts`): agregar `bono_venta: number | null`.
- En `ProductRow.tsx`: nuevo botón "Ver" (icono, antes de "Editar") que abre un modal de solo lectura (`ProductViewModal.tsx`, nuevo componente) mostrando todos los campos del producto, incluida la imagen.

**No incluye (fuera de alcance de esta spec):**

- Uso o cálculo de `bono_venta` en el flujo de ventas (`app/dashboard/ventas`) — solo se captura y guarda en el producto; queda para una spec futura.
- Migración de productos existentes que ya tengan una `url_product` manual (URL externa no-Cloudinary) — se conservan tal cual hasta que alguien suba una imagen nueva.
- Cambios al listado/tabla de `page.tsx` (columnas, filtros) más allá de pasar `bono_venta`/imagen al modal de vista.
- Multi-imagen por producto — sigue siendo una sola imagen (`url_product`).

## Modelo de datos

### Cambio de esquema

`ALTER TABLE [CentroPodologico].[inventory].[Products] ADD [bono_venta] DECIMAL(10,2) NULL;`

- Nullable: los productos existentes quedan con `bono_venta = NULL` (equivalente a "sin bono").
- Sin default numérico (no se asume 0 para no confundir "sin bono" con "bono de $0").

### `interfaces/product.ts`

```ts
export interface IProduct {
  // ...campos existentes...
  bono_venta: number | null;
}
```

### `ProductFormData` (`ProductModal.tsx`)

Sigue siendo `Omit<IProduct, "id_empresa" | "status" | "created_at">`, por lo que hereda `bono_venta` automáticamente — no requiere cambios propios de tipo.

### Nuevo componente `ProductViewModal.tsx`

```ts
interface Props {
  product: IProduct;
  categoryName: string;
  supplierName: string;
  onClose: () => void;
}
```

Solo lectura: no recibe `onChange`/`onSubmit`, no renderiza inputs, solo texto/etiquetas y la imagen (`url_product`) con fallback visual si está vacía.

## Plan de implementación

1. **DB**: ejecutar `ALTER TABLE [CentroPodologico].[inventory].[Products] ADD [bono_venta] DECIMAL(10,2) NULL;` contra la base de datos. Registrar la sentencia en `queries.txt`.

2. **Interfaz**: agregar `bono_venta: number | null` a `IProduct` (`interfaces/product.ts`).

3. **Server actions** (`app/dashboard/productos/actions.ts`):
   - Incluir `[bono_venta]` en el `SELECT` de `getProducts`.
   - Desestructurar `bono_venta` en `saveProduct`, incluirlo en `commonParams`, en el `INSERT` y en el `UPDATE`.
   - Cambiar la validación de `sale_price`: de `if (id_category === 4 && split === true)` a `if (id_category === 4)` (ya no exige `split`).

4. **Cloudinary**: no requiere cambios en `app/api/upload/route.ts` (ya acepta `folder` e imágenes por query param); solo se usará `folder=clinica/productos` desde el cliente.

5. **`ProductModal.tsx`**:
   - Quitar el input de texto "URL Producto".
   - Agregar uploader de imagen: input de archivo oculto + botón "Subir imagen" + preview (imagen actual si `url_product` tiene valor). Al seleccionar archivo: redimensionar a max-width 400px (función `resizeImage`, mismo patrón que `TabFotos.tsx` pero con `maxWidth = 400`), subir a `POST /api/upload?name=...&folder=clinica/productos`, y al responder `ok`, actualizar `form.url_product` vía `onChange` sintético o un nuevo callback `onImageUploaded(url: string)`.
   - Cambiar la condición de mostrar/requerir `sale_price` de `isVentaSplit` a `isVenta = form.id_category === 4` (el label de `price` sigue usando `isVentaSplit` sin cambios).
   - Agregar input `bono_venta` (numérico, `step="0.01"`, `min={0}`), visible solo cuando `isVenta`.

6. **`page.tsx`**:
   - Agregar `bono_venta: null` a `EMPTY`.
   - Agregar `bono_venta: product.bono_venta` en `openEdit`.
   - Agregar `"bono_venta"` a la lista de campos parseados como decimal en `handleChange` (mismo tratamiento que `sale_price`).
   - Si el uploader usa un callback dedicado (`onImageUploaded`) en vez de `onChange`, implementarlo en `page.tsx` actualizando `form.url_product`.

7. **`ProductRow.tsx`**:
   - Agregar estado `showView` y botón "Ver" (icono `Eye` de `lucide-react`) antes del botón "Editar", que abre `ProductViewModal`.

8. **Nuevo `ProductViewModal.tsx`**: modal de solo lectura con todos los campos del producto (imagen, nombre, categoría, marca, presentación, unidad, talla, precio, precio de venta, bono_venta, código, proveedor, piezas, stock mínimo, consumo automático, descripción, activo/split), reutilizando clases de estilo existentes; botón único "Cerrar".

Cada paso deja el sistema funcional y compilando.

## Criterios de aceptación

- [x] La columna `bono_venta` existe en `[CentroPodologico].[inventory].[Products]` como `DECIMAL(10,2) NULL`.
- [x] `IProduct` incluye `bono_venta: number | null`.
- [x] En "Nuevo producto"/"Editar producto", el campo "URL Producto" ya no existe como input de texto; en su lugar hay un botón para subir imagen con preview.
- [x] Al subir una imagen mayor a 400px de ancho, la imagen efectivamente enviada a Cloudinary mide máximo 400px de ancho (proporción conservada).
- [x] Tras subir una imagen, `url_product` en el formulario queda con la URL devuelta por `/api/upload`, y al guardar el producto esa URL se persiste en la BD.
- [x] Subir una nueva imagen sobre una ya existente reemplaza el valor de `url_product` (no hay acumulación ni botón de "quitar" separado).
- [x] Con `id_category === 4` (Venta) y `split` **desmarcado**, el campo "Precio de Venta" es visible y obligatorio (el formulario no permite guardar sin él).
- [x] Con `id_category === 4` y `split` marcado, el comportamiento de "Precio de Venta" sigue igual que antes (obligatorio).
- [x] Con `id_category !== 4`, "Precio de Venta" no se muestra ni se exige (comportamiento sin cambios).
- [x] El label de `price` no cambia respecto al comportamiento actual (`"Precio Unitario"` vs `"Precio de Compra (paquete/caja)"` según `split`).
- [x] El input `bono_venta` solo aparece en el modal cuando `id_category === 4`; se puede dejar vacío (`null`) sin bloquear el guardado.
- [x] Guardar un producto de categoría Venta con `bono_venta` capturado persiste el valor correctamente; recargar el listado y reabrir "Editar" muestra el mismo valor.
- [x] `ProductRow.tsx` muestra un botón "Ver" antes de "Editar" y "Eliminar".
- [x] El botón "Ver" abre `ProductViewModal` mostrando todos los campos del producto (incluida la imagen) sin ningún input editable ni botón de guardar.
- [x] Cerrar `ProductViewModal` no dispara ninguna llamada a `saveProduct` ni modifica datos.
- [x] `npm run build` (o `tsc`) compila sin errores de tipos tras los cambios.

## Decisiones tomadas y descartadas

- **Reemplazar `url_product` (texto) por subida de imagen, en vez de mantener ambos** — decisión del usuario: evita URLs rotas/inconsistentes y sigue el patrón ya usado en `TabFotos.tsx`/documentos de empleados.
- **Redimensionar a 400px de ancho en el cliente antes de subir**, no solo limitar el ancho visual del preview — decisión del usuario: reduce peso de imagen subida a Cloudinary, igual que ya se hace en consultas (ahí con 700px).
- **`sale_price` obligatorio en toda categoría Venta, sin importar `split`** (en vez de mantenerlo opcional cuando no hay split) — decisión explícita del usuario, aunque cambia el comportamiento de la spec 12 original.
- **Label de `price` sin cambios** cuando `split=false` en categoría Venta — se descartó introducir un tercer label; se prioriza no tocar UI que ya funciona bien fuera del alcance pedido.
- **`bono_venta` solo aplica a categoría Venta** (no a todos los productos) — coherente con que solo los productos de venta generan una venta con bono asociado; insumos/consulta no aplican.
- **`bono_venta` es solo un dato capturado en el producto por ahora**, sin lógica de cálculo/pago en el flujo de ventas — se descartó ampliar el alcance a `ventas/` para no mezclar dos specs; queda anotado como trabajo futuro.
- **Modal de vista como componente nuevo (`ProductViewModal`)**, en vez de agregar un prop `readOnly` a `ProductModal` — decisión del usuario: mantiene el formulario de edición simple y evita bifurcar su lógica con condicionales de solo-lectura.
- **Sin botón "quitar imagen" independiente** — reemplazar es suficiente para el caso de uso; se descartó por simplicidad, ya que Cloudinary conserva la imagen anterior sin costo relevante (no se borra explícitamente).
- **Columna `bono_venta` nullable sin default** — se descartó `DEFAULT 0` para distinguir explícitamente "sin bono configurado" de "bono de $0".
