# 39 — Empleados: historial de asistencias en la pestaña "Asistencia"

## Header

- **Estado:** Implementado
- **Depende de:** [27 — Checadores por sucursal y alta de PIN de empleado](27-checadores-por-sucursal.md) (crea `RH.checadores`, `RH.asistencias.id_checador`, la pestaña "Asistencia" y sus server actions de identificadores) y [25 — Módulo de Empleados](25-empleados-alta-listado-detalle.md) (expediente, `getEmployeeById`, guarda de rol en `proxy.ts`). No modifica el esquema de base de datos: solo lee `RH.asistencias`.
- **Fecha:** 2026-09-04
- **Objetivo:** Convertir la pestaña "Asistencia" del expediente en el historial de checadas reales del empleado — tabla paginada filtrable por rango de fechas desde un calendario, con tarjetas de resumen del rango — y mover la configuración de identificadores (PIN/checador) a un modal.

## Alcance

**Incluye:**

### Pantalla `/dashboard/empleados/[id]/asistencia` (rediseño completo)

- **Encabezado de la pestaña:** título "Control de Asistencias" y un botón **"Identificadores"** que abre el modal de configuración (ver abajo).
- **Tarjetas de resumen (4)**, calculadas **sobre el rango de fechas seleccionado**:
  - **Días con asistencia** — días distintos con al menos una checada.
  - **Total de checadas** — filas de `RH.asistencias` en el rango.
  - **Horas registradas** — suma de pares entrada→salida en secuencia por día (soporta salidas intermedias).
  - **Días incompletos** — días con entrada sin salida, o salida sin entrada.
- **Tabla "Registro de Asistencias"**, una fila por checada, columnas: **Fecha**, **Hora**, **Tipo** (badge Entrada/Salida), **Sucursal** (la del checador que registró la checada). Orden: más reciente primero.
- **Paginación server-side**, 15 filas por página, con el conteo total ("Mostrando X-Y de N registros") y botones Anterior / número de página / Siguiente.
- **Calendario lateral** del mes visible:
  - Navegación mes anterior / mes siguiente.
  - Selección de rango por clic (primer clic = inicio, segundo clic = fin; un tercer clic reinicia el rango).
  - Punto por día según su estado: **verde** = día con entrada y salida, **ámbar** = día con checada incompleta, **sin punto** = día sin checadas. Los puntos se calculan para **todo el mes visible**, independientemente del rango seleccionado.
  - Resaltado visual del rango activo y leyenda de colores.
  - Botón "Limpiar rango" que vuelve al valor por defecto (hoy).
- **Rango por defecto al abrir:** solo el día de hoy (`desde = hasta = hoy`), con el calendario abierto en el mes actual.
- **Estado del rango, mes visible y página en la URL** (`?desde=&hasta=&mes=&pagina=`), para que `page.tsx` siga siendo Server Component; el calendario y el paginador son componentes cliente que solo hacen `router.push`.
- **Estado vacío** cuando el rango no tiene checadas.

### Configuración de identificadores → modal

- La UI actual de la pestaña (listado de identificadores asignados + formulario de alta `EmployeeIdentifierForm`) se mueve tal cual a un **modal** (`EmployeeIdentifiersModal.tsx`), siguiendo el patrón de modales del repo (`createPortal`, `mounted`).
- Se conserva funcionalidad idéntica: listar identificadores activos, alta (checador + PIN + tipo) y baja lógica. No cambian sus server actions.

### Server actions — `app/dashboard/empleados/[id]/asistencia/actions.ts` (se amplía)

- `getEmployeeAttendanceEvents({ id_empleado, desde, hasta, pagina })` → página de checadas + total.
- `getEmployeeAttendanceSummary({ id_empleado, desde, hasta })` → las 4 métricas del rango.
- `getEmployeeAttendanceMonthStates({ id_empleado, mes })` → estado por día del mes visible (para los puntos del calendario).
- Todas validan pertenencia del empleado con `getEmployeeById`, usan `queryParams` y devuelven fechas ya casteadas con `CONVERT(varchar(19), …, 120)`.

