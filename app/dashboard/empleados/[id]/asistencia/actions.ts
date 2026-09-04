"use server";

import db from "@/database/connection";
import { IAuthUser } from "@/interfaces/auth";
import {
  IAttendanceDayState,
  IAttendanceEvent,
  IAttendanceEventListItem,
  IAttendanceEventsPage,
  IAttendanceSummary,
  IEmployeeIdentifierListItem,
} from "@/interfaces/asistencia";
import { IChecadorListItem } from "@/interfaces/checador";
import { getEmployeeById } from "@/app/dashboard/empleados/actions";
import { buildDate } from "@/utils/date_helpper";
import { summarizeAttendanceEvents } from "./attendancePairing";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const ATTENDANCE_PAGE_SIZE = 15;

/** Expande "YYYY-MM" al primer y último día calendario de ese mes, como "YYYY-MM-DD". */
function expandMonthToDateRange(mes: string): { firstDay: string; lastDay: string } {
  const [yearStr, monthStr] = mes.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    firstDay: `${yearStr}-${monthStr}-01`,
    lastDay: `${yearStr}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`,
  };
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET_SEED!);

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

async function getActiveUser(): Promise<IAuthUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) throw new Error("No autenticado");
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as IAuthUser;
}

/** Checadores activos de cualquier sucursal, para el <select> del alta de identificador.
 *  No se filtra por sucursal del empleado: un empleado puede fichar en un checador de otra
 *  sucursal (cobertura entre sucursales, suplencias). */
export async function getChecadoresActivos(): Promise<IChecadorListItem[]> {
  const data = await db.queryParams(
    `SELECT c.[id_checador],
            c.[sn],
            c.[id_sucursal],
            c.[nombre],
            c.[activo],
            c.[status],
            CONVERT(varchar(19), c.[created_at], 120) AS created_at,
            s.[nombre] AS nombre_sucursal
       FROM [CentroPodologico].[RH].[checadores] c
       JOIN [CentroPodologico].[dbo].[sucursales] s ON s.[id_sucursal] = c.[id_sucursal]
      WHERE c.[status] = 1
      ORDER BY s.[nombre], c.[nombre]`,
    {}
  );
  return data as IChecadorListItem[];
}

export async function getEmployeeIdentifiers(
  id_empleado: number
): Promise<IEmployeeIdentifierListItem[]> {
  const employee = await getEmployeeById(id_empleado);
  if (!employee) return [];

  const data = await db.queryParams(
    `SELECT ei.[id_empleado_identificador],
            ei.[id_empleado],
            ei.[id_checador],
            ei.[identificador],
            ei.[tipo],
            ei.[status],
            CONVERT(varchar(19), ei.[created_at], 120) AS created_at,
            c.[nombre] AS nombre_checador,
            s.[nombre] AS nombre_sucursal
       FROM [CentroPodologico].[RH].[empleado_identificadores] ei
       JOIN [CentroPodologico].[RH].[checadores] c ON c.[id_checador] = ei.[id_checador]
       JOIN [CentroPodologico].[dbo].[sucursales] s ON s.[id_sucursal] = c.[id_sucursal]
      WHERE ei.[id_empleado] = @id_empleado
        AND ei.[status] = 1
      ORDER BY ei.[created_at]`,
    { id_empleado }
  );
  return data as IEmployeeIdentifierListItem[];
}

