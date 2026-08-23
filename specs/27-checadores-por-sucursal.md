# 27 — Checadores por sucursal y alta de PIN de empleado

## Header

- **Estado:** Aprobado
- **Depende de:** Spec 25 (`RH.empleados`, `/dashboard/empleados/[id]`, guarda de rol en `proxy.ts`), Spec 26
  (barra de pestañas del expediente). Modifica en sitio `RH.empleado_identificadores` y `RH.asistencias`
  (creadas fuera de un spec, directo en la conversación previa) y el endpoint `app/api/asistencias/iclock/cdata`.
- **Fecha:** 2026-08-22
- **Objetivo:** Diferenciar en base de datos qué checador biométrico (por sucursal) reportó cada checada, y
  agregar la pantalla de alta de PIN del empleado en una nueva pestaña "Asistencia" del expediente, junto
  con el CRUD de checadores por sucursal (modal, igual que "Calendarios").

## Alcance

**Incluye:**

### Base de datos

- Nueva tabla **`[CentroPodologico].[RH].[checadores]`**: un registro por dispositivo físico, con su `SN`
  único, la sucursal a la que pertenece y su estado (activo/inactivo).
- **Alteración de `[RH].[empleado_identificadores]`**: se agrega `id_checador` (FK a `RH.checadores`,
  `NOT NULL`); se elimina el `UNIQUE` global sobre `identificador` y se reemplaza por
  `UNIQUE (id_checador, identificador)` — el mismo PIN puede repetirse en checadores distintos, para
  empleados distintos.
- **Alteración de `[RH].[asistencias]`**: se agrega `id_checador` (FK a `RH.checadores`, `NOT NULL`) para
  saber de qué dispositivo/sucursal vino cada checada.
- DDL documentado en `queries.txt` bajo un nuevo bloque
  `-------------------- CHECADORES POR SUCURSAL ---------------------`.

### CRUD de checadores (modal en Sucursales)

- Botón "Checadores" en cada fila de `/dashboard/sucursales`, junto al de "Calendarios", que abre
  `SucursalCheckadoresModal.tsx` (mismo patrón que `SucursalCalendariosModal.tsx`).
- Dentro del modal: listar los checadores de esa sucursal, dar de alta uno nuevo (`SN` + nombre
  descriptivo), editar nombre, activar/desactivar (baja lógica, no borrado físico).
- El `SN` es lo único que debe coincidir exactamente con el que el dispositivo manda en el handshake
  (`?SN=...`).

### Pantalla de alta de PIN — pestaña "Asistencia" del expediente

- Se activa la tercera pestaña "Asistencia" en `EmployeeTabs.tsx` (`/dashboard/empleados/[id]/asistencia`),
  hoy inexistente.
- Sección para asignar identificadores al empleado: seleccionar checador (de los activos, cualquier
  sucursal — un empleado puede tener huella en más de un checador si rota de sucursal), capturar el
  PIN/identificador crudo, tipo (`huella` | `tarjeta` | `otro`). Listado de los identificadores ya
  asignados a ese empleado con opción de dar de baja (lógica).
- Esta pantalla **no** muestra todavía el historial de checadas (`RH.asistencias`) — queda reservado para
  ampliar esta misma pestaña en un spec futuro.

### Endpoint ADMS (`app/api/asistencias/iclock/cdata`)

- El handshake (`GET`) resuelve el `SN` recibido contra `RH.checadores`. Si no existe o está inactivo, se
  **rechaza** (no se entrega la configuración) y se loguea la advertencia.
- El `POST` con `table=ATTLOG` resuelve el empleado por `(id_checador, PIN)` en vez de por PIN solo, y
  guarda `id_checador` en cada fila de `RH.asistencias`.
- `lib/zktecoAdms.ts` se ajusta para recibir el `id_checador` ya resuelto y usarlo en ambas consultas.

**No incluye (para specs futuras):**

- Historial de checadas visible en la pestaña "Asistencia" (solo alta/baja de PIN en este spec).
- Auto-registro de checadores desconocidos: un `SN` no dado de alta manualmente siempre se rechaza, nunca
  se crea solo.
