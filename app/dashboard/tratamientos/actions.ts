"use server";

import db from "@/database/connection";
import { ITratamientoOnicomicosis, ITratamientoOnicomicosisListRow } from "@/interfaces/tratamiento_onicomicosis";
import { IConsulta } from "@/interfaces/consulta";
import { IAuthUser } from "@/interfaces/auth";
import { buildDate, toDBString } from "@/utils/date_helpper";
import { applyConsultationConsumption } from "@/lib/inventory/consultationConsumption";
import { createWebId } from "@/utils/random";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET_SEED!);

async function getActiveUser(): Promise<IAuthUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) throw new Error("No autenticado");
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as IAuthUser;
}

export async function getTratamientos(
  id_sucursal: number,
  id_especialista?: number
): Promise<ITratamientoOnicomicosisListRow[]> {
  const { id_empresa } = await getActiveUser();
  const especialistaFilter = id_especialista != null
    ? `AND t.[id_especialista] = @id_especialista AND t.[id_stage]<5`
    : ``;
  const data = await db.queryParams(
    `SELECT TOP 15 t.[id_tratamiento],
            t.[id_consulta],
            t.[id_stage],
            CONVERT(varchar(19), t.[created_at], 120) AS created_at,
            LTRIM(RTRIM(
              p.[nombre] + ' ' + p.[apellido_paterno]
              + CASE WHEN p.[apellido_materno] IS NOT NULL AND p.[apellido_materno] <> ''
                     THEN ' ' + p.[apellido_materno] ELSE '' END
            )) AS nombre_paciente,
            ISNULL(e.[nombre], '—') AS nombre_especialista,
            ISNULL(u.[nombre], '—') AS nombre_usuario,
            ISNULL(s.[name], '—') AS nombre_stage,
            ISNULL(t.[new_message], 0)  AS new_message,
            t.[message],
            (SELECT COUNT(*) FROM [CentroPodologico].[dbo].[consultas] WHERE [id_tratamiento] = t.[id_tratamiento] and [cancelada] is null) AS num_consultas,
            isnull((select 
                    top 1
                    es.name
                    from dbo.egresos DE
                    left join dbo.egreso_stages ES on ES.id_egreso_stage=DE.id_egreso_stage
                    where id_tabla_referencia=t.id_tratamiento
                    order by de.created_at desc),'Por pagar') pago_especialista,
            p.[whatsapp] AS whatsapp_paciente
       FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis] t
 INNER JOIN [CentroPodologico].[dbo].[consultas] c
         ON c.[id_consulta] = t.[id_consulta]
        AND c.[id_sucursal] = @id_sucursal
        AND c.[id_empresa]  = @id_empresa
 INNER JOIN [CentroPodologico].[dbo].[pacientes] p
         ON p.[id_paciente] = c.[id_paciente]
  LEFT JOIN [CentroPodologico].[dbo].[users] e
         ON e.[id_user] = t.[id_especialista]
  LEFT JOIN [CentroPodologico].[dbo].[users] u
         ON u.[id_user] = t.[id_usuario]
  LEFT JOIN [CentroPodologico].[dbo].[Tratamiento_onicomicosis_stages] s
         ON s.[id_stage] = t.[id_stage]
      WHERE 1=1
        ${especialistaFilter}
      ORDER BY t.[created_at] DESC`,
    { id_sucursal, id_empresa, ...(id_especialista != null ? { id_especialista } : {}) }
  );
  return data as ITratamientoOnicomicosisListRow[];
}