### Interfaces — `interfaces/asistencia.ts` (se amplía)

- `IAttendanceEventListItem` (checada + `nombre_sucursal` + `nombre_checador`), `IAttendanceSummary`, `IAttendanceDayState`.

**No incluye (explícitamente fuera de alcance):**

- **Cualquier cálculo de retardo, falta, puntualidad o "% a tiempo".** No existe horario esperado estructurado (`RH.empleados.horario` es texto libre), así que no se muestra ningún estado derivado. Estructurar horarios y calcular incidencias es una spec futura.
- **Registro manual de asistencia.** No se agrega el botón "Registrar Asistencia Manual" del mockup ni las columnas `metodo` / `id_usuario_registro` en `RH.asistencias`.
- **Columnas "Método" y "Estado / Obs." del mockup.** La primera sería siempre "Biométrico"; la segunda depende del cálculo de incidencias, fuera de alcance.
- **Filtros adicionales** (por tipo entrada/salida, por sucursal, por checador). Solo se filtra por rango de fechas.
- **Botón "Actualizar"** del mockup.
- **Tope máximo de rango.** Se permite cualquier rango; la paginación server-side acota lo que se trae.
- **Edición o borrado de checadas.** `RH.asistencias` sigue siendo solo-lectura desde la app; solo la escribe el webhook ADMS.
- **Cambios en el esquema de base de datos**, en `proxy.ts` (la guarda `/dashboard/empleados` ya cubre la ruta) y en el endpoint `app/api/asistencias/iclock/*`.
- Reportes, exportación a Excel/PDF y vistas agregadas de asistencia de todos los empleados.

## Modelo de datos

**No hay cambios en base de datos.** Esta spec solo lee `RH.asistencias`, que ya tiene todo lo necesario (`id_empleado`, `fecha_hora`, `tipo`, `id_checador`). El índice `IX_asistencias_empleado_fecha ([id_empleado], [fecha_hora])` creado en la spec 27 ya cubre exactamente el patrón de consulta (empleado + rango de fechas), así que tampoco se agregan índices. `queries.txt` no se modifica.

Los tipos nuevos van todos en **`interfaces/asistencia.ts`** (se amplía, nada existente cambia):

```ts
/** Fila de la tabla del historial: IAttendanceEvent + datos del checador resueltos por JOIN. */
export interface IAttendanceEventListItem extends IAttendanceEvent {
  nombre_checador: string;
  nombre_sucursal: string;
}

/** Página de checadas + total, para la paginación server-side. */
export interface IAttendanceEventsPage {
  events: IAttendanceEventListItem[];
  total:  number;   // total de checadas del rango, no de la página
}

/** Métricas de las 4 tarjetas de resumen, calculadas sobre el rango seleccionado. */
export interface IAttendanceSummary {
  attended_days:     number;  // días distintos con al menos una checada
  total_events:      number;  // checadas en el rango
  registered_hours:  number;  // suma de pares entrada→salida, en horas con 2 decimales
  incomplete_days:   number;  // días con entrada sin salida o salida sin entrada
}

/** Estado de un día del mes visible, para el punto de color del calendario. */
export type AttendanceDayStatus = "complete" | "incomplete";

export interface IAttendanceDayState {
  fecha:  string;               // "YYYY-MM-DD"
  status: AttendanceDayStatus;  // los días sin checadas simplemente no vienen en el arreglo
}
```

**Parámetros de las consultas** (no son tipos exportados, van inline en los server actions):

- `getEmployeeAttendanceEvents({ id_empleado, desde, hasta, pagina })` — `desde`/`hasta` son `"YYYY-MM-DD"`; la consulta filtra `fecha_hora >= @desde AND fecha_hora < DATEADD(day, 1, @hasta)` para incluir el día final completo. Pagina con `ORDER BY fecha_hora DESC OFFSET (pagina-1)*15 ROWS FETCH NEXT 15 ROWS ONLY`, más un `COUNT(*)` para el total.
- `getEmployeeAttendanceMonthStates({ id_empleado, mes })` — `mes` es `"YYYY-MM"`; internamente se expande al primer y último día del mes.

