"use server";

import db, { ITransactionClient } from "@/database/connection";
import { applyStockMovement } from "@/lib/inventory/stock";
import { IVenta, IVentaDetalle } from "@/interfaces/venta";
import { IMetodoPago } from "@/interfaces/metodo_pago";
import { IAuthUser } from "@/interfaces/auth";
import { buildDate } from "@/utils/date_helpper";
import { createWebId } from "@/utils/random";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { z } from "zod";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET_SEED!);

/** Movimientos de kardex (ver queries.txt, inventory.movements). */
const MOVEMENT_SALIDA_POR_VENTA = 6;
const MOVEMENT_ENTRADA_POR_AJUSTE = 7;
/** Categoría de `inventory.Products` vendible desde /dashboard/ventas (spec 12). */
const SALE_CATEGORY_ID = 4;

async function getActiveUser(): Promise<IAuthUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) throw new Error("No autenticado");
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as IAuthUser;
}

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

/**
 * Precio efectivo (`sale_price` si `split = 1`, si no `price`) de un conjunto de
 * productos vendibles, para tomar el snapshot de `precio_unitario` al guardar una
 * línea nueva o con cantidad modificada (nunca se confía en un precio mandado por
 * el cliente — mismo criterio que spec 34 aplicó al importe de facturación).
 */
async function getSaleProductsPricing(
  tx: ITransactionClient,
  id_empresa: number,
  ids: number[]
): Promise<Map<number, { effective_price: number; id_stock_unit_measurement: number | null }>> {
  const params: Record<string, unknown> = { id_empresa, id_category: SALE_CATEGORY_ID };
  const placeholders = ids
    .map((id, index) => {
      params[`id_producto_${index}`] = id;
      return `@id_producto_${index}`;
    })
    .join(",");

  const rows = await tx.queryParams(
    `SELECT p.[id_product],
            CASE WHEN p.[split] = 1 AND p.[sale_price] IS NOT NULL
                 THEN p.[sale_price]
                 ELSE p.[price]
            END AS effective_price,
            p.[id_stock_unit_measurement]
       FROM [CentroPodologico].[inventory].[Products] p
      WHERE p.[id_category] = @id_category
        AND p.[activo] = 1
        AND p.[status] = 1
        AND p.[id_empresa] = @id_empresa
        AND p.[id_product] IN (${placeholders})`,
    params
  );

  const pricingByProduct = new Map<
    number,
    { effective_price: number; id_stock_unit_measurement: number | null }
  >();
  for (const row of rows) {
    pricingByProduct.set(Number(row.id_product), {
      effective_price: Number(row.effective_price),
      id_stock_unit_measurement: row.id_stock_unit_measurement,
    });
  }
  return pricingByProduct;
}

/** Producto vendible (categoría Venta) con precio efectivo y stock actual en la sucursal. */
export interface ISaleProduct {
  id_product:                number;
  name:                      string;
  effective_price:           number;
  id_stock_unit_measurement: number | null;
  unit_code:                 string | null;
  stock_quantity:            number;
}

/**
 * Productos de categoría "Venta" (id_category = 4), activos, de la empresa del usuario,
 * con su precio efectivo (`sale_price` si `split = 1`, si no `price`) y su stock actual
 * en `id_sucursal` (0 si no hay fila en `inventory.stock`).
 */
export async function getSaleProducts(id_sucursal: number): Promise<ISaleProduct[]> {
  const { id_empresa } = await getActiveUser();
  const rows = await db.queryParams(
    `SELECT p.[id_product],
            p.[name],
            CASE WHEN p.[split] = 1 AND p.[sale_price] IS NOT NULL
                 THEN p.[sale_price]
                 ELSE p.[price]
            END AS effective_price,
            p.[id_stock_unit_measurement],
            um.[code] AS unit_code,
            ISNULL(s.[quantity], 0) AS stock_quantity
       FROM [CentroPodologico].[inventory].[Products] p
       LEFT JOIN [CentroPodologico].[inventory].[stock] s
         ON s.[id_product] = p.[id_product] AND s.[id_sucursal] = @id_sucursal
       LEFT JOIN [CentroPodologico].[inventory].[units_measurement] um
         ON um.[id_unit_measurement] = p.[id_stock_unit_measurement]
      WHERE p.[id_category] = @id_category
        AND p.[activo] = 1
        AND p.[status] = 1
        AND p.[id_empresa] = @id_empresa
      ORDER BY p.[name]`,
    { id_sucursal, id_empresa, id_category: SALE_CATEGORY_ID }
  );
  return rows.map((row) => ({
    id_product: row.id_product,
    name: row.name,
    effective_price: Number(row.effective_price),
    id_stock_unit_measurement: row.id_stock_unit_measurement,
    unit_code: row.unit_code,
    stock_quantity: Number(row.stock_quantity),
  }));
}

