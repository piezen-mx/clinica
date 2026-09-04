# 38 — Empleados: segundo contacto de emergencia, salario diario fiscal y limpieza de campos

## Header

- **Estado:** Implementado
- **Depende de:** [25 — Módulo de Empleados (RH): alta, listado y expediente](25-empleados-alta-listado-detalle.md). No modifica la estructura base de la tabla `RH.empleados`, solo agrega columnas y cambia qué columnas usa el formulario.
- **Fecha:** 2026-09-04
- **Objetivo:** En el modal de alta/edición de empleado, agregar un segundo contacto de emergencia (nombre + WhatsApp) y el campo salario diario fiscal, y quitar del formulario los campos teléfono personal, salario quincenal, salario mensual y comisión.

## Alcance

**Incluye:**

- **Modal `EmployeeModal.tsx` — sección "Datos personales":**
  - Se elimina el input **Teléfono personal** (`telefono`).
  - Se agregan **Contacto de emergencia 2 (nombre)** y **WhatsApp de emergencia 2**, junto a los campos existentes de contacto de emergencia 1.
- **Modal `EmployeeModal.tsx` — sección "Información laboral":**
  - Se agrega el input **Salario diario fiscal** (`salario_diario_fiscal`), junto a "Salario diario".
  - Se eliminan los inputs **Salario quincenal**, **Salario mensual** y **Comisión (%)**.
- **Expediente `EmployeeGeneralInfo.tsx`** (mismo criterio que el modal):
  - Se elimina la fila **Teléfono personal**.
  - Se agregan las filas **Contacto de emergencia 2** y **WhatsApp de emergencia 2**, junto a las filas del contacto de emergencia 1.
  - Se agrega la fila **Salario diario fiscal**.
  - Se eliminan las filas **Salario quincenal**, **Salario mensual** y **Comisión**.
- **`EmployeeHeader.tsx`:** la fila "Teléfono" (`employee.telefono || employee.whatsapp || "—"`) se renombra a **"WhatsApp"** y su valor pasa a `employee.whatsapp || "—"`.
- **`interfaces/employee.ts`:**
  - `IEmployee` pierde `telefono`, `salario_quincenal`, `salario_mensual`, `comision`.
  - `IEmployee` gana `contacto_emergencia_2: string | null`, `whatsapp_emergencia_2: string | null`, `salario_diario_fiscal: number | null`.
  - `EmployeeFormInput` (derivado por `Omit`) refleja los mismos cambios automáticamente.
- **`app/dashboard/empleados/actions.ts`:**
  - El SELECT de listado/detalle deja de traer `telefono`, `salario_quincenal`, `salario_mensual`, `comision`.
  - El SELECT agrega `contacto_emergencia_2`, `whatsapp_emergencia_2`, `salario_diario_fiscal`.
  - `createEmployee`/`updateEmployee` (INSERT y UPDATE) dejan de escribir `telefono`, `salario_quincenal`, `salario_mensual`, `comision`.
  - `createEmployee`/`updateEmployee` agregan `contacto_emergencia_2`, `whatsapp_emergencia_2`, `salario_diario_fiscal` a INSERT y UPDATE.
- **Base de datos:** se agregan 3 columnas nuevas a `RH.empleados` (`contacto_emergencia_2 NVARCHAR`, `whatsapp_emergencia_2 NVARCHAR`, `salario_diario_fiscal DECIMAL`, mismos tipos que sus contrapartes existentes). DDL documentado en `queries.txt`, bloque de RH.empleados, ejecutado manualmente contra la BD (no hay migraciones).

**No incluye (explícitamente fuera de alcance):**

- No se eliminan físicamente las columnas `telefono`, `salario_quincenal`, `salario_mensual`, `comision` de `RH.empleados` — quedan huérfanas en BD, sin lectura/escritura desde la app.
- No se calculan ni muestran en ningún lado salario quincenal/mensual derivados de `salario_diario` (ni en el modal ni en el expediente/listado).
- No se toca la validación de formato de número de WhatsApp/teléfono (los campos de referencia usan el mismo tipo de input `text` sin validación adicional, igual que los existentes).
- No se modifica el listado (`/dashboard/empleados/page.tsx`) — no muestra hoy ninguno de estos campos y no se le agregan.

