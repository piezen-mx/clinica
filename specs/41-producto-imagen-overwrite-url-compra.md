# 41 — Producto: spinner de subida, reemplazo de imagen en Cloudinary y URL de compra

## Header

- **Estado:** Aprobado
- **Depende de:** [37-producto-imagen-precio-venta-bono](37-producto-imagen-precio-venta-bono.md) (introdujo el uploader de imagen y `ProductViewModal.tsx` que esta spec modifica)
- **Modifica base de datos:** Sí. Nueva columna `inventory.Products.url_compra` (nullable), vía `ALTER TABLE`.
- **Fecha:** 2026-09-05
- **Objetivo:** Mostrar un spinner mientras se sube la imagen del producto, hacer que cada imagen subida reemplace a la anterior en Cloudinary (en vez de acumular assets), agregar el campo `url_compra` capturable en el formulario y visible como link en el detalle, y permitir ver la imagen del producto a tamaño completo desde el detalle.

## Alcance

**Incluye:**

- **`ProductModal.tsx` — spinner de carga:** mientras `uploadingImage` es `true`, se muestra un overlay circular (spinner) encima del recuadro de preview de 20x20 (imagen actual o placeholder "Sin imagen"), además de seguir deshabilitando el botón "Subir imagen".
- **`ProductModal.tsx` — reemplazo real en Cloudinary:** el nombre de archivo enviado a `/api/upload` deja de incluir `Date.now()` y pasa a ser estable por producto: `producto_{id_product}.jpg` cuando se edita un producto existente (`id_product > 0`), o `producto_tmp_{tempId}.jpg` cuando es un producto nuevo (`id_product === 0`), usando un `tempId` aleatorio generado una sola vez al abrir el modal (persistente mientras el modal permanece abierto, aunque se suban varias imágenes antes de guardar). La subida se hace con `overwrite=true`, de modo que cada imagen nueva sustituye al mismo asset en Cloudinary en lugar de crear uno adicional.
- **`app/api/upload/route.ts`:** nuevo query param opcional `overwrite` (`"true"` u omitido). Cuando es `"true"`, se pasa `overwrite: true` a `cloudinary.uploader.upload_stream`; si se omite, se mantiene `overwrite: false` (comportamiento actual, sin cambios para consultas/empleados/pedidos/tratamientos/facturación).
- **Nueva columna `url_compra`** (`NVARCHAR`, nullable) en `[CentroPodologico].[inventory].[Products]`, vía `ALTER TABLE`.
- **`ProductModal.tsx` — campo `url_compra`:** nuevo input de texto "URL de Compra" (tipo `url`, opcional, sin validación estricta de formato), junto a los demás campos de texto del producto.
- **`ProductViewModal.tsx` — mostrar `url_compra`:** nuevo `Field` en la grilla de datos ("URL de Compra") que muestra el valor como link cliqueable (`target="_blank"`, `rel="noopener noreferrer"`) cuando existe, o "—" cuando está vacío.
- **`ProductViewModal.tsx` — imagen a tamaño completo:** click sobre la miniatura de 32x32 abre un lightbox (overlay por encima del modal de detalle) con la imagen a su tamaño natural (limitada al viewport), cerrable con click fuera de la imagen o un botón "×"; solo aplica cuando `url_product` tiene valor.
- **`saveProduct`/`getProducts`** (`app/dashboard/productos/actions.ts`): incluir `url_compra` en el `SELECT`, el `INSERT` y el `UPDATE`.
- **`IProduct`** (`interfaces/product.ts`): agregar `url_compra: string | null`.
- **`page.tsx`**: agregar `url_compra` a `EMPTY`, a `openEdit`, y al tratamiento de `handleChange` (campo de texto simple, sin parseo numérico).

**No incluye:**