- Cálculo de horas trabajadas, retardos, faltas o reportes de nómina a partir de `RH.asistencias`.
- Ajuste del mapeo `status → tipo` del protocolo ADMS (entrada/salida) contra el firmware real — se deja
  igual que hoy (`1`/`5` = salida, cualquier otro = entrada).
- Pantalla de "PIN no reconocidos" para resolver checadas huérfanas — siguen descartándose con
  `console.warn`.
- Autenticación del endpoint `/api/asistencias/iclock/*` (sigue sin API key, decisión ya tomada
  anteriormente).

## Modelo de datos

### Tabla nueva: `[CentroPodologico].[RH].[checadores]`

```sql
USE [CentroPodologico]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [RH].[checadores](
    [id_checador] [int] IDENTITY(1,1) NOT NULL,
    [sn]          [varchar](50)  NOT NULL,   -- número de serie, debe calzar EXACTO con ?SN= del dispositivo
    [id_sucursal] [int]          NOT NULL,
    [nombre]      [varchar](100) NOT NULL,   -- descriptivo, ej. "Entrada principal"
    [activo]      [bit]          NOT NULL CONSTRAINT [DF_checadores_activo] DEFAULT (1),
    [status]      [bit]          NOT NULL CONSTRAINT [DF_checadores_status] DEFAULT (1),
    [created_at]  [datetime2](0) NULL,
 CONSTRAINT [PK_checadores] PRIMARY KEY CLUSTERED ([id_checador] ASC),
 CONSTRAINT [UQ_checadores_sn] UNIQUE ([sn]),
 CONSTRAINT [FK_checadores_sucursal] FOREIGN KEY ([id_sucursal])
     REFERENCES [dbo].[sucursales] ([id_sucursal])
) ON [PRIMARY]
GO
CREATE INDEX [IX_checadores_sucursal]
    ON [RH].[checadores] ([id_sucursal], [status])
GO
```

### Alteración: `[RH].[empleado_identificadores]`

Reemplaza el `UNIQUE` global por uno compuesto con `id_checador`. Sin datos que migrar (tabla vacía hoy).

```sql
ALTER TABLE [RH].[empleado_identificadores]
    DROP CONSTRAINT [UQ_empleado_identificadores_identificador]
GO
ALTER TABLE [RH].[empleado_identificadores]
    ADD [id_checador] [int] NOT NULL CONSTRAINT [DF_empleado_identificadores_checador] DEFAULT (0)
GO
ALTER TABLE [RH].[empleado_identificadores]
    DROP CONSTRAINT [DF_empleado_identificadores_checador]
GO
ALTER TABLE [RH].[empleado_identificadores]
    ADD CONSTRAINT [FK_empleado_identificadores_checador] FOREIGN KEY ([id_checador])
        REFERENCES [RH].[checadores] ([id_checador])
GO
ALTER TABLE [RH].[empleado_identificadores]
    ADD CONSTRAINT [UQ_empleado_identificadores_checador_identificador] UNIQUE ([id_checador], [identificador])
GO
```

*(el `DEFAULT (0)` es solo para poder agregar la columna `NOT NULL` sobre una tabla vacía sin fricción; se
elimina el default de inmediato — cualquier alta nueva de identificador siempre manda `id_checador` real).*

### Alteración: `[RH].[asistencias]`

```sql
ALTER TABLE [RH].[asistencias]
    ADD [id_checador] [int] NOT NULL CONSTRAINT [DF_asistencias_checador] DEFAULT (0)
GO
ALTER TABLE [RH].[asistencias]
    DROP CONSTRAINT [DF_asistencias_checador]
GO
ALTER TABLE [RH].[asistencias]
    ADD CONSTRAINT [FK_asistencias_checador] FOREIGN KEY ([id_checador])
        REFERENCES [RH].[checadores] ([id_checador])
GO
CREATE INDEX [IX_asistencias_checador]
    ON [RH].[asistencias] ([id_checador], [fecha_hora])
GO
```

### Interfaces — `interfaces/checador.ts` (archivo nuevo)

