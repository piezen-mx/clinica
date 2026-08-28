"use server";

import db, { ITransactionClient } from "@/database/connection";
import { applyStockMovement } from "@/lib/inventory/stock";
import { getSaleProducts, ISaleProduct } from "@/app/dashboard/ventas/actions";
import { IArchivo } from "@/interfaces/archivos";
import { IAntecedenteMedico } from "@/interfaces/antecedentes";
import { IConsulta } from "@/interfaces/consulta";
import { IConsultaProducto } from "@/interfaces/consulta_producto";
import { IConsultaServicio } from "@/interfaces/consulta_servicio";
import { IPaciente } from "@/interfaces/paciente";
import { IMetodoPago } from "@/interfaces/metodo_pago";
import { IOnicocriptosisDetalle } from "@/interfaces/onicocriptosis_detalle";
import { IOnicomicosisDetalle } from "@/interfaces/onicomicosis_detalle";
import { IPago } from "@/interfaces/pago";
import { IPatologiaUngueal } from "@/interfaces/patologia_ungueal";
import { IProceso } from "@/interfaces/proceso";
import { IServicio } from "@/interfaces/servicio";
import { IServicioOpcion } from "@/interfaces/servicio_opcion";
import { IValoracionPiel } from "@/interfaces/valoracion_piel";
import { buildDate, toDBString } from "@/utils/date_helpper";
import { createWebId } from "@/utils/random";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";

// ─── types ────────────────────────────────────────────────────────────────────

export type ConsultaProductoExtended = IConsultaProducto & { nombre_producto?: string };

export interface ConsultaData {
  consulta:   IConsulta | null;
  paciente:   IPaciente | null;
  valoracion: IValoracionPiel | null;
  patologia:  IPatologiaUngueal | null;
  archivos:   IArchivo[];
  productos:  ConsultaProductoExtended[];
  pagos:      IPago[];
  proceso:    IProceso | null;
  onicocriptosisDetalle: IOnicocriptosisDetalle[];
  onicomicosisDetalle: IOnicomicosisDetalle[];
}

export type ProcesoField =
  | 'valoracion_piel'
  | 'patologia_ungueal'
  | 'servicios'
  | 'productos'
  | 'fotos_valoracion'
  | 'fotos_pedicure'
  | 'pagar';

const PROCESO_FIELDS: ProcesoField[] = [
  'valoracion_piel', 'patologia_ungueal', 'servicios',
  'productos', 'fotos_valoracion', 'fotos_pedicure', 'pagar',
];

type ActionResult<T> = { ok: true; data: T } | { ok: false; data: string };

// ─── helpers ──────────────────────────────────────────────────────────────────

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET_SEED!);

async function getIdEmpresa(): Promise<number> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return 0;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const user = payload as { id_empresa?: number };
    return user.id_empresa ?? 0;
  } catch {
    return 0;
  }
}

async function getIdUser(): Promise<number> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return 0;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const user = payload as { id_user?: number };
    return user.id_user ?? 0;
  } catch {
    return 0;
  }
}

/** Movimientos de kardex (ver queries.txt, inventory.movements) — mismos códigos que spec 16. */
const MOVEMENT_SALIDA_POR_VENTA = 6;
const MOVEMENT_ENTRADA_POR_AJUSTE = 7;

/** `id_stock_unit_measurement` del producto, para poblar el kardex del movimiento. */
async function getStockUnitMeasurement(
  tx: ITransactionClient,
  id_producto: number
): Promise<number | null> {
  const rows = await tx.queryParams(
    `SELECT [id_stock_unit_measurement]
       FROM [CentroPodologico].[inventory].[Products]
      WHERE [id_product] = @id_producto`,
    { id_producto }
  );
  return rows[0]?.id_stock_unit_measurement ?? null;
}

// ─── fetch all data ───────────────────────────────────────────────────────────