- **Borrado de assets huérfanos en Cloudinary.** Un producto nuevo donde se sube imagen y luego se cancela el modal (o un producto cuya imagen se reemplaza) deja el asset temporal/anterior en Cloudinary sin referencia en BD, sin llamada de borrado — mismo comportamiento de fondo que existe hoy (los assets con `Date.now()` tampoco se borran).
- **Renombrar el asset temporal (`producto_tmp_{tempId}`) al id real** una vez que un producto nuevo se guarda y obtiene su `id_product` definitivo. La URL guardada en BD es la correcta (la del asset temporal); el nombre del asset en Cloudinary simplemente no coincidirá con `producto_{id_product}` hasta que se suba una imagen nueva en una edición posterior.
- **Validación de formato de URL para `url_compra`** en cliente o servidor — se acepta cualquier texto no vacío.
- **Cambios al listado/tabla de `page.tsx`** (columnas, filtros) — `url_compra` no se muestra en la tabla, solo en el modal de edición y el de vista.
- **Migración de imágenes ya subidas con el esquema `Date.now()` anterior** — siguen funcionando (la URL en BD no cambia retroactivamente); solo la próxima subida de esos productos usará el nuevo esquema de nombre y `overwrite=true`.

## Modelo de datos

### Cambio de esquema

```sql
ALTER TABLE [CentroPodologico].[inventory].[Products] ADD [url_compra] NVARCHAR(500) NULL;
```

- Nullable, sin default: los productos existentes quedan con `url_compra = NULL` (equivalente a "sin URL de compra").

### `interfaces/product.ts`

```ts
export interface IProduct {
  // ...campos existentes...
  bono_venta:  number | null;
  url_compra:  string | null;
}
```

### `ProductFormData` (`ProductModal.tsx`)

Sigue siendo `Omit<IProduct, "id_empresa" | "status" | "created_at">`, hereda `url_compra` automáticamente — no requiere cambios propios de tipo.

### `app/api/upload/route.ts`

```ts
// nuevo query param, además de name/folder existentes
const overwrite = searchParams.get("overwrite") === "true";

// ...
cloudinary.uploader.upload_stream(
  { public_id: publicId, folder, resource_type: "auto", overwrite },
  // ...
);
```

Default `overwrite = false` preserva el comportamiento actual para todos los llamadores que no manden el param.

### `ProductModal.tsx` — id estable para el nombre de archivo

```ts
// generado una sola vez al montar el modal, estable mientras esté abierto
const [tempId] = useState(() => Math.random().toString(36).slice(2, 10));

const stableProductKey = form.id_product > 0 ? String(form.id_product) : `tmp_${tempId}`;
const fileName = `producto_${stableProductKey}.jpg`;

// ...
fetch(
  `/api/upload?name=${encodeURIComponent(fileName)}&folder=clinica/productos&overwrite=true`,
  { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: resized }
);
```

Se elimina el uso de `sanitize(form.name)` + `Date.now()` para el nombre de archivo (ya no aporta nada útil una vez que el `public_id` es estable por producto).

## Plan de implementación

1. **DB**: ejecutar `ALTER TABLE [CentroPodologico].[inventory].[Products] ADD [url_compra] NVARCHAR(500) NULL;` contra la base de datos. Registrar la sentencia en `queries.txt`.

   *Verificación:* `SELECT TOP 1 url_compra FROM [CentroPodologico].[inventory].[Products]` no da error; columna nueva es `NULL` en productos existentes.

2. **Interfaz**: agregar `url_compra: string | null` a `IProduct` (`interfaces/product.ts`).

3. **`app/api/upload/route.ts`**: leer `overwrite` de `searchParams` (`=== "true"`), pasarlo a `cloudinary.uploader.upload_stream` en vez del `false` fijo actual.

   *Verificación:* `npm run build` compila; una subida existente (empleados, consultas, etc.) sin el param sigue comportándose igual (`overwrite: false`).