export async function saveEmployeeIdentifier(input: {
  id_empleado: number;
  id_checador: number;
  identificador: string;
  tipo: "huella" | "tarjeta" | "otro";
}): Promise<ActionResult<number>> {
  try {
    const { id_empleado, id_checador, tipo } = input;
    const identificador = input.identificador.trim();

    const employee = await getEmployeeById(id_empleado);
    if (!employee) return { ok: false, message: "El empleado no existe o no pertenece a tu sucursal" };

    if (!identificador) return { ok: false, message: "Debes capturar el identificador (PIN)" };

    const checador = await db.queryParams(
      `SELECT [id_checador] FROM [CentroPodologico].[RH].[checadores]
        WHERE [id_checador] = @id_checador AND [status] = 1`,
      { id_checador }
    );
    if (checador.length === 0) {
      return { ok: false, message: "El checador seleccionado no existe o está inactivo" };
    }

    // El UNIQUE de BD es (id_checador, identificador) sin filtrar por status, así que se valida
    // igual aquí para dar un mensaje claro (una baja lógica no libera el par para reuso).
    const existing = await db.queryParams(
      `SELECT [id_empleado_identificador] FROM [CentroPodologico].[RH].[empleado_identificadores]
        WHERE [id_checador] = @id_checador AND [identificador] = @identificador`,
      { id_checador, identificador }
    );
    if (existing.length > 0) {
      return { ok: false, message: "Ese PIN ya está asignado en este checador" };
    }

    const inserted = await db.queryParams(
      `INSERT INTO [CentroPodologico].[RH].[empleado_identificadores]
         ([id_empleado],[id_checador],[identificador],[tipo],[status],[created_at])
       OUTPUT INSERTED.[id_empleado_identificador]
       VALUES (@id_empleado,@id_checador,@identificador,@tipo,1,@created_at)`,
      { id_empleado, id_checador, identificador, tipo, created_at: buildDate(new Date()) }
    );

    const newId = (inserted[0] as { id_empleado_identificador: number }).id_empleado_identificador;
    revalidatePath(`/dashboard/empleados/${id_empleado}/asistencia`);
    return { ok: true, data: newId };
  } catch {
    return { ok: false, message: "Error al guardar el identificador" };
  }
}

export async function deactivateEmployeeIdentifier(
  id_empleado_identificador: number
): Promise<ActionResult<null>> {
  try {
    const row = await db.queryParams(
      `SELECT [id_empleado] FROM [CentroPodologico].[RH].[empleado_identificadores]
        WHERE [id_empleado_identificador] = @id_empleado_identificador`,
      { id_empleado_identificador }
    );
    if (row.length === 0) return { ok: false, message: "El identificador no existe" };

    const id_empleado = (row[0] as { id_empleado: number }).id_empleado;
    const employee = await getEmployeeById(id_empleado);
    if (!employee) return { ok: false, message: "No tienes acceso a este empleado" };

    await db.queryParams(
      `UPDATE [CentroPodologico].[RH].[empleado_identificadores]
          SET [status] = 0
        WHERE [id_empleado_identificador] = @id_empleado_identificador`,
      { id_empleado_identificador }
    );

    revalidatePath(`/dashboard/empleados/${id_empleado}/asistencia`);
    return { ok: true, data: null };
  } catch {
    return { ok: false, message: "Error al dar de baja el identificador" };
  }
}

