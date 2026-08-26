# 28 — Facturación electrónica: cimientos y seguridad

## Header

- **Estado:** Aprobado
- **Depende de:** `app/actions/auth.ts` (`getMeAction`, `ActionResult<T>`, `IAuthUser`),
  `database/connection.ts` (`queryParams`, `transaction`), `proxy.ts` (guarda de rol, patrón de
  `/dashboard/usuarios` y `/dashboard/empleados`), `app/dashboard/componentes/navConfig.tsx`,
  `ConfirmModal.tsx`, `app/api/upload/route.ts` (validación de archivo por magic bytes),
  `utils/date_helpper.ts` (`buildDate`). Porta el proyecto independiente
  `D:\projects\2026\factura` (Next 16 + Facturapi + Drizzle/MySQL), que se descontinúa como app separada.
- **Fecha:** 2026-08-26
- **Objetivo:** Sentar la base del módulo de facturación electrónica en el dashboard: esquema `BILLING`,
  bitácora de operaciones fiscales, cifrado en reposo de las API keys de Facturapi, sesión y guarda de rol
  compartidas, validación de entrada con `zod`, cliente único de Facturapi, y la primera pantalla útil
  (listado de organizaciones + pestaña **General** del detalle). El modo Live **no se habilita en este
  spec**: todo opera contra el entorno de pruebas de Facturapi.

## Alcance

**Incluye:**

### Base de datos

- Nuevo esquema **`BILLING`**, siguiendo el precedente de `RH` e `inventory`: la facturación electrónica
  queda agrupada y separada de `dbo`, que se reserva al núcleo clínico. Es además el dominio que más
  tablas puede sumar después (complementos de pago, notas de crédito, series de folios), y `organizations`
  es un nombre lo bastante genérico como para chocar en `dbo`.
- Nueva tabla **`[CentroPodologico].[BILLING].[organizations]`**: sidecar local de Facturapi. Guarda solo
  lo que la API no permite resolver localmente — el `uid` de la organización en Facturapi, sus API keys
  **cifradas**, el flag de modo `is_live`, y una copia de los datos legales/dirección para listar sin
  pegarle a la API. `id_empresa` es `NOT NULL`: es la llave del tenant.
- Nueva tabla **`[CentroPodologico].[BILLING].[audit_log]`**: bitácora append-only de las operaciones con
  efecto fiscal o sobre credenciales (quién, cuándo, sobre qué organización, en qué modo).
- DDL documentado en `queries.txt` bajo un nuevo bloque
  `-------------------- FACTURACION (FACTURAPI) ---------------------`.

### Infraestructura compartida

- `lib/auth/session.ts`: `requireActiveUser()`, `requireRole(allowed)` y `requireBillingAccess()`.
  Primer helper de sesión compartido del repo; hoy existen **19 copias privadas** de `getActiveUser()`,
  cada una con su propio `new TextEncoder().encode(process.env.JWT_SECRET_SEED!)`.
- `lib/billing/crypto.ts`: cifrado autenticado AES-256-GCM de las API keys, con el módulo `crypto` de Node.
- `lib/billing/schemas.ts`: schemas `zod` de toda entrada del módulo (alta y edición de organización,
  subida de CSD). Se agrega `zod` a `package.json`.
- `lib/billing/errors.ts`: `toUserMessage(err)` — traduce el error de Facturapi a un mensaje seguro en
  español y registra el error completo del lado del servidor.
- `lib/billing/facturapiClient.ts`: `getRootClient()` (clave de plataforma, perezoso) y
  `getOrgClient(uid, idEmpresa)`, que resuelve el modo internamente. Unifica las 4 implementaciones
  duplicadas de `getOrgClient` y los 8 `new Facturapi(...)` sueltos del proyecto original.
- `lib/billing/organizationsRepository.ts`: el 100% del SQL del módulo.
- `interfaces/organization.ts`: `IOrganizationRecord` y tipos derivados.

### Sección Facturación (`/dashboard/facturacion`)

- **Listado de organizaciones** de la empresa del usuario, con alta de organización nueva.
- **Detalle de organización** (`/dashboard/facturacion/[id]`) con barra de pestañas horizontal. En este
  spec solo la pestaña **General** está habilitada; las demás se agregan en los specs 29-31.
- **General**: datos fiscales (ver y editar), certificado CSD (subir/eliminar), API keys (estado y
  prefijo `first_12`, renovar test, renovar/revocar live), eliminar organización.

### Control de acceso y tenant

- Guarda en `proxy.ts`: `/dashboard/facturacion` solo para `id_role` 1 y 4 (mismo criterio que
  `/dashboard/usuarios` y `/dashboard/empleados`).
- Entrada en `NAV_LINKS` con `excludeRoles: [2, 3, 5]`, coherente con la guarda anterior.
- Toda server action del módulo abre con `requireBillingAccess()` y propaga el `id_empresa` del JWT; el
  `id_empresa` **nunca** llega desde el cliente. Toda lectura y escritura de `organizations` va filtrada
  por ese `id_empresa`.

### Documentación

- `docs/facturacion.md` con los detalles largos del módulo, referenciado desde `CLAUDE.md` en la lista de
  "Domain modules with detailed docs".

**No incluye (para specs futuras):**

- **Clientes, productos, facturas y personalización.** Specs 29, 30 y 31. En este spec las pestañas
  correspondientes aparecen deshabilitadas o no aparecen.
- **Modo Live.** La columna `is_live` existe y se lee, pero se queda en `0`: no hay UI para cambiarla y
  `getOrgClient` solo puede devolver un cliente de pruebas. El modo Live se habilita en el spec 30, junto
  con las facturas — que es lo único que lo hace consecuente.
- **Pantalla de bitácora.** `BILLING.audit_log` se escribe pero no se lee desde ninguna UI todavía.
- **Refactor de los 19 `getActiveUser()` duplicados.** `lib/auth/session.ts` nace para el módulo nuevo;
  migrar los existentes es un spec de limpieza aparte.