```ts
/** Fila de RH.checadores. */
export interface IChecador {
  id_checador: number;
  sn:          string;
  id_sucursal: number;
  nombre:      string;
  activo:      boolean;
  status:      boolean;
  created_at:  string | null;
}

/** Fila de listado: IChecador + nombre de sucursal resuelto por JOIN. */
export interface IChecadorListItem extends IChecador {
  nombre_sucursal: string;
}

/** Payload del alta/edición de checador. */
export type ChecadorFormInput = Pick<IChecador, "sn" | "id_sucursal" | "nombre">;
```

### Interfaces — `interfaces/asistencia.ts` (se amplían)

```ts
export interface IEmployeeIdentifier {
  id_empleado_identificador: number;
  id_empleado:               number;
  id_checador:                number;   // nuevo
  identificador:             string;
  tipo:                      "huella" | "tarjeta" | "otro";
  status:                    boolean;
  created_at:                string | null;
}

/** Listado para la pestaña "Asistencia": IEmployeeIdentifier + nombre del checador. */
export interface IEmployeeIdentifierListItem extends IEmployeeIdentifier {
  nombre_checador:  string;
  nombre_sucursal:  string;
}

export interface IAttendanceEvent {
  id_asistencia:        number;
  id_empleado:          number;
  id_checador:           number;   // nuevo
  fecha_hora:           string;
  tipo:                 AttendanceEventType;
  identificador_origen: string | null;
  created_at:           string | null;
}
```

## Plan de implementación

### 1. Base de datos

Ejecutar manualmente contra `CentroPodologico` el `CREATE TABLE [RH].[checadores]` y los `ALTER TABLE` de
`RH.empleado_identificadores` y `RH.asistencias`. Agregar el mismo DDL a `queries.txt`, después del bloque
`ASISTENCIAS (checador biométrico)`, bajo el separador
`-------------------- CHECADORES POR SUCURSAL ---------------------`.

*Verificación:* `SELECT TOP 1 * FROM [RH].[checadores]` responde sin error; `sp_help
'[RH].[empleado_identificadores]'` y `sp_help '[RH].[asistencias]'` muestran la columna `id_checador` y sus
FK.

### 2. Interfaces

Crear `interfaces/checador.ts` (`IChecador`, `IChecadorListItem`, `ChecadorFormInput`) y ampliar
`interfaces/asistencia.ts` con `id_checador` en `IEmployeeIdentifier`/`IAttendanceEvent` y el nuevo
`IEmployeeIdentifierListItem`.

*Verificación:* `npm run build` compila (solo tipos nuevos, nada roto).

### 3. Server actions de checadores — `app/dashboard/sucursales/actions.ts` (se amplía)

Siguiendo el patrón exacto de `getSucursalCalendarios` / `saveSucursalCalendario` /
`deleteSucursalCalendario`:

- `getChecadores(id_sucursal)` → `IChecador[]` de esa sucursal con `status = 1`.
- `saveChecador(input: ChecadorFormInput & { id_checador?: number })` → `ActionResult<number>`. Valida que
  `sn` no esté ya en uso por otro checador (`UQ_checadores_sn` lo respalda en BD, pero se valida antes para
  dar mensaje claro). `INSERT` o `UPDATE` según traiga `id_checador`. `created_at` con
  `buildDate(new Date())`.
- `deactivateChecador(id_checador)` → `ActionResult<null>`. Baja lógica (`status = 0`), no borra — igual que
  el resto del repo.
- Todas con `queryParams`, cierran con `revalidatePath("/dashboard/sucursales")`.

*Verificación:* alta de un checador con `SN` repetido devuelve `{ ok: false }` con mensaje claro; alta con
`SN` nuevo aparece en `getChecadores` de esa sucursal.

### 4. UI de checadores — `SucursalCheckadoresModal.tsx` (archivo nuevo)

Copia el esqueleto de `SucursalCalendariosModal.tsx` (mismo manejo de `mounted`/`createPortal`, mismo
`ConfirmModal` para la baja): listado de checadores de la sucursal, formulario alta/edición (`SN`, nombre),
botón dar de baja. Se agrega el botón "Checadores" junto al de "Calendarios" en `SucursalFila.tsx`.