**Manejo de fechas** (reglas de CLAUDE.md): `fecha_hora` y `created_at` se traen siempre con `CONVERT(varchar(19), …, 120)`; `desde`/`hasta` viajan como strings `"YYYY-MM-DD"` y nunca se convierten a `Date` antes de llegar a `queryParams`; el "hoy" por defecto se calcula con `addZeroToday(new Date())`, no con `.toISOString()`.

**Cálculo de `registered_hours` e `incomplete_days`:** se hace **en el server action, en TypeScript**, sobre las checadas del rango ordenadas ascendentemente y agrupadas por día — no en SQL. Se recorre cada día emparejando en secuencia: una `entrada` abre un par, la siguiente `salida` lo cierra y suma su diferencia; una `entrada` sin `salida` que la cierre, o una `salida` sin `entrada` previa abierta, marca el día como incompleto (y no suma horas).

## Plan de implementación

### 1. Interfaces — `interfaces/asistencia.ts`

Agregar `IAttendanceEventListItem`, `IAttendanceEventsPage`, `IAttendanceSummary`, `AttendanceDayStatus` e `IAttendanceDayState` tal como quedaron en la sección anterior. No se toca nada existente.

*Verificación:* `npm run build` compila (solo tipos nuevos).

### 2. Helper de emparejado — `app/dashboard/empleados/[id]/asistencia/attendancePairing.ts` (archivo nuevo)

Función pura `summarizeAttendanceEvents(events: IAttendanceEvent[])` que recibe las checadas del rango **ordenadas ascendentemente** y devuelve `{ attended_days, total_events, registered_hours, incomplete_days }` más un mapa `fecha → AttendanceDayStatus`. Implementa el emparejado en secuencia descrito en el modelo de datos. Sin `"use server"` ni acceso a BD: la reutilizan tanto el resumen como los estados del calendario.

*Verificación:* casos manuales — día con entrada+salida suma sus horas; día con entrada, salida, entrada, salida suma ambos pares; día con solo entrada cuenta como incompleto y no suma horas; día con solo salida cuenta como incompleto.

### 3. Server actions — `app/dashboard/empleados/[id]/asistencia/actions.ts` (se amplía)

Tres funciones nuevas, todas con `getEmployeeById(id_empleado)` al inicio (si devuelve `null`, se responde vacío) y `queryParams`:

- **`getEmployeeAttendanceEvents({ id_empleado, desde, hasta, pagina })` → `IAttendanceEventsPage`.** `JOIN` a `RH.checadores` y `dbo.sucursales` para `nombre_checador` / `nombre_sucursal`; `WHERE a.[id_empleado] = @id_empleado AND a.[fecha_hora] >= @desde AND a.[fecha_hora] < DATEADD(day, 1, @hasta)`; `ORDER BY a.[fecha_hora] DESC OFFSET … FETCH NEXT 15`; `COUNT(*)` con el mismo `WHERE` para `total`. `fecha_hora` y `created_at` con `CONVERT(varchar(19), …, 120)`.
- **`getEmployeeAttendanceSummary({ id_empleado, desde, hasta })` → `IAttendanceSummary`.** Trae las checadas del rango (`fecha_hora`, `tipo`, sin paginar, orden ascendente) y delega en `summarizeAttendanceEvents`.
- **`getEmployeeAttendanceMonthStates({ id_empleado, mes })` → `IAttendanceDayState[]`.** Expande `"YYYY-MM"` al primer/último día del mes, trae sus checadas ordenadas y devuelve el mapa `fecha → status` del helper como arreglo (los días sin checadas no aparecen).

Ninguna muta datos, así que ninguna llama `revalidatePath`.

*Verificación:* con checadas de prueba en BD, un rango de un solo día devuelve solo las de ese día; el `total` no cambia al pasar de página; el rango incluye la última checada del día `hasta`.

### 4. Modal de identificadores — `componentes/EmployeeIdentifiersModal.tsx` (archivo nuevo, `"use client"`)

