"use server";

import db from "@/database/connection";
import { ICatState, ISucursal, ISucursalCalendario } from "@/interfaces/sucursal";
import { IChecador, ChecadorFormInput } from "@/interfaces/checador";
import { IAuthUser } from "@/interfaces/auth";
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

export async function getStates(): Promise<ICatState[]> {
  const data = await db.queryParams(
    `SELECT [id_state], [string_key], [description], [state_key], [status]
       FROM [CentroPodologico].[dbo].[Cat_states]
      WHERE [status] = 1`,
    {}
  );
  return data as ICatState[];
}

export async function getSucursales(): Promise<ISucursal[]> {
  const { id_empresa } = await getActiveUser();
  const data = await db.queryParams(
    `SELECT s.[id_sucursal],
            s.[id_empresa],
            s.[nombre],
            s.[ciudad],
            s.[direccion],
            s.[telefono],
            s.[activo],
            CONVERT(varchar(19), s.[created_at], 120) AS created_at,
            s.[status],
            s.[id_state],
            s.[id_calendar],
            s.link_calendar,
            s.iframe,
            s.[seats],
            cs.[description] AS estado
       FROM [CentroPodologico].[dbo].[sucursales] s
       LEFT JOIN [CentroPodologico].[dbo].[Cat_states] cs
         ON cs.[id_state] = s.[id_state]
      WHERE s.[status] = 1
        AND s.[id_empresa] = @id_empresa`,
    { id_empresa }
  );
  return data as ISucursal[];
}

export async function saveSucursal(
  form: Pick<ISucursal, "id_sucursal" | "nombre" | "ciudad" | "direccion" | "telefono" | "id_state" | "id_calendar" | "link_calendar" | "iframe" | "seats">
): Promise<{ ok: boolean; message?: string }> {
  try {
    const { id_sucursal, nombre, ciudad, direccion, telefono, id_state, seats } = form;
    const { id_empresa } = await getActiveUser();

    if (id_sucursal === 0) {
      await db.queryParams(
        `INSERT INTO [CentroPodologico].[dbo].[sucursales]
           ([id_sucursal], [id_empresa], [nombre], [ciudad], [direccion], [telefono], [activo], [created_at], [status], [id_state], [id_calendar], [link_calendar], [iframe], [seats])
         VALUES (
           (SELECT ISNULL(MAX([id_sucursal]), 0) + 1 FROM [CentroPodologico].[dbo].[sucursales]),
           @id_empresa, @nombre, @ciudad, @direccion, @telefono, 1, @created_at, 1, @id_state, @id_calendar, @link_calendar, @iframe, @seats
         )`,
        {
          id_empresa,
          nombre,
          ciudad: ciudad ?? null,
          direccion: direccion ?? null,
          telefono: telefono ?? null,
          created_at: buildDate(new Date()),
          id_state: id_state ?? null,
          id_calendar: form.id_calendar ?? null,
          link_calendar: form.link_calendar ?? null,
          iframe: form.iframe ?? null,
          seats: seats ?? null,
        }
      );
    } else {
      await db.queryParams(
        `UPDATE [CentroPodologico].[dbo].[sucursales]
            SET [nombre]    = @nombre,
                [ciudad]    = @ciudad,
                [direccion] = @direccion,
                [telefono]  = @telefono,
                [id_state]  = @id_state,
                [id_calendar] = @id_calendar,
                [link_calendar] = @link_calendar,
                [iframe] = @iframe,
                [seats] = @seats
          WHERE [id_sucursal] = @id_sucursal `,
        { id_sucursal, nombre, ciudad: ciudad ?? null, direccion: direccion ?? null, telefono: telefono ?? null, id_state: id_state ?? null, id_calendar: form.id_calendar ?? null, link_calendar: form.link_calendar ?? null, iframe: form.iframe ?? null, seats: seats ?? null }
      );
    }

    revalidatePath("/dashboard/sucursales");
    return { ok: true };
  } catch {
    return { ok: false, message: "Error al guardar la sucursal" };
  }
}