export async function getConsultaData(
  id_consulta: number,
  id_paciente: number,
): Promise<ConsultaData> {
  const [cRows, vRows, patRows, aRows, pRows, pgRows, pacRows, procRows, onicoRows, onicomicosisRows] = await Promise.all([
    db.queryParams(
      `SELECT [id_consulta],[id_paciente],[id_podologo]
              ,CONVERT(varchar(19), [fecha],     120) AS fecha
              ,CONVERT(varchar(19), [fecha_fin], 120) AS fecha_fin
              ,[diagnostico],[tratamiento_aplicado],[observaciones]
              ,CONVERT(varchar(19), [created_at], 120) AS created_at
              ,[deleted_at],[costo_total],[id_sucursal],[id_empresa],[id_cita],cancelada,motivo_cancelada,is_onicomicosis,id_tratamiento,id_buzon
         FROM [CentroPodologico].[dbo].[consultas]
        WHERE [id_consulta] = @id_consulta AND [deleted_at] IS NULL`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT [id_valoracion_piel],[id_consulta]
              ,CONVERT(varchar(10), [fecha_valoracion], 120) AS fecha_valoracion
              ,[edema],[pie_atleta],[bromhidrosis]
              ,[hiperdrosis],[anhidrosis],[hiperqueratosis]
              ,[helomas],[verrugas],[observaciones],[status]
              ,CONVERT(varchar(19), [created_at], 120) AS created_at
         FROM [CentroPodologico].[dbo].[valoracion_piel]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT [id_patologia],[id_consulta],[anoniquia],[microniquia],[onicolisis],
              [onicauxis],[hematoma_subungueal],[onicofosis],[paquioniquia],
              [onicomicosis_grado_1],[onicomicosis_grado_2], [onicocriptosis]
         FROM [CentroPodologico].[dbo].[patologia_ungueal]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT [id_archivo],[id_consulta],[ruta],[tipo]
              ,CONVERT(varchar(19), [created_at], 120) AS created_at
              ,[categoria]
         FROM [CentroPodologico].[dbo].[archivos]
        WHERE [id_consulta] = @id_consulta
        ORDER BY [id_archivo] DESC`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT cp.[id_consulta_producto],cp.[id_consulta],cp.[id_producto]
              ,p.[nombre] AS nombre_producto
              ,cp.[precio],cp.[cantidad]
              ,CASE WHEN cp.[status] = 1 THEN 'activo' ELSE 'inactivo' END AS status
              ,CONVERT(varchar(19), cp.[created_at], 120) AS created_at
         FROM [CentroPodologico].[dbo].[consulta_productos] cp
         LEFT JOIN [CentroPodologico].[dbo].[productos] p ON p.[id_producto] = cp.[id_producto]
        WHERE cp.[id_consulta] = @id_consulta`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT p.[id_pago],p.[id_consulta],p.[monto]
              ,CONVERT(varchar(10), p.[fecha_pago], 120) AS fecha_pago
              ,p.[referencia]
              ,CONVERT(varchar(19), p.[created_at], 120) AS created_at
              ,p.[id_empresa],p.[idMetodoPago],p.[webid],p.[facturado],p.[uuid_cfdi]
              ,p.[id_usuario_elimino],p.[status]
              ,u.[nombre] AS nombre_usuario_elimino
         FROM [CentroPodologico].[dbo].[pagos] p
         LEFT JOIN [CentroPodologico].[dbo].[users] u ON u.[id_user] = p.[id_usuario_elimino]
        WHERE p.[id_consulta] = @id_consulta
        ORDER BY p.[id_pago] DESC`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT [id_paciente],DP.[nombre],DP.[telefono]
              ,CONVERT(varchar(10), [fecha_nacimiento], 120) AS fecha_nacimiento
              ,DP.[direccion],[observaciones_generales],DP.[created_at],[updated_at],[deleted_at]
              ,[apellido_paterno],[apellido_materno],[sexo],[whatsapp],[ciudad_preferida]
              ,[contacto_emergencia_nombre],[contacto_emergencia_whatsapp]
              ,DP.[id_sucursal],DP.[id_empresa],DS.nombre sucursal
         FROM [CentroPodologico].[dbo].[pacientes] DP
         left join dbo.sucursales DS on DS.id_sucursal=DP.id_sucursal
        WHERE [id_paciente] = @id_paciente`,
      { id_paciente },
    ),
    db.queryParams(
      `SELECT [id_proceso],[id_consulta],[valoracion_piel],[patologia_ungueal],
              [servicios],[productos],[fotos_valoracion],[fotos_pedicure],[pagar]
         FROM [CentroPodologico].[dbo].[procesos]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT [id_detalle],[id_consulta],[pie],[dedo],[grado],
              [lado_medial],[lado_lateral],[dolor]
         FROM [CentroPodologico].[dbo].[onicocriptosis_detalle]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT [id_detalle],[id_consulta],[pie],[dedo]
         FROM [CentroPodologico].[dbo].[onicomicosis_detalle]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    ),
  ]);

  return {
    consulta:   (cRows[0]   as IConsulta)              ?? null,
    valoracion: (vRows[0]   as IValoracionPiel)         ?? null,
    patologia:  (patRows[0] as IPatologiaUngueal)       ?? null,
    archivos:   (aRows      as IArchivo[])              ?? [],
    productos:  (pRows      as ConsultaProductoExtended[]) ?? [],
    pagos:      (pgRows     as IPago[])                 ?? [],
    paciente:   (pacRows[0] as IPaciente)               ?? null,
    proceso:    (procRows[0] as IProceso)               ?? null,
    onicocriptosisDetalle: (onicoRows as IOnicocriptosisDetalle[]) ?? [],
    onicomicosisDetalle: (onicomicosisRows as IOnicomicosisDetalle[]) ?? [],
  };
}

// ─── proceso ──────────────────────────────────────────────────────────────────

export async function updateProcesoField(
  id_consulta: number,
  field: ProcesoField,
  value: boolean | number,
): Promise<ActionResult<IProceso>> {
  try {
    if (!PROCESO_FIELDS.includes(field)) {
      return { ok: false, data: "Campo no permitido" };
    }
    const result = await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[procesos]
          SET [${field}] = @value
       OUTPUT INSERTED.*
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta, value: value ? 1 : 0 },
    );
    return { ok: true, data: (result[0] as IProceso) };
  } catch {
    return { ok: false, data: "Error al actualizar proceso" };
  }
}

export async function updateTratamientoOnicomicosisMessage(
  id_tratamiento: number,
): Promise<ActionResult<void>> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[Tratamiento_onicomicosis]
          SET [new_message] = 1,
              [message]     = 'NUEVA CONSULTA'
        WHERE [id_tratamiento] = @id_tratamiento`,
      { id_tratamiento },
    );
    return { ok: true, data: undefined };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al actualizar el mensaje del tratamiento de onicomicosis" };
  }
}

// ─── valoración de piel ───────────────────────────────────────────────────────

export async function saveValoracion(
  form: IValoracionPiel,
): Promise<ActionResult<IValoracionPiel>> {
  try {
    const {
      id_valoracion_piel, id_consulta,
      fecha_valoracion, edema, pie_atleta, bromhidrosis,
      hiperdrosis, anhidrosis, hiperqueratosis, helomas, verrugas,
      observaciones, status,
    } = form;

    const created_at = form.created_at || buildDate(new Date());

    const commonParams = {
      id_consulta, fecha_valoracion, edema, pie_atleta,
      bromhidrosis, hiperdrosis, anhidrosis, hiperqueratosis, helomas,
      verrugas, observaciones, status, created_at,
    };

    let result;
    if (id_valoracion_piel === 0) {
      result = await db.queryParams(
        `INSERT INTO [CentroPodologico].[dbo].[valoracion_piel]
           ([id_valoracion_piel],[id_consulta],[fecha_valoracion],[edema],
            [pie_atleta],[bromhidrosis],[hiperdrosis],[anhidrosis],[hiperqueratosis],
            [helomas],[verrugas],[observaciones],[status],[created_at])
         OUTPUT INSERTED.*
         VALUES (
           (SELECT ISNULL(MAX([id_valoracion_piel]),0)+1 FROM [CentroPodologico].[dbo].[valoracion_piel]),
           @id_consulta,@fecha_valoracion,@edema,
           @pie_atleta,@bromhidrosis,@hiperdrosis,@anhidrosis,@hiperqueratosis,
           @helomas,@verrugas,@observaciones,@status,@created_at
         )`,
        commonParams,
      );
    } else {
      result = await db.queryParams(
        `UPDATE [CentroPodologico].[dbo].[valoracion_piel] SET
           [id_consulta]      = @id_consulta,
           [fecha_valoracion] = @fecha_valoracion,
           [edema]            = @edema,
           [pie_atleta]       = @pie_atleta,
           [bromhidrosis]     = @bromhidrosis,
           [hiperdrosis]      = @hiperdrosis,
           [anhidrosis]       = @anhidrosis,
           [hiperqueratosis]  = @hiperqueratosis,
           [helomas]          = @helomas,
           [verrugas]         = @verrugas,
           [observaciones]    = @observaciones,
           [status]           = @status,
           [created_at]       = @created_at
         OUTPUT INSERTED.*
         WHERE [id_valoracion_piel] = @id_valoracion_piel`,
        { id_valoracion_piel, ...commonParams },
      );
    }

    return { ok: true, data: result?.[0] as IValoracionPiel };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al guardar la valoración" };
  }
}

// ─── patología ungueal ────────────────────────────────────────────────────────

export async function savePatologia(
  form: IPatologiaUngueal,
): Promise<ActionResult<IPatologiaUngueal>> {
  try {
    const {
      id_patologia, id_consulta, anoniquia, microniquia, onicolisis,
      onicauxis, hematoma_subungueal, onicofosis, paquioniquia,
      onicomicosis_grado_1, onicomicosis_grado_2, onicocriptosis
    } = form;

    const commonParams = {
      id_consulta, anoniquia, microniquia, onicolisis,
      onicauxis, hematoma_subungueal, onicofosis, paquioniquia, 
      onicomicosis_grado_1, onicomicosis_grado_2, onicocriptosis,
    };

    let result;
    if (id_patologia === 0) {
      result = await db.queryParams(
        `INSERT INTO [CentroPodologico].[dbo].[patologia_ungueal]
           ([id_patologia],[id_consulta],[anoniquia],[microniquia],[onicolisis],
            [onicauxis],[hematoma_subungueal],[onicofosis],[paquioniquia],
            [onicomicosis_grado_1],[onicomicosis_grado_2],[onicocriptosis])
         OUTPUT INSERTED.*
         VALUES (
           (SELECT ISNULL(MAX([id_patologia]),0)+1 FROM [CentroPodologico].[dbo].[patologia_ungueal]),
           @id_consulta,@anoniquia,@microniquia,@onicolisis,
           @onicauxis,@hematoma_subungueal,@onicofosis,@paquioniquia,
           @onicomicosis_grado_1,@onicomicosis_grado_2,@onicocriptosis
         )`,
        commonParams,
      );
    } else {
      result = await db.queryParams(
        `UPDATE [CentroPodologico].[dbo].[patologia_ungueal] SET
           [id_consulta]         = @id_consulta,
           [anoniquia]           = @anoniquia,
           [microniquia]         = @microniquia,
           [onicolisis]          = @onicolisis,
           [onicauxis]           = @onicauxis,
           [hematoma_subungueal] = @hematoma_subungueal,
           [onicofosis]          = @onicofosis,
           [paquioniquia]        = @paquioniquia,
           [onicomicosis_grado_1] = @onicomicosis_grado_1,
           [onicomicosis_grado_2] = @onicomicosis_grado_2,
           [onicocriptosis]       = @onicocriptosis
         OUTPUT INSERTED.*
         WHERE [id_patologia] = @id_patologia`,
        { id_patologia, ...commonParams },
      );
    }

    return { ok: true, data: result?.[0] as IPatologiaUngueal };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al guardar la patología" };
  }
}

// ─── onicocriptosis detalle ──────────────────────────────────────────────────

export async function getOnicocriptosisDetalle(
  id_consulta: number,
): Promise<IOnicocriptosisDetalle[]> {
  const rows = await db.queryParams(
    `SELECT [id_detalle],[id_consulta],[pie],[dedo],[grado],
            [lado_medial],[lado_lateral],[dolor]
       FROM [CentroPodologico].[dbo].[onicocriptosis_detalle]
      WHERE [id_consulta] = @id_consulta`,
    { id_consulta },
  );
  return rows as IOnicocriptosisDetalle[];
}

export async function saveOnicocriptosisDetalle(
  id_consulta: number,
  detalles: Omit<IOnicocriptosisDetalle, "id_detalle" | "id_consulta">[],
): Promise<ActionResult<IOnicocriptosisDetalle[]>> {
  try {
    await db.queryParams(
      `DELETE FROM [CentroPodologico].[dbo].[onicocriptosis_detalle]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    );

    const inserted: IOnicocriptosisDetalle[] = [];
    for (const d of detalles) {
      const result = await db.queryParams(
        `INSERT INTO [CentroPodologico].[dbo].[onicocriptosis_detalle]
           ([id_detalle],[id_consulta],[pie],[dedo],[grado],[lado_medial],[lado_lateral],[dolor])
         OUTPUT INSERTED.*
         VALUES (
           (SELECT ISNULL(MAX([id_detalle]),0)+1 FROM [CentroPodologico].[dbo].[onicocriptosis_detalle]),
           @id_consulta,@pie,@dedo,@grado,@lado_medial,@lado_lateral,@dolor
         )`,
        {
          id_consulta,
          pie: d.pie,
          dedo: d.dedo,
          grado: d.grado,
          lado_medial: d.lado_medial,
          lado_lateral: d.lado_lateral,
          dolor: d.dolor,
        },
      );
      inserted.push(result[0] as IOnicocriptosisDetalle);
    }

    return { ok: true, data: inserted };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al guardar el detalle de onicocriptosis" };
  }
}

// ─── onicomicosis detalle ────────────────────────────────────────────────────

export async function getOnicomicosisDetalle(
  id_consulta: number,
): Promise<IOnicomicosisDetalle[]> {
  const rows = await db.queryParams(
    `SELECT [id_detalle],[id_consulta],[pie],[dedo]
       FROM [CentroPodologico].[dbo].[onicomicosis_detalle]
      WHERE [id_consulta] = @id_consulta`,
    { id_consulta },
  );
  return rows as IOnicomicosisDetalle[];
}

export async function saveOnicomicosisDetalle(
  id_consulta: number,
  detalles: Omit<IOnicomicosisDetalle, "id_detalle" | "id_consulta">[],
): Promise<ActionResult<IOnicomicosisDetalle[]>> {
  try {
    await db.queryParams(
      `DELETE FROM [CentroPodologico].[dbo].[onicomicosis_detalle]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    );

    const inserted: IOnicomicosisDetalle[] = [];
    for (const d of detalles) {
      const result = await db.queryParams(
        `INSERT INTO [CentroPodologico].[dbo].[onicomicosis_detalle]
           ([id_detalle],[id_consulta],[pie],[dedo])
         OUTPUT INSERTED.*
         VALUES (
           (SELECT ISNULL(MAX([id_detalle]),0)+1 FROM [CentroPodologico].[dbo].[onicomicosis_detalle]),
           @id_consulta,@pie,@dedo
         )`,
        {
          id_consulta,
          pie: d.pie,
          dedo: d.dedo,
        },
      );
      inserted.push(result[0] as IOnicomicosisDetalle);
    }

    return { ok: true, data: inserted };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al guardar el detalle de onicomicosis" };
  }
}

// ─── costo total ─────────────────────────────────────────────────────────────

export async function updateConsultaCosto(
  id_consulta: number,
  costo_total: number,
): Promise<ActionResult<void>> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[consultas]
          SET [costo_total] = @costo_total
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta, costo_total },
    );
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, data: "Error al actualizar el costo total" };
  }
}

