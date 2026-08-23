# 26 — Expediente documental del empleado

## Header

- **Estado:** Implementado
- **Depende de:** Spec 25 (`RH.empleados`, `/dashboard/empleados/[id]`, guarda de rol en `proxy.ts`).
  Reutiliza el endpoint existente `app/api/upload` (Cloudinary). No modifica `RH.empleados`.
- **Fecha:** 2026-08-20
- **Objetivo:** Agregar al expediente del empleado la pestaña "Documentación"
  (`/dashboard/empleados/[id]/documentos`), donde se ven, suben y reemplazan los 8 documentos
  obligatorios más documentos libres, respaldados por un catálogo `RH.tipos_documento` y una
  tabla `RH.empleado_documentos`.

## Alcance

**Incluye:**

### Base de datos

- Nueva tabla catálogo **`[CentroPodologico].[RH].[tipos_documento]`** con los 8 tipos obligatorios
  sembrados (INE — frente y reverso, Comprobante de domicilio, Constancia de situación fiscal,
  CURP, Hoja de Seguro Social, Contrato firmado, Firma de recibido del equipo,
  Firma de recibido del instrumental).
- Nueva tabla **`[CentroPodologico].[RH].[empleado_documentos]`** con un registro por archivo subido.
- Ambas se crean manualmente contra la BD (no hay migraciones) y su DDL + los `INSERT` del catálogo
  se documentan en `queries.txt`, bajo el bloque
  `------------ RECURSOS HUMANOS(EMPLEADOS)----------------------`, después de `RH.empleados`.

### Navegación

- Se agrega la **barra de pestañas** del expediente, hoy inexistente, con exactamente **dos** pestañas:
  **"Datos Personales"** (`/dashboard/empleados/[id]`, la pantalla actual) y
  **"Documentación"** (`/dashboard/empleados/[id]/documentos`, nueva ruta).
- La cabecera del empleado (`EmployeeHeader`) se muestra igual en ambas pestañas.
- La nueva ruta hereda la guarda de `proxy.ts` de spec 25: solo `id_role` 1 y 4.
  **Ambos roles pueden ver, subir y reemplazar.**

### Pantalla `/dashboard/empleados/[id]/documentos`

- **Columna izquierda (2/3):** encabezado "Documentos Requeridos" + badge contador
  `N/8 Completados`, y una rejilla de tarjetas — una por cada tipo del catálogo, más una tarjeta
  por cada documento libre ("Otro") ya subido.
  - Tarjeta **cargada**: icono, nombre del tipo, `PDF • 1.2 MB`, fecha de carga y usuario que lo
    subió, badge verde "Cargado", y acciones **Ver** (pestaña nueva), **Descargar** y **Reemplazar**.
  - Tarjeta **pendiente**: borde y franja de error, texto "Requerido", badge "Pendiente" y
    botón **Subir**.
- **Columna derecha (1/3):** panel "Cargar Documento" con zona de **drag & drop**, botón
  "Explorar Archivos" y select **"Asignar a:"** con los tipos del catálogo más la opción
  **"Otro documento…"**, que al elegirse habilita un campo de texto para nombrar el documento.
- Formatos aceptados en la UI: **PDF, JPG, PNG**; tamaño máximo **5 MB**, validado en cliente antes
  de llamar a `/api/upload`. Los archivos van a la carpeta `clinica/empleados/documentos` de Cloudinary.
- **Un solo archivo activo por tipo de catálogo.** Reemplazar marca el registro anterior con
  `status = 0` (queda en BD, no se muestra) e inserta el nuevo. Los documentos "Otro" no tienen
  esa restricción: cada uno es un registro independiente.
- Estados de la pantalla: empleado sin ningún documento (las 8 tarjetas en "Pendiente", contador
  `0/8`), subida en curso (botón deshabilitado + indicador de progreso), y error de subida
  (mensaje inline, sin insertar en BD).