export async function searchTratamientos(
  id_sucursal: number,
  q: string,
  id_especialista?: number
): Promise<ITratamientoOnicomicosisListRow[]> {
  const { id_empresa } = await getActiveUser();
  const especialistaFilter = id_especialista != null
    ? `AND t.[id_especialista] = @id_especialista AND t.[id_stage]<5`
    : ``;
  const data = await db.queryParams(
    `SELECT t.[id_tratamiento],
            t.[id_consulta],
            t.[id_stage],
            CONVERT(varchar(19), t.[created_at], 120) AS created_at,
            LTRIM(RTRIM(
              p.[nombre] + ' ' + p.[apellido_paterno]
              + CASE WHEN p.[apellido_materno] IS NOT NULL AND p.[apellido_materno] <> ''
                     THEN ' ' + p.[apellido_materno] ELSE '' END
            )) AS nombre_paciente,
            ISNULL(e.[nombre], '—') AS nombre_especialista,
            ISNULL(u.[nombre], '—') AS nombre_usuario,
            ISNULL(s.[name], '—') AS nombre_stage,
            ISNULL(t.[new_message], 0)  AS new_message,
            t.[message],
            (SELECT COUNT(*) FROM [CentroPodologico].[dbo].[consultas] WHERE [id_tratamiento] = t.[id_tratamiento] and [cancelada] is null) AS num_consultas,
            p.[whatsapp] AS whatsapp_paciente
       FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis] t
 INNER JOIN [CentroPodologico].[dbo].[consultas] c
         ON c.[id_consulta] = t.[id_consulta]
        AND c.[id_sucursal] = @id_sucursal
        AND c.[id_empresa]  = @id_empresa
 INNER JOIN [CentroPodologico].[dbo].[pacientes] p
         ON p.[id_paciente] = c.[id_paciente]
  LEFT JOIN [CentroPodologico].[dbo].[users] e
         ON e.[id_user] = t.[id_especialista]
  LEFT JOIN [CentroPodologico].[dbo].[users] u
         ON u.[id_user] = t.[id_usuario]
  LEFT JOIN [CentroPodologico].[dbo].[Tratamiento_onicomicosis_stages] s
         ON s.[id_stage] = t.[id_stage]
      WHERE (
        LTRIM(RTRIM(
          p.[nombre] + ' ' + p.[apellido_paterno]
          + CASE WHEN p.[apellido_materno] IS NOT NULL AND p.[apellido_materno] <> ''
                 THEN ' ' + p.[apellido_materno] ELSE '' END
        )) LIKE '%' + @q + '%'
        OR ISNULL(e.[nombre], '') LIKE '%' + @q + '%'
        OR ISNULL(p.[whatsapp], '') LIKE '%' + @q + '%'
      )
        AND c.[id_sucursal] = @id_sucursal
        AND c.[id_empresa]  = @id_empresa
        ${especialistaFilter}
      ORDER BY t.[created_at] DESC`,
    { id_sucursal, id_empresa, q, ...(id_especialista != null ? { id_especialista } : {}) }
  );
  return data as ITratamientoOnicomicosisListRow[];
}

export async function getTratamiento(
  id_tratamiento: number
): Promise<ITratamientoOnicomicosis | null> {
  const data = await db.queryParams(
    `SELECT t.[id_tratamiento],
            t.[id_consulta],
            t.[peso],
            t.[talla],
            t.[altura],
            t.[antecedentes_cronicos],
            t.[antecedentes_hepaticos],
            t.[alergias],
            t.[medicacion_actual],
            CONVERT(varchar(19), t.[created_at], 120) AS created_at,
            t.[id_stage],
            t.[id_usuario],
            t.[id_especialista]
       FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis] t
      WHERE t.[id_tratamiento] = @id_tratamiento`,
    { id_tratamiento }
  );
  const rows = data as ITratamientoOnicomicosis[];
  return rows[0] ?? null;
}