4. **Server actions** (`app/dashboard/productos/actions.ts`):
   - Incluir `[url_compra]` en el `SELECT` de `getProducts`.
   - Desestructurar `url_compra` en `saveProduct`, incluirlo en `commonParams`, en el `INSERT` y en el `UPDATE`.

   *Verificación:* `getProducts()` devuelve `url_compra` (null en productos existentes) sin romper el tipado.

5. **`ProductModal.tsx`**:
   - Agregar `tempId` (generado una vez con `useState`) y `stableProductKey`/`fileName` según el modelo de datos; usarlo en la URL de `/api/upload` junto con `&overwrite=true`. Quitar la lógica de `sanitize(form.name)` + `Date.now()`.
   - Agregar overlay de spinner circular sobre el recuadro de preview de la imagen cuando `uploadingImage` es `true` (manteniendo el botón deshabilitado y su texto "Subiendo…").
   - Agregar input de texto "URL de Compra" (`name="url_compra"`, tipo `url`, opcional) junto a los demás campos de texto.

   *Verificación:* subir dos imágenes distintas en el mismo modal (producto nuevo) resulta en que la 2ª sustituye a la 1ª en Cloudinary (mismo `public_id`); editar un producto existente y subir una imagen usa siempre `producto_{id_product}` como nombre en subidas sucesivas. El spinner se ve sobre el preview mientras sube.

6. **`page.tsx`**:
   - Agregar `url_compra: null` a `EMPTY`.
   - Agregar `url_compra: product.url_compra` en `openEdit`.
   - `url_compra` se maneja como campo de texto simple en `handleChange` (no requiere entrar a ninguna lista de parseo numérico/checkbox).

   *Verificación:* crear/editar un producto con `url_compra` capturado persiste el valor; recargar el listado y reabrir "Editar" muestra el mismo valor.

7. **`ProductViewModal.tsx`**:
   - Agregar `Field` "URL de Compra" en la grilla, mostrando `product.url_compra` como `<a>` (`target="_blank"`, `rel="noopener noreferrer"`) cuando no es vacío, o "—".
   - Agregar estado local (`showFullImage`) y lightbox: click en la miniatura de 32x32 (solo si `url_product` tiene valor) abre un overlay con la imagen a tamaño completo (limitada al viewport), cerrable con click fuera o botón "×".

   *Verificación:* click en la miniatura abre el lightbox con la imagen visible completa; cerrar el lightbox regresa al detalle sin cerrar `ProductViewModal`; con `url_compra` vacío se muestra "—" y no hay link roto.

8. `npm run build` sin errores de TypeScript.

Cada paso deja el sistema funcional y compilando.

## Criterios de aceptación