**No incluye (para specs futuras):**

- **Eliminar documentos** desde la UI (solo ver, descargar y reemplazar).
- **Historial de versiones** navegable: el archivo reemplazado queda con `status = 0` en BD pero
  no hay pantalla para consultarlo.
- **Fechas de vencimiento / vigencia** de documentos y avisos de caducidad.
- Marcar documentos como **validados/rechazados** por RH (flujo de revisión y aprobación).
- **CRUD del catálogo `RH.tipos_documento`** desde la UI: se siembra por SQL y se lee, no se administra.
- **Documentos obligatorios distintos por puesto o departamento**: los 8 aplican a todo empleado.
- Las otras cinco pestañas del expediente (Nómina, Asistencia, Agenda Laboral, Incidencias,
  Productividad, Inventario Asignado): no se dibujan ni deshabilitadas.
- Indicador de documentación pendiente en el **listado** de empleados o en las tarjetas resumen.
- Visor embebido de PDF/imagen dentro de la app: "Ver" abre la URL de Cloudinary en pestaña nueva.
- Subir **múltiples archivos a la vez** (drag & drop de un archivo por operación).

## Modelo de datos

### Tabla nueva: `[CentroPodologico].[RH].[tipos_documento]`

Catálogo sembrado a mano, mismo estilo que `RH.departamentos` / `RH.puestos` (PK sin `IDENTITY`).

```sql
USE [CentroPodologico]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [RH].[tipos_documento](
    [id_tipo_documento] [tinyint]      NOT NULL,
    [nombre]            [varchar](150) NOT NULL,
    [icono]             [varchar](50)  NULL,   -- nombre del icono de lucide-react
    [obligatorio]       [bit]          NOT NULL CONSTRAINT [DF_tipos_documento_obligatorio] DEFAULT (1),
    [orden]             [tinyint]      NOT NULL,
    [status]            [bit]          NOT NULL CONSTRAINT [DF_tipos_documento_status] DEFAULT (1),
 CONSTRAINT [PK_tipos_documento] PRIMARY KEY CLUSTERED ([id_tipo_documento] ASC)
) ON [PRIMARY]
GO

INSERT [RH].[tipos_documento] ([id_tipo_documento],[nombre],[icono],[obligatorio],[orden],[status]) VALUES
 (1, N'INE — frente y reverso',            N'BadgeCheck',      1, 1, 1),
 (2, N'Comprobante de domicilio',          N'Home',            1, 2, 1),
 (3, N'Constancia de situación fiscal',    N'ReceiptText',     1, 3, 1),
 (4, N'CURP',                              N'Fingerprint',     1, 4, 1),
 (5, N'Hoja de Seguro Social',             N'HeartPulse',      1, 5, 1),
 (6, N'Contrato firmado',                  N'FileSignature',   1, 6, 1),
 (7, N'Firma de recibido del equipo',      N'PackageCheck',    1, 7, 1),
 (8, N'Firma de recibido del instrumental',N'Stethoscope',     1, 8, 1)
GO
```

### Tabla nueva: `[CentroPodologico].[RH].[empleado_documentos]`

Un registro por archivo subido. El reemplazo no borra: marca el anterior con `status = 0`.