- **Filtro por sucursal.** Las organizaciones son entidades fiscales a nivel empresa; se filtran solo por
  `id_empresa`, a diferencia del resto del sistema.
- **Facturar automáticamente desde ventas/consultas.** Este spec entrega infraestructura administrativa;
  el enlace entre `[ventas]`/`[consultas]` y la generación del CFDI queda pendiente.
- **CRUD de empresas.** Sigue sin existir (`registerAction` hardcodea `id_empresa: 1`).
- **Complementos de pago, notas de crédito y carta porte.**
- **Paginación real.** Se listan con `limit: 50` como en el proyecto original.
- **Persistencia local de clientes/productos/facturas.** Facturapi sigue siendo el sistema de registro.
- **Rotación automatizada de `BILLING_ENCRYPTION_KEY`.** El formato de cifrado lleva prefijo de versión
  (`v1:`) para permitirla después, pero no se implementa el re-cifrado masivo.

## Modelo de datos

### Esquema y tablas nuevos

```sql
USE [CentroPodologico]
GO
CREATE SCHEMA BILLING
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [BILLING].[organizations](
    [id]            [int] IDENTITY(1,1) NOT NULL,
    [uid]           [nvarchar](255) NOT NULL,   -- id de la organización en Facturapi
    [id_empresa]    [int]           NOT NULL,
    [test_key]      [nvarchar](max) NULL,       -- cifrada: v1:<iv>:<tag>:<cipher>
    [live_key]      [nvarchar](max) NULL,       -- cifrada: v1:<iv>:<tag>:<cipher>
    [is_live]       [bit]           NOT NULL CONSTRAINT [DF_organizations_is_live] DEFAULT (0),
    [name]          [nvarchar](255) NULL,
    [legal_name]    [nvarchar](255) NULL,
    [tax_id]        [nvarchar](20)  NULL,
    [tax_system]    [nvarchar](10)  NULL,
    [phone]         [nvarchar](50)  NULL,
    [website]       [nvarchar](255) NULL,
    [support_email] [nvarchar](255) NULL,
    [street]        [nvarchar](255) NULL,
    [exterior]      [nvarchar](50)  NULL,
    [interior]      [nvarchar](50)  NULL,
    [neighborhood]  [nvarchar](255) NULL,
    [zip]           [nvarchar](10)  NULL,
    [city]          [nvarchar](255) NULL,
    [municipality]  [nvarchar](255) NULL,
    [state]         [nvarchar](255) NULL,
    [country]       [nvarchar](10)  NULL,
    [created_at]    [datetime2](0)  NULL,
    [updated_at]    [datetime2](0)  NULL,
 CONSTRAINT [PK_organizations] PRIMARY KEY CLUSTERED ([id] ASC),
 CONSTRAINT [UQ_organizations_uid] UNIQUE ([uid])
) ON [PRIMARY]
GO
CREATE INDEX [IX_organizations_empresa]
    ON [BILLING].[organizations] ([id_empresa])
GO

CREATE TABLE [BILLING].[audit_log](
    [id]         [int] IDENTITY(1,1) NOT NULL,
    [id_empresa] [int]           NOT NULL,
    [id_user]    [int]           NOT NULL,
    [action]     [nvarchar](60)  NOT NULL,   -- ver catálogo abajo
    [org_uid]    [nvarchar](255) NULL,
    [target_id]  [nvarchar](255) NULL,       -- id de factura / id de api key / etc.
    [mode]       [nvarchar](10)  NULL,       -- 'test' | 'live' | NULL
    [detail]     [nvarchar](max) NULL,       -- NUNCA claves ni la contraseña del CSD
    [created_at] [datetime2](0)  NOT NULL,
 CONSTRAINT [PK_billing_audit_log] PRIMARY KEY CLUSTERED ([id] ASC)
) ON [PRIMARY]
GO
CREATE INDEX [IX_billing_audit_empresa_fecha]
    ON [BILLING].[audit_log] ([id_empresa] ASC, [created_at] DESC)
GO
```

Catálogo de valores de `action` (se amplía en los specs 29-31):
`org.create`, `org.update_legal`, `org.delete`, `cert.upload`, `cert.delete`, `key.renew_test`,
`key.renew_live`, `key.revoke_live`.

Diferencias respecto al DDL MySQL original (`factura/drizzle/0000_first_meteorite.sql`) y su razón:

- **`IDENTITY(1,1)` en vez de `MAX(id)+1`.** El repo genera IDs con
  `(SELECT ISNULL(MAX([id]),0)+1 FROM ...)` en ~15 sitios, patrón con carrera bajo concurrencia. Son tablas
  nuevas sin nada que dependa del patrón viejo; los `INSERT` recuperan la fila con `OUTPUT INSERTED.*`.
- **`id_empresa` `NOT NULL`**: en el original era una columna declarada pero jamás leída ni escrita; aquí
  es la llave del tenant, alineada con el `IAuthUser.id_empresa` que ya viaja en el JWT.
- **API keys cifradas**: el original las guarda en `text` plano.
- **Sin `ON UPDATE CURRENT_TIMESTAMP`** (no existe en SQL Server): `updated_at` se setea explícitamente en
  cada `UPDATE` con `buildDate(new Date())`.
- **Fechas como string end-to-end**: se escriben con `buildDate()` y se leen con
  `CONVERT(varchar(19), [col], 120)`, según la regla de `CLAUDE.md`.

### Interfaces — `interfaces/organization.ts` (archivo nuevo)

