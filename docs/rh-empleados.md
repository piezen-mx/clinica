# HR — Employees (empleados)

- `app/dashboard/empleados/` covers employee onboarding, listing, and detail (`RH.empleados` table; catalogs in `interfaces/rh_catalogs.ts` — department, puesto, turno).
- Employee detail (`empleados/[id]/`) is a tabbed layout: **Documentos** (`[id]/documentos/`, Cloudinary uploads) and **Asistencia** (`[id]/asistencia/`, attendance records fed by the biometric checadores — see `docs/asistencias-biometricas.md`).