```sql
CREATE TABLE [RH].[empleado_documentos](
    [id_empleado_documento] [int] IDENTITY(1,1) NOT NULL,
    [id_empleado]           [int]           NOT NULL,
    [id_tipo_documento]     [tinyint]       NULL,   -- NULL = documento libre ("Otro")
    [nombre_personalizado]  [varchar](150)  NULL,   -- requerido cuando id_tipo_documento es NULL
    [url]                   [varchar](500)  NOT NULL,
    [mime_type]             [varchar](100)  NULL,   -- 'application/pdf' | 'image/jpeg' | 'image/png'
    [size_bytes]            [int]           NULL,
    [id_usuario_carga]      [int]           NULL,   -- quién lo subió (dbo.usuarios)
    [status]                [bit]           NOT NULL CONSTRAINT [DF_empleado_documentos_status] DEFAULT (1),
    [created_at]            [datetime2](0)  NULL,
 CONSTRAINT [PK_empleado_documentos] PRIMARY KEY CLUSTERED ([id_empleado_documento] ASC),
 CONSTRAINT [FK_empleado_documentos_empleado] FOREIGN KEY ([id_empleado])
     REFERENCES [RH].[empleados] ([id_empleado]),
 CONSTRAINT [FK_empleado_documentos_tipo] FOREIGN KEY ([id_tipo_documento])
     REFERENCES [RH].[tipos_documento] ([id_tipo_documento])
) ON [PRIMARY]
GO
CREATE INDEX [IX_empleado_documentos_empleado]
    ON [RH].[empleado_documentos] ([id_empleado], [status]) INCLUDE ([id_tipo_documento])
GO
```

No hay `UNIQUE` sobre `(id_empleado, id_tipo_documento)`: la regla "un archivo activo por tipo"
la garantiza el server action (`UPDATE … SET status = 0` antes del `INSERT`), porque `status = 0`
debe poder repetirse.

### Interfaces — `interfaces/employee_document.ts` (archivo nuevo)

```ts
/** Fila del catálogo RH.tipos_documento. */
export interface IDocumentType {
  id_tipo_documento: number;
  nombre:            string;
  icono:             string | null;
  obligatorio:       boolean;
  orden:             number;
}

/** Archivo activo ya cargado (status = 1). */
export interface IEmployeeDocument {
  id_empleado_documento: number;
  id_empleado:           number;
  id_tipo_documento:     number | null;
  nombre_personalizado:  string | null;
  url:                   string;
  mime_type:             string | null;
  size_bytes:            number | null;
  nombre_usuario_carga:  string | null;   // resuelto con JOIN a dbo.usuarios
  created_at:            string;          // CONVERT(varchar(19), …, 120)
}

/** Lo que la pantalla renderiza: catálogo + su documento, si existe. */
export interface IEmployeeDocumentSlot {
  tipo:      IDocumentType | null;        // null en documentos libres
  documento: IEmployeeDocument | null;    // null en tipos pendientes
}

/** Entrada del server action que registra un archivo ya subido a Cloudinary. */
export interface EmployeeDocumentInput {
  id_empleado:          number;
  id_tipo_documento:    number | null;
  nombre_personalizado: string | null;
  url:                  string;
  mime_type:            string;
  size_bytes:           number;
}
```

`created_at` se escribe con `buildDate(new Date())` y se lee con
`CONVERT(varchar(19), [created_at], 120)`, según las reglas de fecha del CLAUDE.md.

## Plan de implementación

### 1. Base de datos

Ejecutar manualmente contra `CentroPodologico` el `CREATE TABLE [RH].[tipos_documento]` con sus
8 `INSERT`, y el `CREATE TABLE [RH].[empleado_documentos]` con su índice. Agregar el mismo DDL a
`queries.txt`, después del bloque de `RH.empleados`, bajo el separador
`-------------------- DOCUMENTOS DEL EMPLEADO ---------------------`.

*Verificación:* `SELECT * FROM [RH].[tipos_documento] ORDER BY [orden]` devuelve las 8 filas y
`SELECT TOP 1 * FROM [RH].[empleado_documentos]` responde sin error.

### 2. Interfaces

Crear `interfaces/employee_document.ts` con `IDocumentType`, `IEmployeeDocument`,
`IEmployeeDocumentSlot` y `EmployeeDocumentInput`.

*Verificación:* `npm run build` compila; la app sigue igual (solo tipos nuevos).

### 3. Server actions — `app/dashboard/empleados/[id]/documentos/actions.ts` (archivo nuevo)