*Verificación:* desde `/dashboard/sucursales`, dar de alta un checador con `SN=NYU7244801371` para una
sucursal y verlo listado; dar de baja lo desaparece de la lista activa.

### 5. Server actions de identificadores — `app/dashboard/empleados/[id]/asistencia/actions.ts` (archivo
nuevo)

Mismo helper `getActiveUser()` que el resto de `empleados`:

- `getChecadoresActivos()` → todos los checadores con `status = 1` de cualquier sucursal (para el select —
  un empleado puede tener huella en más de un checador si rota de sucursal), con `nombre_sucursal` resuelto
  por `JOIN`.
- `getEmployeeIdentifiers(id_empleado)` → `IEmployeeIdentifierListItem[]` con `status = 1`, `JOIN` a
  `RH.checadores` y `dbo.sucursales` para `nombre_checador`/`nombre_sucursal`. Verifica pertenencia del
  empleado igual que `getEmployeeById`.
- `saveEmployeeIdentifier({ id_empleado, id_checador, identificador, tipo })` → `ActionResult<number>`.
  Valida que `(id_checador, identificador)` no esté ya asignado a otro empleado (mensaje claro además del
  `UNIQUE` de BD). `INSERT` con `created_at = buildDate(new Date())`.
- `deactivateEmployeeIdentifier(id_empleado_identificador)` → `ActionResult<null>`. Baja lógica.
- Cierran con `revalidatePath("/dashboard/empleados/[id]/asistencia")`.

*Verificación:* asignar el mismo PIN (`"1"`) en dos checadores distintos a dos empleados distintos funciona
sin error; intentar asignarlo dos veces al mismo checador falla con mensaje claro.

### 6. Pantalla — pestaña "Asistencia" del expediente

- `EmployeeTabs.tsx`: se agrega la tercera entrada `{ href: /dashboard/empleados/${id}/asistencia, label:
  "Asistencia" }`.
- `app/dashboard/empleados/[id]/asistencia/page.tsx` (archivo nuevo): Server Component, llama
  `getEmployeeIdentifiers` + `getChecadoresActivos`, renderiza listado de identificadores asignados
  (checador, sucursal, tipo, identificador, botón dar de baja) y el formulario de alta.
- `app/dashboard/empleados/[id]/asistencia/componentes/EmployeeIdentifierForm.tsx` (Client Component, único
  con `"use client"`): select de checador (de `getChecadoresActivos`), input de identificador, select de
  tipo; llama `saveEmployeeIdentifier`.

No requiere cambios en `proxy.ts`: la guarda `pathname.startsWith("/dashboard/empleados")` ya cubre la ruta
nueva.

*Verificación:* la pestaña "Asistencia" aparece junto a "Datos Personales" y "Documentación"; dar de alta un
identificador lo refleja en el listado sin recarga manual; roles 2, 3 y 5 son redirigidos igual que en el
resto del expediente.

### 7. Endpoint ADMS — resolver por checador

- `app/api/asistencias/iclock/cdata/route.ts` (`GET`): antes de responder el handshake, resuelve `SN`
  contra `RH.checadores` (`status = 1`). Si no existe → responde `403` con texto plano y loguea
  `console.warn`. Si existe, procede igual que hoy.
- `lib/zktecoAdms.ts`: `parseAttlogBody` no cambia; `saveAttendanceRecords(records, idChecador)` ahora
  recibe el `id_checador` ya resuelto y lo usa tanto para resolver el PIN (`WHERE id_checador = @id_checador
  AND identificador = @identificador`) como para el `INSERT` en `RH.asistencias`.
- `POST` en `route.ts` también resuelve el `SN` a `id_checador` antes de llamar `saveAttendanceRecords` (si
  el `SN` no existe, responde `403` igual que el handshake, sin tocar `RH.asistencias`).