export async function getTratamientoDetalle(
  id_tratamiento: number
): Promise<(ITratamientoOnicomicosis & {
  nombre_paciente:     string;
  nombre_especialista: string;
  nombre_usuario:      string;
  nombre_stage:        string;
  nombre_sucursal:     string | null;
  id_paciente:         number;
  id_podologo:         number;
  id_sucursal:         number;
  whatsapp:            string | null;
  phone_code:          string | null;
  edad_paciente:       number | null;
}) | null> {
  const data = await db.queryParams(
    `SELECT t.[id_tratamiento],
            t.[id_consulta],
            t.[peso],
            t.[talla],
            t.[altura],
            t.[antecedentes_cronicos],
            t.[antecedentes_hepaticos],
            t.[alergias],
            t.[medicacion_actual],
            CONVERT(varchar(19), t.[created_at], 120) AS created_at,
            t.[id_stage],
            t.[id_usuario],
            t.[id_especialista],
            ISNULL(t.[new_message], 0) AS new_message,
            t.[message],
            c.[id_paciente] AS id_paciente,
            c.[id_podologo] AS id_podologo,
            c.[id_sucursal] AS id_sucursal,
            LTRIM(RTRIM(
              p.[nombre] + ' ' + p.[apellido_paterno]
              + CASE WHEN p.[apellido_materno] IS NOT NULL AND p.[apellido_materno] <> ''
                     THEN ' ' + p.[apellido_materno] ELSE '' END
            )) AS nombre_paciente,
            ISNULL(e.[nombre], '—') AS nombre_especialista,
            ISNULL(u.[nombre], '—') AS nombre_usuario,
            ISNULL(s.[name], '—') AS nombre_stage,
            p.[whatsapp]   AS whatsapp,
            pc.[id_phone_code]      AS phone_code,
            DATEDIFF(YEAR, p.[fecha_nacimiento], GETDATE())
              - CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, p.[fecha_nacimiento], GETDATE()), p.[fecha_nacimiento]) > GETDATE() THEN 1 ELSE 0 END AS edad_paciente,
            ISNULL(suc.[nombre], NULL) AS nombre_sucursal
       FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis] t
 INNER JOIN [CentroPodologico].[dbo].[consultas] c
         ON c.[id_consulta] = t.[id_consulta]
 INNER JOIN [CentroPodologico].[dbo].[pacientes] p
         ON p.[id_paciente] = c.[id_paciente]
  LEFT JOIN [CentroPodologico].[dbo].[users] e
         ON e.[id_user] = t.[id_especialista]
  LEFT JOIN [CentroPodologico].[dbo].[users] u
         ON u.[id_user] = t.[id_usuario]
  LEFT JOIN [CentroPodologico].[dbo].[Tratamiento_onicomicosis_stages] s
         ON s.[id_stage] = t.[id_stage]
  LEFT JOIN [CentroPodologico].[dbo].[codigos_telefonicos] pc
         ON pc.[id_phone_code] = p.[id_phone_code]
  LEFT JOIN [CentroPodologico].[dbo].[sucursales] suc
         ON suc.[id_sucursal] = c.[id_sucursal]
      WHERE t.[id_tratamiento] = @id_tratamiento`,
    { id_tratamiento }
  );
  const rows = data as (ITratamientoOnicomicosis & {
    nombre_paciente:     string;
    nombre_especialista: string;
    nombre_usuario:      string;
    nombre_stage:        string;
    nombre_sucursal:     string | null;
    id_paciente:         number;
    id_podologo:         number;
    id_sucursal:         number;
    whatsapp:            string | null;
    phone_code:          string | null;
    edad_paciente:       number | null;
  })[];
  return rows[0] ?? null;
}

export async function markTratamientoRevisado(
  id_tratamiento: number
): Promise<void> {
  await db.queryParams(
    `UPDATE [CentroPodologico].[dbo].[Tratamiento_onicomicosis]
        SET [new_message] = 0,
            [message]     = ''
      WHERE [id_tratamiento] = @id_tratamiento`,
    { id_tratamiento }
  );
}

export async function updateTratamientoStage(
  id_tratamiento: number,
  id_stage: number
): Promise<void> {
  await db.queryParams(
    `UPDATE [CentroPodologico].[dbo].[Tratamiento_onicomicosis]
        SET [id_stage] = @id_stage
      WHERE [id_tratamiento] = @id_tratamiento`,
    { id_tratamiento, id_stage }
  );
}

export async function getArchivosByConsulta(
  id_consulta: number
): Promise<{ id_archivo: number; ruta: string; categoria: string }[]> {
  const data = await db.queryParams(
    `SELECT [id_archivo], [ruta], [categoria]
       FROM [CentroPodologico].[dbo].[archivos]
      WHERE [id_consulta] = @id_consulta
        AND [categoria] IN ('VALORACION_U', 'PEDICURE_U')
      ORDER BY [id_archivo]`,
    { id_consulta }
  );
  return data as { id_archivo: number; ruta: string; categoria: string }[];
}