export async function updateConsultaFechaFin(
  id_consulta: number,
  fecha_fin: string,
): Promise<ActionResult<void>> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[consultas]
          SET [fecha_fin] = @fecha_fin
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta, fecha_fin },
    );
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, data: "Error al actualizar fecha fin" };
  }
}

export async function updateConsultaBuzon(
  id_consulta: number,
  id_buzon: number,
): Promise<ActionResult<void>> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[consultas]
          SET [id_buzon] = @id_buzon
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta, id_buzon },
    );
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, data: "Error al actualizar buzón" };
  }
}

// ─── pagos ────────────────────────────────────────────────────────────────────

export async function savePago(
  form: Omit<IPago, "id_pago" | "created_at" | "id_empresa">,
): Promise<ActionResult<IPago>> {
  try {
    const id_empresa = await getIdEmpresa();
    const created_at = buildDate(new Date());

    const webid =createWebId(8);

    await db.queryParams(
      
      `
      declare @const int=(SELECT ISNULL(MAX([id_pago]),0)+1 FROM [CentroPodologico].[dbo].[pagos])
      INSERT INTO [CentroPodologico].[dbo].[pagos]
         ([id_pago],[id_consulta],[monto],[fecha_pago],[referencia],[created_at],[id_empresa],[idMetodoPago],[webid],[facturado],[uuid_cfdi],[status],[id_usuario_elimino])
       VALUES (
         @const,
         @id_consulta,@monto,@fecha_pago,@referencia,@created_at,@id_empresa,@idMetodoPago,CONVERT(varchar,@const)+'-'+@webid,@facturado,@uuid_cfdi,1,NULL
       )`,
      {
        id_consulta:  form.id_consulta,
        monto:        form.monto,
        fecha_pago:   form.fecha_pago,
        referencia:   form.referencia,
        created_at,
        id_empresa,
        idMetodoPago: form.idMetodoPago ?? null,
        webid,
        facturado:    false,
        uuid_cfdi:    null,
      },
    );

    const rows = await db.queryParams(
      `SELECT TOP 1 p.[id_pago],p.[id_consulta],p.[monto]
              ,CONVERT(varchar(10), p.[fecha_pago], 120) AS fecha_pago
              ,p.[referencia]
              ,CONVERT(varchar(19), p.[created_at], 120) AS created_at
              ,p.[id_empresa],p.[idMetodoPago],p.[webid],p.[facturado],p.[uuid_cfdi]
              ,p.[id_usuario_elimino],p.[status]
              ,u.[nombre] AS nombre_usuario_elimino
         FROM [CentroPodologico].[dbo].[pagos] p
         LEFT JOIN [CentroPodologico].[dbo].[users] u ON u.[id_user] = p.[id_usuario_elimino]
        WHERE p.[id_consulta] = @id_consulta
        ORDER BY [id_pago] DESC`,
      { id_consulta: form.id_consulta },
    );

    return { ok: true, data: rows?.[0] as IPago };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al registrar el pago" };
  }
}