export async function deleteSucursal(
  id_sucursal: number
): Promise<{ ok: boolean; message?: string }> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[sucursales]
          SET [status] = 0
        WHERE [id_sucursal] = @id_sucursal`,
      { id_sucursal }
    );
    revalidatePath("/dashboard/sucursales");
    return { ok: true };
  } catch {
    return { ok: false, message: "Error al eliminar la sucursal" };
  }
}

export async function getSucursalCalendarios(
  id_sucursal: number
): Promise<ISucursalCalendario[]> {
  const data = await db.queryParams(
    `SELECT [id_sucursal_calendario],
            [id_sucursal],
            [nombre],
            [id_calendar],
            [iframe],
            [link_calendar],
            [status],
            CONVERT(varchar(19), [created_at], 120) AS created_at
       FROM [CentroPodologico].[dbo].[sucursal_calendarios]
      WHERE [id_sucursal] = @id_sucursal
        AND [status] = 1
      ORDER BY [id_sucursal_calendario]`,
    { id_sucursal }
  );
  return data as ISucursalCalendario[];
}

export async function saveSucursalCalendario(
  form: Pick<ISucursalCalendario, "id_sucursal_calendario" | "id_sucursal" | "nombre" | "id_calendar" | "iframe" | "link_calendar">
): Promise<{ ok: boolean; message?: string }> {
  try {
    const { id_sucursal_calendario, id_sucursal, nombre, id_calendar, iframe, link_calendar } = form;

    if (id_sucursal_calendario === 0) {
      await db.queryParams(
        `INSERT INTO [CentroPodologico].[dbo].[sucursal_calendarios]
           ([id_sucursal_calendario], [id_sucursal], [nombre], [id_calendar], [iframe], [link_calendar], [status], [created_at])
         VALUES (
           (SELECT ISNULL(MAX([id_sucursal_calendario]), 0) + 1 FROM [CentroPodologico].[dbo].[sucursal_calendarios]),
           @id_sucursal, @nombre, @id_calendar, @iframe, @link_calendar, 1, @created_at
         )`,
        {
          id_sucursal,
          nombre,
          id_calendar: id_calendar ?? null,
          iframe: iframe ?? null,
          link_calendar: link_calendar ?? null,
          created_at: buildDate(new Date()),
        }
      );
    } else {
      await db.queryParams(
        `UPDATE [CentroPodologico].[dbo].[sucursal_calendarios]
            SET [nombre]        = @nombre,
                [id_calendar]   = @id_calendar,
                [iframe]        = @iframe,
                [link_calendar] = @link_calendar
          WHERE [id_sucursal_calendario] = @id_sucursal_calendario`,
        {
          id_sucursal_calendario,
          nombre,
          id_calendar: id_calendar ?? null,
          iframe: iframe ?? null,
          link_calendar: link_calendar ?? null,
        }
      );
    }

    revalidatePath("/dashboard/sucursales");
    revalidatePath("/dashboard/citas");
    return { ok: true };
  } catch {
    return { ok: false, message: "Error al guardar el calendario" };
  }
}

export async function deleteSucursalCalendario(
  id_sucursal_calendario: number
): Promise<{ ok: boolean; message?: string }> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[sucursal_calendarios]
          SET [status] = 0
        WHERE [id_sucursal_calendario] = @id_sucursal_calendario`,
      { id_sucursal_calendario }
    );
    revalidatePath("/dashboard/sucursales");
    revalidatePath("/dashboard/citas");
    return { ok: true };
  } catch {
    return { ok: false, message: "Error al eliminar el calendario" };
  }
}

/** Returns the sucursales this user is allowed to see/select.
 *  Roles 1 and 4 → all active sucursales of the empresa.
 *  Other roles   → only the ones listed in sucursales_string. */
export async function getSucursalesForUser(): Promise<ISucursal[]> {
  const user = await getActiveUser();
  const { id_empresa, id_role, sucursales_string } = user;

  const isAdmin = id_role === 1 || id_role === 4;

  if (isAdmin) {
    const data = await db.queryParams(
      `SELECT s.[id_sucursal],
              s.[id_empresa],
              s.[nombre],
              s.[ciudad],
              s.[direccion],
              s.[telefono],
              s.[activo],
              CONVERT(varchar(19), s.[created_at], 120) AS created_at,
              s.[status],
              s.[id_state],
              s.[id_calendar],
              s.[link_calendar],
              s.[iframe],
              s.[seats],
              cs.[description] AS estado
         FROM [CentroPodologico].[dbo].[sucursales] s
         LEFT JOIN [CentroPodologico].[dbo].[Cat_states] cs
           ON cs.[id_state] = s.[id_state]
        WHERE s.[status] = 1
          AND s.[id_empresa] = @id_empresa`,
      { id_empresa }
    );
   
    return data as ISucursal[];
  }

  // Parse the comma-separated ids; if empty return empty list
  const ids = (sucursales_string ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0);

  if (ids.length === 0) return [];

  const placeholders = ids.map((_, i) => `@id${i}`).join(", ");
  const params: Record<string, number | string> = { id_empresa };
  ids.forEach((id, i) => { params[`id${i}`] = id; });

  const data = await db.queryParams(
    `SELECT s.[id_sucursal],
            s.[id_empresa],
            s.[nombre],
            s.[ciudad],
            s.[direccion],
            s.[telefono],
            s.[activo],
            CONVERT(varchar(19), s.[created_at], 120) AS created_at,
            s.[status],
            s.[id_state],
            s.[id_calendar],
            s.[link_calendar],
            s.[iframe],
            s.[seats],
            cs.[description] AS estado
       FROM [CentroPodologico].[dbo].[sucursales] s
       LEFT JOIN [CentroPodologico].[dbo].[Cat_states] cs
         ON cs.[id_state] = s.[id_state]
      WHERE s.[status] = 1
        AND s.[id_empresa] = @id_empresa
        AND s.[id_sucursal] IN (${placeholders})`,
    params
  );
  return data as ISucursal[];
}