Archivo `"use server"` que replica el helper `getActiveUser()` ya usado en
`app/dashboard/empleados/actions.ts` (cookie `auth_token` + `jose`).

- `getEmployeeDocuments(id_empleado)` → `{ slots: IEmployeeDocumentSlot[]; completados: number; total: number }`.
  Verifica primero que el empleado pertenece al `id_empresa` y a alguna sucursal del usuario
  (mismo criterio que `getEmployeeById`); si no, devuelve vacío. Lee el catálogo ordenado por
  `orden` y los documentos con `status = 1`, con `JOIN` a `dbo.usuarios` para
  `nombre_usuario_carga` y `CONVERT(varchar(19), [created_at], 120)`. Arma los slots: primero los
  8 del catálogo (con su documento o `null`), luego un slot por cada documento libre.
  `completados` cuenta solo tipos obligatorios con documento; `total` es el número de obligatorios.
- `saveEmployeeDocument(input: EmployeeDocumentInput)` → `ActionResult<number>`.
  Valida pertenencia del empleado, que `mime_type` esté en `{application/pdf, image/jpeg, image/png}`,
  que `size_bytes <= 5 * 1024 * 1024`, y que venga `nombre_personalizado` cuando
  `id_tipo_documento` es `null`. Si `id_tipo_documento` no es `null`, ejecuta primero
  `UPDATE [RH].[empleado_documentos] SET [status] = 0 WHERE [id_empleado] = @id AND [id_tipo_documento] = @tipo AND [status] = 1`
  y luego el `INSERT` con `created_at = buildDate(new Date())` e `id_usuario_carga` del JWT.
  Todo con `queryParams`. Cierra con `revalidatePath("/dashboard/empleados/[id]/documentos")`.

*Verificación:* llamar `getEmployeeDocuments` sobre un empleado sin documentos devuelve 8 slots
vacíos y `completados = 0`; tras un `saveEmployeeDocument` el slot correspondiente trae el archivo
y `completados = 1`. Un segundo guardado del mismo tipo deja **un solo** registro con `status = 1`.

### 4. Layout compartido del expediente — `app/dashboard/empleados/[id]/layout.tsx` (archivo nuevo)

Server Component que asume lo que hoy hace `page.tsx` alrededor del contenido: el link "← Empleados",
el título, la carga de `getEmployeeById` + `getEmployeeCatalogs`, el `notFound()` y el
`<EmployeeHeader>`; debajo renderiza la nueva barra de pestañas y `{children}`.
`app/dashboard/empleados/[id]/page.tsx` queda reducido a cargar el empleado y renderizar
`<EmployeeGeneralInfo>`.

Nuevo componente `app/dashboard/empleados/[id]/componentes/EmployeeTabs.tsx` (Client Component
mínimo, solo por `usePathname()` para marcar la pestaña activa): dos `<Link>`, "Datos Personales"
→ `/dashboard/empleados/${id}` y "Documentación" → `/dashboard/empleados/${id}/documentos`,
con el subrayado azul del activo según el mockup.

*Verificación:* `/dashboard/empleados/[id]` se ve igual que antes más la barra de pestañas, con
"Datos Personales" marcada; el header no parpadea ni se duplica al cambiar de pestaña.

### 5. Pantalla de documentos — `app/dashboard/empleados/[id]/documentos/page.tsx` (archivo nuevo)

Server Component: llama `getEmployeeDocuments(id)` y renderiza la rejilla de dos columnas
(`lg:grid-cols-3`) con el encabezado "Documentos Requeridos", el badge `N/8 Completados`,
`<EmployeeDocumentCard>` por cada slot y `<EmployeeDocumentUploader>` en la columna derecha.

Componentes nuevos en `app/dashboard/empleados/[id]/documentos/componentes/`:

- **`EmployeeDocumentCard.tsx`** — Server Component. Estado cargado: icono de `lucide-react`
  resuelto desde `tipo.icono` con un mapa local (fallback `FileText`), nombre, `PDF • 1.2 MB`
  formateado por un helper `formatFileSize(bytes)`, fecha de carga y usuario, badge "Cargado", y
  acciones **Ver** / **Descargar** (`<a target="_blank" rel="noopener noreferrer">`, la de descarga
  con el parámetro `fl_attachment` de Cloudinary) más **Reemplazar**, que es el botón cliente del
  punto siguiente. Estado pendiente: franja de error, "Requerido", badge "Pendiente" y botón **Subir**.
- **`EmployeeDocumentUploader.tsx`** — Client Component, el único con `"use client"`. Concentra
  toda la subida: zona drag & drop, `<input type="file" accept=".pdf,.jpg,.jpeg,.png">`, select
  "Asignar a:" (tipos + "Otro documento…", que revela el input de nombre), validación de formato y
  de 5 MB antes de subir, `POST` a
  `/api/upload?folder=clinica/empleados/documentos&name=…` (mismo patrón que `EmployeeModal.tsx`),
  y al recibir la URL llama `saveEmployeeDocument`. Muestra estado "Subiendo…" y errores inline.
  Expone además `EmployeeDocumentUploadButton`, el botón que las tarjetas usan para
  Subir/Reemplazar preseleccionando su tipo (comparten estado vía un contexto local del uploader
  o vía props desde `page.tsx`; se decide al implementar, sin duplicar la lógica de subida).

*Verificación:* subir un PDF de <5 MB desde el panel derecho asignado a "CURP" hace que la tarjeta
CURP pase a "Cargado" y el contador a `1/8` sin recargar manualmente. Un archivo `.docx` o de 8 MB
se rechaza en cliente con mensaje y **no** llega a `/api/upload`.

### 6. Verificación manual completa

- Empleado nuevo: 8 tarjetas "Pendiente", contador `0/8`, panel derecho operativo.
- Subir los 8 obligatorios: contador `8/8`, todas las tarjetas en verde.
- Reemplazar uno: la tarjeta muestra el archivo nuevo con su nueva fecha y usuario; en BD hay dos
  filas para ese tipo, una con `status = 0` y una con `status = 1`.
- Documento "Otro" con nombre libre: aparece como tarjeta extra al final; el contador **no** cambia.
- "Ver" abre el archivo en pestaña nueva; "Descargar" baja el archivo con su nombre.
- Rol 1 y rol 4 ven y pueden subir; roles 2, 3 y 5 son redirigidos por `proxy.ts` al entrar a
  `/dashboard/empleados/[id]/documentos`.
- Modo oscuro: tarjetas, badges y zona de drag & drop legibles (el mockup solo trae modo claro).

## Criterios de aceptación

- [x] Existen en BD `[RH].[tipos_documento]` (con las 8 filas sembradas y `orden` 1–8) y
      `[RH].[empleado_documentos]` con sus dos FK y su índice.
- [x] El DDL de ambas tablas y los `INSERT` del catálogo están en `queries.txt`.
- [x] `/dashboard/empleados/[id]` muestra la barra de pestañas con exactamente dos pestañas
      ("Datos Personales" y "Documentación") y "Datos Personales" marcada como activa.
- [x] La cabecera del empleado (`EmployeeHeader`) se ve idéntica en ambas pestañas y se renderiza
      desde `layout.tsx`, no duplicada en cada `page.tsx`.
- [x] `/dashboard/empleados/[id]/documentos` renderiza 8 tarjetas (una por tipo obligatorio) más
      una tarjeta por cada documento libre ya subido.
- [x] Una tarjeta sin archivo muestra "Requerido", badge "Pendiente" y botón "Subir";
      con archivo muestra badge "Cargado", `TIPO • X.X MB`, fecha de carga, usuario que lo subió,
      y los botones Ver, Descargar y Reemplazar.