/**
 * Trae los tickets de venta (encabezado) de la sucursal/rango dados, con sus líneas
 * anidadas. Dos consultas — encabezados y luego `VentasDetalle` filtrado por los
 * `id_venta` resultantes — ensambladas en JS (sin `FOR JSON`, siguiendo el estilo de
 * raw SQL del resto del repo, ver spec 35).
 */
export async function getVentas(
  id_sucursal: number,
  fechaInicio: string,
  fechaFin: string
): Promise<IVenta[]> {
  const headers = await db.queryParams(
    `SELECT v.[id_venta],
            v.[id_sucursal],
            v.[idMetodoPago],
            v.[total],
            CONVERT(varchar(19), v.[created_at], 120) AS created_at,
            v.[id_usuario],
            v.[status],
            v.[webid],
            v.[facturado],
            v.[uuid_cfdi],
            mp.[descripcion] AS descripcion_metodo
       FROM [CentroPodologico].[dbo].[Ventas] v
  LEFT JOIN [CentroPodologico].[dbo].[MetodosPagos] mp
         ON mp.[idMetodoPago] = v.[idMetodoPago]
      WHERE v.[status] = 1
        AND v.[id_sucursal] = @id_sucursal
        AND CAST(v.[created_at] AS DATE) >= CAST(@fechaInicio AS DATE)
        AND CAST(v.[created_at] AS DATE) <= CAST(@fechaFin AS DATE)
      ORDER BY v.[created_at] DESC`,
    { id_sucursal, fechaInicio, fechaFin }
  );

  if (headers.length === 0) return [];

  const detailParams: Record<string, unknown> = {};
  const ventaPlaceholders = headers
    .map((header, index) => {
      detailParams[`id_venta_${index}`] = Number(header.id_venta);
      return `@id_venta_${index}`;
    })
    .join(",");

  const detailRows = await db.queryParams(
    `SELECT vd.[id_venta],
            vd.[id_venta_detalle],
            vd.[id_producto],
            vd.[cantidad],
            vd.[precio_unitario],
            vd.[subtotal],
            p.[name] AS nombre_producto
       FROM [CentroPodologico].[dbo].[VentasDetalle] vd
  LEFT JOIN [CentroPodologico].[inventory].[Products] p
         ON p.[id_product] = vd.[id_producto]
      WHERE vd.[id_venta] IN (${ventaPlaceholders})
      ORDER BY vd.[id_venta_detalle]`,
    detailParams
  );

  const lineasByVenta = new Map<number, IVentaDetalle[]>();
  for (const row of detailRows) {
    const idVenta = Number(row.id_venta);
    const lineas = lineasByVenta.get(idVenta) ?? [];
    lineas.push({
      id_venta_detalle: Number(row.id_venta_detalle),
      id_producto: Number(row.id_producto),
      nombre_producto: row.nombre_producto ?? undefined,
      cantidad: Number(row.cantidad),
      precio_unitario: Number(row.precio_unitario),
      subtotal: Number(row.subtotal),
    });
    lineasByVenta.set(idVenta, lineas);
  }

  return headers.map((header) => ({
    id_venta: Number(header.id_venta),
    id_sucursal: Number(header.id_sucursal),
    idMetodoPago: Number(header.idMetodoPago),
    total: Number(header.total),
    created_at: header.created_at,
    id_usuario: Number(header.id_usuario),
    status: Number(header.status),
    webid: header.webid,
    facturado: header.facturado,
    uuid_cfdi: header.uuid_cfdi,
    lineas: lineasByVenta.get(Number(header.id_venta)) ?? [],
    descripcion_metodo: header.descripcion_metodo,
  }));
}

export async function getMetodosPagos(): Promise<IMetodoPago[]> {
  const data = await db.query(
    `SELECT [idMetodoPago], [descripcion], [clave], [eliminado], [activo]
       FROM [CentroPodologico].[dbo].[MetodosPagos]
      WHERE [activo] = 1 AND [eliminado] = 0`
  );
  return data as IMetodoPago[];
}