```ts
/** Fila de BILLING.organizations tal como la devuelve el repositorio. */
export interface IOrganizationRecord {
  id:            number;
  uid:           string;
  id_empresa:    number;
  is_live:       boolean;
  name:          string | null;
  legal_name:    string | null;
  tax_id:        string | null;
  tax_system:    string | null;
  phone:         string | null;
  website:       string | null;
  support_email: string | null;
  street:        string | null;
  exterior:      string | null;
  interior:      string | null;
  neighborhood:  string | null;
  zip:           string | null;
  city:          string | null;
  municipality:  string | null;
  state:         string | null;
  country:       string | null;
  created_at:    string | null;   // "YYYY-MM-DD HH:mm:ss"
  updated_at:    string | null;   // "YYYY-MM-DD HH:mm:ss"
}

/**
 * `IOrganizationRecord` NO expone `test_key` ni `live_key`: las claves descifradas solo circulan
 * dentro de `lib/billing/`, y este tipo es el que cruza hacia páginas y componentes.
 */
export interface IOrganizationSecrets {
  hasTestKey: boolean;
  hasLiveKey: boolean;
}

/** Datos legales + dirección que se copian localmente y se mandan a Facturapi. */
export type OrganizationLegalInput = Pick<
  IOrganizationRecord,
  | "name" | "legal_name" | "tax_id" | "tax_system" | "phone" | "website" | "support_email"
  | "street" | "exterior" | "interior" | "neighborhood" | "zip" | "city"
  | "municipality" | "state" | "country"
>;

/** Modo de operación de una organización: sandbox o producción. */
export type FacturapiMode = "test" | "live";
```

Los tipos `OrganizationRecord`/`NewOrganizationRecord` inferidos por Drizzle en el proyecto original
desaparecen.

### Repositorio — `lib/billing/organizationsRepository.ts` (archivo nuevo)

Toda la superficie SQL del módulo. Las 8 lecturas `SELECT ... WHERE uid = ?` dispersas del proyecto
original colapsan en una sola función, y todas reciben `id_empresa`:

| Función | Reemplaza en el proyecto original a |
|---|---|
| `getOrganizationByUid(uid, idEmpresa)` | los 8 `db.select()…where(eq(organizations.uid, …)).limit(1)` |
| `getOrganizationKey(uid, idEmpresa, mode)` | *(nuevo — única salida de una clave descifrada)* |
| `listOrganizationUids(idEmpresa)` | *(nuevo — filtro por tenant)* |
| `insertOrganization(record)` | `app/actions/organizations.ts:54-72` |
| `updateOrganizationLegal(uid, idEmpresa, data)` | `organizations.ts:125-145` |
| `setTestKey(uid, idEmpresa, key)` | `organizations.ts:208-211` |
| `setLiveKey(uid, idEmpresa, key \| null)` | `organizations.ts:224-228` y `244-247` |
| `setLiveMode(uid, idEmpresa, isLive)` | `organizations.ts:312` |
| `deleteOrganizationByUid(uid, idEmpresa)` | *(nuevo — corrige fila huérfana, ver Decisiones)* |
| `writeAuditEntry(entry)` | *(nuevo)* |

Notas de implementación:

- `setTestKey` / `setLiveKey` cifran con `encryptSecret` **antes** de escribir; `getOrganizationKey`
  descifra al leer. Ninguna otra función devuelve material de clave: `getOrganizationByUid` proyecta
  `CASE WHEN [test_key] IS NULL THEN 0 ELSE 1 END AS has_test_key` en vez de la columna.
- `is_live` es `BIT`; `bindParams` mapea `boolean → sql.Bit` al escribir, y al leer hay que normalizar con
  `Boolean(row.is_live)`.
- `writeAuditEntry` se llama desde las funciones que mutan, dentro de la misma `db.transaction()` cuando
  la operación toca dos tablas. `database/connection.ts` ya expone `transaction<T>(work)` con
  `ITransactionClient`.
- El `upsert` del proyecto original (`migrate-orgs`) desaparece junto con esa ruta (ver paso 9).

## Plan de implementación

### 1. Dependencias y variables de entorno

Agregar a `package.json`: `facturapi` `^4.16.0`, `server-only` `^0.0.1` y `zod` `^4`. **No** se agregan
`drizzle-orm`, `drizzle-kit`, `mysql2`, `@base-ui/react`, `class-variance-authority`, `clsx`,
`tailwind-merge`, `tw-animate-css` ni `shadcn` — la capa de datos y la de UI se reescriben con lo que ya
hay en el repo.

Agregar a `.env.local` (no versionado):

- `FACTURAPI_USER_KEY` — clave de plataforma de Facturapi.
- `BILLING_ENCRYPTION_KEY` — 32 bytes aleatorios en base64
  (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).

No se usa `DATABASE_URL`: la conexión sale de `DB_HOST`/`DB_NAME`/`DB_USERNAME`/`DB_PASSWORD`.
`MIGRATE_SECRET` del proyecto original **no** se porta (ver paso 9).

En `next.config.ts` (hoy con solo dos claves) fijar
`experimental: { serverActions: { bodySizeLimit: "2mb" } }`, para acotar explícitamente la subida del CSD
y del logo en vez de depender del default implícito.

*Verificación:* `npm install` sin conflictos de peers; `npm run build` sigue compilando antes de tocar código.

### 2. Base de datos

Ejecutar manualmente contra `CentroPodologico` el `CREATE SCHEMA BILLING`, ambos `CREATE TABLE` y sus
índices. Agregar el mismo DDL a `queries.txt` bajo el separador `FACTURACION (FACTURAPI)`.

*Verificación:* `SELECT TOP 1 * FROM [BILLING].[organizations]` responde sin error;
`sp_help '[BILLING].[organizations]'` muestra `UQ_organizations_uid`, el `IDENTITY` y el índice por
`id_empresa`.

### 3. Sesión compartida — `lib/auth/session.ts` (archivo nuevo)

```ts
export async function requireActiveUser(): Promise<IAuthUser>
export async function requireRole(allowed: number[]): Promise<IAuthUser>
export async function requireBillingAccess(): Promise<IAuthUser>   // requireRole([1, 4])
```