- [x] El badge contador muestra `N/8 Completados`, donde `N` es el número de tipos obligatorios con
      documento activo, y **no** aumenta al subir documentos "Otro".
- [x] Subir un archivo desde el panel derecho asignado a un tipo del catálogo lo refleja en la
      tarjeta de ese tipo sin recarga manual del navegador.
- [x] Elegir "Otro documento…" en el select obliga a escribir un nombre; sin nombre no se sube.
- [x] Un archivo con extensión distinta de PDF/JPG/PNG es rechazado en cliente con mensaje visible
      y no se hace la petición a `/api/upload`.
- [x] Un archivo mayor a 5 MB es rechazado en cliente con mensaje visible y no se sube.
- [x] Reemplazar un documento deja en BD exactamente una fila con `status = 1` para ese
      `(id_empleado, id_tipo_documento)`, y la anterior con `status = 0`.
- [x] "Ver" abre la URL de Cloudinary en pestaña nueva con `rel="noopener noreferrer"`;
      "Descargar" descarga el archivo.
- [x] `getEmployeeDocuments` y `saveEmployeeDocument` usan `queryParams` en todas las consultas y
      validan que el empleado pertenezca al `id_empresa` y a una sucursal del usuario autenticado.
- [x] `created_at` se escribe con `buildDate(new Date())` y se lee con
      `CONVERT(varchar(19), [created_at], 120)`; en la UI la fecha se muestra sin desfase de día.
- [x] Un usuario con `id_role` 2, 3 o 5 que navega a `/dashboard/empleados/[id]/documentos` es
      redirigido por `proxy.ts`.
- [x] `"use client"` aparece únicamente en `EmployeeTabs.tsx` y en el uploader; las tarjetas y las
      páginas son Server Components.
- [x] `npm run build` compila sin errores ni warnings nuevos.
- [x] La pantalla es legible en modo oscuro y la rejilla colapsa a una columna en móvil.

## Decisiones tomadas y descartadas

- **Catálogo en BD (`RH.tipos_documento`) en vez de lista hardcodeada.** La lista de documentos
  obligatorios de RH crece (firmas de recibido, futuros formatos internos) y con tabla se agrega
  con un `INSERT`, sin tocar código ni desplegar. Descartado: constante en TypeScript.

- **Reemplazo por baja lógica (`status = 0`), no sobrescritura ni versionado navegable.**
  Sobrescribir la fila perdería el rastro de qué había antes; un historial completo exigiría UI de
  versiones que no está pedida. La baja lógica deja la evidencia en BD y permite construir el
  historial después sin migrar datos.

- **Documentos libres con `id_tipo_documento NULL` + `nombre_personalizado`.** Alternativa
  descartada: crear un tipo de catálogo "Otro" y meterle todos los documentos libres — rompería la
  regla "un archivo activo por tipo" y ensuciaría el conteo de obligatorios.

- **Regla "un archivo activo por tipo" en el server action, no con `UNIQUE` en la tabla.**
  Un índice único sobre `(id_empleado, id_tipo_documento)` impediría conservar las filas históricas
  con `status = 0`. Un índice filtrado `WHERE status = 1` era viable pero añade una restricción que
  hay que recordar al insertar; se prefirió concentrar la regla en un solo lugar del código.

- **Ruta propia `/documentos` en vez de `?tab=` o estado de cliente.** Mantiene cada pestaña como
  Server Component cargando solo sus datos, hace el enlace compartible y evita traer documentos al
  abrir "Datos Personales". Descartado: query param (mismo componente, datos mezclados) y estado
  de cliente (obligaría a volver client toda la página).

- **Header y pestañas en `layout.tsx`.** Evita duplicar la carga de `getEmployeeById` en cada
  pestaña y hace que la cabecera no se re-renderice al navegar entre ellas. Descartado: repetir
  `<EmployeeHeader>` en cada `page.tsx`.