export interface IPagoTratamientoRow {
  id_tratamiento_pago:      number;
  total:                    number;
  idMetodoPago:             number;
  created_at:               string;
  referencia:               string;
  nombre_metodo:            string;
  nombre_tipo:              string;
}

export async function getPagosByTratamiento(
  id_tratamiento: number
): Promise<IPagoTratamientoRow[]> {
  const data = await db.queryParams(
    `SELECT p.[id_tratamiento_pago],
            p.[total],
            p.[idMetodoPago],
            CONVERT(varchar(19), p.[created_at], 120) AS created_at,
            ISNULL(p.[referencia], '') AS referencia,
            ISNULL(mp.[descripcion], '—') AS nombre_metodo,
            ISNULL(tp.[name], '—') AS nombre_tipo
       FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos] p
  LEFT JOIN [CentroPodologico].[dbo].[MetodosPagos] mp
         ON mp.[idMetodoPago] = p.[idMetodoPago]
  LEFT JOIN [CentroPodologico].[dbo].[Tratamiento_pagos_tipos] tp
         ON tp.[id_tratamiento_pago_tipo] = p.[id_tratamiento_pago_tipo]
      WHERE p.[id_tratamiento] = @id_tratamiento
        AND p.[status] = 1
      ORDER BY p.[created_at] ASC`,
    { id_tratamiento }
  );
  return data as IPagoTratamientoRow[];
}

export async function getDefaultTotalTipo1(): Promise<number> {
  const rows = await db.queryParams(
    `SELECT [total]
       FROM [CentroPodologico].[dbo].[Tratamiento_pagos_tipos]
      WHERE [id_tratamiento_pago_tipo] = @id`,
    { id: 2 }
  );
  return rows.length > 0 ? Number(rows[0].total) : 0;
}

export async function getDefaultTotalTipo2(): Promise<number> {
  const rows = await db.queryParams(
    `SELECT [total]
       FROM [CentroPodologico].[dbo].[Tratamiento_pagos_tipos]
      WHERE [id_tratamiento_pago_tipo] = @id`,
    { id: 2 }
  );
  return rows.length > 0 ? Number(rows[0].total) : 0;
}

export async function getMetodosPagoTratamiento(): Promise<{ idMetodoPago: number; descripcion: string }[]> {
  const rows = await db.query(
    `SELECT [idMetodoPago], [descripcion]
       FROM [CentroPodologico].[dbo].[MetodosPagos]
      WHERE [activo] = 1 AND [eliminado] = 0`
  );
  return rows as { idMetodoPago: number; descripcion: string }[];
}

export async function createPagoTratamiento(data: {
  id_tratamiento: number;
  total:          number;
  idMetodoPago:   number;
  referencia:     string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const { id_user } = await getActiveUser();
    const created_at  = buildDate(new Date());
    const webid       = createWebId(10);

    await db.queryParams(
      `DECLARE @id_pago INT =
         (SELECT ISNULL(MAX([id_tratamiento_pago]), 0) + 1
            FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos])

       INSERT INTO [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos]
         ([id_tratamiento_pago],[id_tratamiento],[total],[idMetodoPago],
          [status],[created_at],[facturado],[webid],[uuid_cfdi],
          [id_usuario],[id_usuario_elimino],[deleted_date],
          [id_tratamiento_pago_tipo],[referencia])
       VALUES
         (@id_pago,@id_tratamiento,@total,@idMetodoPago,
          1,@created_at,0,CONVERT(varchar,@id_pago)+'-'+@webid,NULL,
          @id_usuario,NULL,NULL,
          2,@referencia)`,
      {
        id_tratamiento: Number(data.id_tratamiento),
        total:          String(data.total),
        idMetodoPago:   Number(data.idMetodoPago),
        referencia:     data.referencia,
        created_at,
        id_usuario:     id_user,
        webid,
      }
    );
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al registrar el pago" };
  }
}

export async function hasPagoTipo2(id_tratamiento: number): Promise<boolean> {
  const rows = await db.queryParams(
    `SELECT TOP 1 1 AS existe
       FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos]
      WHERE [id_tratamiento] = @id_tratamiento
        AND [id_tratamiento_pago_tipo] = 2
        AND [status] = 1`,
    { id_tratamiento }
  );
  return rows.length > 0;
}