// ─── cita estado ─────────────────────────────────────────────────────────────

export async function updateCitaEstado(
  id_cita: number,
  estado: string,
): Promise<ActionResult<void>> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[citas]
          SET [estado] = @estado
        WHERE [id_cita] = @id_cita`,
      { id_cita, estado },
    );
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, data: "Error al actualizar el estado de la cita" };
  }
}

// ─── métodos de pago ──────────────────────────────────────────────────────────

export async function getMetodosPago(): Promise<IMetodoPago[]> {
  const rows = await db.query(
    `SELECT [idMetodoPago],[descripcion],[clave],[eliminado],[activo]
       FROM [CentroPodologico].[dbo].[MetodosPagos]
      WHERE [activo] = 1 AND ([eliminado] IS NULL OR [eliminado] = 0)
      ORDER BY [descripcion]`,
  );
  return rows as IMetodoPago[];
}

// ─── servicios con opciones ───────────────────────────────────────────────────

export interface ServicioConOpciones extends IServicio {
  opciones: IServicioOpcion[];
}

export async function getServiciosTabData(id_consulta: number): Promise<{
  servicios:         ServicioConOpciones[];
  consultaServicios: IConsultaServicio[];
}> {
  const id_empresa = await getIdEmpresa();

  const consultaRows = await db.queryParams(
    `SELECT [id_sucursal]
       FROM [CentroPodologico].[dbo].[consultas]
      WHERE [id_consulta] = @id_consulta`,
    { id_consulta },
  );
  if (consultaRows.length === 0) {
    throw new Error("La consulta no existe");
  }
  const id_sucursal = Number(consultaRows[0].id_sucursal);

  const [rows, csRows] = await Promise.all([
    db.queryParams(
      `SELECT s.[id_servicio], s.[nombre], s.[status],
              CONVERT(varchar(19), s.[cretated_at], 120) AS cretated_at,
              s.[id_empresa],
              so.[id_servicio_opcion], so.[nombre] AS opcion_nombre, so.[descripcion], so.[precio], so.[id_sucursal]
         FROM [CentroPodologico].[dbo].[servicios] s
         LEFT JOIN [CentroPodologico].[dbo].[servicio_opciones] so
                ON so.[id_servicio] = s.[id_servicio] AND so.[status] = 1
               AND so.[id_sucursal] = @id_sucursal
        WHERE s.[status] = 1
          AND s.[id_empresa] = @id_empresa
          AND s.[id_sucursal] = @id_sucursal
        ORDER BY s.[id_servicio], so.[id_servicio_opcion]`,
      { id_empresa, id_sucursal },
    ),
    db.queryParams(
      `SELECT [id_consulta_servicio],[id_consulta],[id_servicio_opcion],[precio_aplicado]
         FROM [CentroPodologico].[dbo].[consulta_servicios]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    ),
  ]);

  type JoinRow = IServicio & {
    id_servicio_opcion: number | null;
    opcion_nombre:      string | null;
    descripcion:        string | null;
    precio:             number | null;
    id_sucursal:        number | null;
  };

  const servicioMap = new Map<number, ServicioConOpciones>();
  for (const r of rows as JoinRow[]) {
    if (!servicioMap.has(r.id_servicio)) {
      servicioMap.set(r.id_servicio, {
        id_servicio: r.id_servicio,
        nombre:      r.nombre,
        descripcion: (r as IServicio).descripcion ?? "",
        status:      r.status,
        cretated_at: r.cretated_at,
        id_empresa:  r.id_empresa,
        id_sucursal: r.id_sucursal ?? 0,
        opciones:    [],
      });
    }
    if (r.id_servicio_opcion !== null) {
      servicioMap.get(r.id_servicio)!.opciones.push({
        id_servicio_opcion: r.id_servicio_opcion,
        id_servicio:        r.id_servicio,
        nombre:             r.opcion_nombre!,
        descripcion:        r.descripcion!,
        precio:             r.precio!,
        id_sucursal:        r.id_sucursal ?? 0,
        status:             true,
      });
    }
  }

  return {
    servicios:         Array.from(servicioMap.values()),
    consultaServicios: csRows as IConsultaServicio[],
  };
}