- **Solo dos pestañas reales, sin placeholders deshabilitados.** Cinco pestañas grises prometen
  pantallas que no existen; se agregan cuando cada una tenga su spec. Consistente con la decisión
  del spec 25 de no dibujar la barra hasta tener una segunda pestaña.

- **Reutilizar `/api/upload` (Cloudinary) en vez de crear un endpoint nuevo.** Ya valida por
  *magic bytes*, ya acepta PDF/JPG/PNG y es el patrón de todo el repo (facturas, recetas, egresos).
  La restricción a esos tres formatos y a 5 MB se aplica en la UI, sin tocar el endpoint compartido.

- **Iconos como nombre de `lucide-react`, no de Material Symbols.** El mockup usa Material Symbols,
  que el proyecto no carga; se guarda el nombre lucide en `tipos_documento.icono` y se resuelve con
  un mapa local con fallback `FileText`, para que un icono mal escrito en el catálogo no rompa la
  pantalla.

- **"Ver" abre pestaña nueva, sin visor embebido.** Es lo que ya hace el repo con facturas y recetas
  y evita los problemas de `<iframe>` con PDF en móvil. Descartado: modal con visor.

- **Sin eliminar documentos en esta iteración.** El mockup no lo contempla y en documentación
  laboral el borrado tiene implicaciones (evidencia de contrato firmado); si se agrega, debería ser
  baja lógica con permiso explícito, tema de otro spec.

- **`id_usuario_carga` apunta a `dbo.usuarios`, no a `RH.empleados`.** Quien sube es el usuario del
  sistema autenticado (RH/admin), que no necesariamente tiene ficha de empleado. El vínculo
  empleado ↔ usuario sigue fuera de alcance desde el spec 25.

- **Sin vencimientos ni flujo de validación/rechazo.** Confirmado con el usuario: el documento solo
  tiene dos estados, "cargado" o "pendiente". Agregar vigencias implicaría alertas y un tablero de
  caducidades que merece su propio spec.

## Riesgos identificados

- **Documentos personales en una URL pública de Cloudinary.** Esto es lo más delicado del spec:
  INE, CURP y NSS quedan accesibles para cualquiera que tenga el enlace, sin pasar por la sesión
  de la app — igual que hoy pasa con recetas y facturas, pero aquí el contenido es identificación
  personal de empleados. *Mitigación mínima en este spec:* subir a una carpeta propia
  (`clinica/empleados/documentos`) con nombre de archivo no adivinable. *Pendiente para otro spec:*
  entrega firmada/privada de Cloudinary (`type: authenticated` + URLs con expiración) o proxy de
  descarga que valide sesión. Vale la pena decidir esto antes de cargar documentos reales de
  producción.

- **`revalidatePath` con ruta dinámica.** Si `revalidatePath("/dashboard/empleados/[id]/documentos")`
  no refresca como se espera, la tarjeta puede no actualizarse tras subir. Alternativa a aplicar en
  ese caso: `revalidatePath` con la ruta concreta ya interpolada, o `router.refresh()` desde el
  uploader tras un `ActionResult` exitoso.

- **Subida en dos pasos sin transacción.** Si `/api/upload` tiene éxito pero `saveEmployeeDocument`
  falla, el archivo queda huérfano en Cloudinary y no aparece en la app. Es el mismo comportamiento
  que ya tienen facturas y recetas en el repo; se asume, mostrando error claro para que el usuario
  reintente.

- **Empleados que ya existen sin documentación.** Todo empleado dado de alta bajo el spec 25 abrirá
  la pestaña en `0/8`. Es correcto, pero conviene avisarlo a RH para que no se lea como pérdida de
  datos.

- **Catálogo editable solo por SQL.** Si RH necesita un noveno documento obligatorio, depende de
  alguien con acceso a la BD. Aceptado a cambio de no construir un CRUD de catálogo ahora; si la
  petición se repite, es señal de que toca su spec.