`requireActiveUser` envuelve `getMeAction()` de `app/actions/auth.ts` (que ya hace el `jwtVerify` sobre la
cookie `auth_token`) y lanza `Error("No autenticado")` si devuelve `null` o si `!user.status`.
`requireRole` lanza `Error("No tienes permisos para esta operación")`. Siguen la doctrina ya escrita en
`app/dashboard/conteos/actions.ts:56` (`assertSupervisorRole`): gatear en el server action **además** del
gate de rutas de `proxy.ts`, porque proteger solo en cliente deja el endpoint expuesto.

*Verificación:* `npm run build` compila; llamar una action del módulo sin cookie devuelve el error, no datos.

### 4. Cifrado — `lib/billing/crypto.ts` (archivo nuevo)

```ts
export function encryptSecret(plain: string): string   // "v1:<iv_b64>:<tag_b64>:<cipher_b64>"
export function decryptSecret(stored: string): string
```

AES-256-GCM con el módulo `crypto` de Node (sin dependencia nueva), IV aleatorio de 12 bytes por
operación, tag de autenticación de 16 bytes. La clave se lee de `BILLING_ENCRYPTION_KEY` de forma
**perezosa** (en la primera llamada, no en el import), igual que `getRootClient()`, para que una variable
faltante no tumbe el arranque de toda la app. `decryptSecret` valida el prefijo de versión y lanza un
error claro si el formato no coincide.

*Verificación:* script temporal que hace `decryptSecret(encryptSecret("abc")) === "abc"`; alterar un
carácter del ciphertext hace fallar el descifrado (el tag GCM detecta la manipulación).

### 5. Validación y errores

`lib/billing/schemas.ts` (archivo nuevo) — schemas `zod` de este spec:
`CreateOrganizationSchema`, `UpdateOrganizationLegalSchema`, `UploadCertificateSchema`. El último valida
`orgId`, `password` no vacía y los dos archivos: extensión, tamaño máximo y **tipo real por magic bytes**,
reusando el enfoque de `app/api/upload/route.ts` (el `accept` del `<input>` es solo cliente y se salta
trivialmente). Cada action abre con `safeParse` y devuelve `{ ok: false, message }` si falla; en el módulo
no puede quedar ni un cast `as string` / `as File` sobre `FormData`.

`lib/billing/errors.ts` (archivo nuevo) — `toUserMessage(err): string`. El original devuelve el
`err.message` crudo de Facturapi al cliente en ~20 sitios y no registra nada en el servidor; esos mensajes
cargan RFCs, seriales de certificado y detalles de folio, y con eso se puede sondear qué organizaciones
existen. Aquí se mapea a un mensaje seguro en español y se hace `console.error` del error completo.

*Verificación:* mandar un `.txt` renombrado a `.cer` es rechazado por el schema, no por Facturapi; un
error provocado en Facturapi aparece completo en la consola del servidor y resumido en pantalla.

### 6. Interfaces y repositorio

Crear `interfaces/organization.ts` y `lib/billing/organizationsRepository.ts` (con `import "server-only"`)
según el modelo de datos de arriba. Todas las consultas con `queryParams` y parámetros `@nombre`; los
`SELECT` castean fechas con `CONVERT(varchar(19), [col], 120)`; los `INSERT` usan `OUTPUT INSERTED.*` y
escriben `created_at`/`updated_at` con `buildDate(new Date())`.

*Verificación:* un `insertOrganization` de prueba desde un script temporal deja la fila con `created_at` en
hora local correcta (no corrida por UTC), `is_live = 0`, y `SELECT test_key` devuelve una cadena que
empieza con `v1:`, no una clave legible.

### 7. Cliente de Facturapi — `lib/billing/facturapiClient.ts` (archivo nuevo)

Con `import "server-only"`:

- `getRootClient()` — singleton **perezoso** con `FACTURAPI_USER_KEY`. El `lib/facturapi.ts` original hace
  `throw` en el import si falta la variable; portado tal cual rompería el arranque de toda la app para
  quien no la tenga configurada. Debe validar y construir en la primera llamada.
- `getOrgClient(uid, idEmpresa)` — **sin parámetro `mode`**. Resuelve la organización con
  `getOrganizationByUid` (lo que garantiza el chequeo de tenant en todos los call sites), lee `is_live` de
  la fila, obtiene la clave con `getOrganizationKey` y devuelve `new Facturapi(key)`. Si el modo resuelto
  es `live`, exige que existan `live_key` y certificado antes de construir el cliente. Conserva los
  mensajes en español del original (`"Clave Live no configurada para esta organización…"`, `"Clave Test no
  disponible para esta organización"`).

Que el modo se resuelva **dentro** de esta función es lo que hace imposible timbrar en producción por
accidente desde cualquier call site — ver spec 30.

*Verificación:* con `FACTURAPI_USER_KEY` sin definir, `npm run dev` levanta y el resto del dashboard
funciona; solo al entrar a `/dashboard/facturacion` aparece el error. `getOrgClient` con el `uid` de una
organización de otra empresa lanza error.

### 8. Server actions — `app/dashboard/facturacion/actions.ts` (archivo nuevo)

Porta `app/actions/organizations.ts` del proyecto original (318 líneas, 13 exports). Cambios obligatorios:

1. Eliminar todo import de `drizzle-orm`, `@/lib/db` y `@/lib/schema`; sustituir por el repositorio.
2. Cada función abre con `const { id_empresa, id_user } = await requireBillingAccess();` y propaga esos
   valores. El `id_empresa` nunca llega del cliente.
3. Cada función valida su entrada con el schema de `lib/billing/schemas.ts` antes de tocar Facturapi.
4. `listOrganizations()` cruza `getRootClient().organizations.list()` con `listOrganizationUids(id_empresa)`
   y devuelve solo las de la empresa del usuario. `createOrganization()` inserta con el `id_empresa` del JWT.
5. **Ninguna action devuelve `test_key` ni `live_key`.** `renewTestApiKey` y `renewLiveApiKey` persisten la
   clave cifrada y devuelven solo `{ first_12 }`; desaparece el `data: <clave en claro>` del original
   (`organizations.ts:203-235`). Desaparece también `getTestApiKey` como fuente de props de página.