*Verificación:* un `SN` no dado de alta recibe `403` en el handshake y en el `POST`; un `SN` dado de alta
guarda checadas con el `id_checador` correcto; el mismo PIN en dos checadores de sucursales distintas
resuelve al empleado correcto en cada uno.

### 8. Verificación manual completa

- Dar de alta 2 checadores en 2 sucursales distintas, ambos con PIN `"1"` asignado a empleados distintos →
  cada `POST ATTLOG` de cada `SN` inserta la checada del empleado correcto.
- Un `SN` no reconocido: handshake y `POST` responden `403`, no se inserta nada.
- Dar de baja un checador: su handshake empieza a responder `403`.
- `npm run build` compila sin errores ni warnings nuevos.

## Criterios de aceptación

- [ ] Existe en BD `[RH].[checadores]` con `UNIQUE` sobre `sn` y FK a `dbo.sucursales`.
- [ ] `[RH].[empleado_identificadores]` tiene `id_checador` `NOT NULL` con FK a `RH.checadores`, y su
      `UNIQUE` es `(id_checador, identificador)` — ya no existe el `UNIQUE` global anterior sobre
      `identificador`.
- [ ] `[RH].[asistencias]` tiene `id_checador` `NOT NULL` con FK a `RH.checadores` y su índice `(id_checador,
      fecha_hora)`.
- [ ] Todo el DDL nuevo está en `queries.txt`, bajo el separador `CHECADORES POR SUCURSAL`.
- [ ] Desde `/dashboard/sucursales`, el botón "Checadores" de cada fila abre un modal que permite dar de
      alta, editar y dar de baja (lógica) checadores de esa sucursal.
- [ ] Dar de alta un `SN` ya usado por otro checador (de cualquier sucursal) falla con mensaje claro, sin
      llegar a violar el `UNIQUE` de BD sin control.
- [ ] El expediente de empleado muestra una tercera pestaña "Asistencia"
      (`/dashboard/empleados/[id]/asistencia`), junto a "Datos Personales" y "Documentación".
- [ ] La pestaña "Asistencia" permite asignar un identificador (checador + PIN + tipo) al empleado y lista
      los ya asignados con opción de dar de baja.
- [ ] El mismo PIN puede asignarse en dos checadores distintos a dos empleados distintos sin error.
- [ ] Asignar un PIN ya usado en el mismo checador falla con mensaje claro.
- [ ] `GET .../iclock/cdata?SN=<desconocido>` responde `403` y no entrega configuración; se loguea la
      advertencia.
- [ ] `POST .../iclock/cdata?SN=<desconocido>&table=ATTLOG` responde `403` y no inserta nada en
      `RH.asistencias`.
- [ ] `POST .../iclock/cdata?SN=<conocido>&table=ATTLOG` inserta cada checada con el `id_checador` correcto,
      resolviendo el PIN por `(id_checador, identificador)`.
- [ ] Dar de baja un checador hace que su handshake empiece a responder `403`.
- [ ] Todas las consultas nuevas usan `queryParams`; los server actions de checadores e identificadores
      validan pertenencia (sucursal del usuario / empresa del empleado) igual que el resto de RH.
- [ ] `created_at` se escribe con `buildDate(new Date())` en todas las tablas nuevas/alteradas.
- [ ] `"use client"` aparece únicamente en `SucursalCheckadoresModal.tsx` y `EmployeeIdentifierForm.tsx`; el
      resto son Server Components.
- [ ] `npm run build` compila sin errores ni warnings nuevos.
- [ ] Roles 2, 3 y 5 son redirigidos por `proxy.ts` al entrar a `/dashboard/empleados/[id]/asistencia` (sin
      cambios necesarios en `proxy.ts`, la guarda existente ya cubre la ruta).

## Decisiones tomadas y descartadas

- **`id_checador` en vez de solo `SN` como identificador en las tablas relacionadas.** Un `int`
  autoincremental es más barato de indexar y de referenciar por FK que un `varchar(50)`; el `SN` se
  conserva único en `RH.checadores` pero no viaja repetido en cada fila de `asistencias`/
  `empleado_identificadores`. Descartado: usar `SN` directo como PK/FK.

