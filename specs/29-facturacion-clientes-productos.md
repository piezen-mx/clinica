# 29 — Facturación: clientes y productos de la organización

## Header

- **Estado:** Implementado
- **Depende de:** Spec 28 (`BILLING.organizations`, `BILLING.audit_log`, `lib/billing/facturapiClient.ts`,
  `lib/billing/organizationsRepository.ts`, `lib/billing/schemas.ts`, `lib/billing/errors.ts`,
  `lib/auth/session.ts`, `/dashboard/facturacion/[id]` con `OrgTabs`). No modifica base de datos.
- **Fecha:** 2026-08-26
- **Objetivo:** Habilitar las pestañas **Clientes** y **Productos** del detalle de organización: listar,
  buscar, crear y editar los clientes y productos que viven en Facturapi, con el buscador del catálogo SAT
  de productos. Sigue todo en modo Test; el modo Live llega en el spec 30.

## Alcance

**Incluye:**

### Pantalla `/dashboard/facturacion/[id]/customers`

- Listado de clientes de la organización (`limit: 50`), con buscador por nombre/RFC que delega en el
  parámetro `q` de Facturapi.
- Alta y edición de cliente: razón social, RFC, régimen fiscal, correo, teléfono y dirección.
- Server actions en `app/dashboard/facturacion/[id]/customers/actions.ts`, portadas de
  `app/actions/customers.ts` del proyecto original (94 líneas, 4 exports).

### Pantalla `/dashboard/facturacion/[id]/products`

- Listado de productos de la organización (`limit: 50`).
- Alta y edición de producto: descripción, precio, clave de unidad, clave del SAT, IVA.
- Buscador del catálogo SAT de productos incrustado en el formulario, con mínimo de 2 caracteres.
- Server actions en `app/dashboard/facturacion/[id]/products/actions.ts`, portadas de
  `app/actions/products.ts` (68 líneas, 2 exports).

### Route handler `app/api/facturacion/catalogs/products`

- Búsqueda en el catálogo SAT de productos, portado de `app/api/catalogs/products/route.ts`.
- **Se le agrega autenticación y scoping**: `requireBillingAccess()` y verificación de que el `uid` de la
  organización pertenece al `id_empresa` de la sesión. En el original es un endpoint anónimo que recibe
  `?orgId=` del query string, resuelve la clave de esa organización y ejecuta llamadas a Facturapi con
  ella: cualquiera puede enumerar `orgId`s y generar tráfico facturado a organizaciones ajenas.
- Es un route handler y no una server action porque el buscador es un `fetch` incremental desde el
  formulario de producto, no un submit. Es el único caso de este spec que justifica salirse del patrón de
  server actions de `CLAUDE.md`.

### Validación

- Schemas nuevos en `lib/billing/schemas.ts`: `CustomerSchema`, `ProductSchema`, `SatCatalogQuerySchema`.
- `ProductSchema` valida el precio con un parser numérico que **rechaza `NaN`**. El original hace
  `parseFloat(data.price)` sin verificar (`products.ts:33,58`), de modo que un precio no numérico llega a
  Facturapi como `NaN`.
- `SatCatalogQuerySchema` exige el mínimo de 2 caracteres **del lado del servidor**, no solo en el cliente
  (`ProductFormModal.tsx:97`).

### Bitácora

Se amplía el catálogo de `BILLING.audit_log` con `customer.create`, `customer.update`, `product.create` y
`product.update`. No se registran las lecturas.

**No incluye (para specs futuras):**

- **Facturas y modo Live.** Spec 30.
- **Personalización del PDF.** Spec 31.
- **Eliminar clientes o productos.** El original tampoco lo hace; Facturapi los conserva porque están
  referenciados por comprobantes emitidos.
- **Paginación real.** Se mantiene `limit: 50` como en el original. Con más de 50 clientes o productos hay
  que usar el buscador. *(Ver Riesgos.)*
- **Persistencia local de clientes o productos.** Facturapi sigue siendo el sistema de registro; no se
  crean tablas locales.
- **Importación masiva de clientes o productos** desde CSV o desde `dbo.pacientes` / `inventory.Products`.

## Modelo de datos

No hay cambios de base de datos en este spec. Se agregan tipos de formulario a
`interfaces/organization.ts`:

```ts
/** Datos de un cliente de Facturapi capturados en el formulario. */
export interface ICustomerFormInput {
  legal_name:  string;
  tax_id:      string;
  tax_system:  string;
  email:       string;
  phone:       string | null;
  street:      string | null;
  exterior:    string | null;
  interior:    string | null;
  neighborhood: string | null;
  zip:         string;
  city:        string | null;
  municipality: string | null;
  state:       string | null;
  country:     string | null;
}

/** Datos de un producto de Facturapi capturados en el formulario. */
export interface IProductFormInput {
  description: string;
  product_key: string;   // clave del catálogo SAT
  unit_key:    string;   // clave de unidad SAT, default "H87"
  price:       number;   // validado: nunca NaN
  tax_included: boolean;
}

/** Resultado del buscador del catálogo SAT. */
export interface ISatProductSuggestion {
  key:         string;
  description: string;
}
```

## Plan de implementación

### 1. Schemas de validación — `lib/billing/schemas.ts` (modificado)

Agregar `CustomerSchema`, `ProductSchema` y `SatCatalogQuerySchema`. El parser de precio es una función
compartida (`money()`) que acepta string o number, normaliza la coma decimal, y falla ante `NaN`, negativos
e infinitos. `CustomerSchema` valida el formato de RFC y el correo.

*Verificación:* `ProductSchema.safeParse({ price: "abc", … })` falla; `{ price: "1,234.50", … }` pasa y
produce `1234.5`.

### 2. Server actions de clientes — `app/dashboard/facturacion/[id]/customers/actions.ts` (archivo nuevo)

Porta `app/actions/customers.ts`: `createCustomerAction`, `listCustomersAction`, `searchCustomersAction`,
`updateCustomerAction`. Cambios obligatorios:

1. Eliminar el `getOrgClient` local (`customers.ts:9-13`, duplicado byte a byte con el de `products.ts`) y
   usar `getOrgClient(uid, id_empresa)` de `lib/billing/facturapiClient.ts`.
2. Abrir con `const { id_empresa, id_user } = await requireBillingAccess();`; el `uid` recibido se valida
   contra ese `id_empresa` dentro de `getOrgClient`.
3. `safeParse` con `CustomerSchema` antes de tocar Facturapi.
4. Retorno `ActionResult<T>`; los `catch` pasan por `toUserMessage`.
5. `revalidatePath("/dashboard/facturacion/[id]/customers")` tras cada mutación.
6. Registrar `customer.create` / `customer.update` en `audit_log`.

*Verificación:* llamar la action con el `uid` de una organización de otra empresa falla antes de llegar a
Facturapi.

### 3. Server actions de productos — `app/dashboard/facturacion/[id]/products/actions.ts` (archivo nuevo)

Porta `app/actions/products.ts`: `createProductAction`, `updateProductAction`. Mismos seis cambios que
clientes, más:

7. Sustituir `parseFloat(data.price)` por el precio ya validado por `ProductSchema`.
8. El IVA hardcodeado en `0.16 / Tasa` del original se mantiene, pero pasa a ser una constante nombrada
   (`DEFAULT_VAT_RATE`) en el archivo, no un literal enterrado en el payload.

*Verificación:* crear un producto con precio `"abc"` devuelve `{ ok: false }` con mensaje claro y no genera
ninguna llamada a Facturapi.

### 4. Route handler del catálogo SAT — `app/api/facturacion/catalogs/products/route.ts` (archivo nuevo)

`export const runtime = "nodejs";` y `export const GET`, siguiendo el estilo de `app/api/upload/route.ts`.

1. `await requireBillingAccess()` al inicio; sin sesión válida responde `401` con
   `NextResponse.json({ ok: false, message }, { status: 401 })`.
2. `orgId` y `q` validados con `SatCatalogQuerySchema`; `q` con mínimo 2 caracteres.
3. El cliente sale de `getOrgClient(orgId, id_empresa)`, que ya valida pertenencia — no se lee la clave
   directamente como hace el original (`catalogs/products/route.ts:22`).
4. Los errores pasan por `toUserMessage`; no se devuelve el `message` crudo de Facturapi (hoy sí, en las
   respuestas 500).
