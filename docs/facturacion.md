# Billing / electronic invoicing (Facturapi)

- `app/dashboard/facturacion/` manages organizations (`BILLING.organizations`) for electronic
  invoicing via [Facturapi](https://www.facturapi.io). Ported from a standalone project
  (`factura`) across specs 28-31; spec 28 covers only the schema, shared infra, and the
  organizations listing + General tab. `docs/facturacion.md` grows with each spec.
- Tenant scope: every read/write filters by `id_empresa` from the JWT, **not** by
  `id_sucursal`. A Facturapi organization is a fiscal entity of the whole company — the CSD
  certificate and folio series are per organization, not per branch. Don't "fix" this by
  adding an `id_sucursal` filter later.
- **RFC and country are shared across every organization in the account, not unique per
  organization.** Facturapi v2 (the only version still live — v1 was retired in April 2023)
  rejects `tax_id` and `address.country` on both `organizations.create` and
  `organizations.updateLegal`; they're fixed to the RFC/country of the account that owns the
  `FACTURAPI_USER_KEY`. An "organization" here is closer to a sub-brand of one legal entity
  than an independent taxpayer. `CreateOrganizationSchema` doesn't collect either field; the
  UI shows them read-only, sourced from Facturapi's response, never from user input.
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
and not read from any UI yet. Current `action` values, written from
`app/dashboard/facturacion/actions.ts`:

| Action | Written by |
|---|---|
| `org.create` | `createOrganization` |
| `org.update_legal` | `updateOrganizationLegal` |
| `org.delete` | `deleteOrganization` |
| `cert.upload` | `uploadCertificate` |
| `cert.delete` | `deleteCertificate` |
| `key.renew_test` | `renewTestApiKey` |
| `key.renew_live` | `renewLiveApiKey` |
| `key.revoke_live` | `deleteLiveApiKey` |

`detail` must never contain key material or the CSD password. The catalog grows in specs
29-31 (customers, products, invoices, customization).

## `getOrgClient` contract

- `lib/billing/facturapiClient.ts` exposes two clients: `getRootClient()` (platform key,
  account-level operations — everything in spec 28's `actions.ts` uses this one, since
  managing organizations is an account operation, not invoicing on behalf of one) and
  `getOrgClient(uid, idEmpresa)` (organization-specific test/live key, reserved for the
  domain calls — customers, products, invoices — that specs 29 and 30 add).
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
