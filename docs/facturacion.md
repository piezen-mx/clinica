# Billing / electronic invoicing (Facturapi)

- `app/dashboard/facturacion/` manages organizations (`BILLING.organizations`) for electronic
  invoicing via [Facturapi](https://www.facturapi.io). Ported from a standalone project
  (`factura`) across specs 28-31; spec 28 covers only the schema, shared infra, and the
  organizations listing + General tab. The module is complete as of spec 31: five tabs
  (General, Clientes, Productos, Facturas, Personalizar) under
  `app/dashboard/facturacion/[id]/`, each with its own `page.tsx`/`actions.ts`/`componentes/`,
  same convention as `empleados/[id]/documentos/`.
- Tenant scope: every read/write filters by `id_empresa` from the JWT, **not** by
  `id_sucursal`. A Facturapi organization is a fiscal entity of the whole company — the CSD
  certificate and folio series are per organization, not per branch. Don't "fix" this by
  adding an `id_sucursal` filter later.
- **RFC is editable per organization, depending on whether the account has Facturapi's
  multi-RFC add-on contracted — this account does (spec 32).** Without that add-on, Facturapi
  v2 rejects `tax_id` on `organizations.create`/`organizations.updateLegal` and fixes it to the
  RFC of the account that owns the `FACTURAPI_USER_KEY` (which is what spec 28 originally
  assumed, before the add-on was confirmed). `CreateOrganizationSchema` collects `tax_id` from
  the form (same `RFC_REGEX` as `CustomerSchema`) and both `createOrganization` and
  `updateOrganizationLegal` send it to Facturapi; the value actually persisted to
  `BILLING.organizations` is whatever Facturapi confirms back in its response, not the raw form
  value. `country` stays fixed to `"MEX"` — not a Facturapi API limitation, but a product
  decision (spec 32): every organization in this account is a Mexican fiscal entity, so
  `country` isn't a form field at all.
- `createOrganization` is necessarily two Facturapi calls, not one: `organizations.create`
  accepts only `{ name }` in v2 (nesting the payload under `legal`, like the original project
  did, fails outright — `"El campo legal no está permitido"`); the rest of the legal data is
  set right after with `organizations.updateLegal`. If that second call throws, the action
  deletes the just-created organization to avoid leaving one behind in Facturapi with no
  local row and no legal data.
- Access: `/dashboard/facturacion` is gated to `id_role` 1 and 4 in `proxy.ts` (same criterion
  as `/dashboard/usuarios` and `/dashboard/empleados`); every server action also opens with
  `requireBillingAccess()` (`lib/auth/session.ts`) since the `proxy.ts` matcher doesn't cover
  `/api/*` routes that later specs may add.

## Tabs of an organization

`app/dashboard/facturacion/[id]/layout.tsx` renders the Live-mode banner and `OrgTabs`
(the tab strip) around whichever tab is active; each tab is its own route with its own
`actions.ts`:

| Tab | Route | `actions.ts` | Added in |
|---|---|---|---|
| General | `[id]/general` | `app/dashboard/facturacion/actions.ts` (shared with the listing) | spec 28 |
| Clientes | `[id]/customers` | `[id]/customers/actions.ts` | spec 29 |
| Productos | `[id]/products` | `[id]/products/actions.ts` | spec 29 |
| Facturas | `[id]/invoices` | `[id]/invoices/actions.ts` | spec 30 |
| Personalizar | `[id]/customize` | `[id]/customize/actions.ts` | spec 31 |

Clientes, Productos and Facturas call Facturapi through `getOrgClient(uid, idEmpresa)`
(domain calls, mode-aware). General **and** Personalizar use `getRootClient()` instead —
see `getOrgClient` contract below for why Personalizar is there and not with the other
three.

### Personalizar (spec 31)

- **Uses `getRootClient()`, not `getOrgClient()`.** The spec's plan called for
  `getOrgClient(uid, id_empresa)` (like customers/products/invoices), but Facturapi
  rejects `uploadLogo`, `updateCustomization`, `updateDefaultSeries`,
  `updateSeriesGroup` and `listSeriesGroup` with `"Esta operación requiere una API key
  de producción"` when called with an organization-scoped key (test or live) — they're
  account-administration endpoints, same class as the CSD and API-key calls in
  `app/dashboard/facturacion/actions.ts`, which already use `getRootClient()`.
  `[id]/customize/actions.ts` validates tenant ownership itself
  (`assertOwnedOrganization`, duplicated from the same pattern in
  `app/dashboard/facturacion/actions.ts`) since `getRootClient()` doesn't do that check.
- Logo: `uploadOrganizationLogo(formData)` sends the file straight to
  `organizations.uploadLogo` — Facturapi hosts it, not Cloudinary (it's Facturapi that
  prints the PDF, so routing the file through `app/api/upload` would just add a hop where
  the logo could end up out of sync). The file is validated by `UploadLogoSchema`
  (`lib/billing/schemas.ts`) — extension, 2 MB max, and real PNG/JPEG magic bytes — the
  same shape of check as `UploadCertificateSchema`'s DER signature check for the CSD.
  The preview uses `next/image`, so Facturapi's asset host is allowed in
  `next.config.ts`'s `images.remotePatterns`: `logo_url` actually resolves to a Google
  Cloud Storage bucket (`storage.googleapis.com/cdn.facturapi.io/organization/<uid>/logo.<ext>`),
  not to `cdn.facturapi.io` directly — confirmed against a real upload. The pattern
  restricts `pathname` to that bucket, not all of `storage.googleapis.com`.
- Appearance and series: `updateOrganizationCustomization(orgId, input)` validates via
  `OrganizationCustomizationSchema` (hex color, alphanumeric series, positive integer
  folio) and chains up to three Facturapi calls depending on what changed —
  `updateCustomization` (color + `pdf_extra`), `updateDefaultSeries` (only if the series
  changed), `updateSeriesGroup` (only if the folio changed, writing `next_folio` or
  `next_folio_test` depending on which mode — test/live — the organization is currently
  in). `getInvoiceSeriesFolio` is a read-only helper (no `audit_log` entry) used by the
  page to show the current folio next to the input, so a blind edit doesn't create a gap
  in the numbering unnoticed.
- Scope: customization is per organization, not per branch (same `id_empresa`-only filter
  as the rest of the module — see Tenant scope above) and there's no PDF preview before
  saving; the next real invoice is how a change gets confirmed.

## API key lifecycle

- Every organization has a **test key** (always present after creation) and an optional
  **live key**, both minted by Facturapi and stored encrypted in `BILLING.organizations`
  (`test_key` / `live_key`). Neither is ever readable in full after being stored — Facturapi
  itself doesn't let you re-read an issued key, only renew it, so "fetch on demand" isn't an
  option.
- `renewTestApiKey` / `renewLiveApiKey` (`app/dashboard/facturacion/actions.ts`) call
  Facturapi, persist the new key encrypted, and return only `{ first_12 }` — the UI never
  receives, stores, or renders the full key. `getOrganizationKey` (`organizationsRepository.ts`)
  is the only function in the codebase that decrypts one, and it stays inside `lib/billing/`.
- Revoking a live key (`deleteLiveApiKey`) identifies whether the revoked key is the one we
  have stored by comparing `first_12` (read from Facturapi's key list *before* deleting)
  against the locally decrypted key, and clears the column whenever they match — not only
  when no live keys remain. The original project only cleared the column when the account had
  zero live keys left, which could leave a dead key referenced locally after revoking one of
  several.
- Uploading a CSD certificate (`uploadCertificate`) sends the `.cer`/`.key` files and password
  straight to Facturapi and discards the password immediately: it is never persisted, logged,
  or written to `audit_log`. The certificate itself isn't stored locally either — Facturapi
  remains the system of record; `organizations.retrieve` reports `certificate.has_certificate`
  and `certificate.expires_at`.

## Encryption format and rotation

- `lib/billing/crypto.ts` — AES-256-GCM via Node's `crypto`, no extra dependency. Stored
  format: `v1:<iv_base64>:<tag_base64>:<cipher_base64>`, IV is 12 random bytes per encryption.
- The version prefix (`v1:`) exists so a future re-encryption scheme can coexist with rows
  encrypted under the current one; spec 28 does not implement that mass re-encryption, only
  the prefix that would make it possible later.
- `BILLING_ENCRYPTION_KEY` (32 random bytes, base64) is read lazily on first use, like
  `getRootClient()` — a missing env var only breaks the billing module, not the whole app's
  boot. Losing this key makes stored keys unrecoverable: the test key can be regenerated via
  `renewTestApiKey`, but a lost live key can only be replaced by renewing it in Facturapi
  (invalidating the old one). Back it up alongside DB credentials.

## `audit_log` catalog

`BILLING.audit_log` is append-only (by convention, not by DB permission — see spec 28 Risks)
and not read from any UI yet. Complete `action` catalog as of spec 31, and which
`actions.ts` writes each one:

| Action | Written by | `actions.ts` |
|---|---|---|
| `org.create` | `createOrganization` | `app/dashboard/facturacion/actions.ts` |
| `org.update_legal` | `updateOrganizationLegal` | `app/dashboard/facturacion/actions.ts` |
| `org.delete` | `deleteOrganization` | `app/dashboard/facturacion/actions.ts` |
| `cert.upload` | `uploadCertificate` | `app/dashboard/facturacion/actions.ts` |
| `cert.delete` | `deleteCertificate` | `app/dashboard/facturacion/actions.ts` |
| `key.renew_test` | `renewTestApiKey` | `app/dashboard/facturacion/actions.ts` |
| `key.renew_live` | `renewLiveApiKey` | `app/dashboard/facturacion/actions.ts` |
| `key.revoke_live` | `deleteLiveApiKey` | `app/dashboard/facturacion/actions.ts` |
| `customer.create` | `createCustomerAction` | `[id]/customers/actions.ts` |
| `customer.update` | `updateCustomerAction` | `[id]/customers/actions.ts` |
| `product.create` | `createProductAction` | `[id]/products/actions.ts` |
| `product.update` | `updateProductAction` | `[id]/products/actions.ts` |
| `mode.set_live` | `setOrgMode` | `app/dashboard/facturacion/actions.ts` |
| `mode.set_test` | `setOrgMode` | `app/dashboard/facturacion/actions.ts` |
| `invoice.create` | `createInvoiceAction` | `[id]/invoices/actions.ts` |
| `invoice.cancel` | `cancelInvoiceAction` | `[id]/invoices/actions.ts` |
| `invoice.email` | `sendInvoiceByEmailAction` | `[id]/invoices/actions.ts` |
| `invoice.pdf` | PDF route handler (`app/api/facturacion/organizations/[orgId]/invoices/[invoiceId]/pdf`) | — |
| `org.upload_logo` | `uploadOrganizationLogo` | `[id]/customize/actions.ts` |
| `org.update_customization` | `updateOrganizationCustomization` | `[id]/customize/actions.ts` |

`detail` must never contain key material or the CSD password. The catalog is complete as
of spec 31 — a future spec that adds a new mutation should extend
`BillingAuditAction` (`lib/billing/organizationsRepository.ts`) and this table together.

## `getOrgClient` contract

- `lib/billing/facturapiClient.ts` exposes two clients: `getRootClient()` (platform key,
  account-level operations — everything in spec 28's `actions.ts` uses this one, since
  managing organizations is an account operation, not invoicing on behalf of one) and
  `getOrgClient(uid, idEmpresa)` (organization-specific test/live key, reserved for the
  domain calls — customers, products, invoices — that specs 29 and 30 add). It might
  look like Personalización (spec 31) belongs on the `getOrgClient` side too, since it
  changes what a *comprobante* looks like — but Facturapi's logo/customization/series
  endpoints only accept the platform key (`"Esta operación requiere una API key de
  producción"` otherwise), so `[id]/customize/actions.ts` uses `getRootClient()` and
  validates tenant ownership itself, same as General.
- `getOrgClient` takes **no `mode` parameter**. It resolves the organization via
  `getOrganizationByUid` (which enforces the tenant filter), reads `is_live` from that row,
  and picks the matching key internally. The original project took `mode` as a function
  argument and even accepted it as a `?mode=` query param that won the DB's actual setting —
  so `?mode=live` in a URL was enough to invoice in production. Resolving the mode *inside*
  the client, never as an argument, makes that class of mistake impossible from any call site.
- In spec 28, `is_live` stays `0` on every row and there is no UI to change it — Live mode
  ships in spec 30, alongside the invoices that are the only thing that makes it consequential.
  When `is_live` does flip to `true` (spec 30), `getOrgClient` requires both a stored live key
  and `certificate.has_certificate` (checked via `getRootClient().organizations.retrieve`)
  before it will construct a live client.