Envuelve el contenido que hoy vive en `page.tsx`: botón disparador "Identificadores", `createPortal` + patrón `mounted` como el resto de modales del repo, y adentro el listado de identificadores asignados (con su botón de baja) y el `EmployeeIdentifierForm` existente reutilizado sin cambios. Recibe `id_empleado`, `identifiers` y `checadores` como props desde el Server Component. La baja, que hoy es una Server Action inline atada a un `<form>` en `page.tsx`, pasa a llamar `deactivateEmployeeIdentifier` desde el modal seguido de `router.refresh()`.

*Verificación:* el modal abre y cierra; alta y baja de identificador siguen funcionando igual que antes, reflejándose en la lista sin recarga manual.

### 5. Calendario — `componentes/AttendanceCalendar.tsx` (archivo nuevo, `"use client"`)

Recibe `mes`, `desde`, `hasta` y `dayStates: IAttendanceDayState[]`. Renderiza la rejilla del mes (semana L-D), pinta el rango activo, los puntos por día (verde `complete`, ámbar `incomplete`), la leyenda y el botón "Limpiar rango". Toda interacción se traduce en `router.push` sobre los search params:

- Flechas de mes → cambian `mes` (y **no** tocan el rango).
- Primer clic en un día → `desde = hasta = ese día`, `pagina = 1`. Segundo clic → fija `hasta` (invirtiendo si es anterior a `desde`), `pagina = 1`. Tercer clic → reinicia el rango en ese día.
- "Limpiar rango" → `desde = hasta = hoy`, `mes` = mes actual, `pagina = 1`.

*Verificación:* seleccionar un rango recarga la tabla y las tarjetas con los datos de ese rango; navegar de mes repinta los puntos sin perder el rango seleccionado; la URL refleja siempre el estado y es compartible/recargable.

### 6. Pantalla — `app/dashboard/empleados/[id]/asistencia/page.tsx` (se reescribe)

Server Component. Lee `searchParams` (`desde`, `hasta`, `mes`, `pagina`) con defaults (`desde = hasta = addZeroToday(new Date())`, `mes` = mes de `hasta`, `pagina = 1`) y valores inválidos normalizados al default. Llama en paralelo `getEmployeeAttendanceEvents`, `getEmployeeAttendanceSummary`, `getEmployeeAttendanceMonthStates`, `getEmployeeIdentifiers` y `getChecadoresActivos`. Renderiza:

- Encabezado "Control de Asistencias" + `<EmployeeIdentifiersModal …>`.
- Fila de 4 tarjetas de resumen.
- Columna izquierda (`lg:col-span-8`): tabla de checadas (Fecha, Hora, Tipo, Sucursal), badge con el total de registros, estado vacío, y el paginador con `<Link>` que preservan `desde`/`hasta`/`mes`.
- Columna derecha (`lg:col-span-4`): `<AttendanceCalendar …>`.

El layout sigue el bento del mockup (`references/employees/Employees-html/asistencia.html`), pero con los tokens de color y clases Tailwind ya usados en el resto del expediente (`#0b1c30`, `#44474f`, `#c4c6d0`, variantes `dark:`), **no** con la paleta del prototipo. Se aplica la skill `frontend-design` al construirlo.

*Verificación:* abrir la pestaña muestra solo las checadas de hoy; con más de 15 checadas en el rango el paginador navega correctamente; recargar con la URL manipulada a mano da el mismo resultado.

### 7. Formateo de fecha/hora en la tabla

`fecha_hora` llega como `"YYYY-MM-DD HH:mm:ss"`. Para mostrar `13/10/2023` y `08:58` se parte el string directamente (`slice`), o se normaliza con `replace(" ", "T")` antes de cualquier `new Date` — nunca `new Date(dbValue)` sobre el string crudo.

*Verificación:* una checada guardada a las 08:58 se muestra como 08:58, no desplazada por zona horaria.

### 8. Verificación manual completa

- Empleado sin checadas: estado vacío, tarjetas en cero, calendario sin puntos.
- Empleado con checadas de varios días: rango de un día, rango de varios días y rango que cruza meses devuelven cifras coherentes; un día con entrada+salida pinta verde, uno con solo entrada pinta ámbar.
- El modal "Identificadores" conserva alta y baja.
- `npm run build` compila sin errores ni warnings nuevos.
- `"use client"` aparece solo en `EmployeeIdentifiersModal.tsx`, `AttendanceCalendar.tsx` y el ya existente `EmployeeIdentifierForm.tsx`.