/** Stores the user's selected sucursal in a short-lived cookie. */
export async function setSelectedSucursal(
  id_sucursal: number
): Promise<void> {
  const user = await getActiveUser();
  const allowed = await getSucursalesForUser();
  const isAllowed = allowed.some((s) => s.id_sucursal === id_sucursal);
  if (!isAllowed) return; // silently ignore invalid selections

  const cookieStore = await cookies();
  cookieStore.set("sel_sucursal", String(id_sucursal), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    path:     "/",
    maxAge:   60 * 60 * 24 * 7,
  });

  void user; // used indirectly via getActiveUser guard
}

export async function getChecadores(id_sucursal: number): Promise<IChecador[]> {
  const { id_empresa } = await getActiveUser();
  const data = await db.queryParams(
    `SELECT c.[id_checador],
            c.[sn],
            c.[id_sucursal],
            c.[nombre],
            c.[activo],
            c.[status],
            CONVERT(varchar(19), c.[created_at], 120) AS created_at
       FROM [CentroPodologico].[RH].[checadores] c
       JOIN [CentroPodologico].[dbo].[sucursales] s ON s.[id_sucursal] = c.[id_sucursal]
      WHERE c.[id_sucursal] = @id_sucursal
        AND c.[status] = 1
        AND s.[id_empresa] = @id_empresa
      ORDER BY c.[id_checador]`,
    { id_sucursal, id_empresa }
  );
  return data as IChecador[];
}

export async function saveChecador(
  input: ChecadorFormInput & { id_checador?: number }
): Promise<ActionResult<number>> {
  try {
    const { sn, id_sucursal, nombre, id_checador } = input;
    const { id_empresa } = await getActiveUser();

    // La sucursal debe pertenecer a la empresa del usuario.
    const sucursal = await db.queryParams(
      `SELECT [id_sucursal] FROM [CentroPodologico].[dbo].[sucursales]
        WHERE [id_sucursal] = @id_sucursal AND [id_empresa] = @id_empresa`,
      { id_sucursal, id_empresa }
    );
    if (sucursal.length === 0) {
      return { ok: false, message: "La sucursal no pertenece a tu empresa" };
    }

    // El SN debe ser único entre todos los checadores (de cualquier sucursal), salvo el propio al editar.
    const existing = await db.queryParams(
      `SELECT [id_checador] FROM [CentroPodologico].[RH].[checadores]
        WHERE [sn] = @sn AND [id_checador] <> @id_checador`,
      { sn, id_checador: id_checador ?? 0 }
    );
    if (existing.length > 0) {
      return { ok: false, message: "Ese número de serie (SN) ya está en uso por otro checador" };
    }

    if (!id_checador) {
      const inserted = await db.queryParams(
        `INSERT INTO [CentroPodologico].[RH].[checadores]
           ([sn], [id_sucursal], [nombre], [activo], [status], [created_at])
         OUTPUT INSERTED.[id_checador]
         VALUES (@sn, @id_sucursal, @nombre, 1, 1, @created_at)`,
        { sn, id_sucursal, nombre, created_at: buildDate(new Date()) }
      );
      const newId = (inserted[0] as { id_checador: number }).id_checador;
      revalidatePath("/dashboard/sucursales");
      return { ok: true, data: newId };
    }

    await db.queryParams(
      `UPDATE [CentroPodologico].[RH].[checadores]
          SET [sn] = @sn, [id_sucursal] = @id_sucursal, [nombre] = @nombre
        WHERE [id_checador] = @id_checador`,
      { sn, id_sucursal, nombre, id_checador }
    );
    revalidatePath("/dashboard/sucursales");
    return { ok: true, data: id_checador };
  } catch {
    return { ok: false, message: "Error al guardar el checador" };
  }
}

export async function deactivateChecador(id_checador: number): Promise<ActionResult<null>> {
  try {
    const { id_empresa } = await getActiveUser();
    await db.queryParams(
      `UPDATE c
          SET c.[status] = 0
         FROM [CentroPodologico].[RH].[checadores] c
         JOIN [CentroPodologico].[dbo].[sucursales] s ON s.[id_sucursal] = c.[id_sucursal]
        WHERE c.[id_checador] = @id_checador
          AND s.[id_empresa] = @id_empresa`,
      { id_checador, id_empresa }
    );
    revalidatePath("/dashboard/sucursales");
    return { ok: true, data: null };
  } catch {
    return { ok: false, message: "Error al dar de baja el checador" };
  }
}