6. `deleteLiveApiKey(orgId, keyId)` corrige el bug del original (`organizations.ts:237`): hoy solo pone
   `live_key = NULL` si `remaining.length === 0`, así que revocar una de varias claves deja guardada una
   clave muerta. La nueva versión limpia la columna siempre que la clave revocada sea la almacenada.
7. `deleteOrganization()` borra también la fila local con `deleteOrganizationByUid` (hoy la deja huérfana,
   con ambas keys, apuntando a una organización inexistente).
8. `setOrgMode` **no se porta en este spec** (llega en el 30, con confirmación y precondiciones).
9. Migrar el retorno `{ success: boolean; error?: string }` a `ActionResult<T>` (`{ ok: true; data }` /
   `{ ok: false; message }`), importado de `app/actions/auth.ts`. Los `catch` usan `toUserMessage`.
10. Actualizar los `revalidatePath("/organizations/…")` al prefijo `/dashboard/facturacion/…`.
11. Quitar el `console.log(result.data)` de `organizations.ts:12`, que filtra datos de organizaciones a los
    logs del servidor.
12. Registrar en `audit_log`: `org.create`, `org.update_legal`, `org.delete`, `cert.upload`, `cert.delete`,
    `key.renew_test`, `key.renew_live`, `key.revoke_live`.
13. Comentar explícitamente por qué **no** se filtra por `id_sucursal`, para que no se "corrija" después.

La contraseña del CSD se reenvía a Facturapi y se descarta: no se persiste, no se registra en `audit_log`,
no se loguea. (Es lo único que el proyecto original ya hacía bien.)

*Verificación:* con dos filas en `organizations` de empresas distintas, el listado devuelve solo la del
usuario; `grep -rn "live_key\|test_key" app/dashboard/facturacion/` no arroja resultados.

### 9. Backfill de organizaciones existentes (one-off, sin route handler)

El proyecto original expone `app/api/admin/migrate-orgs/route.ts`, protegido por un header
`X-Migrate-Secret`, que recorre todas las organizaciones de la cuenta Facturapi y las inserta en la BD.
**No se porta como ruta.** Es una operación de una sola vez; dejarla como endpoint permanente agrega
superficie de ataque para siempre y obliga a mantener otro secreto (`MIGRATE_SECRET`).

En su lugar: un script temporal ejecutado localmente que llama a `getRootClient().organizations.list()`,
pide `getTestApiKey` por organización, y llama a `insertOrganization` con el `id_empresa` pasado como
argumento. **Se borra al terminar** y no se versiona.

*Verificación:* tras correrlo, las organizaciones existentes aparecen en el listado con su `id_empresa`
correcto y su `test_key` cifrada; `app/api/facturacion/admin/` no existe.

### 10. Rutas, guarda de rol y navegación

Estructura de rutas creada en este spec bajo `app/dashboard/facturacion/`:

```
facturacion/
├── page.tsx                    ← app/organizations/page.tsx (sin <header> full-width)
├── actions.ts
├── componentes/                ← OrganizationsTable, OrganizationRow, CreateOrganizationModal
└── [id]/
    ├── layout.tsx              ← app/organizations/[id]/layout.tsx (sin <header> full-width)
    ├── page.tsx                ← redirect a ./general
    ├── componentes/            ← OrgTabs (ex OrgSidebar)
    └── general/                ← page.tsx + componentes de datos legales, CSD y API keys
```

- `proxy.ts` (modificado): agregar la guarda de `/dashboard/facturacion` para `id_role` 1 y 4, junto a las
  de `/dashboard/usuarios` y `/dashboard/empleados`. El `matcher` ya cubre `/dashboard/:path*`.
  **Nota importante para los specs 29 y 30:** el `matcher` **no** cubre `/api/*`, así que cualquier route
  handler del módulo se autentica por su cuenta con `requireBillingAccess()`.
- `navConfig.tsx` (modificado): agregar
  `{ href: "/dashboard/facturacion", label: "Facturación", icon: Receipt, minRole: 0, excludeRoles: [2, 3, 5] }`
  (icono de `lucide-react`, ya instalado). En `Sidebar.tsx:58`, `minRole: 0` significa "todos" y el gate
  real lo hace `excludeRoles`.

*Verificación:* con `id_role` 2, 3 o 5 la entrada no aparece en el sidebar y la URL directa redirige; con
1 o 4 entra normal.

### 11. UI — adaptación al sistema de diseño del repo

El proyecto original trae 9 primitivos `components/ui/*` sobre `@base-ui/react` +
`class-variance-authority`. **No se portan**, ni `lib/utils.ts` (`cn`), ni `app/globals.css`, ni
`app/layout.tsx` (fuentes Inter/JetBrains), ni `app/page.tsx`, ni `components.json`, ni
`postcss.config.mjs`, ni `drizzle/`, `drizzle.config.ts`, `lib/db.ts`, `lib/schema.ts`. Todo se reescribe
con Tailwind inline sobre los tokens de `references/DESIGN.md` y sus equivalentes `dark:` en la escala
`zinc`, como el resto del dashboard.

Sustituciones:

| Del módulo original | En este repo |
|---|---|
| `<Dialog>` | patrón del repo: `"use client"` + `createPortal`, `fixed inset-0 z-50 bg-black/50`, panel `rounded-xl bg-white dark:bg-zinc-900 shadow-xl` |
| `DeleteOrganizationModal`, `DeleteCertificateModal`, `RevokeLiveApiKeyModal` | **reusar `ConfirmModal.tsx`** (`{ message, onConfirm, onCancel, loading, error, confirmLabel }`) en vez de tres modales nuevos |
| `TestApiKeyCard` con `navigator.clipboard.writeText(currentKey)` | **se elimina la copia**: ya no hay clave que copiar en el cliente, solo `first_12` |
| `RenewTestApiKeyModal` / `RenewLiveApiKeyModal` que renderizan la clave | `ConfirmModal` + mensaje de éxito con `first_12`; la clave nunca llega al navegador |
| `<Table>` | `<table className="w-full text-left border-collapse">` con las clases del repo (`thead bg-[#eff4ff] dark:bg-zinc-800`, `tbody divide-y divide-[#c4c6d0]/50`) |
| `<Button>`, `<Input>`, `<Label>`, `<Select>`, `<Card>`, `<Badge>` | clases Tailwind inline al estilo de `EmployeesTable.tsx` / `EmployeeModal.tsx` |
| `OrgSidebar` (barra lateral vertical) | `OrgTabs`: tira de pestañas horizontal, copiando `app/dashboard/empleados/[id]/componentes/EmployeeTabs.tsx` (`usePathname()` + `next/link`, borde inferior activo) |
| `OrgMobileNav` | se elimina: el drawer móvil ya lo resuelve el `Sidebar` del repo |

El patrón de llamada a actions desde cliente es el dominante del repo (ver
`app/dashboard/empleados/[id]/componentes/EmployeeActions.tsx`): `useState` para `loading`/`error`,
`if (!result.ok) { setError(result.message); return; }`, luego `router.refresh()`.

Antes de escribir la UI, invocar la skill `frontend-design` (obligatorio por `CLAUDE.md`) y revisar
`references/DESIGN.md`.

*Verificación:* ningún archivo del módulo importa `@/components/ui/*` ni `cn`; la sección se ve consistente
con el resto del dashboard en claro y oscuro; `grep` de `class-variance-authority` y `@base-ui` no arroja
resultados.

### 12. Documentación

Crear `docs/facturacion.md`: ciclo de vida de las API keys, formato y rotación del cifrado, catálogo de
acciones de `audit_log`, contrato de `getOrgClient` y por qué el modo no es un parámetro, y la razón del
filtro por `id_empresa` sin `id_sucursal`. Agregar la línea correspondiente en `CLAUDE.md`, en la lista de
"Domain modules with detailed docs (loaded on demand)".

### 13. Verificación manual completa

Todo contra Facturapi en **modo Test** (no genera CFDI reales):

- Crear organización → verificar la fila en SQL Server: `id_empresa` correcto, `test_key` empieza con
  `v1:`, `created_at` en hora local correcta, `is_live = 0`.
- Editar datos fiscales → la fila local y Facturapi quedan iguales.
- Subir certificado CSD de prueba → aparece cargado. Intentar subir un `.txt` renombrado a `.cer` → lo
  rechaza el schema con mensaje claro.
- Renovar la clave de prueba → la UI muestra el nuevo `first_12` y **nada más**; en las herramientas de
  desarrollo, el payload de la respuesta no contiene la clave completa.
- Eliminar la organización → desaparece de Facturapi **y** la fila local se borra.
- `SELECT action, id_user, created_at FROM [BILLING].[audit_log] ORDER BY id` muestra un registro por cada
  operación anterior, sin claves ni contraseñas en `detail`.
- Con `id_role` 3, entrar por URL a `/dashboard/facturacion` redirige.
- `npm run build` y `npm run lint` sin errores ni warnings nuevos.

## Criterios de aceptación

- [ ] Existen en BD el esquema `BILLING` y las tablas `[BILLING].[organizations]` (con `UNIQUE` sobre
      `uid`, `id_empresa` `NOT NULL`, `IDENTITY` e índice por `id_empresa`) y `[BILLING].[audit_log]`; el
      DDL está en `queries.txt` bajo el separador `FACTURACION (FACTURAPI)`.
- [ ] Ninguna tabla del módulo quedó en `dbo`; todas las consultas del repositorio califican el esquema
      como `[CentroPodologico].[BILLING].[…]`.
- [ ] No queda ningún import de `drizzle-orm`, `@/lib/db` ni `@/lib/schema`; tampoco se agregaron
      `drizzle-orm`, `drizzle-kit` ni `mysql2` a `package.json`.
- [ ] Todo el SQL del módulo vive en `lib/billing/organizationsRepository.ts` y usa `queryParams` con
      parámetros `@nombre`; ningún `actions.ts` arma SQL por su cuenta.
- [ ] `created_at`/`updated_at` se escriben con `buildDate(new Date())` y se leen con
      `CONVERT(varchar(19), [col], 120)`; ninguna fecha viaja como objeto `Date`.
- [ ] `SELECT test_key FROM [BILLING].[organizations]` devuelve texto que empieza con `v1:`, no una clave
      de Facturapi legible.
- [ ] **Ninguna server action, route handler, página ni componente del módulo devuelve o renderiza
      `test_key` o `live_key`.** La UI muestra a lo sumo `first_12`. Verificable con
      `grep -rn "test_key\|live_key" app/` sin resultados.
- [ ] `getRootClient()` y la clave de cifrado son perezosos: con `FACTURAPI_USER_KEY` o
      `BILLING_ENCRYPTION_KEY` sin definir, `npm run dev` levanta y el resto del dashboard funciona.
- [ ] Existe un único `getOrgClient` (en `lib/billing/facturapiClient.ts`), **sin parámetro `mode`**; no
      queda ningún `new Facturapi(...)` suelto en páginas, actions o route handlers.
- [ ] Toda server action del módulo abre con `requireBillingAccess()` y con un `safeParse` de `zod`; no
      queda ningún cast `as string` / `as File` sobre `FormData` ni ningún `parseFloat`/`parseInt` sin
      validar.
- [ ] El `id_empresa` nunca llega desde el cliente; el listado muestra solo las organizaciones de la
      empresa del usuario, y entrar por URL directa al `uid` de una organización de otra empresa falla.
- [ ] Ningún error crudo de Facturapi llega al cliente: todos pasan por `toUserMessage`, y el error
      completo queda en el log del servidor.
- [ ] Cada operación del catálogo (`org.*`, `cert.*`, `key.*`) deja un registro en `BILLING.audit_log` con
      `id_user` e `id_empresa`, y `detail` no contiene claves ni la contraseña del CSD.