5. Recordar que **el `matcher` de `proxy.ts` no cubre `/api/*`**: esta autenticación es la única que hay.

*Verificación:* sin cookie de sesión, `GET /api/facturacion/catalogs/products?orgId=…&q=serv` responde
`401`; con sesión de otra empresa, error de organización no encontrada; con `q` de 1 carácter, `400`.

### 5. UI — pestaña Clientes

`app/dashboard/facturacion/[id]/customers/page.tsx` (Server Component) + `componentes/CustomersSection.tsx`
(cliente, ex `CustomersSection.tsx` de 291 líneas) y su modal de alta/edición.

Se reescribe con las clases del repo, siguiendo `EmployeesTable.tsx` para la tabla y el toolbar, y
`EmployeeModal.tsx` para el formulario. El patrón de llamada es el dominante del repo (`useState` para
`loading`/`error`, `if (!result.ok) setError(result.message)`, luego `router.refresh()`).

Se agrega la pestaña "Clientes" a `OrgTabs.tsx` (modificado).

*Verificación:* listar, buscar, crear y editar un cliente funcionan; el buscador con cadena vacía muestra
el listado completo.

### 6. UI — pestaña Productos

`app/dashboard/facturacion/[id]/products/page.tsx` + `componentes/ProductsSection.tsx` (ex 96 líneas) y
`ProductFormModal.tsx` (ex 262 líneas), este último con el buscador del catálogo SAT.

Al portar el buscador hay que conservar su comportamiento: mínimo 2 caracteres, resultados en lista
seleccionable que rellena `product_key`, y `fetch` apuntando a la ruta nueva
`/api/facturacion/catalogs/products` (el original apunta a `/api/catalogs/products` en
`ProductFormModal.tsx:100`).

Se agrega la pestaña "Productos" a `OrgTabs.tsx`.

*Verificación:* el buscador SAT devuelve resultados y rellena la clave; guardar un producto con la clave
elegida funciona.

### 7. Verificación manual completa

Con Facturapi en **modo Test**, sobre una organización creada en el spec 28:

- Crear cliente con RFC de prueba → aparece en el listado → editarlo → los cambios persisten en Facturapi.
- Buscar cliente por RFC parcial → filtra correctamente.
- Intentar crear un cliente con RFC mal formado → lo rechaza el schema con mensaje claro, sin llegar a
  Facturapi.
- Crear producto usando el buscador del catálogo SAT → la clave se rellena → se guarda.
- Intentar crear un producto con precio `"abc"` → rechazado con mensaje claro.
- `SELECT action, id_user FROM [BILLING].[audit_log] WHERE action LIKE 'customer%' OR action LIKE 'product%'`
  muestra un registro por cada alta y edición.
- En una ventana sin sesión, `GET /api/facturacion/catalogs/products?orgId=…&q=serv` responde `401`.
- `npm run build` y `npm run lint` sin errores ni warnings nuevos.

## Criterios de aceptación

- [x] Las pestañas Clientes y Productos aparecen en `OrgTabs` y funcionan; listar, buscar, crear y editar
      operan contra Facturapi.
- [x] No existe ningún `getOrgClient` local en `customers/actions.ts` ni en `products/actions.ts`: ambos
      usan el de `lib/billing/facturapiClient.ts`, sin parámetro `mode`.
- [x] No queda ningún `new Facturapi(...)` en las páginas de clientes ni de productos (el original lo hace
      inline en `customers/page.tsx:13` y `products/page.tsx:13`).
- [x] Toda action y el route handler abren con `requireBillingAccess()` y un `safeParse` de `zod`.
- [x] No queda ningún `parseFloat`/`parseInt` sin validar: el precio pasa por `ProductSchema` y un valor no
      numérico se rechaza antes de llamar a Facturapi.
- [x] `GET /api/facturacion/catalogs/products` responde `401` sin sesión y falla con el `orgId` de una
      organización de otra empresa; exige `q` de al menos 2 caracteres del lado del servidor.
- [x] `ProductFormModal` apunta a `/api/facturacion/catalogs/products`, no a la ruta del proyecto original.
- [x] Ningún error crudo de Facturapi llega al cliente ni al cuerpo de una respuesta HTTP; todos pasan por
      `toUserMessage`.
