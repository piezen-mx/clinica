# Attendance / biometric checadores (ZKTeco ADMS)

- Branch biometric devices (ZKTeco) push attendance punches over the **ADMS/iClock** protocol to `app/api/asistencias/iclock/*` (`cdata` for handshake + record push, `getrequest` for device polling). This is the one intentional exception to "no new REST endpoints" — the device speaks a fixed plain-HTTP protocol and can't be a Server Action.
- `lib/zktecoAdms.ts` parses the `ATTLOG` body the device pushes, resolves the checador by serial number (`resolveChecadorBySN`, against `RH.checadores`), and persists punches (`saveAttendanceRecords`). An unregistered or inactive SN is rejected with `403`.
- `app/dashboard/sucursales/componentes/SucursalCheckadoresModal.tsx` manages which checadores (`IChecador`, `interfaces/checador.ts`) are active per branch.
- `interfaces/asistencia.ts` / `interfaces/employee.ts` define punches and employees; when touching this code follow the same string-only date handling rules in the main CLAUDE.md (punches are timestamps).