- [ ] La contraseña del CSD no se persiste, no se registra en bitácora y no aparece en ningún log.
- [ ] `proxy.ts` redirige a `id_role` 2, 3 y 5 fuera de `/dashboard/facturacion`, y la entrada del sidebar
      tiene `excludeRoles: [2, 3, 5]`, coherente con esa guarda.
- [ ] Eliminar una organización borra tanto en Facturapi como la fila local (no quedan filas huérfanas).
- [ ] Revocar una clave Live cuando existen varias deja `live_key` limpia si la revocada era la almacenada.
- [ ] No existe `app/api/facturacion/admin/migrate-orgs` ni la variable `MIGRATE_SECRET`.
- [ ] No queda ningún `console.log` de datos de organizaciones.
- [ ] Ningún archivo del módulo importa `@/components/ui/*` ni `cn`; los modales destructivos reusan
      `ConfirmModal`.
- [ ] La navegación interna de la organización es una tira de pestañas horizontal, no un segundo sidebar,
      y ninguna página del módulo renderiza `min-h-screen` ni un `<header>` full-width propio.
- [ ] `"use client"` aparece solo en los componentes que realmente necesitan interactividad; las páginas y
      las secciones de solo lectura son Server Components.
- [ ] `is_live` sigue en `0` en todas las filas y no existe UI para cambiarlo (llega en el spec 30).
- [ ] Existe `docs/facturacion.md` y está referenciado desde `CLAUDE.md`.
- [ ] `npm run build` y `npm run lint` compilan sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **Portar a `clinica` y no a `sofne-nextjs`.** Ambos usan SQL Server, y `sofne-nextjs` incluso ya tiene
  `facturapi 4.4.1` instalado; pero usa MUI 5 + Emotion y React 18, lo que obligaría a reescribir toda la
  UI del módulo a MUI o a meter Tailwind al proyecto. `clinica` comparte stack casi exacto con el proyecto
  original (Next 16, React 19, Tailwind v4, `lucide-react`, alias `@/*` a la raíz).

- **Partir el trabajo en cuatro specs.** El alcance original era un solo entregable de ~30 componentes y
  ~4,000 líneas de UI más el esquema, el repositorio, cuatro `actions.ts` y tres route handlers.
  Verificarlo de una sentada es inviable y acumularía los errores hasta el final. Este spec entrega
  cimientos + una pantalla útil; 29 agrega Clientes y Productos; 30 agrega Facturas y el modo Live; 31
  agrega Personalización. **El modo Live queda hasta el 30** justamente porque solo tiene consecuencias
  cuando ya se pueden emitir comprobantes.

- **Cifrar las API keys en reposo.** El original las guarda en `text` plano. Aquí conviven con la BD de la
  clínica, y una `live_key` filtrada permite emitir CFDI reales a nombre de la empresa ante el SAT.
  AES-256-GCM con el `crypto` de Node no agrega dependencias y queda contenido en el repositorio. Se
  descartó no persistirlas: Facturapi no permite releer una clave ya emitida, solo renovarla, así que
  "pedirla bajo demanda" no es una opción real.

- **Las claves nunca cruzan al cliente.** El original devuelve la clave en claro desde `renewTestApiKey` y
  `renewLiveApiKey` y la renderiza en el DOM, y además serializa la test key en el payload RSC de la
  pestaña General en **cada carga** (`ApiKeysSection.tsx:25`), con un enmascarado puramente cosmético. Se
  adopta el patrón que el propio original ya usa bien en `LiveApiKeyRow.tsx:13`: mostrar solo `first_12`.
  Se descartó el patrón "revelar una sola vez" (GitHub/Stripe) porque aquí no hay ningún flujo que
  requiera que un humano copie la clave: el único consumidor es el propio servidor.

- **`getOrgClient` sin parámetro `mode`.** En el original el modo es un argumento del cliente
  (`invoices.ts:31,85,101`) y un query param (`?mode=`) que gana sobre la BD, de modo que `?mode=live` en
  la URL basta para operar en producción. Resolverlo dentro del cliente único, leyendo `is_live`, hace que
  ningún call site pueda equivocarse. Es la razón principal de centralizar `getOrgClient`.

- **Un solo `getOrgClient` en vez de las 4 copias del original.** El proyecto original tenía cuatro
  implementaciones casi idénticas con mensajes divergentes, más ocho `new Facturapi(...)` inline, y su
  propio `CLAUDE.md` pedía "mantener los helpers duplicados consistentes". Con el chequeo de tenant y la
  resolución de modo de por medio, esa duplicación pasa de ser un problema de mantenimiento a un riesgo de
  seguridad: bastaría con olvidar el filtro en una copia.

- **`getRootClient()` perezoso en vez del singleton que lanza en el import.** El `lib/facturapi.ts`
  original hace `throw` al importarse si falta `FACTURAPI_USER_KEY`. Eso es aceptable cuando el módulo *es*
  la app; dentro de `clinica` significaría que una variable de entorno faltante tumba el arranque de
  pacientes, citas, ventas e inventario.

- **`zod` en vez de validadores a mano.** El repo no tiene ninguna librería de validación y el estilo de la
  casa es hand-rolled, pero una frontera `'use server'` acepta cualquier input deserializado y los tipos TS
  se borran en runtime: hoy los dos proyectos van con casts directos a Facturapi. `zod` es la corrección de
  mayor apalancamiento por línea escrita, es solo servidor, y no entra al bundle del cliente.

- **`lib/billing/` en inglés, ruta `/dashboard/facturacion` en español.** `CLAUDE.md` exige identificadores
  en inglés y el precedente del repo es `lib/inventory/`; el esquema de BD ya se llama `BILLING`. Las rutas
  y carpetas de feature siguen en español como el resto (`pacientes`, `citas`, `sucursales`).

- **`IDENTITY` en vez de `MAX(id)+1`.** Se rompe deliberadamente el patrón que el repo usa en ~15 sitios,
  porque tiene carrera bajo concurrencia y estas son tablas nuevas sin nada que dependa de él.