export async function selectServicioOpcion(
  id_consulta:      number,
  id_servicio:      number,
  id_servicio_opcion: number,
  precio_aplicado:  number,
): Promise<ActionResult<IConsultaServicio | null>> {
  try {
    // Remove previous selection for this service in this consultation
    await db.queryParams(
      `DELETE cs
         FROM [CentroPodologico].[dbo].[consulta_servicios] cs
         JOIN [CentroPodologico].[dbo].[servicio_opciones] so
           ON so.[id_servicio_opcion] = cs.[id_servicio_opcion]
        WHERE cs.[id_consulta] = @id_consulta
          AND so.[id_servicio] = @id_servicio`,
      { id_consulta, id_servicio },
    );

    if (id_servicio_opcion === 0) {
      return { ok: true, data: null };
    }

    const matchRows = await db.queryParams(
      `SELECT so.[id_servicio_opcion]
         FROM [CentroPodologico].[dbo].[servicio_opciones] so
         JOIN [CentroPodologico].[dbo].[consultas] c ON c.[id_sucursal] = so.[id_sucursal]
        WHERE so.[id_servicio_opcion] = @id_servicio_opcion
          AND c.[id_consulta] = @id_consulta`,
      { id_servicio_opcion, id_consulta },
    );
    if (matchRows.length === 0) {
      return { ok: false, data: "Esta opción no pertenece a la sucursal de la consulta" };
    }

    const result = await db.queryParams(
      `INSERT INTO [CentroPodologico].[dbo].[consulta_servicios]
         ([id_consulta_servicio],[id_consulta],[id_servicio_opcion],[precio_aplicado])
       OUTPUT INSERTED.*
       VALUES (
         (SELECT ISNULL(MAX([id_consulta_servicio]),0)+1 FROM [CentroPodologico].[dbo].[consulta_servicios]),
         @id_consulta,@id_servicio_opcion,@precio_aplicado
       )`,
      { id_consulta, id_servicio_opcion, precio_aplicado },
    );

    return { ok: true, data: result?.[0] as IConsultaServicio };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al guardar la selección de servicio" };
  }
}

// ─── consulta productos ───────────────────────────────────────────────────────

const CONSULTA_PRODUCTOS_SELECT = `
  SELECT cp.[id_consulta_producto],cp.[id_consulta],cp.[id_producto]
        ,p.[name] AS nombre_producto
        ,cp.[precio],cp.[cantidad]
        ,CASE WHEN cp.[status] = 1 THEN 'activo' ELSE 'inactivo' END AS status
        ,CONVERT(varchar(19), cp.[created_at], 120) AS created_at
    FROM [CentroPodologico].[dbo].[consulta_productos] cp
    LEFT JOIN [CentroPodologico].[inventory].[Products] p ON p.[id_product] = cp.[id_producto]`;

export async function getConsultaProductos(
  id_consulta: number,
): Promise<ConsultaProductoExtended[]> {
  const rows = await db.queryParams(
    `${CONSULTA_PRODUCTOS_SELECT}
    WHERE cp.[id_consulta] = @id_consulta
    ORDER BY cp.[id_consulta_producto]`,
    { id_consulta },
  );
  return rows as ConsultaProductoExtended[];
}

/**
 * Productos de categoría "Venta" de `inventory.Products`, con precio efectivo y
 * stock actual en `id_sucursal` (ver spec 16/17) — reemplaza el catálogo legacy
 * de `dbo.productos`.
 */