export type VentaLineaForm = {
  id_venta_detalle?: number; // presente = línea existente; ausente = línea nueva
  id_producto:       number;
  cantidad:          number;
};

export type VentaForm = {
  id_venta:     number; // 0 = nueva venta
  id_sucursal:  number;
  idMetodoPago: number;
  lineas:       VentaLineaForm[];
};

const ventaLineaFormSchema = z.object({
  id_venta_detalle: z.number().int().positive().optional(),
  id_producto: z.number().int().positive(),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0"),
});

const ventaFormSchema = z.object({
  id_venta: z.number().int().nonnegative(),
  id_sucursal: z.number().int().positive(),
  idMetodoPago: z.number().int().positive(),
  lineas: z.array(ventaLineaFormSchema).min(1, "El ticket debe tener al menos un producto"),
});

/**
 * Crea o actualiza un ticket de venta (encabezado + líneas), reflejando el ajuste
 * de stock correspondiente por línea dentro de la misma transacción (ver spec 35,
 * "Cálculo del ajuste de stock al editar"). `id_empresa` e `id_user` se toman del
 * JWT; `id_sucursal` viaja explícito desde `SucursalContext` solo para la creación.
 */
export async function saveVenta(
  form: VentaForm
): Promise<{ ok: boolean; message?: string }> {
  try {
    const parsed = ventaFormSchema.safeParse(form);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const { id_venta, id_sucursal, idMetodoPago, lineas } = parsed.data;
    const { id_empresa, id_user } = await getActiveUser();

    await db.transaction(async (tx) => {
      if (id_venta === 0) {
        const pricingByProduct = await getSaleProductsPricing(
          tx,
          id_empresa,
          [...new Set(lineas.map((linea) => linea.id_producto))]
        );
        for (const linea of lineas) {
          if (!pricingByProduct.has(linea.id_producto)) {
            throw new Error(
              `El producto con id ${linea.id_producto} no existe, no está activo o no pertenece a la empresa`
            );
          }
        }

        const nextIdRows = await tx.queryParams(
          `SELECT ISNULL(MAX([id_venta]), 0) + 1 AS next_id
             FROM [CentroPodologico].[dbo].[Ventas]`,
          {}
        );
        const newIdVenta = Number(nextIdRows[0].next_id);
        const now = buildDate(new Date());

        let total = 0;
        for (const linea of lineas) {
          const pricing = pricingByProduct.get(linea.id_producto)!;
          total += linea.cantidad * pricing.effective_price;
        }

        await tx.queryParams(
          `INSERT INTO [CentroPodologico].[dbo].[Ventas]
             ([id_venta], [id_sucursal], [idMetodoPago], [total],
              [created_at], [id_usuario], [status], [webid], [facturado], [uuid_cfdi])
           VALUES (
             @id_venta, @id_sucursal, @idMetodoPago, @total,
             @created_at, @id_usuario, 1, CONVERT(varchar,@id_venta)+'-'+@webid, 0, NULL
           )`,
          {
            id_venta: newIdVenta,
            id_sucursal,
            idMetodoPago,
            total,
            created_at: now,
            id_usuario: id_user,
            webid: createWebId(9),
          }
        );

        for (const linea of lineas) {
          const pricing = pricingByProduct.get(linea.id_producto)!;
          const subtotal = linea.cantidad * pricing.effective_price;

          await tx.queryParams(
            `INSERT INTO [CentroPodologico].[dbo].[VentasDetalle]
               ([id_venta], [id_producto], [cantidad], [precio_unitario], [subtotal], [created_at])
             VALUES (@id_venta, @id_producto, @cantidad, @precio_unitario, @subtotal, @created_at)`,
            {
              id_venta: newIdVenta,
              id_producto: linea.id_producto,
              cantidad: linea.cantidad,
              precio_unitario: pricing.effective_price,
              subtotal,
              created_at: now,
            }
          );

          await applyStockMovement(tx, {
            id_product: linea.id_producto,
            id_sucursal,
            id_empresa,
            id_movement: MOVEMENT_SALIDA_POR_VENTA,
            quantity: linea.cantidad,
            id_unit_measurement: pricing.id_stock_unit_measurement,
            id_venta: newIdVenta,
            id_user,
          });
        }
      } else {
        const headerRows = await tx.queryParams(
          `SELECT [id_sucursal]
             FROM [CentroPodologico].[dbo].[Ventas] WITH (UPDLOCK, HOLDLOCK)
            WHERE [id_venta] = @id_venta`,
          { id_venta }
        );
        if (headerRows.length === 0) {
          throw new Error("La venta no existe");
        }
        const ticketSucursal = Number(headerRows[0].id_sucursal);

        const currentLineRows = await tx.queryParams(
          `SELECT [id_venta_detalle], [id_producto], [cantidad]
             FROM [CentroPodologico].[dbo].[VentasDetalle] WITH (UPDLOCK, HOLDLOCK)
            WHERE [id_venta] = @id_venta`,
          { id_venta }
        );
        const currentLineById = new Map(
          currentLineRows.map((row) => [
            Number(row.id_venta_detalle),
            { id_producto: Number(row.id_producto), cantidad: Number(row.cantidad) },
          ])
        );

        const formLineIds = new Set(
          lineas
            .filter((linea) => linea.id_venta_detalle !== undefined)
            .map((linea) => linea.id_venta_detalle!)
        );

        const newLines = lineas.filter((linea) => linea.id_venta_detalle === undefined);
        const changedLines: { id_venta_detalle: number; id_producto: number; cantidad: number; oldCantidad: number }[] = [];

        for (const linea of lineas) {
          if (linea.id_venta_detalle === undefined) continue;
          const current = currentLineById.get(linea.id_venta_detalle);
          if (!current) {
            throw new Error(`La línea con id ${linea.id_venta_detalle} no existe en este ticket`);
          }
          if (current.id_producto !== linea.id_producto) {
            throw new Error(
              "Cambiar el producto de una línea existente no es una operación soportada"
            );
          }
          if (current.cantidad !== linea.cantidad) {
            changedLines.push({
              id_venta_detalle: linea.id_venta_detalle,
              id_producto: linea.id_producto,
              cantidad: linea.cantidad,
              oldCantidad: current.cantidad,
            });
          }
        }

        const removedLines = currentLineRows.filter(
          (row) => !formLineIds.has(Number(row.id_venta_detalle))
        );

        const pricingByProduct = await getSaleProductsPricing(
          tx,
          id_empresa,
          [...new Set([...newLines, ...changedLines].map((linea) => linea.id_producto))]
        );
        for (const linea of [...newLines, ...changedLines]) {
          if (!pricingByProduct.has(linea.id_producto)) {
            throw new Error(
              `El producto con id ${linea.id_producto} no existe, no está activo o no pertenece a la empresa`
            );
          }
        }

        const now = buildDate(new Date());

        // Líneas nuevas.
        for (const linea of newLines) {
          const pricing = pricingByProduct.get(linea.id_producto)!;
          const subtotal = linea.cantidad * pricing.effective_price;

          await tx.queryParams(
            `INSERT INTO [CentroPodologico].[dbo].[VentasDetalle]
               ([id_venta], [id_producto], [cantidad], [precio_unitario], [subtotal], [created_at])
             VALUES (@id_venta, @id_producto, @cantidad, @precio_unitario, @subtotal, @created_at)`,
            {
              id_venta,
              id_producto: linea.id_producto,
              cantidad: linea.cantidad,
              precio_unitario: pricing.effective_price,
              subtotal,
              created_at: now,
            }
          );

          await applyStockMovement(tx, {
            id_product: linea.id_producto,
            id_sucursal: ticketSucursal,
            id_empresa,
            id_movement: MOVEMENT_SALIDA_POR_VENTA,
            quantity: linea.cantidad,
            id_unit_measurement: pricing.id_stock_unit_measurement,
            id_venta,
            id_user,
          });
        }

        // Líneas eliminadas.
        for (const row of removedLines) {
          const id_producto = Number(row.id_producto);
          const cantidad = Number(row.cantidad);
          const idStockUnitMeasurement = await getStockUnitMeasurement(tx, id_producto);

          await applyStockMovement(tx, {
            id_product: id_producto,
            id_sucursal: ticketSucursal,
            id_empresa,
            id_movement: MOVEMENT_ENTRADA_POR_AJUSTE,
            quantity: cantidad,
            id_unit_measurement: idStockUnitMeasurement,
            id_venta,
            notes: `Reversión por edición de venta #${id_venta} (línea eliminada)`,
            id_user,
          });

          await tx.queryParams(
            `DELETE FROM [CentroPodologico].[dbo].[VentasDetalle]
              WHERE [id_venta_detalle] = @id_venta_detalle`,
            { id_venta_detalle: Number(row.id_venta_detalle) }
          );
        }

        // Líneas con cantidad distinta.
        for (const linea of changedLines) {
          const pricing = pricingByProduct.get(linea.id_producto)!;
          const delta = linea.cantidad - linea.oldCantidad;
          const subtotal = linea.cantidad * pricing.effective_price;

          await applyStockMovement(tx, {
            id_product: linea.id_producto,
            id_sucursal: ticketSucursal,
            id_empresa,
            id_movement: delta > 0 ? MOVEMENT_SALIDA_POR_VENTA : MOVEMENT_ENTRADA_POR_AJUSTE,
            quantity: Math.abs(delta),
            id_unit_measurement: pricing.id_stock_unit_measurement,
            id_venta,
            notes: delta < 0 ? `Reversión por edición de venta #${id_venta}` : null,
            id_user,
          });

          await tx.queryParams(
            `UPDATE [CentroPodologico].[dbo].[VentasDetalle]
                SET [cantidad] = @cantidad,
                    [precio_unitario] = @precio_unitario,
                    [subtotal] = @subtotal
              WHERE [id_venta_detalle] = @id_venta_detalle`,
            {
              id_venta_detalle: linea.id_venta_detalle,
              cantidad: linea.cantidad,
              precio_unitario: pricing.effective_price,
              subtotal,
            }
          );
        }

        // Líneas sin cambios: conservan su `precio_unitario`/`subtotal` grabados
        // como snapshot, sin `UPDATE` ni movimiento de stock (ver spec 35, Decisiones).

        const total = await recalculateTotal(tx, id_venta);

        await tx.queryParams(
          `UPDATE [CentroPodologico].[dbo].[Ventas]
              SET [idMetodoPago] = @idMetodoPago,
                  [total]        = @total
            WHERE [id_venta] = @id_venta`,
          { id_venta, idMetodoPago, total }
        );
      }
    });

    revalidatePath("/dashboard/ventas");
    return { ok: true };
  } catch (error) {
    console.log(error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Error al guardar la venta",
    };
  }
}

