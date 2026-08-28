# 36 — Sucursal fija en consulta y tratamiento

## Header

- **Estado:** Aprobado
- **Depende de:** Ninguno directamente (toca el mismo dominio de `consulta_servicios`/`consulta_productos` que specs 13/17, pero no modifica su esquema ni su lógica de stock)
- **Modifica base de datos:** No
- **Fecha:** 2026-08-28
- **Objetivo:** Hacer que la pestaña de servicios y de productos dentro de una consulta, y el mensaje de WhatsApp al crear un tratamiento, usen siempre la sucursal propia de la consulta en vez de la sucursal activa en `SucursalContext`, agregando además una validación en servidor que rechace guardar una opción de servicio que no pertenezca a esa sucursal.

## Alcance

**Incluye:**

- **`TabServicios.tsx`** (`app/dashboard/pacientes/[id]/consultas/[id_consulta]/componentes/TabServicios.tsx`): deja de importar/usar `useSucursal()`. `getServiciosTabData` pasa a recibir solo `id_consulta` y resuelve `id_sucursal` internamente con un `SELECT [id_sucursal] FROM [dbo].[consultas] WHERE [id_consulta] = @id_consulta`, igual que ya hace `addConsultaProducto`.
- **`selectServicioOpcion`** (`.../actions.ts:720`): antes de insertar en `consulta_servicios`, valida en servidor que `id_servicio_opcion` pertenezca a la misma `id_sucursal` que la consulta (join contra `servicio_opciones`). Si no coincide, devuelve `{ ok: false, data: "..." }` sin insertar nada.
- **`TabProductos.tsx`** (misma carpeta): deja de usar `useSucursal()`. `getProductosCatalogo` pasa a recibir solo `id_consulta` y resuelve `id_sucursal` internamente de la misma forma, antes de delegar en `getSaleProducts`.
- **`app/dashboard/pacientes/[id]/consultas/[id_consulta]/tratamiento/page.tsx`**: el mensaje de WhatsApp que arma el texto de sucursal deja de leer `sucursales.find(s => s.id_sucursal === selectedId)` y usa la sucursal propia de la consulta (ya disponible en la data que resuelve el guardado del tratamiento).
- **`app/dashboard/tratamientos/[id_tratamiento]/page.tsx`**: `openCrearConsulta` y `openCrearCitaByTratamiento` dejan de prellenar `id_sucursal: selectedId || user!.id_sucursal` y usan la sucursal propia del tratamiento (la de su consulta origen, `t.id_consulta → consultas.id_sucursal`). Para esto, `getTratamientoDetalle` agrega `id_sucursal` a su `SELECT` (ya hace `LEFT JOIN sucursales` para el nombre; solo falta exponer el id). El selector de sucursal del modal (`ConsultaModal`/`CitaModal`) se mantiene editable — solo cambia el valor por defecto.

**No incluye:**

- **Auditoría del resto de la app.** No se revisan otras pantallas que usen `useSucursal()` (citas, ventas, egresos, etc.); si aparece el mismo patrón en otro lado, es un spec aparte.
- **`servicios/[id_servicio]/opciones`.** Ya está bien resuelto (no usa `SucursalContext`, deriva `id_sucursal` del `servicio` padre); no requiere cambios.
- **Bloquear o deshabilitar el selector de sucursal del sidebar/topbar mientras hay una consulta abierta.** Se decidió no restringir la UI global; el arreglo es que las pantallas de consulta/tratamiento ignoren `SucursalContext` y usen la sucursal fija de la entidad, no impedir que el usuario cambie de sucursal en general.
- **Cambios al esquema de `consulta_productos`, `consulta_servicios`, `Tratamiento_onicomicosis` o cualquier tabla.** Es un fix de lectura/validación, no de datos.
- **Corregir consultas ya guardadas con datos cruzados de sucursal** (si existieran). No se pidió una limpieza de datos históricos.

## Modelo de datos

Este spec no introduce estructuras de datos nuevas ni cambia el esquema — solo cambia de dónde se lee `id_sucursal` en funciones ya existentes (parámetro de cliente → `SELECT` server-side) y agrega una validación. Se omite esta sección.

## Plan de implementación

1. **`app/dashboard/pacientes/[id]/consultas/[id_consulta]/actions.ts` — `getServiciosTabData`.**
   Quita el parámetro `id_sucursal: number` de la firma; dentro de la función agrega `const [{ id_sucursal }] = await db.queryParams(\`SELECT [id_sucursal] FROM [dbo].[consultas] WHERE [id_consulta] = @id_consulta\`, { id_consulta })` antes de las consultas que hoy reciben `id_sucursal` por parámetro (líneas 660-667), y usa esa variable en su lugar.

2. **Mismo archivo — `selectServicioOpcion`.**
   Antes del `INSERT` (línea ~742), agrega una validación: `JOIN` o `SELECT` que compare `servicio_opciones.id_sucursal` de la opción elegida contra `consultas.id_sucursal` de `id_consulta`. Si no coinciden, retorna `{ ok: false, data: "Esta opción no pertenece a la sucursal de la consulta" }` sin ejecutar el `DELETE`/`INSERT`.