## Modelo de datos

**ALTER TABLE sobre `[RH].[empleados]`** (DDL a agregar en `queries.txt`, bloque `RECURSOS HUMANOS(EMPLEADOS)`, ejecución manual contra la BD):

```sql
ALTER TABLE [RH].[empleados] ADD
    [contacto_emergencia_2] [varchar](150)  NULL,
    [whatsapp_emergencia_2] [varchar](25)   NULL,
    [salario_diario_fiscal] [decimal](12,2) NULL;
```

- `contacto_emergencia_2` y `whatsapp_emergencia_2` replican exactamente el tipo de `contacto_emergencia` / `whatsapp_emergencia`.
- `salario_diario_fiscal` replica el tipo de `salario_diario` (`decimal(12,2)`).
- Las columnas `telefono`, `salario_quincenal`, `salario_mensual`, `comision` **no se tocan** en la tabla — quedan con su definición actual, simplemente dejan de usarse desde la app.

**`interfaces/employee.ts` — `IEmployee`** (diff sobre la interfaz actual):

```ts
// Se eliminan:
telefono:            string | null;
salario_quincenal:   number | null;
salario_mensual:     number | null;
comision:            number | null;

// Se agregan (junto a contacto_emergencia / whatsapp_emergencia):
contacto_emergencia_2: string | null;
whatsapp_emergencia_2: string | null;

// Se agrega (junto a salario_diario):
salario_diario_fiscal: number | null;
```

`IEmployeeListItem`, `IEmployeeRecord` y `EmployeeFormInput` no cambian su definición (siguen extendiendo/derivando de `IEmployee`), pero heredan estos cambios automáticamente.

## Plan de implementación

1. **Base de datos:** ejecutar el `ALTER TABLE` de la sección "Modelo de datos" contra la BD, y documentarlo en `queries.txt` dentro del bloque `RECURSOS HUMANOS(EMPLEADOS)`, justo debajo del `CREATE TABLE [RH].[empleados]`.
2. **`interfaces/employee.ts`:** aplicar el diff de `IEmployee` (quitar `telefono`, `salario_quincenal`, `salario_mensual`, `comision`; agregar `contacto_emergencia_2`, `whatsapp_emergencia_2`, `salario_diario_fiscal`). El sistema sigue compilando en este paso (los consumidores se ajustan en los siguientes pasos).
3. **`app/dashboard/empleados/actions.ts`:** actualizar el SELECT (listado/detalle) y los statements INSERT/UPDATE de `createEmployee`/`updateEmployee` para dejar de leer/escribir las columnas eliminadas y sí leer/escribir las nuevas, incluyendo los parámetros `queryParams` correspondientes (tipo `sql.NVarChar` para los dos contactos, `sql.Decimal`/numérico para `salario_diario_fiscal`, siguiendo el patrón de `salario_diario`).
4. **`EmployeeModal.tsx`:** en `buildEmptyForm()` y `employeeToFormInput()` quitar `telefono`, `salario_quincenal`, `salario_mensual`, `comision` y agregar `contacto_emergencia_2`, `whatsapp_emergencia_2`, `salario_diario_fiscal`; en el JSX quitar el input de Teléfono personal, Salario quincenal, Salario mensual y Comisión, y agregar los inputs de Contacto de emergencia 2 / WhatsApp de emergencia 2 (sección "Datos personales", junto al contacto 1) y Salario diario fiscal (sección "Información laboral", junto a Salario diario).
5. **`EmployeeGeneralInfo.tsx`:** quitar la fila de Teléfono personal, Salario quincenal, Salario mensual y Comisión; agregar las filas de Contacto de emergencia 2, WhatsApp de emergencia 2 y Salario diario fiscal, junto a sus contrapartes existentes.
6. **`EmployeeHeader.tsx`:** cambiar la fila "Teléfono" (`employee.telefono || employee.whatsapp || "—"`) por una fila "WhatsApp" (`employee.whatsapp || "—"`).
7. **Verificación manual:** `npm run build` (o `tsc --noEmit`) para confirmar que no quedan referencias colgantes a los campos eliminados; luego alta de un empleado nuevo y edición de uno existente desde el dashboard, confirmando que los 3 campos nuevos se guardan y se recuperan correctamente, y que el expediente/header ya no muestran los campos eliminados.