export async function deletePagoTratamiento(
  id_tratamiento_pago: number
): Promise<{ ok: boolean; message?: string }> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos]
          SET [status] = 0
        WHERE [id_tratamiento_pago] = @id_tratamiento_pago`,
      { id_tratamiento_pago }
    );
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al eliminar el pago" };
  }
}

export async function updatePagoTratamiento(data: {
  id_tratamiento_pago: number;
  total:               number;
  idMetodoPago:        number;
  referencia:          string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos]
          SET [total]        = @total,
              [idMetodoPago] = @idMetodoPago,
              [referencia]   = @referencia
        WHERE [id_tratamiento_pago] = @id_tratamiento_pago`,
      {
        id_tratamiento_pago: Number(data.id_tratamiento_pago),
        total:               String(data.total),
        idMetodoPago:        Number(data.idMetodoPago),
        referencia:          data.referencia,
      }
    );
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al actualizar el pago" };
  }
}

// ─── recetas ──────────────────────────────────────────────────────────────────

export interface IRecetaTratamiento {
  id_archivo:  number;
  ruta:        string;
  tipo:        string;
  created_at:  string;
  categoria:   string;
}

export async function getRecetasByTratamiento(
  id_tratamiento: number
): Promise<IRecetaTratamiento[]> {
  const data = await db.queryParams(
    `SELECT [id_archivo],
            [ruta],
            [tipo],
            CONVERT(varchar(19), [created_at], 120) AS created_at,
            [categoria]
       FROM [CentroPodologico].[dbo].[archivos]
      WHERE [id_consulta] = @id_tratamiento
        AND [categoria]   = 'RECETA'
      ORDER BY [created_at] DESC`,
    { id_tratamiento }
  );
  return data as IRecetaTratamiento[];
}