- [x] Las altas y ediciones de cliente y producto quedan registradas en `BILLING.audit_log`.
- [x] Ningún archivo importa `@/components/ui/*` ni `cn`; la UI usa las clases del repo y se ve consistente
      en claro y oscuro.
- [x] `"use client"` solo en los componentes que necesitan interactividad; las páginas son Server
      Components.
- [x] No se creó ninguna tabla local para clientes ni productos.
- [x] `npm run build` y `npm run lint` compilan sin errores ni warnings nuevos.

## Decisiones tomadas y descartadas

- **El catálogo SAT sigue siendo un route handler, no una server action.** `CLAUDE.md` prohíbe agregar
  rutas REST para CRUD, pero este no es CRUD: es una búsqueda incremental disparada desde un campo de
  texto, con `fetch` y cancelación, no un submit. Es el mismo criterio por el que existen `app/api/upload`
  y el webhook de los checadores. Se documenta en el propio archivo para que no se "corrija".

- **Autenticar y acotar el catálogo SAT en vez de dejarlo público.** En el original es un endpoint anónimo
  que recibe `?orgId=` y usa la clave de esa organización para llamar a Facturapi. Además de ser un oráculo
  para enumerar organizaciones existentes, permite generar tráfico facturado a cuentas ajenas. La
  autenticación es propia porque el `matcher` de `proxy.ts` no cubre `/api/*`.

- **Validar el precio en vez de confiar en Facturapi.** El original manda `NaN` cuando el precio no es
  numérico y deja que Facturapi lo rechace; el mensaje que vuelve es opaco para el usuario. Validarlo antes
  ahorra un viaje y produce un error accionable.

- **No eliminar clientes ni productos.** El original tampoco lo permite, y Facturapi los conserva porque
  están referenciados por comprobantes ya emitidos. Ocultarlos del listado sería una función distinta
  (archivar), que no se pide.

- **Mantener `limit: 50` en vez de introducir paginación.** `CLAUDE.md` pide paginar listas grandes, pero
  la paginación de Facturapi es por cursor y no hay ninguna lista local que paginar; introducirla aquí
  significaría inventar el patrón para todo el repo, que hoy no tiene ninguno. Se difiere, con el buscador
  como salida práctica. *(Ver Riesgos.)*

- **No importar clientes desde `dbo.pacientes` ni productos desde `inventory.Products`.** Es tentador,
  porque los datos ya existen, pero los requisitos fiscales (RFC, régimen, código postal, clave SAT) no
  están en esas tablas y la correspondencia no es uno a uno. Es un spec propio.

## Riesgos identificados

- **`limit: 50` sin paginación oculta registros en silencio.** Una organización con más de 50 clientes o
  productos muestra una lista truncada sin ningún aviso. *Mitigación:* indicar en la interfaz cuándo el
  listado está truncado e invitar a usar el buscador; la paginación real queda para un spec posterior.

- **Clientes y productos operan siempre contra la clave de prueba en el proyecto original.** Sus
  `getOrgClient` (`customers.ts:9-13`, `products.ts:9-13`) usan `test_key` sin mirar el modo, así que con el
  switch en Live la pestaña de clientes sigue mostrando datos de sandbox — y una factura Live podía
  construirse con clientes del entorno de pruebas. Aquí el `getOrgClient` compartido resuelve el modo desde
  `is_live`, que en este spec siempre vale `0`, así que el comportamiento observable es idéntico. **El spec
  30 debe verificar explícitamente que, al activar Live, clientes y productos también cambian de entorno**,
  y que un cliente creado en Test no aparece en Live.

- **El buscador del catálogo SAT consume cuota de Facturapi por pulsación.** Con `q` de mínimo 2 caracteres
  y sin debounce, teclear rápido genera varias llamadas. *Mitigación:* debounce en el cliente al portar
  `ProductFormModal`, y el mínimo de 2 caracteres validado también en el servidor.

- **La copia de datos del cliente vive solo en Facturapi.** Si la cuenta de Facturapi se pierde o se migra,
  el padrón de clientes se va con ella; no hay respaldo local. Es la consecuencia deliberada de mantener
  Facturapi como sistema de registro (decisión del spec 28).