- **Unicidad de PIN por `(id_checador, identificador)`, no global.** Confirmado con el usuario: cada
  sucursal administra sus checadores de forma independiente y puede reusar números de PIN. Un `UNIQUE`
  global habría impedido esto y habría obligado a coordinar rangos de PIN entre sucursales, algo que no
  está garantizado hoy.

- **Checadores desconocidos siempre se rechazan (`403`), nunca se auto-registran.** Auto-registrar
  dispositivos no reconocidos es una superficie de abuso (cualquiera que sepa la URL podría "conectar" un
  dispositivo falso) y además dejaría checadores fantasma sin sucursal asignada. El alta manual previa es
  más segura y ya es el patrón del resto de RH (nada se crea implícitamente).

- **Modal en Sucursales (`SucursalCheckadoresModal`) en vez de ruta `[id]` nueva.** `sucursales` no tiene
  detalle propio hoy — es lista + modales (`SucursalCalendariosModal`). Crear una ruta `[id]` solo para
  checadores rompería esa convención sin necesidad; el modal reutiliza exactamente el mismo esqueleto ya
  probado.

- **Pestaña "Asistencia" en el expediente en vez de pantalla independiente.** Ya estaba prevista como
  pestaña futura en el spec 26 (hoy deshabilitada) y deja el terreno preparado para agregar ahí mismo, en
  un spec posterior, el historial de checadas del empleado — sin fragmentar la información de asistencia
  en dos lugares distintos del sistema.

- **Sin backfill de datos al alterar `empleado_identificadores`/`asistencias`.** Ambas tablas se crearon en
  esta misma conversación y siguen vacías (nadie ha podido dar de alta un PIN todavía, porque la pantalla
  no existía). Se documenta explícitamente para que quede claro que el `DEFAULT (0)` transitorio en los
  `ALTER` es solo un mecanismo técnico, no una migración de datos reales.

- **`GET getChecadoresActivos()` sin filtrar por sucursal del empleado.** Un empleado puede fichar en un
  checador de una sucursal distinta a la suya (cobertura entre sucursales, suplencias). Restringir el
  select solo a los checadores de su propia sucursal habría bloqueado ese caso sin que se haya pedido esa
  restricción.

- **Mapeo `status → tipo` del ADMS sin tocar en este spec.** Quedó fuera de alcance explícitamente: el
  usuario priorizó diferenciar checadores por sucursal sobre ajustar los códigos de firmware, que se
  revisará cuando haya visibilidad real de qué códigos manda el dispositivo en producción.

## Riesgos identificados

- **`403` en el handshake puede dejar el checador reintentando indefinidamente sin que nadie lo note.** A
  diferencia de un error de aplicación con UI, un checador rechazado no tiene forma de "avisar" salvo sus
  propios logs internos (a veces ni siquiera visibles sin acceso físico al dispositivo). *Mitigación
  pendiente para otro spec:* alertar (correo/Slack) cuando un `SN` desconocido intente conectarse
  repetidamente, en vez de depender de revisar logs del servidor.

- **Migración en caliente de un `UNIQUE` constraint en una tabla ya productiva.** Aunque hoy está vacía, si
  entre esta conversación y la ejecución del `ALTER` alguien ya insertó un identificador de prueba, el
  `DROP CONSTRAINT` + `ADD CONSTRAINT` fallaría o dejaría un estado intermedio inconsistente. *Mitigación:*
  verificar `SELECT COUNT(*) FROM RH.empleado_identificadores` antes de ejecutar el `ALTER`, como parte del
  paso 1.

- **Un empleado con checadas ya asociadas a un checador que luego se da de baja.** El histórico en
  `RH.asistencias` conserva el `id_checador`, pero la baja lógica del checador no se propaga a
  `RH.empleado_identificadores` — un PIN podría quedar "vivo" apuntando a un checador inactivo. Aceptado
  por ahora: no rompe nada (el checador inactivo ya no manda handshakes), pero si se reactiva el mismo `SN`
  en otro checador nuevo, el PIN viejo no se reasigna automáticamente.