3. **Mismo archivo — `getProductosCatalogo`.**
   Quita el parámetro `id_sucursal: number`; resuelve `id_sucursal` internamente igual que en el paso 1 (mismo `SELECT`, puede extraerse a un helper local del archivo ya que se repite 3 veces — en `getServiciosTabData`, `getProductosCatalogo` y ya existe inline en `addConsultaProducto`/`updateConsultaProducto`) y pasa el valor resuelto a `getSaleProducts(id_sucursal)`.

4. **`TabServicios.tsx` y `TabProductos.tsx`.**
   Quitan el `import { useSucursal } from "@/contexts/SucursalContext"` y la línea `const { selectedId: id_sucursal } = useSucursal()`. Las llamadas pasan a `getServiciosTabData(id_consulta)` / `getProductosCatalogo(id_consulta)`; el `useEffect` de `TabServicios` queda con `[id_consulta]` en vez de `[id_consulta, id_sucursal]`.

5. **`app/dashboard/pacientes/[id]/consultas/[id_consulta]/tratamiento/actions.ts` — `saveTratamiento`.**
   En el `SELECT` final (línea ~165, el que ya hace `JOIN Consultas c`), agrega `LEFT JOIN [dbo].[sucursales] s ON s.[id_sucursal] = c.[id_sucursal]` y `s.[nombre] AS nombre_sucursal` a las columnas. Agrega `nombreSucursal?: string | null` al tipo de retorno y al objeto devuelto.

6. **`.../tratamiento/page.tsx`.**
   Quita `import { useSucursal }` y las líneas `const { selectedId, sucursales } = useSucursal(); const sucursal = sucursales.find(...)`. En `handleConfirmSave`, la línea del mensaje pasa a `` `Sucursal: ${result.nombreSucursal ?? "Desconocida"}.` ``.

7. **`app/dashboard/tratamientos/actions.ts` — `getTratamientoDetalle`.**
   Agrega `c.[id_sucursal] AS id_sucursal` al `SELECT` (ya hace `JOIN consultas c`) y `id_sucursal: number` al tipo de retorno.

8. **`app/dashboard/tratamientos/[id_tratamiento]/page.tsx`.**
   En `DetailRow`, agrega `id_sucursal: number`. En `openCrearConsulta` (línea 182) y `openCrearCitaByTratamiento` (línea 242), reemplaza `id_sucursal: selectedId || user!.id_sucursal` por `id_sucursal: detalle.id_sucursal`. Quita `const { selectedId } = useSucursal()` y su import, ya sin más usos en el archivo.

9. **Verificación manual.** Con un usuario con acceso a 2+ sucursales: abrir una consulta de la Sucursal A, cambiar a Sucursal B desde el sidebar sin salir de la consulta, confirmar que la pestaña Servicios sigue mostrando el catálogo de A (no de B) y que la pestaña Productos sigue mostrando el stock de A; guardar un servicio y un producto y confirmar en BD que `consulta_servicios`/`consulta_productos` quedan ligados a opciones/consumos de A. Repetir para "Crear tratamiento" (confirmar el WhatsApp reporta la sucursal de la consulta, no la activa) y para "Crear consulta"/"Crear cita" desde `tratamientos/[id]` (confirmar que el modal abre con la sucursal del tratamiento preseleccionada, no la activa). Forzar el caso de rechazo de `selectServicioOpcion` (llamando la action con un `id_servicio_opcion` de otra sucursal) y confirmar el mensaje de error sin inserción.

10. `npm run build` y `npm run lint` sin errores ni warnings nuevos.

## Criterios de aceptación

- [ ] `getServiciosTabData` y `getProductosCatalogo` ya no reciben `id_sucursal` como parámetro del cliente; ambas lo resuelven internamente con un `SELECT` contra `consultas.id_sucursal` usando `id_consulta`.
- [ ] `TabServicios.tsx` y `TabProductos.tsx` ya no importan ni usan `useSucursal()`/`SucursalContext`.
- [ ] Con una consulta abierta en la Sucursal A, cambiar la sucursal activa a B desde el sidebar **no cambia** el catálogo de servicios ni el catálogo/stock de productos mostrado en esas pestañas — siguen reflejando la Sucursal A.
- [ ] `selectServicioOpcion` rechaza (`ok: false`, sin insertar) una selección cuyo `id_servicio_opcion` pertenezca a una sucursal distinta a la de la consulta, con un mensaje explícito que el tab muestra al usuario.
- [ ] Ningún `consulta_servicios` u operación de `consulta_productos` puede quedar ligado a una opción/consumo de una sucursal distinta a `consultas.id_sucursal` de esa consulta, sin importar qué sucursal esté activa en `SucursalContext` al momento de guardar.
- [ ] El mensaje de WhatsApp enviado al especialista al crear un tratamiento reporta la sucursal de la consulta de origen, no la sucursal activa en `SucursalContext`; `saveTratamiento` resuelve `nombreSucursal` en servidor.
- [ ] Al abrir "Crear consulta" o "Crear cita" desde `dashboard/tratamientos/[id]`, el formulario preselecciona la sucursal del tratamiento (vía su consulta origen), no la sucursal activa; el selector de sucursal del modal sigue siendo editable.
- [ ] `getTratamientoDetalle` expone `id_sucursal` en su resultado.
- [ ] `dashboard/tratamientos/[id_tratamiento]/page.tsx` ya no importa `useSucursal()`.
- [ ] `npm run build` y `npm run lint` compilan sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **Derivar/validar `id_sucursal` en servidor a partir de la entidad (consulta/tratamiento), no bloquear el selector de sucursal global.** Se consideró deshabilitar el cambio de sucursal en el sidebar mientras hay una consulta o tratamiento abiertos, y se descartó: es un cambio de UX más invasivo (afecta toda la navegación, no solo estas pantallas) y no cierra el hueco de fondo — un cliente manipulado igual podría mandar un `id_servicio_opcion`/producto de otra sucursal. Derivar y validar en servidor es la que realmente cierra el problema; además ya es el patrón que usan correctamente `addConsultaProducto`, `updateConsultaProducto` y `TabGeneral.tsx` en este mismo módulo.