Cada paso deja el sistema compilable; los pasos 1–3 no cambian todavía la UI, y la pantalla se sustituye por completo en el paso 6.

## Criterios de aceptación

- [ ] `interfaces/asistencia.ts` exporta `IAttendanceEventListItem`, `IAttendanceEventsPage`, `IAttendanceSummary`, `AttendanceDayStatus` e `IAttendanceDayState`, sin modificar los tipos existentes.
- [ ] No se ejecutó ningún DDL: `RH.asistencias` y el resto del esquema quedan idénticos, y `queries.txt` no se modificó.
- [ ] Al abrir `/dashboard/empleados/[id]/asistencia` sin parámetros, la tabla muestra únicamente las checadas con fecha de hoy y el calendario abre en el mes actual.
- [ ] La tabla muestra una fila por checada con las columnas Fecha, Hora, Tipo y Sucursal — y **no** muestra columnas Método ni Estado/Obs.
- [ ] La columna Sucursal muestra la sucursal del **checador** que registró la checada (vía `JOIN` a `RH.checadores`), no la sucursal asignada al empleado.
- [ ] Las filas se ordenan de la checada más reciente a la más antigua.
- [ ] La paginación es server-side con 15 filas por página: el server action devuelve solo esa página más el `total` del rango, y el pie muestra el conteo correcto.
- [ ] Navegar entre páginas conserva el rango y el mes seleccionados en la URL.
- [ ] Las 4 tarjetas muestran Días con asistencia, Total de checadas, Horas registradas y Días incompletos, calculadas sobre el rango seleccionado (no sobre la página visible).
- [ ] `registered_hours` suma cada par entrada→salida en secuencia dentro del mismo día: un día con entrada, salida, entrada, salida suma ambos pares.
- [ ] Un día con entrada sin salida (o salida sin entrada) cuenta en `incomplete_days` y no aporta horas.
- [ ] En el calendario, un día con entrada y salida pinta punto verde; un día incompleto pinta punto ámbar; un día sin checadas no pinta punto.
- [ ] Los puntos del calendario corresponden a todo el mes visible, aunque el rango seleccionado sea solo un día.
- [ ] Hacer clic en dos días distintos filtra la tabla y las tarjetas por ese rango, incluyendo las checadas del día final completo (una checada a las 23:50 del día `hasta` aparece).
- [ ] Seleccionar un rango invertido (clic en un día posterior y luego en uno anterior) produce un rango válido, no una tabla vacía.
- [ ] Navegar de mes en el calendario repinta los puntos sin alterar el rango seleccionado.
- [ ] "Limpiar rango" devuelve el filtro a hoy y el calendario al mes actual.
- [ ] El estado (`desde`, `hasta`, `mes`, `pagina`) vive en la URL; recargar la página o compartir la URL reproduce exactamente la misma vista.
- [ ] Parámetros inválidos o ausentes en la URL se normalizan a los valores por defecto sin romper la página.
- [ ] `page.tsx` es Server Component; `"use client"` aparece solo en `EmployeeIdentifiersModal.tsx`, `AttendanceCalendar.tsx` y el preexistente `EmployeeIdentifierForm.tsx`.
- [ ] El paginador se renderiza con `<Link>` desde el Server Component, sin componente cliente propio.
- [ ] El botón "Identificadores" del encabezado abre un modal que lista los identificadores activos del empleado y permite darlos de alta y de baja, con el mismo comportamiento que la pantalla anterior.
- [ ] La configuración de identificadores ya no ocupa el cuerpo de la pestaña.
- [ ] No existe en ninguna parte de la pantalla un botón "Registrar Asistencia Manual", ni "Actualizar", ni indicadores de retardo/falta/puntualidad.
- [ ] Todas las consultas nuevas usan `queryParams` y validan pertenencia del empleado con `getEmployeeById`.
- [ ] Todas las columnas de fecha se traen con `CONVERT(varchar(19), …, 120)` y no se construye ningún `Date` a partir de strings crudos de BD; el "hoy" por defecto usa `addZeroToday(new Date())`.
- [ ] Una checada registrada a las 08:58 se muestra como 08:58, sin desplazamiento de zona horaria.
- [ ] Un empleado sin checadas en el rango muestra estado vacío, tarjetas en cero y calendario sin puntos, sin errores.
- [ ] `npm run build` compila sin errores ni warnings nuevos.
- [ ] Roles 2, 3 y 5 siguen siendo redirigidos por `proxy.ts` al entrar a la ruta, sin cambios en `proxy.ts`.