/** Suma de `subtotal` de las líneas vigentes de un ticket, tras aplicar el diff. */
async function recalculateTotal(tx: ITransactionClient, id_venta: number): Promise<number> {
  const rows = await tx.queryParams(
    `SELECT ISNULL(SUM([subtotal]), 0) AS total
       FROM [CentroPodologico].[dbo].[VentasDetalle]
      WHERE [id_venta] = @id_venta`,
    { id_venta }
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Elimina (soft-delete) un ticket de venta, revirtiendo por completo el stock de
 * todas sus líneas antes de marcar `status = 0` en el encabezado (ver spec 35).
 */
export async function deleteVenta(
  id_venta: number
): Promise<{ ok: boolean; message?: string }> {
  try {
    const { id_empresa, id_user } = await getActiveUser();

    await db.transaction(async (tx) => {
      const headerRows = await tx.queryParams(
        `SELECT [id_sucursal]
           FROM [CentroPodologico].[dbo].[Ventas] WITH (UPDLOCK, HOLDLOCK)
          WHERE [id_venta] = @id_venta`,
        { id_venta }
      );
      if (headerRows.length === 0) {
        throw new Error("La venta no existe");
      }
      const id_sucursal = Number(headerRows[0].id_sucursal);

      const lineRows = await tx.queryParams(
        `SELECT [id_producto], [cantidad]
           FROM [CentroPodologico].[dbo].[VentasDetalle] WITH (UPDLOCK, HOLDLOCK)
          WHERE [id_venta] = @id_venta`,
        { id_venta }
      );

      for (const row of lineRows) {
        const id_producto = Number(row.id_producto);
        const cantidad = Number(row.cantidad);
        const idStockUnitMeasurement = await getStockUnitMeasurement(tx, id_producto);

        await applyStockMovement(tx, {
          id_product: id_producto,
          id_sucursal,
          id_empresa,
          id_movement: MOVEMENT_ENTRADA_POR_AJUSTE,
          quantity: cantidad,
          id_unit_measurement: idStockUnitMeasurement,
          id_venta,
          notes: `Reversión por eliminación de venta #${id_venta}`,
          id_user,
        });
      }

      await tx.queryParams(
        `UPDATE [CentroPodologico].[dbo].[Ventas] SET [status] = 0 WHERE [id_venta] = @id_venta`,
        { id_venta }
      );
    });

    revalidatePath("/dashboard/ventas");
    return { ok: true };
  } catch (error) {
    console.log(error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Error al eliminar la venta",
    };
  }
}