export async function saveRecetaTratamiento(data: {
  id_tratamiento: number;
  ruta:           string;
  tipo:           string;
  created_at:     string;
}): Promise<{ ok: boolean; data?: IRecetaTratamiento; message?: string }> {
  try {
    const result = await db.queryParams(
      `INSERT INTO [CentroPodologico].[dbo].[archivos]
         ([id_archivo],[id_consulta],[ruta],[tipo],[created_at],[categoria])
       OUTPUT INSERTED.[id_archivo], INSERTED.[id_consulta],
              INSERTED.[ruta], INSERTED.[tipo],
              CONVERT(varchar(19), INSERTED.[created_at], 120) AS created_at,
              INSERTED.[categoria]
       VALUES (
         (SELECT ISNULL(MAX([id_archivo]),0)+1 FROM [CentroPodologico].[dbo].[archivos]),
         @id_tratamiento, @ruta, @tipo, @created_at, 'RECETA'
       )`,
      {
        id_tratamiento: data.id_tratamiento,
        ruta:           data.ruta,
        tipo:           data.tipo,
        created_at:     data.created_at,
      }
    );

    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[Tratamiento_onicomicosis]
          SET [new_message] = 1,
              [message]     = 'NUEVA RECETA'
        WHERE [id_tratamiento] = @id_tratamiento`,
      { id_tratamiento: data.id_tratamiento }
    );

    return { ok: true, data: result?.[0] as IRecetaTratamiento };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al guardar la receta" };
  }
}

// ─── egresos ──────────────────────────────────────────────────────────────────

export interface IEgresoRow {
  id_egreso:          number;
  id_egreso_tipo:     number;
  nombre_tipo:        string;
  id_tabla_referencia: number;
  idMetodoPago:       number;
  metodo_pago:        string;
  iva_bit:            number;
  iva:                number;
  monto:              number;
  created_at:         string;
  deleted_at:         string | null;
  id_user_capturo:    number;
  user:               string;
  id_user_elimino:    number | null;
  id_egreso_stage:    number;
  stage:              string;
  referencia:         string;
  status:             number;
}

export interface IEgresoArchivoRow {
  id_egreso_archivo: number;
  id_egreso:         number;
  url:               string;
  created_at:        string;
  status:            number;
  id_user:           number;
  user:              string;
}

export async function getEgresosByTratamiento(
  id_tratamiento: number
): Promise<IEgresoRow[]> {
  const data = await db.queryParams(
    `SELECT DE.[id_egreso],
            DE.[id_egreso_tipo],
            ISNULL(ET.[name], '—') AS nombre_tipo,
            DE.[id_tabla_referencia],
            DE.[idMetodoPago],
            ISNULL(MP.[descripcion], '—') AS metodo_pago,
            DE.[iva_bit],
            DE.[iva],
            DE.[monto],
            CONVERT(varchar(19), DE.[created_at], 120) AS created_at,
            CONVERT(varchar(19), DE.[deleted_at],  120) AS deleted_at,
            DE.[id_user_capturo],
            ISNULL(DU.[nombre], '—') AS [user],
            DE.[id_user_elimino],
            DE.[id_egreso_stage],
            ISNULL(ES.[name], '—') AS stage,
            ISNULL(DE.[referencia], '') AS referencia,
            DE.[status]
       FROM [CentroPodologico].[dbo].[Egresos] DE
  LEFT JOIN [CentroPodologico].[dbo].[egresos_tipos] ET
         ON ET.[id_egreso_tipo] = DE.[id_egreso_tipo]
  LEFT JOIN [CentroPodologico].[dbo].[MetodosPagos] MP
         ON MP.[idMetodoPago] = DE.[idMetodoPago]
  LEFT JOIN [CentroPodologico].[dbo].[Egreso_stages] ES
         ON ES.[id_egreso_stage] = DE.[id_egreso_stage]
  LEFT JOIN [CentroPodologico].[dbo].[Users] DU
         ON DU.[id_user] = DE.[id_user_capturo]
      WHERE DE.[status] = 1
        AND DE.[id_tabla_referencia] = @id_tratamiento
      ORDER BY DE.[created_at] DESC`,
    { id_tratamiento }
  );
  return data as IEgresoRow[];
}

export async function getEgresoTipos(): Promise<{ id_egreso_tipo: number; name: string }[]> {
  const rows = await db.query(
    `SELECT [id_egreso_tipo], [name]
       FROM [CentroPodologico].[dbo].[egresos_tipos]`
  );
  return rows as { id_egreso_tipo: number; name: string }[];
}

export async function getEgresoStages(): Promise<{ id_egreso_stage: number; name: string }[]> {
  const rows = await db.query(
    `SELECT [id_egreso_stage], [name]
       FROM [CentroPodologico].[dbo].[Egreso_stages]`
  );
  return rows as { id_egreso_stage: number; name: string }[];
}

export async function createEgreso(data: {
  id_tratamiento:  number;
  id_egreso_tipo:  number;
  idMetodoPago:    number;
  iva_bit:         number;
  iva:             number;
  monto:           number;
  referencia:      string;
  id_egreso_stage: number;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const { id_user } = await getActiveUser();
    const created_at  = buildDate(new Date());
    const iva         = data.iva_bit ? Number(data.monto) * 0.16 : 0;
    await db.queryParams(
      `
      declare @id_egreso INT =
        (SELECT ISNULL(MAX([id_egreso]), 0) + 1 FROM [CentroPodologico].[dbo].[Egresos])
      INSERT INTO [CentroPodologico].[dbo].[Egresos]
         ( [id_egreso],[id_egreso_tipo],[id_tabla_referencia],[idMetodoPago],
          [iva_bit],[iva],[monto],[created_at],[id_user_capturo],
          [id_egreso_stage],[referencia],[status])
       VALUES
         (@id_egreso,@id_egreso_tipo,@id_tratamiento,@idMetodoPago,
          @iva_bit,@iva,@monto,@created_at,@id_user_capturo,
          1,@referencia,1)`,
      {
       
        id_egreso_tipo:  Number(data.id_egreso_tipo),
        id_tratamiento:  Number(data.id_tratamiento),
        idMetodoPago:    Number(data.idMetodoPago),
        iva_bit:         Number(data.iva_bit),
        iva:             String(iva),
        monto:           String(data.monto),
        created_at,
        id_user_capturo: id_user,
        id_egreso_stage: Number(data.id_egreso_stage),
        referencia:      data.referencia,
      }
    );
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al registrar el egreso" };
  }
}

export async function updateEgreso(data: {
  id_egreso:       number;
  id_egreso_tipo:  number;
  idMetodoPago:    number;
  iva_bit:         number;
  iva:             number;
  monto:           number;
  referencia:      string;
  id_egreso_stage: number;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const iva = data.iva_bit ? Number(data.monto) * 0.16 : 0;
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[Egresos]
          SET [id_egreso_tipo]  = @id_egreso_tipo,
              [idMetodoPago]    = @idMetodoPago,
              [iva_bit]         = @iva_bit,
              [iva]             = @iva,
              [monto]           = @monto,
              [referencia]      = @referencia,
              [id_egreso_stage] = @id_egreso_stage
        WHERE [id_egreso] = @id_egreso`,
      {
        id_egreso:       Number(data.id_egreso),
        id_egreso_tipo:  Number(data.id_egreso_tipo),
        idMetodoPago:    Number(data.idMetodoPago),
        iva_bit:         Number(data.iva_bit),
        iva:             String(iva),
        monto:           String(data.monto),
        referencia:      data.referencia,
        id_egreso_stage: Number(data.id_egreso_stage),
      }
    );
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al actualizar el egreso" };
  }
}