- **Bitácora propia (`BILLING.audit_log`) desde el primer spec.** El repo no tiene bitácora, pero sí el
  precedente de `inventory.kardex` (ledger append-only con `id_user`, `notes`, `created_at`). Emitir o
  cancelar un CFDI, o rotar una clave de producción, son actos con consecuencias externas: hay que poder
  responder quién los hizo. Se crea aquí y no en el spec 30 para que las operaciones de credenciales y
  certificado también queden registradas.

- **`requireActiveUser` / `requireBillingAccess` compartidos.** El repo duplica `getActiveUser()` en 19
  `actions.ts`, cada uno reencodeando `JWT_SECRET_SEED`. Sumar la copia número 20 sería más barato hoy y
  peor mañana. No se migran los 19 existentes: es limpieza aparte.

- **Filtrar solo por `id_empresa`, no por `id_sucursal`.** Rompe deliberadamente la convención del resto
  del sistema (`WHERE id_sucursal = @id_sucursal AND id_empresa = @id_empresa`) porque una organización de
  Facturapi es una entidad fiscal de la empresa completa, no de una sucursal: el RFC, el certificado CSD y
  las series de folios son únicos por razón social. Se documenta en el propio `actions.ts`.

- **Aprovechar `id_empresa`, que ya existía como columna muerta.** El proyecto original la declaraba pero
  nunca la leía ni la escribía (reservada para trabajo multi-tenant futuro). Aquí se vuelve `NOT NULL` y la
  llave del tenant.

- **Backfill por script temporal en vez de `admin/migrate-orgs`.** Ver paso 9. Un endpoint permanente
  protegido por un header de secreto compartido es superficie de ataque perpetua para una operación que se
  hace una vez.

- **Borrar la fila local al eliminar una organización.** El original solo llamaba a
  `facturapi.organizations.del(id)` y dejaba la fila en MySQL, con sus API keys, apuntando a una
  organización inexistente.

- **Adaptar la UI al sistema de diseño del repo en vez de portar shadcn.** Traer `components/ui/*` habría
  significado agregar `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `tw-animate-css` y el paquete `shadcn` (que el original necesita en runtime por el
  `@import "shadcn/tailwind.css"` de su `globals.css`), además de fusionar sus tokens `oklch` con los del
  repo. El resultado sería una sección que se ve como otra app dentro del dashboard.

- **Pestañas horizontales en vez del sidebar vertical del original.** El repo ya tiene un `Sidebar` fijo y
  colapsable con drawer móvil propio; anidar un segundo sidebar produce doble chrome y rompe el layout en
  pantallas chicas. Por lo mismo se elimina `OrgMobileNav`.

- **Mantener Facturapi como sistema de registro; no replicar clientes/productos/facturas en SQL Server.**
  La tabla local guarda solo lo que la API no resuelve bien (keys, modo, copia de datos legales para listar
  sin pegarle a la API). Crear tablas espejo introduciría un problema de sincronización sin beneficio claro
  a esta escala.

## Riesgos identificados

- **Perder `BILLING_ENCRYPTION_KEY` inutiliza las claves guardadas.** La test key se recupera con
  `renewTestApiKey`; la live key **solo** renovándola en Facturapi, lo que invalida la anterior. La variable
  debe respaldarse junto con las credenciales de BD y rotarse solo con un re-cifrado planeado (el prefijo
  `v1:` existe para eso). Cifrar mueve el riesgo de "clave legible en la BD" a "clave perdida con la
  variable de entorno"; es un intercambio deliberado.

- **El cifrado protege el volcado de BD, no un servidor comprometido.** `BILLING_ENCRYPTION_KEY` vive en el
  proceso de Next; quien ejecute código en ese servidor puede descifrar. Mitiga el escenario realista (un
  backup, un `SELECT` de alguien con acceso a la BD de la clínica), no el de compromiso total.

- **`id_empresa` es hoy siempre `1`.** `registerAction` lo hardcodea y no existe CRUD de empresas, así que
  el filtro por tenant no está realmente ejercitado en producción. El aislamiento funciona a nivel código,
  pero no se probará de verdad hasta que exista una segunda empresa. *Mitigación:* la verificación del paso
  8 inserta manualmente una fila con `id_empresa` distinto para ejercitar el filtro.

- **La copia local de los datos legales puede desincronizarse de Facturapi.** `updateOrganizationLegal`
  escribe en ambos lados, pero si la llamada a Facturapi tiene éxito y el `UPDATE` local falla (o alguien
  edita la organización desde el panel de Facturapi), el listado mostrará datos viejos. No hay transacción
  distribuida posible. *Mitigación aceptada:* la copia local es solo para el listado; el detalle siempre lee
  de Facturapi con `organizations.retrieve`.

- **`toUserMessage` reduce el detalle visible en pantalla.** Un usuario que hace algo que Facturapi rechaza
  verá un mensaje genérico y tendrá que pedir que alguien revise los logs. Es el precio de no exponer RFCs,
  seriales de certificado y detalles de folio a la interfaz. *Mitigación:* el catálogo de mensajes de
  `errors.ts` debe cubrir los rechazos comunes (RFC inválido, CSD vencido, régimen incompatible) con texto
  accionable, y todo lo demás cae al genérico.

- **`BILLING.audit_log` no está protegida contra borrado.** Es append-only por convención, no por permisos:
  cualquiera con acceso a la BD puede editarla. Sirve para responder "quién hizo esto" en operación normal,
  no como evidencia forense frente a un insider. *Mitigación pendiente:* permisos de solo-inserción para el
  usuario de la aplicación, en un spec de infraestructura.

- **`zod` es una dependencia nueva en un repo que no tenía ninguna de validación.** Suma superficie a
  mantener y una versión más que actualizar. Se acota a `lib/billing/` en este spec; extenderlo al resto del
  repo es decisión aparte.
