import "server-only";

import db from "@/database/connection";
import { ITransactionClient } from "@/database/connection";
import { BillableSource, IBillableOperation } from "@/interfaces/organization";

/**
 * SQL de los cobros facturables (consultas y tratamientos totalmente pagados y
 * no facturados) — spec 34. Vive aquí, aparte de `organizationsRepository.ts`,
 * porque consulta el dominio clínico (`dbo.consultas`, `dbo.pagos`,
 * `dbo.Tratamiento_onicomicosis*`), no `BILLING.*`, y lo necesitan dos pestañas
 * distintas: Por facturar (`[id]/pending/`, listar y timbrar) y Facturas
 * (`[id]/invoices/`, revertir el estampado al cancelar).
 *
 * **Nota de nombre de tabla:** el spec 34 refiere el catálogo de totales de
 * tratamiento como `dbo.Tratamiento_onicomicosis_pagos_tipos`. La tabla real en
 * la base de datos (confirmada contra `app/dashboard/tratamientos/actions.ts` y
 * `.../tratamiento/actions.ts`, que ya la usan) es `dbo.Tratamiento_pagos_tipos`.
 * Este archivo usa el nombre real.
 */

/** `id_tratamiento_pago_tipo` correspondiente a cada origen de tratamiento. */
const TREATMENT_PAYMENT_TYPE_BY_SOURCE: Record<"tratamiento_revision" | "tratamiento", number> = {
  tratamiento_revision: 1,
  tratamiento: 2,
};

export interface IBillableOperationFilters {
  id_empresa: number;
  id_sucursal: number;
  /** "YYYY-MM-DD"; filtra por la fecha del último pago de la operación. */
  date_from?: string | null;
  /** "YYYY-MM-DD"; filtra por la fecha del último pago de la operación. */
  date_to?: string | null;
  id_podologo?: number | null;
  /** Nombre de paciente o WhatsApp; se parte en palabras, como `buscarPacientesPorSucursal`. */
  search?: string | null;
}