export async function getProductosCatalogo(id_consulta: number): Promise<ISaleProduct[]> {
  const consultaRows = await db.queryParams(
    `SELECT [id_sucursal]
       FROM [CentroPodologico].[dbo].[consultas]
      WHERE [id_consulta] = @id_consulta`,
    { id_consulta },
  );
  if (consultaRows.length === 0) {
    throw new Error("La consulta no existe");
  }
  const id_sucursal = Number(consultaRows[0].id_sucursal);

  return getSaleProducts(id_sucursal);
}

/**
 * Agrega un producto a la consulta, descontando `inventory.stock` de la sucursal
 * de la consulta (mov. `6`) dentro de la misma transacción que el `INSERT` a
 * `dbo.consulta_productos` (ver spec 17, "Modelo de datos").
 */
export async function addConsultaProducto(
  id_consulta: number,
  id_producto:  number,
  precio:       number,
  cantidad:     number,
): Promise<ActionResult<ConsultaProductoExtended>> {
  try {
    const created_at = buildDate(new Date());
    const id_user = await getIdUser();

    let new_id = 0;
    await db.transaction(async (tx) => {
      const consultaRows = await tx.queryParams(
        `SELECT [id_sucursal],[id_empresa]
           FROM [CentroPodologico].[dbo].[consultas]
          WHERE [id_consulta] = @id_consulta`,
        { id_consulta },
      );
      if (consultaRows.length === 0) {
        throw new Error("La consulta no existe");
      }
      const id_sucursal = Number(consultaRows[0].id_sucursal);
      const id_empresa = Number(consultaRows[0].id_empresa);
      const id_unit_measurement = await getStockUnitMeasurement(tx, id_producto);

      const inserted = await tx.queryParams(
        `INSERT INTO [CentroPodologico].[dbo].[consulta_productos]
           ([id_consulta_producto],[id_consulta],[id_producto],[precio],[cantidad],[status],[created_at])
         OUTPUT INSERTED.[id_consulta_producto] AS new_id
         VALUES (
           (SELECT ISNULL(MAX([id_consulta_producto]),0)+1 FROM [CentroPodologico].[dbo].[consulta_productos]),
           @id_consulta,@id_producto,@precio,@cantidad,1,@created_at
         )`,
        { id_consulta, id_producto, precio, cantidad, created_at },
      );
      new_id = (inserted[0] as { new_id: number }).new_id;

      await applyStockMovement(tx, {
        id_product: id_producto,
        id_sucursal,
        id_empresa,
        id_movement: MOVEMENT_SALIDA_POR_VENTA,
        quantity: cantidad,
        id_unit_measurement,
        id_consulta,
        id_user,
      });
    });

    const rows = await db.queryParams(
      `${CONSULTA_PRODUCTOS_SELECT} WHERE cp.[id_consulta_producto] = @new_id`,
      { new_id },
    );
    return { ok: true, data: rows[0] as ConsultaProductoExtended };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al agregar el producto" };
  }
}

/**
 * Actualiza cantidad/precio/status de un producto de la consulta, ajustando el
 * stock de la sucursal de la consulta según la transición `status`/`cantidad`
 * (ver spec 17, tabla de transiciones), dentro de la misma transacción que el
 * `UPDATE` a `dbo.consulta_productos`.
 */
export async function updateConsultaProducto(
  id_consulta_producto: number,
  precio:               number,
  cantidad:             number,
  status:               string,
): Promise<ActionResult<ConsultaProductoExtended>> {
  try {
    const id_user = await getIdUser();

    await db.transaction(async (tx) => {
      const currentRows = await tx.queryParams(
        `SELECT cp.[id_producto], cp.[cantidad], cp.[status], cp.[id_consulta],
                c.[id_sucursal], c.[id_empresa]
           FROM [CentroPodologico].[dbo].[consulta_productos] cp WITH (UPDLOCK, HOLDLOCK)
           JOIN [CentroPodologico].[dbo].[consultas] c ON c.[id_consulta] = cp.[id_consulta]
          WHERE cp.[id_consulta_producto] = @id_consulta_producto`,
        { id_consulta_producto },
      );
      if (currentRows.length === 0) {
        throw new Error("El producto de la consulta no existe");
      }
      const current = currentRows[0];
      const id_producto  = Number(current.id_producto);
      const oldCantidad   = Number(current.cantidad);
      const wasActivo     = Boolean(current.status);
      const willBeActivo  = status === "activo";
      const id_consulta   = Number(current.id_consulta);
      const id_sucursal   = Number(current.id_sucursal);
      const id_empresa    = Number(current.id_empresa);

      let movement: { id_movement: number; quantity: number; notes: string | null } | null = null;

      if (wasActivo && willBeActivo) {
        const delta = cantidad - oldCantidad;
        if (delta > 0) {
          movement = { id_movement: MOVEMENT_SALIDA_POR_VENTA, quantity: delta, notes: null };
        } else if (delta < 0) {
          movement = {
            id_movement: MOVEMENT_ENTRADA_POR_AJUSTE,
            quantity: Math.abs(delta),
            notes: `Reversión por edición de producto en consulta #${id_consulta}`,
          };
        }
      } else if (wasActivo && !willBeActivo) {
        movement = {
          id_movement: MOVEMENT_ENTRADA_POR_AJUSTE,
          quantity: oldCantidad,
          notes: `Reversión por edición de producto en consulta #${id_consulta}`,
        };
      } else if (!wasActivo && willBeActivo) {
        movement = { id_movement: MOVEMENT_SALIDA_POR_VENTA, quantity: cantidad, notes: null };
      }

      if (movement) {
        const id_unit_measurement = await getStockUnitMeasurement(tx, id_producto);
        await applyStockMovement(tx, {
          id_product: id_producto,
          id_sucursal,
          id_empresa,
          id_movement: movement.id_movement,
          quantity: movement.quantity,
          id_unit_measurement,
          id_consulta,
          notes: movement.notes,
          id_user,
        });
      }

      await tx.queryParams(
        `UPDATE [CentroPodologico].[dbo].[consulta_productos]
            SET [precio]   = @precio,
                [cantidad] = @cantidad,
                [status]   = CASE WHEN @status = 'activo' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END
          WHERE [id_consulta_producto] = @id_consulta_producto`,
        { id_consulta_producto, precio, cantidad, status },
      );
    });

    const rows = await db.queryParams(
      `${CONSULTA_PRODUCTOS_SELECT} WHERE cp.[id_consulta_producto] = @id_consulta_producto`,
      { id_consulta_producto },
    );
    return { ok: true, data: rows[0] as ConsultaProductoExtended };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al actualizar el producto" };
  }
}

