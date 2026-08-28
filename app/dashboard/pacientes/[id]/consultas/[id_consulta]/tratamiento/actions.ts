"use server";

import db from "@/database/connection";
import { IMetodoPago } from "@/interfaces/metodo_pago";
import { buildDate } from "@/utils/date_helpper";
import { createWebId } from "@/utils/random";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET_SEED!);

async function getActiveUser(): Promise<{ id_user: number; id_empresa: number }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) throw new Error("No autenticado");
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as { id_user: number; id_empresa: number };
}

export interface EspecialistaOption {
  id_user: number;
  nombre:  string;
}

export async function getEspecialistas(): Promise<EspecialistaOption[]> {
  const { id_empresa } = await getActiveUser();
  const rows = await db.queryParams(
    `SELECT [id_user], [nombre]
       FROM [CentroPodologico].[dbo].[users]
      WHERE [status] = 1
        AND [id_role] = 5
        AND [id_empresa] = @id_empresa`,
    { id_empresa },
  );
  return rows as EspecialistaOption[];
}

export async function getMetodosPago(): Promise<IMetodoPago[]> {
  const rows = await db.query(
    `SELECT [idMetodoPago], [descripcion], [clave], [eliminado], [activo]
       FROM [CentroPodologico].[dbo].[MetodosPagos]
      WHERE [activo] = 1 AND [eliminado] = 0`,
  );
  return rows as IMetodoPago[];
}

export async function checkOnicomicosisGrado2(id_consulta: number): Promise<boolean> {
  const rows = await db.queryParams(
    `SELECT TOP 1 [onicomicosis_grado_2]
       FROM [CentroPodologico].[dbo].[patologia_ungueal]
      WHERE [id_consulta] = @id_consulta`,
    { id_consulta },
  );
  if (rows.length === 0) return false;
  return !!rows[0].onicomicosis_grado_2;
}

export async function checkTratamientoExists(id_consulta: number): Promise<boolean> {
  const rows = await db.queryParams(
    `SELECT TOP 1 1 AS existe
       FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis]
      WHERE [id_consulta] = @id_consulta`,
    { id_consulta },
  );
  return rows.length > 0;
}

export async function getDefaultTotalTratamiento(): Promise<number> {
  const rows = await db.queryParams(
    `SELECT [total]
       FROM [CentroPodologico].[dbo].[Tratamiento_pagos_tipos]
      WHERE [id_tratamiento_pago_tipo] = @id`,
    { id: 1 },
  );
  return rows.length > 0 ? Number(rows[0].total) : 950;
}

export type TratamientoFormData = {
  peso:                   string;
  talla:                  string;
  altura:                 string;
  antecedentes_cronicos:  string;
  antecedentes_hepaticos: string;
  alergias:               string;
  medicacion_actual:      string;
  id_especialista:        number;
};

export type PagoFormData = {
  total:        number;
  idMetodoPago: number;
  referencia:   string;
};

export async function saveTratamiento(
  id_consulta:  number,
  tratamiento:  TratamientoFormData,
  pago:         PagoFormData,
): Promise<{ ok: boolean; message?: string; id_tratamiento?: number; especialistaTelefono?: string | null; nombreEspecialista?: string; nombrePaciente?: string; createdAt?: string; nombreSucursal?: string | null }> {
  try {
    const { id_user } = await getActiveUser();
    const created_at  = buildDate(new Date());
    const webid       = createWebId(10);

    await db.queryParams(
      `BEGIN TRY
         BEGIN TRANSACTION
           DECLARE @id_tratamiento INT =
             (SELECT ISNULL(MAX([id_tratamiento]), 0) + 1
                FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis])

           INSERT INTO [CentroPodologico].[dbo].[Tratamiento_onicomicosis]
             ([id_tratamiento],[id_consulta],[peso],[talla],[altura],
              [antecedentes_cronicos],[antecedentes_hepaticos],[alergias],[medicacion_actual],
              [created_at],[id_stage],[id_usuario],[id_especialista],
              [new_message],[message],[id_billing_stage])
           VALUES
             (@id_tratamiento,@id_consulta,@peso,@talla,@altura,
              @antecedentes_cronicos,@antecedentes_hepaticos,@alergias,@medicacion_actual,
              @created_at,1,@id_usuario,@id_especialista,
              1,'SOLICITUD',1)

           DECLARE @id_pago INT =
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
              1,@referencia)

           SELECT @id_tratamiento AS id_tratamiento
         COMMIT TRANSACTION
       END TRY
       BEGIN CATCH
         IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION
         THROW
       END CATCH`,
      {
        id_consulta,
        peso:                   String(tratamiento.peso),
        talla:                  String(tratamiento.talla),
        altura:                 String(tratamiento.altura),
        antecedentes_cronicos:  tratamiento.antecedentes_cronicos,
        antecedentes_hepaticos: tratamiento.antecedentes_hepaticos,
        alergias:               tratamiento.alergias,
        medicacion_actual:      tratamiento.medicacion_actual,
        id_especialista:        Number(tratamiento.id_especialista),
        total:                  String(pago.total),
        idMetodoPago:           Number(pago.idMetodoPago),
        referencia:             pago.referencia,
        created_at,
        id_usuario:             id_user,
        webid,
      },
    );

    const idTratamientoResult = await db.queryParams(
      `SELECT TOP 1 t.[id_tratamiento],
              CONVERT(varchar(19), t.[created_at], 120) AS created_at,
              u.[telefono],
              u.[nombre] AS nombre_especialista,
              p.[nombre] + ' ' + ISNULL(p.[apellido_paterno],'') + ' ' + ISNULL(p.[apellido_materno],'') AS nombre_paciente,
              s.[nombre] AS nombre_sucursal
         FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis] t
         JOIN [CentroPodologico].[dbo].[Consultas] c ON c.[id_consulta] = t.[id_consulta]
         JOIN [CentroPodologico].[dbo].[pacientes] p ON p.[id_paciente] = c.[id_paciente]
         LEFT JOIN [CentroPodologico].[dbo].[users] u ON u.[id_user] = t.[id_especialista]
         LEFT JOIN [CentroPodologico].[dbo].[sucursales] s ON s.[id_sucursal] = c.[id_sucursal]
        WHERE t.[id_consulta] = @id_consulta
        ORDER BY t.[id_tratamiento] DESC`,
      { id_consulta },
    );

    const row = idTratamientoResult[0];
    return {
      ok: true,
      id_tratamiento:        row ? Number(row.id_tratamiento) : undefined,
      especialistaTelefono:  row?.telefono ?? null,
      nombreEspecialista:    row?.nombre_especialista?.trim() ?? undefined,
      nombrePaciente:        row?.nombre_paciente?.trim() ?? undefined,
      createdAt:             row ? String(row.created_at) : undefined,
      nombreSucursal:        row?.nombre_sucursal ?? null,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Error al guardar el tratamiento" };
  }
}