- [ ] La columna `url_compra` existe en `[CentroPodologico].[inventory].[Products]` como `NVARCHAR(500) NULL`.
- [ ] `IProduct` incluye `url_compra: string | null`.
- [ ] `/api/upload` acepta `?overwrite=true`; sin ese param, el comportamiento es idéntico al actual (`overwrite: false`).
- [ ] Mientras se sube una imagen en `ProductModal.tsx`, se ve un spinner circular sobre el recuadro de preview/placeholder de la imagen.
- [ ] En un producto **existente**, subir dos imágenes distintas en ediciones separadas usa el mismo nombre de archivo (`producto_{id_product}`) y `overwrite=true`, de modo que la segunda sustituye a la primera en Cloudinary (no queda un asset adicional para ese producto).
- [ ] En un producto **nuevo** (aún sin guardar), subir dos imágenes distintas dentro del mismo modal abierto sustituye la primera por la segunda en Cloudinary (mismo `public_id` temporal).
- [ ] Cerrar el modal de un producto nuevo sin guardar, tras haber subido una imagen, no bloquea ni rompe nada (el asset temporal queda en Cloudinary sin referencia, aceptado como comportamiento conocido).
- [ ] El formulario de alta/edición muestra un input "URL de Compra"; se puede dejar vacío sin bloquear el guardado ni exigir formato de URL.
- [ ] Guardar un producto con `url_compra` capturado persiste el valor; recargar el listado y reabrir "Editar" muestra el mismo valor.
- [ ] `ProductViewModal.tsx` muestra un campo "URL de Compra": link cliqueable cuando hay valor (abre en pestaña nueva), o "—" cuando está vacío.
- [ ] En `ProductViewModal.tsx`, hacer click sobre la miniatura de la imagen (cuando existe) abre un lightbox con la imagen a tamaño completo; hay una forma de cerrarlo (click fuera o botón) que regresa al detalle sin cerrar el modal completo.
- [ ] Sin imagen (`url_product` vacío), la miniatura no es cliqueable ni intenta abrir un lightbox vacío.
- [ ] La pantalla se ve correctamente en modo claro y oscuro, consistente con el resto de Productos.
- [ ] `npm run build` compila sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **`public_id` estable (`producto_{id_product}` / `producto_tmp_{tempId}`) en vez de solo quitar `Date.now()`** — decisión del usuario: usar el nombre del producto como base seguiría rompiendo el reemplazo si el nombre cambia entre subidas, y podría colisionar entre productos con nombres similares. El id (real o temporal) es estable e inequívoco.
- **`overwrite` como query param opcional en `/api/upload` compartido, en vez de un endpoint/helper dedicado para productos** — decisión del usuario: el endpoint ya es genérico (name/folder por query param); agregar un tercer param opcional con default `false` no cambia nada para los demás módulos (consultas, empleados, pedidos, tratamientos, facturación) y evita duplicar la validación de MIME/bytes que ya vive ahí.
- **Sin borrado de assets huérfanos en Cloudinary** — se descartó agregar un endpoint de `destroy` porque el comportamiento actual (con `Date.now()`) ya deja huérfanos sin borrarlos; esta spec no empeora esa situación (de hecho la reduce para productos existentes, que ahora sí reemplazan en vez de acumular) y agregar borrado es una ampliación de alcance no pedida.
- **No se renombra el asset temporal al guardar un producto nuevo** — requeriría una llamada adicional a Cloudinary (`rename`) en el server action de guardado, coordinada con el flujo de subida en el cliente; se descartó por complejidad no justificada, ya que la URL persistida en BD funciona igual sin importar el nombre interno del asset en Cloudinary.
- **`url_compra` sin validación de formato** — decisión del usuario: consistente con el resto de campos de texto del producto (código de barras, marca, etc.), que tampoco validan formato; agregar una regex de URL es fricción no solicitada.
- **`url_compra` visible en la grilla de `ProductViewModal.tsx`, no en la cabecera junto al nombre** — decisión del usuario: mantiene el patrón existente de `Field`s en grilla para todos los datos del producto, en vez de crear una excepción visual para este campo.
- **Lightbox en vez de abrir en pestaña nueva** — decisión del usuario: mantiene al usuario dentro del flujo de la app (sin perder el modal de detalle) y sigue un patrón visual ya usado en la app para overlays.

## Riesgos identificados

- **Un producto nuevo cuya imagen se sube con el `public_id` temporal (`producto_tmp_{tempId}`) y luego se guarda, queda con una URL de Cloudinary cuyo nombre interno no coincide con `producto_{id_product}`.** Si en el futuro se necesitara reconstruir o migrar imágenes por convención de nombre, este caso quedaría fuera del patrón. *Mitigación:* no es un problema funcional hoy (la URL guardada en BD siempre es la correcta); si se vuelve necesario, se puede agregar en una spec futura un paso de `rename` en Cloudinary al guardar un producto nuevo.
- **Cambiar `overwrite` de `false` (implícito) a parametrizable en un endpoint compartido por 6+ módulos** introduce superficie de riesgo si algún llamador futuro pasa `overwrite=true` sin querer. *Mitigación:* el default sigue siendo `false`; solo `ProductModal.tsx` lo activa explícitamente en esta spec.