/**
 * Elimina un producto de la consulta, revirtiendo por completo el stock que
 * había descontado (mov. `7`) si estaba `activo`, antes del `DELETE`, dentro de
 * la misma transacción (ver spec 17).
 */
export async function deleteConsultaProducto(
  id_consulta_producto: number,
): Promise<ActionResult<null>> {
  try {
    const id_user = await getIdUser();

    await db.transaction(async (tx) => {
      const currentRows = await tx.queryParams(
        `SELECT cp.[id_producto], cp.[cantidad], cp.[status], cp.[id_consulta],
                c.[id_sucursal], c.[id_empresa]
           FROM [CentroPodologico].[dbo].[consulta_productos] cp WITH (UPDLOCK, HOLDLOCK)
           JOIN [CentroPodologico].[dbo].[consultas] c ON c.[id_consulta] = cp.[id_consulta]
          WHERE cp.[id_consulta_producto] = @id_consulta_producto`,
        { id_consulta_producto },
      );
      if (currentRows.length === 0) {
        throw new Error("El producto de la consulta no existe");
      }
      const current = currentRows[0];
      const wasActivo = Boolean(current.status);

      if (wasActivo) {
        const id_producto  = Number(current.id_producto);
        const cantidad      = Number(current.cantidad);
        const id_consulta   = Number(current.id_consulta);
        const id_sucursal   = Number(current.id_sucursal);
        const id_empresa    = Number(current.id_empresa);
        const id_unit_measurement = await getStockUnitMeasurement(tx, id_producto);

        await applyStockMovement(tx, {
          id_product: id_producto,
          id_sucursal,
          id_empresa,
          id_movement: MOVEMENT_ENTRADA_POR_AJUSTE,
          quantity: cantidad,
          id_unit_measurement,
          id_consulta,
          notes: `Reversión por eliminación de producto en consulta #${id_consulta}`,
          id_user,
        });
      }

      await tx.queryParams(
        `DELETE FROM [CentroPodologico].[dbo].[consulta_productos]
          WHERE [id_consulta_producto] = @id_consulta_producto`,
        { id_consulta_producto },
      );
    });

    return { ok: true, data: null };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al eliminar el producto" };
  }
}

// ─── general tab data ────────────────────────────────────────────────────────

export interface ServicioResumen {
  id_consulta_servicio: number;
  nombre_servicio:      string;
  descripcion_opcion:   string;
  precio_aplicado:      number;
}

export interface GeneralTabData {
  antecedentes:      IAntecedenteMedico | null;
  serviciosUsados:   ServicioResumen[];
  productos:         ConsultaProductoExtended[];
  nombrePodologo:    string | null;
  sucursalNombre:    string | null;
  sucursalCiudad:    string | null;
  patologiaUrls:     Record<string, string>;
  pagoWebId:         string | null;
  phoneCode:         string | null;
  tratamientoExiste: boolean;
  idTratamiento:     number | null;
  citaExiste:        boolean;
}

export async function getGeneralTabData(
  id_consulta:  number,
  id_paciente:  number,
  id_podologo:  number,
  id_sucursal:  number,
): Promise<GeneralTabData> {
  const [antRows, sRows, pRows, podRows, sucRows, urlRows, pagoRows, phoneRows, tratRows, citaRows] = await Promise.all([
    db.queryParams(
      `SELECT [id_antecedente_medico],[id_paciente]
              ,CONVERT(varchar(10), [fecha_registro], 120) AS fecha_registro
              ,[alergia_anestesia],[alergia_antibioticos],[alergia_sulfas],[alergia_latex]
              ,[alergia_ninguna],[diabetico],[hipertenso],[hipotiroidismo],[cancer]
              ,[embarazada],[lactando],[fracturas],[antecedentes_dermatologicos]
              ,[medicamentos_actuales],[tipo_sangre],[otros]
         FROM [CentroPodologico].[dbo].[antecedentes_medicos]
        WHERE [id_paciente] = @id_paciente`,
      { id_paciente },
    ),
    db.queryParams(
      `SELECT cs.[id_consulta_servicio]
              ,s.[nombre]  AS nombre_servicio
              ,so.[descripcion] AS descripcion_opcion
              ,cs.[precio_aplicado]
         FROM [CentroPodologico].[dbo].[consulta_servicios] cs
         JOIN [CentroPodologico].[dbo].[servicio_opciones] so
           ON so.[id_servicio_opcion] = cs.[id_servicio_opcion]
         JOIN [CentroPodologico].[dbo].[servicios] s
           ON s.[id_servicio] = so.[id_servicio]
        WHERE cs.[id_consulta] = @id_consulta
        ORDER BY s.[id_servicio]`,
      { id_consulta },
    ),
    db.queryParams(
      `${CONSULTA_PRODUCTOS_SELECT}
        WHERE cp.[id_consulta] = @id_consulta
        ORDER BY cp.[id_consulta_producto]`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT [nombre] FROM [CentroPodologico].[dbo].[users] WHERE [id_user] = @id_podologo`,
      { id_podologo },
    ),
    db.queryParams(
      `SELECT [nombre],[ciudad] FROM [CentroPodologico].[dbo].[sucursales] WHERE [id_sucursal] = @id_sucursal`,
      { id_sucursal },
    ),
    db.query(
      `SELECT [nombre_patologia],[url]
         FROM [CentroPodologico].[dbo].[patologia_urls]
        WHERE [status] = 1 AND [url] IS NOT NULL AND [url] <> ''`,
    ),
    db.queryParams(
      `SELECT TOP 1 [webid]
         FROM [CentroPodologico].[dbo].[pagos]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT ct.[codigo]
         FROM [CentroPodologico].[dbo].[pacientes] p
         LEFT JOIN [CentroPodologico].[dbo].[codigos_telefonicos] ct
           ON ct.[id_phone_code] = p.[id_phone_code]
        WHERE p.[id_paciente] = @id_paciente`,
      { id_paciente },
    ),
    db.queryParams(
      `SELECT TOP 1 [id_tratamiento]
         FROM [CentroPodologico].[dbo].[Tratamiento_onicomicosis]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    ),
    db.queryParams(
      `SELECT TOP 1 1 AS existe
         FROM [CentroPodologico].[dbo].[citas]
        WHERE [id_consulta] = @id_consulta`,
      { id_consulta },
    ),
  ]);

  const pod = (podRows[0] as { nombre?: string } | undefined);
  const suc = (sucRows[0] as { nombre?: string; ciudad?: string } | undefined);

  const patologiaUrls: Record<string, string> = {};
  (urlRows as { nombre_patologia: string; url: string }[]).forEach((r) => {
    patologiaUrls[r.nombre_patologia] = r.url;
  });

  const pago  = (pagoRows[0]  as { webid?:  string } | undefined);
  const phone = (phoneRows[0] as { codigo?: string } | undefined);

  const trat = (tratRows[0] as { id_tratamiento?: number } | undefined);

  return {
    antecedentes:      (antRows[0] as IAntecedenteMedico) ?? null,
    serviciosUsados:   sRows as ServicioResumen[],
    productos:         pRows as ConsultaProductoExtended[],
    nombrePodologo:    pod?.nombre ?? null,
    sucursalNombre:    suc?.nombre ?? null,
    sucursalCiudad:    suc?.ciudad ?? null,
    patologiaUrls,
    pagoWebId:         pago?.webid  ?? null,
    phoneCode:         phone?.codigo ?? null,
    tratamientoExiste: tratRows.length > 0,
    idTratamiento:     trat?.id_tratamiento ?? null,
    citaExiste:        citaRows.length > 0,
  };
}

