# Google Calendar integration

- `lib/googleCalendar.ts` authenticates as a Google service account (JWT signed with `jose`, PKCS#1→PKCS#8 conversion needed because of Node/OpenSSL 3) — no `google-auth-library` JWT client is used, to avoid `ERR_OSSL_UNSUPPORTED`.
- Calendar events carry `extendedProperties.private` for app-specific metadata (e.g. `id_sucursal`).
- Env vars: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` (primary/default), `GOOGLE_EXTRA_CALENDAR_IDS` (comma-separated, queried in parallel and de-duplicated by event ID).
- Each branch (`sucursal`) has its own linked Google Calendar (`link_calendar` column) for scheduling citas.
