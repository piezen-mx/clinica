"use server";

import db from "@/database/connection";
import { IAuthUser } from "@/interfaces/auth";
import { IEmployeeIdentifierListItem } from "@/interfaces/asistencia";
import { IChecadorListItem } from "@/interfaces/checador";
import { getEmployeeById } from "@/app/dashboard/empleados/actions";
import { buildDate } from "@/utils/date_helpper";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

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