/** Construye el fragmento `AND ...` común a los tres bloques del `UNION ALL`, y sus parámetros. */
function buildFilterFragment(filters: IBillableOperationFilters): { clause: string; params: Record<string, unknown> } {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {
    id_empresa: filters.id_empresa,
    id_sucursal: filters.id_sucursal,
  };

  if (filters.date_from) {
    conditions.push("CAST(agg.[last_paid] AS date) >= @date_from");
    params.date_from = filters.date_from;
  }
  if (filters.date_to) {
    conditions.push("CAST(agg.[last_paid] AS date) <= @date_to");
    params.date_to = filters.date_to;
  }
  if (filters.id_podologo) {
    conditions.push("c.[id_podologo] = @id_podologo");
    params.id_podologo = filters.id_podologo;
  }

  const searchWords = (filters.search ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  searchWords.forEach((word, i) => {
    params[`q${i}`] = `%${word}%`;
    conditions.push(
      `(p.[nombre] LIKE @q${i} OR p.[apellido_paterno] LIKE @q${i} OR p.[apellido_materno] LIKE @q${i} OR p.[whatsapp] LIKE @q${i})`
    );
  });

  return { clause: conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "", params };
}

function toBillableOperation(row: Record<string, unknown>): IBillableOperation {
  return {
    source: row.source as BillableSource,
    source_id: Number(row.source_id),
    patient_name: String(row.patient_name ?? ""),
    patient_whatsapp: row.patient_whatsapp ? String(row.patient_whatsapp) : null,
    podologist_name: row.podologist_name ? String(row.podologist_name) : null,
    last_payment_date: String(row.last_payment_date),
    total: Number(row.total),
    payment_form: String(row.payment_form),
    payment_form_label: String(row.payment_form_label),
  };
}

/**
 * Listado unificado de operaciones cobrables completas y no facturadas: consultas,
 * revisión de tratamiento (tipo 1) y tratamiento (tipo 2), como renglones
 * independientes. Ningún total esperado está codificado aquí: sale de
 * `consultas.costo_total` y de `Tratamiento_pagos_tipos.total`.
 */
export async function listBillableOperations(filters: IBillableOperationFilters): Promise<IBillableOperation[]> {
  const { clause, params } = buildFilterFragment(filters);

  const rows = await db.queryParams(
    `SELECT * FROM (
       SELECT 'consulta' AS source,
              c.[id_consulta] AS source_id,
              LTRIM(RTRIM(p.[nombre] + ' ' + ISNULL(p.[apellido_paterno],'') + ' ' + ISNULL(p.[apellido_materno],''))) AS patient_name,
              p.[whatsapp] AS patient_whatsapp,
              u.[nombre] AS podologist_name,
              CONVERT(varchar(19), agg.[last_paid], 120) AS last_payment_date,
              agg.[paid] AS total,
              pf.[clave] AS payment_form,
              pf.[descripcion] AS payment_form_label
         FROM [CentroPodologico].[dbo].[consultas] c
         JOIN [CentroPodologico].[dbo].[pacientes] p ON p.[id_paciente] = c.[id_paciente]
    LEFT JOIN [CentroPodologico].[dbo].[users] u ON u.[id_user] = c.[id_podologo]
   CROSS APPLY (
              SELECT SUM([monto]) AS paid, MAX([created_at]) AS last_paid
                FROM [CentroPodologico].[dbo].[pagos]
               WHERE [id_consulta] = c.[id_consulta] AND [status] = 1
            ) agg
   CROSS APPLY (
              SELECT TOP 1 mp.[clave], mp.[descripcion]
                FROM [CentroPodologico].[dbo].[pagos] pg
                JOIN [CentroPodologico].[dbo].[MetodosPagos] mp ON mp.[idMetodoPago] = pg.[idMetodoPago]
               WHERE pg.[id_consulta] = c.[id_consulta] AND pg.[status] = 1
               ORDER BY pg.[monto] DESC, pg.[id_pago] ASC
            ) pf
        WHERE c.[costo_total] > 0
          AND agg.[paid] IS NOT NULL AND agg.[paid] >= c.[costo_total]
          AND c.[deleted_at] IS NULL AND c.[cancelada] = 0
          AND c.[id_sucursal] = @id_sucursal AND c.[id_empresa] = @id_empresa
          AND NOT EXISTS (
                SELECT 1 FROM [CentroPodologico].[dbo].[pagos] f
                 WHERE f.[id_consulta] = c.[id_consulta] AND f.[status] = 1 AND f.[facturado] = 1
              )
          ${clause}

       UNION ALL

       SELECT 'tratamiento_revision' AS source,
              t.[id_tratamiento] AS source_id,
              LTRIM(RTRIM(p.[nombre] + ' ' + ISNULL(p.[apellido_paterno],'') + ' ' + ISNULL(p.[apellido_materno],''))) AS patient_name,
              p.[whatsapp] AS patient_whatsapp,
              u.[nombre] AS podologist_name,
              CONVERT(varchar(19), agg.[last_paid], 120) AS last_payment_date,
              agg.[paid] AS total,
              pf.[clave] AS payment_form,
              pf.[descripcion] AS payment_form_label
         FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis] t
         JOIN [CentroPodologico].[dbo].[consultas] c ON c.[id_consulta] = t.[id_consulta]
         JOIN [CentroPodologico].[dbo].[pacientes] p ON p.[id_paciente] = c.[id_paciente]
    LEFT JOIN [CentroPodologico].[dbo].[users] u ON u.[id_user] = c.[id_podologo]
         JOIN [CentroPodologico].[dbo].[Tratamiento_pagos_tipos] tt ON tt.[id_tratamiento_pago_tipo] = 1
   CROSS APPLY (
              SELECT SUM([total]) AS paid, MAX([created_at]) AS last_paid
                FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos]
               WHERE [id_tratamiento] = t.[id_tratamiento] AND [id_tratamiento_pago_tipo] = 1 AND [status] = 1
            ) agg
   CROSS APPLY (
              SELECT TOP 1 mp.[clave], mp.[descripcion]
                FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos] tp
                JOIN [CentroPodologico].[dbo].[MetodosPagos] mp ON mp.[idMetodoPago] = tp.[idMetodoPago]
               WHERE tp.[id_tratamiento] = t.[id_tratamiento] AND tp.[id_tratamiento_pago_tipo] = 1 AND tp.[status] = 1
               ORDER BY tp.[total] DESC, tp.[id_tratamiento_pago] ASC
            ) pf
        WHERE agg.[paid] IS NOT NULL AND agg.[paid] >= tt.[total]
          AND c.[deleted_at] IS NULL AND c.[cancelada] = 0
          AND c.[id_sucursal] = @id_sucursal AND c.[id_empresa] = @id_empresa
          AND NOT EXISTS (
                SELECT 1 FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos] f
                 WHERE f.[id_tratamiento] = t.[id_tratamiento] AND f.[id_tratamiento_pago_tipo] = 1
                   AND f.[status] = 1 AND f.[facturado] = 1
              )
          ${clause}

       UNION ALL

       SELECT 'tratamiento' AS source,
              t.[id_tratamiento] AS source_id,
              LTRIM(RTRIM(p.[nombre] + ' ' + ISNULL(p.[apellido_paterno],'') + ' ' + ISNULL(p.[apellido_materno],''))) AS patient_name,
              p.[whatsapp] AS patient_whatsapp,
              u.[nombre] AS podologist_name,
              CONVERT(varchar(19), agg.[last_paid], 120) AS last_payment_date,
              agg.[paid] AS total,
              pf.[clave] AS payment_form,
              pf.[descripcion] AS payment_form_label
         FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis] t
         JOIN [CentroPodologico].[dbo].[consultas] c ON c.[id_consulta] = t.[id_consulta]
         JOIN [CentroPodologico].[dbo].[pacientes] p ON p.[id_paciente] = c.[id_paciente]
    LEFT JOIN [CentroPodologico].[dbo].[users] u ON u.[id_user] = c.[id_podologo]
         JOIN [CentroPodologico].[dbo].[Tratamiento_pagos_tipos] tt ON tt.[id_tratamiento_pago_tipo] = 2
   CROSS APPLY (
              SELECT SUM([total]) AS paid, MAX([created_at]) AS last_paid
                FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos]
               WHERE [id_tratamiento] = t.[id_tratamiento] AND [id_tratamiento_pago_tipo] = 2 AND [status] = 1
            ) agg
   CROSS APPLY (
              SELECT TOP 1 mp.[clave], mp.[descripcion]
                FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos] tp
                JOIN [CentroPodologico].[dbo].[MetodosPagos] mp ON mp.[idMetodoPago] = tp.[idMetodoPago]
               WHERE tp.[id_tratamiento] = t.[id_tratamiento] AND tp.[id_tratamiento_pago_tipo] = 2 AND tp.[status] = 1
               ORDER BY tp.[total] DESC, tp.[id_tratamiento_pago] ASC
            ) pf
        WHERE agg.[paid] IS NOT NULL AND agg.[paid] >= tt.[total]
          AND c.[deleted_at] IS NULL AND c.[cancelada] = 0
          AND c.[id_sucursal] = @id_sucursal AND c.[id_empresa] = @id_empresa
          AND NOT EXISTS (
                SELECT 1 FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos] f
                 WHERE f.[id_tratamiento] = t.[id_tratamiento] AND f.[id_tratamiento_pago_tipo] = 2
                   AND f.[status] = 1 AND f.[facturado] = 1
              )
          ${clause}
     ) AS billable
     ORDER BY [last_payment_date] DESC`,
    params
  );

  return rows.map(toBillableOperation);
}

/** Fila de pago activa que compone una operación, tal como la resuelve `resolveBillableOperation`. */
interface IBillablePaymentRow {
  id: number;
  amount: number;
  facturado: boolean;
  payment_form: string;
  payment_form_label: string;
}

/** Operación recalculada en el servidor, lista para timbrar. */
export interface IResolvedBillableOperation {
  total: number;
  payment_form: string;
  payment_form_label: string;
  /** `id`s de las filas de pago que componen la operación (`dbo.pagos` o `dbo.Tratamiento_onicomicosis_pagos`). */
  payment_ids: number[];
}

/** Suma, valida y elige el pago de mayor monto de un conjunto de pagos activos. `null` si no es facturable. */
function resolveFromPaymentRows(
  rows: IBillablePaymentRow[],
  expectedTotal: number
): IResolvedBillableOperation | null {
  if (rows.length === 0) return null;
  if (rows.some((row) => row.facturado)) return null;

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  if (total < expectedTotal) return null;

  const maxPayment = rows.reduce((max, row) => (row.amount > max.amount ? row : max));

  return {
    total,
    payment_form: maxPayment.payment_form,
    payment_form_label: maxPayment.payment_form_label,
    payment_ids: rows.map((row) => row.id),
  };
}

async function resolveConsultaOperation(
  sourceId: number,
  idEmpresa: number,
  idSucursal: number
): Promise<IResolvedBillableOperation | null> {
  const consultaRows = await db.queryParams(
    `SELECT [costo_total]
       FROM [CentroPodologico].[dbo].[consultas]
      WHERE [id_consulta] = @sourceId AND [id_empresa] = @idEmpresa AND [id_sucursal] = @idSucursal
        AND [deleted_at] IS NULL AND [cancelada] = 0`,
    { sourceId, idEmpresa, idSucursal }
  );
  if (consultaRows.length === 0) return null;
  const expectedTotal = Number(consultaRows[0].costo_total);
  if (!(expectedTotal > 0)) return null;

  const paymentRows = await db.queryParams(
    `SELECT pg.[id_pago] AS id, pg.[monto] AS amount, pg.[facturado] AS facturado,
            mp.[clave] AS payment_form, mp.[descripcion] AS payment_form_label
       FROM [CentroPodologico].[dbo].[pagos] pg
       JOIN [CentroPodologico].[dbo].[MetodosPagos] mp ON mp.[idMetodoPago] = pg.[idMetodoPago]
      WHERE pg.[id_consulta] = @sourceId AND pg.[status] = 1`,
    { sourceId }
  );

  return resolveFromPaymentRows(
    paymentRows.map((row) => ({
      id: Number(row.id),
      amount: Number(row.amount),
      facturado: Boolean(row.facturado),
      payment_form: String(row.payment_form),
      payment_form_label: String(row.payment_form_label),
    })),
    expectedTotal
  );
}

async function resolveTreatmentOperation(
  source: "tratamiento_revision" | "tratamiento",
  sourceId: number,
  idEmpresa: number,
  idSucursal: number
): Promise<IResolvedBillableOperation | null> {
  const tipo = TREATMENT_PAYMENT_TYPE_BY_SOURCE[source];

  const treatmentRows = await db.queryParams(
    `SELECT tt.[total] AS expected_total
       FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis] t
       JOIN [CentroPodologico].[dbo].[consultas] c ON c.[id_consulta] = t.[id_consulta]
       JOIN [CentroPodologico].[dbo].[Tratamiento_pagos_tipos] tt ON tt.[id_tratamiento_pago_tipo] = @tipo
      WHERE t.[id_tratamiento] = @sourceId
        AND c.[id_empresa] = @idEmpresa AND c.[id_sucursal] = @idSucursal
        AND c.[deleted_at] IS NULL AND c.[cancelada] = 0`,
    { sourceId, idEmpresa, idSucursal, tipo }
  );
  if (treatmentRows.length === 0) return null;
  const expectedTotal = Number(treatmentRows[0].expected_total);
  if (!(expectedTotal > 0)) return null;

  const paymentRows = await db.queryParams(
    `SELECT tp.[id_tratamiento_pago] AS id, tp.[total] AS amount, tp.[facturado] AS facturado,
            mp.[clave] AS payment_form, mp.[descripcion] AS payment_form_label
       FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos] tp
       JOIN [CentroPodologico].[dbo].[MetodosPagos] mp ON mp.[idMetodoPago] = tp.[idMetodoPago]
      WHERE tp.[id_tratamiento] = @sourceId AND tp.[id_tratamiento_pago_tipo] = @tipo AND tp.[status] = 1`,
    { sourceId, tipo }
  );

  return resolveFromPaymentRows(
    paymentRows.map((row) => ({
      id: Number(row.id),
      amount: Number(row.amount),
      facturado: Boolean(row.facturado),
      payment_form: String(row.payment_form),
      payment_form_label: String(row.payment_form_label),
    })),
    expectedTotal
  );
}

/**
 * Recalcula una operación cobrable contra la base de datos, en el momento del
 * timbrado — nunca confía en el total ni la forma de pago que mandó el cliente
 * (`IBillableOperation` no los expone). Devuelve `null` si la operación ya no es
 * facturable: se pagó de menos, se canceló, o alguien ya la facturó.
 */
export async function resolveBillableOperation(
  source: BillableSource,
  sourceId: number,
  idEmpresa: number,
  idSucursal: number
): Promise<IResolvedBillableOperation | null> {
  if (source === "consulta") return resolveConsultaOperation(sourceId, idEmpresa, idSucursal);
  return resolveTreatmentOperation(source, sourceId, idEmpresa, idSucursal);
}

/**
 * Estampa `facturado = 1` y `uuid_cfdi` en las filas de pago activas que
 * componen la operación, dentro de la tabla que corresponda. Se llama después de
 * que Facturapi confirma el timbrado, dentro de la misma `db.transaction` que su
 * entrada de `audit_log`.
 */
export async function markOperationInvoiced(
  tx: ITransactionClient,
  source: BillableSource,
  sourceId: number,
  uuid: string
): Promise<void> {
  if (source === "consulta") {
    await tx.queryParams(
      `UPDATE [CentroPodologico].[dbo].[pagos]
          SET [facturado] = 1, [uuid_cfdi] = @uuid
        WHERE [id_consulta] = @sourceId AND [status] = 1`,
      { sourceId, uuid }
    );
    return;
  }

  const tipo = TREATMENT_PAYMENT_TYPE_BY_SOURCE[source];
  await tx.queryParams(
    `UPDATE [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos]
        SET [facturado] = 1, [uuid_cfdi] = @uuid
      WHERE [id_tratamiento] = @sourceId AND [id_tratamiento_pago_tipo] = @tipo AND [status] = 1`,
    { sourceId, uuid, tipo }
  );
}

/**
 * Reversión de `markOperationInvoiced`: limpia `facturado = 0` y `uuid_cfdi = NULL`
 * en ambas tablas de cobro, sin importar cuál generó el CFDI. Una factura ajena a
 * esta pestaña (`uuid` que ninguna fila referencia) no afecta ninguna fila.
 */
export async function clearInvoiceStamp(tx: ITransactionClient, uuid: string): Promise<void> {
  await tx.queryParams(
    `UPDATE [CentroPodologico].[dbo].[pagos]
        SET [facturado] = 0, [uuid_cfdi] = NULL
      WHERE [uuid_cfdi] = @uuid`,
    { uuid }
  );
  await tx.queryParams(
    `UPDATE [CentroPodologico].[dbo].[Tratamiento_onicomicosis_pagos]
        SET [facturado] = 0, [uuid_cfdi] = NULL
      WHERE [uuid_cfdi] = @uuid`,
    { uuid }
  );
}