## Decisiones tomadas y descartadas

- **Sin cálculo de retardos, faltas ni puntualidad (opción 1a).** El mockup promete "Retardos", "Entradas a tiempo 95%" y filas de "Falta"/"Tolerancia (2 min)", pero `RH.empleados.horario` y `dias_laborales` son texto libre ("09:00 - 18:00", "Lunes a Sábado") — no hay horario esperado estructurado contra el cual comparar. Se descartaron dos alternativas: (b) crear ya `RH.empleado_horarios` con hora de entrada/salida por día y tolerancia, que es una spec grande por sí sola y arrastra decisiones de nómina; y (c) parsear el texto libre con una tolerancia global fija, que es frágil (cualquier variación de formato produce cifras silenciosamente falsas en un dato sensible como asistencia). Se prefiere mostrar solo hechos verificables ahora y estructurar horarios en una spec propia.

- **Las 4 tarjetas se redefinieron para ser derivables sin horario.** En vez de Días asistidos / Horas / Retardos / % a tiempo, se muestran Días con asistencia / Total de checadas / Horas registradas / Días incompletos. Se conserva la forma visual del mockup sin inventar métricas que no se pueden calcular.

- **Una fila por checada, no una fila por día.** El mockup mezcla ambas granularidades (Entrada 08:58 y Salida 18:05 como filas separadas, pero "Falta" como fila de día). Sin cálculo de faltas la fila por día pierde su razón de ser, y la fila por checada es fiel 1:1 a `RH.asistencias` — lo que ve el usuario es exactamente lo que reportó el dispositivo, sin capa de interpretación. La vista agregada por día queda para cuando exista el horario esperado.

- **Se eliminan las columnas "Método" y "Estado / Obs."** La primera sería literalmente siempre "Biométrico" (no hay captura manual ni app móvil), y la segunda depende del cálculo de incidencias. Se descartó dejar "Método" fija como decoración: una columna con un único valor es ruido. Tampoco se sustituyó "Estado" por la columna "Checador" — el nombre de la sucursal ya ubica el dispositivo y agregar ambas ensancha la tabla sin aportar; el nombre del checador sí viaja en el DTO por si se decide mostrarlo después.

- **Sin registro manual de asistencia en esta spec.** Habría requerido agregar `metodo` e `id_usuario_registro` a `RH.asistencias`, decidir qué roles pueden capturar checadas a mano y cómo se auditan — una superficie de escritura sobre datos que hoy son evidencia de un dispositivo físico. Se dejó fuera deliberadamente; si entra después, entra con su propio esquema y su propia auditoría.

- **Emparejado entrada→salida en secuencia (2b), no primera-entrada/última-salida (2a).** Se eligió el emparejado por pares porque descuenta las salidas intermedias (comida): con 2a, un empleado que sale a comer 1 hora aparecería con esa hora como trabajada. El costo es que la lógica vive en TypeScript en vez de SQL, lo que a cambio la hace testeable como función pura (`summarizeAttendanceEvents`) y reutilizable entre el resumen y los puntos del calendario.

- **Estado en la URL (`?desde=&hasta=&mes=&pagina=`) en vez de estado en cliente.** Permite que `page.tsx` siga siendo Server Component y que los datos se traigan del servidor sin `useEffect` + fetch, tal como exige CLAUDE.md. Beneficio adicional: la vista es recargable y compartible por link. Se descartó subir toda la pantalla a `"use client"` con estado local y llamadas a server actions, que era el camino corto pero contradice la convención del repo.