// ─── archivos ─────────────────────────────────────────────────────────────────

export async function saveArchivo(
  archivo: Omit<IArchivo, "id_archivo">,
): Promise<ActionResult<IArchivo>> {
  try {
    const result = await db.queryParams(
      `INSERT INTO [CentroPodologico].[dbo].[archivos]
         ([id_archivo],[id_consulta],[ruta],[tipo],[created_at],[categoria])
       OUTPUT INSERTED.*
       VALUES (
         (SELECT ISNULL(MAX([id_archivo]),0)+1 FROM [CentroPodologico].[dbo].[archivos]),
         @id_consulta,@ruta,@tipo,@created_at,@categoria
       )`,
      {
        id_consulta: archivo.id_consulta,
        ruta:        archivo.ruta,
        tipo:        archivo.tipo,
        created_at:  archivo.created_at,
        categoria:   archivo.categoria,
      },
    );

    return { ok: true, data: result?.[0] as IArchivo };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al registrar el archivo" };
  }
}

// ─── editar pago ─────────────────────────────────────────────────────────────

export interface EditarPagoData {
  monto:        number;
  idMetodoPago: number;
  fecha_pago:   string;
  referencia:   string;
}

export async function editarPago(
  id_pago: number,
  data: EditarPagoData,
): Promise<ActionResult<IPago>> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[pagos]
          SET [monto]        = @monto,
              [idMetodoPago] = @idMetodoPago,
              [fecha_pago]   = @fecha_pago,
              [referencia]   = @referencia
        WHERE [id_pago] = @id_pago`,
      {
        id_pago,
        monto:        data.monto,
        idMetodoPago: data.idMetodoPago,
        fecha_pago:   toDBString(String(data.fecha_pago ?? "")) ?? data.fecha_pago,
        referencia:   data.referencia,
      },
    );

    const rows = await db.queryParams(
      `SELECT TOP 1 p.[id_pago],p.[id_consulta],p.[monto]
              ,CONVERT(varchar(10), p.[fecha_pago], 120) AS fecha_pago
              ,p.[referencia]
              ,CONVERT(varchar(19), p.[created_at], 120) AS created_at
              ,p.[id_empresa],p.[idMetodoPago],p.[webid],p.[facturado],p.[uuid_cfdi]
              ,p.[id_usuario_elimino],p.[status]
              ,u.[nombre] AS nombre_usuario_elimino
         FROM [CentroPodologico].[dbo].[pagos] p
         LEFT JOIN [CentroPodologico].[dbo].[users] u ON u.[id_user] = p.[id_usuario_elimino]
        WHERE p.[id_pago] = @id_pago`,
      { id_pago },
    );

    return { ok: true, data: rows?.[0] as IPago };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al editar el pago" };
  }
}

// ─── eliminar pago (soft-delete) ─────────────────────────────────────────────

export async function eliminarPago(
  id_pago: number,
  id_usuario: number,
): Promise<ActionResult<IPago>> {
  try {
    await db.queryParams(
      `UPDATE [CentroPodologico].[dbo].[pagos]
          SET [status] = 0, [id_usuario_elimino] = @id_usuario
        WHERE [id_pago] = @id_pago`,
      { id_pago, id_usuario },
    );

    const rows = await db.queryParams(
      `SELECT TOP 1 p.[id_pago],p.[id_consulta],p.[monto]
              ,CONVERT(varchar(10), p.[fecha_pago], 120) AS fecha_pago
              ,p.[referencia]
              ,CONVERT(varchar(19), p.[created_at], 120) AS created_at
              ,p.[id_empresa],p.[idMetodoPago],p.[webid],p.[facturado],p.[uuid_cfdi]
              ,p.[id_usuario_elimino],p.[status]
              ,u.[nombre] AS nombre_usuario_elimino
         FROM [CentroPodologico].[dbo].[pagos] p
         LEFT JOIN [CentroPodologico].[dbo].[users] u ON u.[id_user] = p.[id_usuario_elimino]
        WHERE p.[id_pago] = @id_pago`,
      { id_pago },
    );

    return { ok: true, data: rows?.[0] as IPago };
  } catch (err) {
    console.error(err);
    return { ok: false, data: "Error al eliminar el pago" };
  }
}