- **`selectServicioOpcion` rechaza con `ActionResult` explícito, no falla en silencio.** Un no-op silencioso dejaría al usuario sin saber por qué su selección no se guardó, especialmente si cambió de sucursal sin darse cuenta a medio proceso. Un mensaje claro es consistente con cómo esta misma pantalla ya maneja otros errores (`setError` en `TabServicios`).

- **El servidor resuelve `id_sucursal` con su propio `SELECT`, no se pasa como prop desde `page.tsx`.** Se consideró que la página padre (que ya carga la consulta completa) pasara `consulta.id_sucursal` como prop a los tabs, reenviándola a las actions. Se descartó porque seguiría dependiendo de que ningún componente intermedio la sobreescriba con `SucursalContext`, y porque el patrón ya establecido en `addConsultaProducto` (resolver `id_sucursal` con un `SELECT` dentro de la propia action, ignorando lo que mande el cliente) es más robusto: la action nunca confía en un dato de sucursal que venga del cliente, ni siquiera indirectamente vía props.

- **Incluir el mensaje de WhatsApp de creación de tratamiento y el default de sucursal en `tratamientos/[id]`, aunque sean de menor severidad.** Ambos comparten la misma causa raíz (`useSucursal()` leído donde debería leerse la sucursal fija de la entidad) y el arreglo es contenido (una columna más en un `SELECT` ya existente); dejarlos fuera habría dejado el mismo patrón de bug sin corregir en dos lugares que ya se investigaron a fondo.

- **No se incluye una auditoría completa de `useSucursal()` en el resto de la app.** Se decidió acotar el spec a las tres pantallas señaladas (más el hallazgo directamente relacionado del mensaje de WhatsApp) para mantenerlo implementable y verificable en una sola pasada; si aparece el mismo patrón en citas, ventas u otro módulo, se atiende en un spec propio.

- **No se toca `servicios/[id_servicio]/opciones`.** Ya sigue el patrón correcto (deriva `id_sucursal` del `servicio` padre, con un comentario en código documentando exactamente esta clase de bug) — es la referencia que se replica en los otros lugares, no un sitio a corregir.

## Riesgos identificados

- **No hay backfill de datos ya guardados con sucursal cruzada.** Si en producción ya existen filas de `consulta_servicios` cuyo `id_servicio_opcion` pertenece a una sucursal distinta a la de su consulta (producto de este mismo bug), este spec no las detecta ni corrige — solo evita que se sigan generando. *Mitigación:* si se sospecha que existen, correr una consulta de auditoría (`consulta_servicios cs JOIN servicio_opciones so ON so.id_servicio_opcion = cs.id_servicio_opcion JOIN consultas c ON c.id_consulta = cs.id_consulta WHERE so.id_sucursal <> c.id_sucursal`) como paso aparte, fuera de este spec.

- **`TabProductos` no valida en servidor que el producto elegido tenga sentido para la sucursal de la consulta**, porque los productos son catálogo global (`inventory.Products`) y solo el `stock_quantity` es por sucursal — a diferencia de `servicio_opciones`, no hay un "producto de otra sucursal" que rechazar, solo un catálogo/stock mal mostrado. El fix de este spec corrige la fuente del catálogo mostrado (ahora siempre el de la sucursal de la consulta), pero no agrega una validación equivalente a la de `selectServicioOpcion` porque no hay nada que validar a ese nivel — el riesgo real ya lo cerraba `addConsultaProducto` derivando `id_sucursal` server-side para el movimiento de stock.

- **El helper de `SELECT id_sucursal FROM consultas` se repite en al menos tres lugares** (`getServiciosTabData`, `getProductosCatalogo`, y ya existía en `addConsultaProducto`/`updateConsultaProducto`) sin extraerse a una función compartida en este spec, para no ampliar el alcance a un refactor. Queda como candidato a limpieza si se toca este archivo de nuevo.
