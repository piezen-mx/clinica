import db from "@/database/connection";
import { toDBString, buildDate } from "@/utils/date_helpper";
import type { AttendanceEventType } from "@/interfaces/asistencia";

// Códigos de status del protocolo ADMS (ZKTeco) que se traducen a AttendanceEventType.
// El mapeo exacto varía por firmware; estos son los códigos más comunes.
const CHECK_OUT_STATUS_CODES = new Set(["1", "5"]); // 1=check-out, 5=overtime check-out

/** Cualquier código no reconocido explícitamente como salida se trata como entrada. */
function resolveEventType(statusCode: string): AttendanceEventType {
  return CHECK_OUT_STATUS_CODES.has(statusCode) ? "salida" : "entrada";
}

export interface ParsedAttlogRecord {
  identificador: string; // PIN configurado en el checador
  fechaHora:     string; // "YYYY-MM-DD HH:mm:ss"
  tipo:          AttendanceEventType;
}

/**
 * Parsea el body de un POST .../iclock/cdata?table=ATTLOG.
 * Cada línea reportada por el checador viene tab-separada:
 * PIN\tDateTime\tStatus\tVerify\tWorkCode\t...
 */
export function parseAttlogBody(body: string): ParsedAttlogRecord[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter(([pin, dateTime]) => Boolean(pin) && Boolean(dateTime))
    .map(([pin, dateTime, status]) => ({
      identificador: pin,
      fechaHora: dateTime.replace("T", " ").slice(0, 19),
      tipo: resolveEventType(status ?? "0"),
    }));
}

/**
 * Resuelve el SN recibido en el handshake/POST contra RH.checadores. Devuelve
 * el id_checador si existe y está activo (status = 1); null si no se reconoce
 * o está dado de baja — nunca se auto-registra un checador desconocido.
 */
export async function resolveChecadorBySN(sn: string): Promise<number | null> {
  const rows = await db.queryParams(
    `SELECT [id_checador]
       FROM [RH].[checadores]
      WHERE [sn] = @sn AND [status] = 1`,
    { sn },
  );
  return rows.length > 0 ? (rows[0].id_checador as number) : null;
}

/**
 * Inserta las checadas ya parseadas en RH.asistencias, resolviendo cada PIN
 * contra RH.empleado_identificadores por (id_checador, identificador) — el mismo
 * PIN puede pertenecer a empleados distintos en checadores distintos. Un PIN no
 * reconocido en ESE checador se ignora (solo se loguea) para no romper el ack
 * que espera el dispositivo ni tumbar el resto del lote.
 */
export async function saveAttendanceRecords(
  records: ParsedAttlogRecord[],
  idChecador: number,
): Promise<void> {
  for (const record of records) {
    const empleado = await db.queryParams(
      `SELECT [id_empleado]
         FROM [RH].[empleado_identificadores]
        WHERE [id_checador] = @id_checador AND [identificador] = @identificador AND [status] = 1`,
      { id_checador: idChecador, identificador: record.identificador },
    );

    if (empleado.length === 0) {
      console.warn(
        `[asistencias] PIN no reconocido en el checador ${idChecador}: ${record.identificador}`,
      );
      continue;
    }

    await db.queryParams(
      `INSERT INTO [RH].[asistencias]
         ([id_empleado], [id_checador], [fecha_hora], [tipo], [identificador_origen], [created_at])
       VALUES (@id_empleado, @id_checador, @fecha_hora, @tipo, @identificador, @created_at)`,
      {
        id_empleado: empleado[0].id_empleado,
        id_checador: idChecador,
        fecha_hora: toDBString(record.fechaHora),
        tipo: record.tipo,
        identificador: record.identificador,
        created_at: buildDate(new Date()),
      },
    );
  }
}