Cada paso deja el sistema en un estado funcional (compilable) al terminar.

## Criterios de aceptación

- [x] `RH.empleados` tiene las columnas `contacto_emergencia_2`, `whatsapp_emergencia_2` y `salario_diario_fiscal`, con el `ALTER TABLE` documentado en `queries.txt`.
- [x] Las columnas `telefono`, `salario_quincenal`, `salario_mensual`, `comision` siguen existiendo físicamente en `RH.empleados`, sin modificarse.
- [x] `IEmployee` (y por herencia `IEmployeeListItem`, `IEmployeeRecord`, `EmployeeFormInput`) ya no declara `telefono`, `salario_quincenal`, `salario_mensual` ni `comision`, y sí declara `contacto_emergencia_2`, `whatsapp_emergencia_2` y `salario_diario_fiscal`.
- [x] El modal de alta/edición de empleado ya no muestra los inputs Teléfono personal, Salario quincenal, Salario mensual ni Comisión (%).
- [x] El modal muestra los inputs Contacto de emergencia 2 (nombre), WhatsApp de emergencia 2 y Salario diario fiscal.
- [x] Al dar de alta un empleado nuevo capturando los 3 campos nuevos, y luego abrir su expediente, los valores capturados se muestran correctamente en `EmployeeGeneralInfo.tsx`.
- [x] Al editar un empleado existente, guardar cambios en los campos nuevos persiste correctamente (se refleja tras `router.refresh()`).
- [x] El expediente (`EmployeeGeneralInfo.tsx`) ya no muestra las filas Teléfono personal, Salario quincenal, Salario mensual ni Comisión, y sí muestra Contacto de emergencia 2, WhatsApp de emergencia 2 y Salario diario fiscal.
- [x] `EmployeeHeader.tsx` muestra una fila etiquetada "WhatsApp" con el valor de `employee.whatsapp` (o "—" si es `null`), sin referenciar `employee.telefono`.
- [x] `npm run build` (o `tsc --noEmit`) no reporta errores de tipos relacionados con los campos eliminados/agregados en ningún archivo del proyecto.

## Decisiones tomadas y descartadas

- **Contactos de referencia = segundo contacto de emergencia, no una entidad nueva.** Se descartó modelar los "contactos de referencia" como una lista/tabla separada (ej. `RH.empleado_contactos`); se optó por replicar el patrón plano ya existente (`contacto_emergencia` + `whatsapp_emergencia`) agregando un segundo par de columnas (`contacto_emergencia_2` / `whatsapp_emergencia_2`). Es consistente con el resto de la tabla y evita una relación 1-a-N innecesaria para un caso fijo de "máximo 2 contactos".
- **Columnas huérfanas en vez de `DROP COLUMN`.** Se decidió no eliminar físicamente `telefono`, `salario_quincenal`, `salario_mensual` y `comision` de `RH.empleados`. Menor riesgo (sin pérdida de datos históricos, sin necesidad de tocar constraints/índices), a costa de dejar columnas sin uso en el esquema. Si en el futuro se confirma que nunca se van a recuperar, se puede hacer un `DROP COLUMN` en una spec aparte.
- **Salario quincenal/mensual: no se calculan ni se muestran, ni en el modal ni en el expediente.** El usuario indicó que se calculan "con respecto al salario diario", pero no se pidió mostrarlos derivados en ningún lado en esta spec — se limita a remover los inputs manuales. Mostrar un cálculo derivado (de solo lectura) queda fuera de esta spec.
- **`EmployeeHeader.tsx` se renombra a "WhatsApp" en vez de mantener la etiqueta "Teléfono".** Al eliminarse `telefono`, esa fila solo puede mostrar `whatsapp`; renombrar la etiqueta evita una fila engañosa ("Teléfono" mostrando en realidad un WhatsApp).
- **Tipos de columna nuevos replican los de su contraparte existente** (`contacto_emergencia_2`/`whatsapp_emergencia_2` iguales a `contacto_emergencia`/`whatsapp_emergencia`; `salario_diario_fiscal` igual a `salario_diario`) en vez de definir tipos propios, por consistencia y porque no hay ningún requisito que justifique divergir.