export async function deleteEgreso(
  id_egreso: number
): Promise<{ ok: boolean; message?: string }> {
  try {
    const { id_user } = await getActiveUser();
    const deleted_at  = buildDate(new Date());
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[Egresos]
          SET [status]         = 0,
              [deleted_at]     = @deleted_at,
              [id_user_elimino] = @id_user_elimino
        WHERE [id_egreso] = @id_egreso`,
      { id_egreso, deleted_at, id_user_elimino: id_user }
    );
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al eliminar el egreso" };
  }
}

export async function getArchivosByEgreso(
  id_egreso: number
): Promise<IEgresoArchivoRow[]> {
  const data = await db.queryParams(
    `SELECT EA.[id_egreso_archivo],
            EA.[id_egreso],
            EA.[url],
            CONVERT(varchar(19), EA.[created_at], 120) AS created_at,
            EA.[status],
            EA.[id_user],
            ISNULL(DU.[nombre], '—') AS [user]
       FROM [CentroPodologico].[dbo].[Egresos_archivos] EA
  LEFT JOIN [CentroPodologico].[dbo].[Users] DU
         ON DU.[id_user] = EA.[id_user]
      WHERE EA.[status] = 1
        AND EA.[id_egreso] = @id_egreso
      ORDER BY EA.[created_at] DESC`,
    { id_egreso }
  );
  return data as IEgresoArchivoRow[];
}

export async function saveEgresoArchivo(data: {
  id_egreso:  number;
  url:        string;
  id_user:    number;
  created_at: string;
}): Promise<{ ok: boolean; data?: IEgresoArchivoRow; message?: string }> {
  try {
    const result = await db.queryParams(
      `
      declare @id_egreso_archivo INT =
        (SELECT ISNULL(MAX([id_egreso_archivo]), 0) + 1 FROM [CentroPodologico].[dbo].[Egresos_archivos])
      INSERT INTO [CentroPodologico].[dbo].[Egresos_archivos]
         ( [id_egreso_archivo],[id_egreso],[url],[created_at],[status],[id_user])
       OUTPUT INSERTED.[id_egreso_archivo], INSERTED.[id_egreso],
              INSERTED.[url],
              CONVERT(varchar(19), INSERTED.[created_at], 120) AS created_at,
              INSERTED.[status], INSERTED.[id_user]
       VALUES (@id_egreso_archivo, @id_egreso, @url, @created_at, 1, @id_user)`,
      {
        id_egreso:  Number(data.id_egreso),
        url:        data.url,
        created_at: data.created_at,
        id_user:    Number(data.id_user),
      }
    );
    const row = result?.[0] as IEgresoArchivoRow | undefined;
    if (row) row.user = "";
    return { ok: true, data: row };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al guardar el archivo" };
  }
}

// ─── consultas ────────────────────────────────────────────────────────────────

export async function getConsultasByTratamiento(
  id_tratamiento: number
): Promise<IConsulta[]> {
  const data = await db.queryParams(
    `SELECT c.[id_consulta], c.[id_paciente], c.[id_podologo],
            CONVERT(varchar(19), c.[fecha], 120) AS fecha,
            c.[diagnostico], c.[tratamiento_aplicado], c.[observaciones],
            CONVERT(varchar(19), c.[created_at], 120) AS created_at,
            CONVERT(varchar(19), c.[fecha_fin],  120) AS fecha_fin,
            c.[deleted_at], c.[costo_total], c.[id_sucursal], c.[id_empresa],
            c.[cancelada], c.[motivo_cancelada], c.[id_tratamiento],
            u.[nombre] AS nombre_podologo,
            s.[nombre] AS nombre_sucursal
       FROM [CentroPodologico].[dbo].[consultas] c
       LEFT JOIN [CentroPodologico].[dbo].[users] u ON u.[id_user] = c.[id_podologo]
       LEFT JOIN [CentroPodologico].[dbo].[sucursales] s ON s.[id_sucursal] = c.[id_sucursal]
      WHERE c.[id_tratamiento] = @id_tratamiento
        AND c.[deleted_at] IS NULL
      ORDER BY c.[fecha] DESC`,
    { id_tratamiento }
  );
  return data as IConsulta[];
}

export async function createConsultaOnicomicosis(form: {
  id_paciente:          number;
  id_podologo:          number;
  diagnostico:          string;
  tratamiento_aplicado: string;
  observaciones:        string;
  costo_total:          number;
  id_sucursal:          number;
  id_empresa:           number;
  id_tratamiento:       number;
}): Promise<{ ok: boolean; id_consulta?: number; message?: string }> {
  try {
    const created_at = buildDate(new Date());
    const result = await db.queryParams(
      `INSERT INTO [CentroPodologico].[dbo].[consultas]
         ([id_consulta],[id_paciente],[id_podologo],[fecha],[diagnostico],
          [tratamiento_aplicado],[observaciones],[created_at],[deleted_at],
          [costo_total],[id_sucursal],[id_empresa],[is_onicomicosis],[id_tratamiento])
       OUTPUT INSERTED.*
       VALUES (
         (SELECT ISNULL(MAX([id_consulta]),0)+1 FROM [CentroPodologico].[dbo].[consultas]),
         @id_paciente,@id_podologo,@fecha,@diagnostico,
         @tratamiento_aplicado,@observaciones,@created_at,NULL,
         @costo_total,@id_sucursal,@id_empresa,1,@id_tratamiento
       )`,
      {
        id_paciente:          form.id_paciente,
        id_podologo:          form.id_podologo,
        fecha:                toDBString(created_at) ?? created_at,
        diagnostico:          form.diagnostico,
        tratamiento_aplicado: form.tratamiento_aplicado,
        observaciones:        form.observaciones,
        created_at,
        costo_total:          form.costo_total,
        id_sucursal:          form.id_sucursal,
        id_empresa:           form.id_empresa,
        id_tratamiento:       form.id_tratamiento,
      }
    );
    const newConsulta = (result as IConsulta[])?.[0];
    if (newConsulta?.id_consulta) {
      await db.queryParams(
        `INSERT INTO [CentroPodologico].[dbo].[procesos]
           ([id_proceso],[id_consulta],[valoracion_piel],[patologia_ungueal],
            [servicios],[productos],[fotos_valoracion],[fotos_pedicure],[pagar])
         VALUES (
           (SELECT ISNULL(MAX([id_proceso]),0)+1 FROM [CentroPodologico].[dbo].[procesos]),
           @id_consulta,0,0,0,0,0,0,0
         )`,
        { id_consulta: newConsulta.id_consulta }
      );

      await applyConsultationConsumption({
        id_consulta: newConsulta.id_consulta,
        id_sucursal: form.id_sucursal,
        id_empresa:  form.id_empresa,
        id_user:     form.id_podologo,
      });

      return { ok: true, id_consulta: newConsulta.id_consulta };
    }
    return { ok: false, message: "No se pudo crear la consulta" };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al crear la consulta" };
  }
}