- **Paginación server-side con `<Link>`, no un componente cliente.** Como la página vive en la URL, el paginador puede ser Server Component puro. Se descartó copiar el paginador de `StockMovementsTable.tsx`, que usa `useState` local porque ahí toda la tabla ya es cliente; replicarlo aquí habría forzado un `"use client"` innecesario. No se extrajo un paginador compartido: hoy solo habría dos usos con contratos distintos (URL vs estado local), y abstraer sobre dos casos divergentes es prematuro.

- **La configuración de identificadores pasa a modal (opción 2a), no a sub-pestañas ni al modal de Sucursales.** Es configuración esporádica (se hace una vez, al dar de alta al empleado) compitiendo por el espacio con datos de consulta diaria. Se descartó dividir en sub-pestañas ("Asistencias" / "Identificadores") porque anida un segundo nivel de navegación dentro de una pestaña; y se descartó moverla al modal de checadores en `/dashboard/sucursales` porque el PIN pertenece al empleado, no al dispositivo, y buscarlo ahí sería contraintuitivo.

- **Sin tope máximo de rango.** La paginación server-side ya acota las filas traídas de la tabla, y el índice `IX_asistencias_empleado_fecha` cubre la consulta. El único cálculo que sí recorre todo el rango es el resumen — ver riesgos.

- **Se conserva el layout bento del mockup, pero no su paleta.** El prototipo trae su propio `tailwind.config` con tokens Material (`surface-container-lowest`, `on-surface-variant`, etc.) que no existen en el proyecto. Se reutilizan los colores ya usados en el resto del expediente para que la pestaña no se vea como una pantalla ajena al sistema.

- **No se toca el endpoint ADMS ni `proxy.ts`.** Esta spec es de solo lectura sobre datos que ya llegan bien; la guarda `pathname.startsWith("/dashboard/empleados")` ya cubre la ruta.

## Riesgos identificados

- **El resumen y los puntos del calendario recorren todo el rango, sin paginar.** La tabla está acotada a 15 filas, pero `getEmployeeAttendanceSummary` trae todas las checadas del rango para emparejarlas en TypeScript, y al no haber tope de rango un usuario puede pedir varios años de un empleado antiguo. Con ~4 checadas por día son unas 1,000 filas al año — manejable, pero crece linealmente y sin techo. *Mitigación si molesta:* mover el conteo de días y el `COUNT(*)` a SQL y traer solo lo mínimo para el emparejado, o introducir el tope de rango que aquí se descartó.

- **La ausencia de estados puede leerse como "no hay retardos" en vez de "no se calculan".** La pantalla muestra checadas crudas sin ningún juicio, y alguien de RH podría interpretar que un empleado llegó a tiempo porque la fila no dice lo contrario. *Mitigación:* que la pantalla no insinúe evaluación (sin semáforos ni porcentajes de puntualidad), lo cual ya está en el alcance — los únicos colores son verde/ámbar y refieren a completitud del par, no a puntualidad. Vale la pena una línea de texto bajo el título aclarando que se muestran las checadas registradas por el checador, sin evaluación de horario.

- **El mapeo `status → tipo` del ADMS sigue sin validarse contra el firmware real** (heredado de la spec 27: `1`/`5` = salida, cualquier otro = entrada). Esta pantalla es la primera que expone ese dato al usuario, así que si el mapeo está mal, se hará visible aquí como entradas/salidas invertidas y como días marcados incompletos sin serlo. *Es en realidad una oportunidad:* la propia pantalla sirve para detectar y corregir el mapeo en una spec posterior.

- **"Días incompletos" contará falsos positivos por operación normal, no solo por error.** Un empleado que olvida checar salida, o cuyo turno cruza la medianoche (el emparejado agrupa por día calendario, así que una entrada a las 22:00 y su salida a las 02:00 quedan en días distintos y ambos incompletos), inflará la métrica. Hoy los turnos son Matutino/Vespertino y no cruzan medianoche, así que se acepta; si aparece un turno nocturno, el agrupado por día calendario deja de servir.