/** Página de checadas del empleado en el rango [desde, hasta] (inclusivo del día hasta completo). */
export async function getEmployeeAttendanceEvents(input: {
  id_empleado: number;
  desde: string;
  hasta: string;
  pagina: number;
}): Promise<IAttendanceEventsPage> {
  const { id_empleado, desde, hasta, pagina } = input;
  const employee = await getEmployeeById(id_empleado);
  if (!employee) return { events: [], total: 0 };

  const offset = (pagina - 1) * ATTENDANCE_PAGE_SIZE;

  const events = await db.queryParams(
    `SELECT a.[id_asistencia],
            a.[id_empleado],
            a.[id_checador],
            CONVERT(varchar(19), a.[fecha_hora], 120) AS fecha_hora,
            a.[tipo],
            a.[identificador_origen],
            CONVERT(varchar(19), a.[created_at], 120) AS created_at,
            c.[nombre] AS nombre_checador,
            s.[nombre] AS nombre_sucursal
       FROM [CentroPodologico].[RH].[asistencias] a
       JOIN [CentroPodologico].[RH].[checadores] c ON c.[id_checador] = a.[id_checador]
       JOIN [CentroPodologico].[dbo].[sucursales] s ON s.[id_sucursal] = c.[id_sucursal]
      WHERE a.[id_empleado] = @id_empleado
        AND a.[fecha_hora] >= @desde
        AND a.[fecha_hora] < DATEADD(day, 1, @hasta)
      ORDER BY a.[fecha_hora] DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
    { id_empleado, desde, hasta, offset, pageSize: ATTENDANCE_PAGE_SIZE }
  );

  const totalResult = await db.queryParams(
    `SELECT COUNT(*) AS total
       FROM [CentroPodologico].[RH].[asistencias] a
      WHERE a.[id_empleado] = @id_empleado
        AND a.[fecha_hora] >= @desde
        AND a.[fecha_hora] < DATEADD(day, 1, @hasta)`,
    { id_empleado, desde, hasta }
  );

  return {
    events: events as IAttendanceEventListItem[],
    total: (totalResult[0] as { total: number }).total,
  };
}

/** Métricas de las 4 tarjetas de resumen, calculadas sobre todo el rango (no la página). */
export async function getEmployeeAttendanceSummary(input: {
  id_empleado: number;
  desde: string;
  hasta: string;
}): Promise<IAttendanceSummary> {
  const { id_empleado, desde, hasta } = input;
  const employee = await getEmployeeById(id_empleado);
  if (!employee) {
    return { attended_days: 0, total_events: 0, registered_hours: 0, incomplete_days: 0 };
  }

  const events = await db.queryParams(
    `SELECT a.[id_asistencia],
            a.[id_empleado],
            a.[id_checador],
            CONVERT(varchar(19), a.[fecha_hora], 120) AS fecha_hora,
            a.[tipo],
            a.[identificador_origen],
            CONVERT(varchar(19), a.[created_at], 120) AS created_at
       FROM [CentroPodologico].[RH].[asistencias] a
      WHERE a.[id_empleado] = @id_empleado
        AND a.[fecha_hora] >= @desde
        AND a.[fecha_hora] < DATEADD(day, 1, @hasta)
      ORDER BY a.[fecha_hora] ASC`,
    { id_empleado, desde, hasta }
  );

  const summary = summarizeAttendanceEvents(events as IAttendanceEvent[]);
  return {
    attended_days: summary.attended_days,
    total_events: summary.total_events,
    registered_hours: summary.registered_hours,
    incomplete_days: summary.incomplete_days,
  };
}

/** Estado (completo/incompleto) por día del mes visible, para los puntos del calendario. */
export async function getEmployeeAttendanceMonthStates(input: {
  id_empleado: number;
  mes: string;
}): Promise<IAttendanceDayState[]> {
  const { id_empleado, mes } = input;
  const employee = await getEmployeeById(id_empleado);
  if (!employee) return [];

  const { firstDay, lastDay } = expandMonthToDateRange(mes);

  const events = await db.queryParams(
    `SELECT a.[id_asistencia],
            a.[id_empleado],
            a.[id_checador],
            CONVERT(varchar(19), a.[fecha_hora], 120) AS fecha_hora,
            a.[tipo],
            a.[identificador_origen],
            CONVERT(varchar(19), a.[created_at], 120) AS created_at
       FROM [CentroPodologico].[RH].[asistencias] a
      WHERE a.[id_empleado] = @id_empleado
        AND a.[fecha_hora] >= @firstDay
        AND a.[fecha_hora] < DATEADD(day, 1, @lastDay)
      ORDER BY a.[fecha_hora] ASC`,
    { id_empleado, firstDay, lastDay }
  );

  const summary = summarizeAttendanceEvents(events as IAttendanceEvent[]);
  return Array.from(summary.dayStatuses, ([fecha, status]) => ({ fecha, status }));
}
