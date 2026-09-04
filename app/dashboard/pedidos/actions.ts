"use server";

import { randomUUID } from "crypto";
import db, { ITransactionClient } from "@/database/connection";
import { ISuggestedProduct } from "@/interfaces/suggested_product";
import { IAuthUser } from "@/interfaces/auth";
import { IPurchaseOrder, IPurchaseOrderItem } from "@/interfaces/purchase_order";
import { IPurchaseReception } from "@/interfaces/purchase_reception";
import {
  IPurchaseOrderTemplate,
  IPurchaseOrderTemplateItemDetail,
  IPurchaseOrderTemplateListItem,
} from "@/interfaces/purchase_order_template";
import { buildDate } from "@/utils/date_helpper";
import { round2 } from "@/utils/number_helper";
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

/** KPIs del encabezado de "Pedidos de inventario". */
export interface IPurchaseOrdersSummary {
  products_below_minimum: number;
  suggested_count:         number;
  last_order_date:         string | null;
  last_order_supplier:     string | null;
}

/**
 * Productos del catálogo con su existencia actual en `id_sucursal`, mínimo efectivo
 * (`COALESCE(stock.min_stock, Products.min_stock)`) y cantidad sugerida a pedir.
 * Alimenta ambas tabs de `/dashboard/pedidos/nuevo` ("Sugeridos para pedir" filtra
 * por `below_minimum`, "Todos los productos" muestra el arreglo completo).
 */
export async function getSuggestedProducts(
  id_sucursal: number
): Promise<ActionResult<ISuggestedProduct[]>> {
  try {
    const { id_empresa } = await getActiveUser();
    const rows = await db.queryParams(
      `SELECT p.[id_product],
              p.[name],
              p.[id_category],
              p.[brand],
              p.[product_code],
              p.[id_unit_measurement],
              p.[price],
              p.[id_supplier],
              p.[pieces],
              p.[split],
              p.[min_stock] AS product_min_stock,
              s.[quantity] AS stock_quantity,
              suc.[seats] AS seats,
              pending.[folios] AS pending_order_folios
         FROM [CentroPodologico].[inventory].[Products] p
         LEFT JOIN [CentroPodologico].[inventory].[stock] s
                ON s.[id_product] = p.[id_product]
               AND s.[id_sucursal] = @id_sucursal
         LEFT JOIN [CentroPodologico].[dbo].[sucursales] suc
                ON suc.[id_sucursal] = @id_sucursal
         OUTER APPLY (
                SELECT STRING_AGG(po.[folio], ', ') AS folios
                  FROM [CentroPodologico].[inventory].[purchase_order_items] poi
                  JOIN [CentroPodologico].[inventory].[purchase_orders] po
                    ON po.[id_purchase_order] = poi.[id_purchase_order]
                 WHERE poi.[id_product] = p.[id_product]
                   AND poi.[quantity] > poi.[quantity_received]
                   AND po.[id_sucursal] = @id_sucursal
                   AND po.[id_empresa] = @id_empresa
                   AND po.[status] = 1
                   AND po.[id_status] IN (1, 2, 4)
              ) pending
        WHERE p.[status] = 1
          AND p.[id_empresa] = @id_empresa
        ORDER BY p.[name]`,
      { id_sucursal, id_empresa }
    );

    const data: ISuggestedProduct[] = rows.map((row) => {
      const currentStock = Number(row.stock_quantity ?? 0);
      const seatsEffective = Number(row.seats) > 0 ? Number(row.seats) : 1;
      const minStockEffective =
        row.product_min_stock !== null && row.product_min_stock !== undefined
          ? Math.ceil(Number(row.product_min_stock) * seatsEffective)
          : null;
      const conversionFactor = row.split ? Number(row.pieces) || 1 : 1;
      const belowMinimum =
        minStockEffective !== null && currentStock < minStockEffective;
      const suggestedQuantity = belowMinimum
        ? Math.max(
            1,
            Math.ceil((minStockEffective! - currentStock) / conversionFactor)
          )
        : 0;
      const pendingOrderFolios = row.pending_order_folios
        ? String(row.pending_order_folios)
            .split(",")
            .map((folio: string) => folio.trim())
            .filter(Boolean)
        : [];

      return {
        id_product: row.id_product,
        name: row.name,
        id_category: row.id_category,
        brand: row.brand,
        product_code: row.product_code,
        id_unit_measurement: row.id_unit_measurement,
        price: Number(row.price ?? 0),
        id_supplier: row.id_supplier,
        pieces: row.pieces,
        split: Boolean(row.split),
        current_stock: currentStock,
        min_stock_effective: minStockEffective,
        suggested_quantity: suggestedQuantity,
        below_minimum: belowMinimum,
        has_pending_order: pendingOrderFolios.length > 0,
        pending_order_folios: pendingOrderFolios,
      };
    });

    return { ok: true, data };
  } catch {
    return { ok: false, message: "Error al obtener los productos sugeridos" };
  }
}

/** Datos para los tres KPIs del encabezado de "Pedidos de inventario". */
export async function getPurchaseOrdersSummary(
  id_sucursal: number
): Promise<ActionResult<IPurchaseOrdersSummary>> {
  try {
    const { id_empresa } = await getActiveUser();

    const suggestedResult = await getSuggestedProducts(id_sucursal);
    if (!suggestedResult.ok) {
      return { ok: false, message: suggestedResult.message };
    }
    const belowMinimumCount = suggestedResult.data.filter(
      (product) => product.below_minimum
    ).length;

    const lastOrderRows = await db.queryParams(
      `SELECT TOP 1
              CONVERT(varchar(10), po.[created_at], 120) AS last_order_date,
              sup.[nombre_corto] AS last_order_supplier
         FROM [CentroPodologico].[inventory].[purchase_orders] po
         JOIN [CentroPodologico].[inventory].[proveedores] sup
           ON sup.[id_proveedor] = po.[id_supplier]
        WHERE po.[id_empresa] = @id_empresa
          AND po.[id_sucursal] = @id_sucursal
          AND po.[status] = 1
        ORDER BY po.[created_at] DESC`,
      { id_empresa, id_sucursal }
    );

    const data: IPurchaseOrdersSummary = {
      products_below_minimum: belowMinimumCount,
      suggested_count: belowMinimumCount,
      last_order_date: lastOrderRows[0]?.last_order_date ?? null,
      last_order_supplier: lastOrderRows[0]?.last_order_supplier ?? null,
    };

    return { ok: true, data };
  } catch {
    return { ok: false, message: "Error al obtener el resumen de pedidos" };
  }
}

export interface ICreatePurchaseOrderLineInput {
  id_product:  number;
  id_supplier: number | null;
  quantity:    number;
  unit_price:  number;
  applies_iva: boolean;
}

export interface ICreatePurchaseOrdersInput {
  id_sucursal:              number;
  estimated_date:           string | null;
  notes:                    string;
  lines:                    ICreatePurchaseOrderLineInput[];
  /** id_supplier -> idMetodoPago. Obligatorio para cada proveedor con líneas en el carrito. */
  paymentMethodBySupplier:  Record<number, number>;
  /** id_supplier -> gasto de envío. Proveedor ausente = 0. */
  shippingCostBySupplier:   Record<number, number>;
}

const TAX_RATE = 16;

/**
 * Crea una orden de compra por proveedor a partir del carrito revisado, todas
 * agrupadas bajo un mismo `id_batch`. Una sola transacción: valida los productos
 * contra la BD, recalcula subtotal/IVA/total en el servidor (nunca confía en lo
 * enviado por el cliente) y congela `conversion_factor` en cada línea.
 */
export async function createPurchaseOrders(
  input: ICreatePurchaseOrdersInput
): Promise<ActionResult<{ folios: string[] }>> {
  try {
    const { id_empresa, id_user } = await getActiveUser();
    const { id_sucursal, estimated_date, notes, lines, paymentMethodBySupplier, shippingCostBySupplier } = input;

    if (!lines || lines.length === 0) {
      return { ok: false, message: "El carrito está vacío" };
    }
    if (lines.some((line) => line.id_supplier === null)) {
      return { ok: false, message: "Todas las líneas deben tener un proveedor asignado" };
    }
    if (lines.some((line) => line.quantity <= 0)) {
      return { ok: false, message: "La cantidad de cada línea debe ser mayor a cero" };
    }
    if (lines.some((line) => line.unit_price < 0)) {
      return { ok: false, message: "El precio unitario no puede ser negativo" };
    }
    const supplierIdsWithLines = [...new Set(lines.map((line) => line.id_supplier as number))];
    const supplierWithoutPaymentMethod = supplierIdsWithLines.find(
      (id_supplier) => !paymentMethodBySupplier?.[id_supplier]
    );
    if (supplierWithoutPaymentMethod !== undefined) {
      return {
        ok: false,
        message: `Falta asignar un método de pago para el proveedor con id ${supplierWithoutPaymentMethod}`,
      };
    }
    const supplierWithNegativeShipping = supplierIdsWithLines.find(
      (id_supplier) => (shippingCostBySupplier?.[id_supplier] ?? 0) < 0
    );
    if (supplierWithNegativeShipping !== undefined) {
      return {
        ok: false,
        message: `El gasto de envío no puede ser negativo para el proveedor con id ${supplierWithNegativeShipping}`,
      };
    }

    const folios = await db.transaction(async (tx) => {
      // Valida que cada producto exista, esté activo y sea de la empresa; toma
      // los snapshots (nombre, código, marca, unidad, conversion_factor) desde la BD,
      // nunca desde lo que mandó el cliente.
      const productIds = [...new Set(lines.map((line) => line.id_product))];
      const productParams: Record<string, unknown> = { id_empresa };
      const productPlaceholders = productIds
        .map((id, index) => {
          productParams[`id_product_${index}`] = id;
          return `@id_product_${index}`;
        })
        .join(",");

      const productRows = await tx.queryParams(
        `SELECT [id_product],[name],[product_code],[brand],[id_unit_measurement],[pieces],[split]
           FROM [CentroPodologico].[inventory].[Products]
          WHERE [id_empresa] = @id_empresa
            AND [status] = 1
            AND [activo] = 1
            AND [id_product] IN (${productPlaceholders})`,
        productParams
      );
      const productById = new Map(productRows.map((product) => [product.id_product, product]));
      for (const line of lines) {
        if (!productById.has(line.id_product)) {
          throw new Error(
            `El producto con id ${line.id_product} no existe, no está activo o no pertenece a la empresa`
          );
        }
      }

      const id_batch = randomUUID();
      const now = buildDate(new Date());
      const year = new Date().getFullYear();
      const createdFolios: string[] = [];

      const linesBySupplier = new Map<number, ICreatePurchaseOrderLineInput[]>();
      for (const line of lines) {
        const supplierId = line.id_supplier as number; // ya validado como no-nulo arriba
        const supplierLines = linesBySupplier.get(supplierId) ?? [];
        supplierLines.push(line);
        linesBySupplier.set(supplierId, supplierLines);
      }

      for (const [id_supplier, supplierLines] of linesBySupplier) {
        // Consecutivo del folio serializado con HOLDLOCK sobre el rango año+empresa,
        // para minimizar colisiones bajo dos pedidos generados en simultáneo.
        const prefix = `PO-${year}-`;
        const countRows = await tx.queryParams(
          `SELECT COUNT(*) AS cnt
             FROM [CentroPodologico].[inventory].[purchase_orders] WITH (UPDLOCK, HOLDLOCK)
            WHERE [id_empresa] = @id_empresa
              AND [folio] LIKE @prefix + '%'`,
          { id_empresa, prefix }
        );
        const consecutive = Number(countRows[0]?.cnt ?? 0) + 1;
        const folio = `${prefix}${String(consecutive).padStart(4, "0")}`;

        const itemsToInsert = supplierLines.map((line) => {
          const product = productById.get(line.id_product)!;
          const conversionFactor = product.split ? Number(product.pieces) || 1 : 1;
          const lineTotal = round2(line.quantity * line.unit_price);
          const lineTaxAmount = line.applies_iva ? round2(lineTotal * (TAX_RATE / 100)) : 0;
          return { line, product, conversionFactor, lineTotal, lineTaxAmount };
        });
        const subtotal = round2(itemsToInsert.reduce((sum, item) => sum + item.lineTotal, 0));
        const tax = round2(itemsToInsert.reduce((sum, item) => sum + item.lineTaxAmount, 0));
        const shipping = round2(shippingCostBySupplier?.[id_supplier] ?? 0);
        const total = round2(subtotal + tax + shipping);

        const orderResult = await tx.queryParams(
          `INSERT INTO [CentroPodologico].[inventory].[purchase_orders]
             ([folio],[id_batch],[id_empresa],[id_sucursal],[id_supplier],[id_status],
              [subtotal],[discount],[tax],[shipping_cost],[total],[tax_rate],
              [estimated_date],[notes],[id_metodo_pago],[id_user_created],[created_at],[status])
           OUTPUT inserted.id_purchase_order
           VALUES
             (@folio,@id_batch,@id_empresa,@id_sucursal,@id_supplier,1,
              @subtotal,0,@tax,@shipping_cost,@total,@tax_rate,
              @estimated_date,@notes,@id_metodo_pago,@id_user_created,@created_at,1)`,
          {
            folio,
            id_batch,
            id_empresa,
            id_sucursal,
            id_supplier,
            subtotal,
            tax,
            shipping_cost: shipping,
            total,
            tax_rate: TAX_RATE,
            estimated_date: estimated_date || null,
            notes: notes || null,
            id_metodo_pago: paymentMethodBySupplier[id_supplier],
            id_user_created: id_user,
            created_at: now,
          }
        );
        const id_purchase_order = orderResult[0].id_purchase_order;

        for (const { line, product, conversionFactor, lineTotal, lineTaxAmount } of itemsToInsert) {
          await tx.queryParams(
            `INSERT INTO [CentroPodologico].[inventory].[purchase_order_items]
               ([id_purchase_order],[id_product],[product_name],[product_code],[brand],
                [id_unit_measurement],[conversion_factor],[quantity],[quantity_received],
                [unit_price],[discount],[line_total],[applies_iva],[tax_amount],[created_at])
             VALUES
               (@id_purchase_order,@id_product,@product_name,@product_code,@brand,
                @id_unit_measurement,@conversion_factor,@quantity,0,
                @unit_price,0,@line_total,@applies_iva,@tax_amount,@created_at)`,
            {
              id_purchase_order,
              id_product: line.id_product,
              product_name: product.name,
              product_code: product.product_code,
              brand: product.brand,
              id_unit_measurement: product.id_unit_measurement,
              conversion_factor: conversionFactor,
              quantity: line.quantity,
              unit_price: line.unit_price,
              line_total: lineTotal,
              applies_iva: line.applies_iva,
              tax_amount: lineTaxAmount,
              created_at: now,
            }
          );
        }

        createdFolios.push(folio);
      }

      return createdFolios;
    });

    revalidatePath("/dashboard/pedidos");
    return { ok: true, data: { folios } };
  } catch (error) {
    console.log(error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Error al generar la orden de compra",
    };
  }
}

/** Fila del historial: encabezado de la orden + nombre del proveedor para mostrar. */
export interface IPurchaseOrderListItem extends IPurchaseOrder {
  supplier_name:              string;
  metodo_pago_descripcion:    string | null;
}

export interface IPurchaseOrdersFilters {
  id_sucursal: number;
  id_status?:  number | null;
  id_supplier?: number | null;
  date_from?:  string | null;
  date_to?:    string | null;
}

export async function getPurchaseOrders(
  filters: IPurchaseOrdersFilters
): Promise<ActionResult<IPurchaseOrderListItem[]>> {
  try {
    const { id_empresa } = await getActiveUser();
    const { id_sucursal, id_status, id_supplier, date_from, date_to } = filters;

    const conditions = [
      "po.[id_empresa] = @id_empresa",
      "po.[id_sucursal] = @id_sucursal",
      "po.[status] = 1",
    ];
    const params: Record<string, unknown> = { id_empresa, id_sucursal };

    if (id_status) {
      conditions.push("po.[id_status] = @id_status");
      params.id_status = id_status;
    }
    if (id_supplier) {
      conditions.push("po.[id_supplier] = @id_supplier");
      params.id_supplier = id_supplier;
    }
    if (date_from) {
      conditions.push("po.[created_at] >= @date_from");
      params.date_from = `${date_from} 00:00:00`;
    }
    if (date_to) {
      conditions.push("po.[created_at] <= @date_to");
      params.date_to = `${date_to} 23:59:59`;
    }

    const rows = await db.queryParams(
      `SELECT ${!date_from?'TOP 10':''} po.[id_purchase_order],
              po.[folio],
              po.[id_batch],
              po.[id_empresa],
              po.[id_sucursal],
              po.[id_supplier],
              po.[id_status],
              po.[subtotal],
              po.[discount],
              po.[tax],
              po.[shipping_cost],
              po.[total],
              po.[tax_rate],
              CONVERT(varchar(10), po.[estimated_date], 120) AS estimated_date,
              CONVERT(varchar(10), po.[delivery_date], 120) AS delivery_date,
              CONVERT(varchar(10), po.[invoice_date], 120) AS invoice_date,
              po.[invoice_url],
              po.[invoice_number],
              po.[notes],
              po.[id_metodo_pago],
              po.[id_user_created],
              CONVERT(varchar(19), po.[created_at], 120) AS created_at,
              CONVERT(varchar(19), po.[sent_at], 120) AS sent_at,
              CONVERT(varchar(19), po.[closed_at], 120) AS closed_at,
              po.[status],
              sup.[nombre_corto] AS supplier_name,
              mp.[descripcion] AS metodo_pago_descripcion
         FROM [CentroPodologico].[inventory].[purchase_orders] po
         JOIN [CentroPodologico].[inventory].[proveedores] sup
           ON sup.[id_proveedor] = po.[id_supplier]
         LEFT JOIN [CentroPodologico].[dbo].[MetodosPagos] mp
           ON mp.[idMetodoPago] = po.[id_metodo_pago]
        WHERE ${conditions.join(" AND ")}
        ORDER BY po.[created_at] DESC`,
      params
    );

    return { ok: true, data: rows as IPurchaseOrderListItem[] };
  } catch {
    return { ok: false, message: "Error al obtener el historial de pedidos" };
  }
}

/** Fila de la bitácora de recepciones, con el nombre de quien la confirmó. */
export interface IPurchaseReceptionListItem extends IPurchaseReception {
  user_name: string;
}

/** Detalle de una orden: encabezado + nombre del proveedor + líneas + bitácora de recepciones. */
export interface IPurchaseOrderDetailView extends IPurchaseOrder {
  supplier_name:           string;
  metodo_pago_descripcion: string | null;
  items:                   IPurchaseOrderItem[];
  receptions:               IPurchaseReceptionListItem[];
}

export async function getPurchaseOrderById(
  id_purchase_order: number
): Promise<ActionResult<IPurchaseOrderDetailView>> {
  try {
    const { id_empresa } = await getActiveUser();

    const headerRows = await db.queryParams(
      `SELECT po.[id_purchase_order],
              po.[folio],
              po.[id_batch],
              po.[id_empresa],
              po.[id_sucursal],
              po.[id_supplier],
              po.[id_status],
              po.[subtotal],
              po.[discount],
              po.[tax],
              po.[shipping_cost],
              po.[total],
              po.[tax_rate],
              CONVERT(varchar(10), po.[estimated_date], 120) AS estimated_date,
              CONVERT(varchar(10), po.[delivery_date], 120) AS delivery_date,
              CONVERT(varchar(10), po.[invoice_date], 120) AS invoice_date,
              po.[invoice_url],
              po.[invoice_number],
              po.[notes],
              po.[id_metodo_pago],
              po.[id_user_created],
              CONVERT(varchar(19), po.[created_at], 120) AS created_at,
              CONVERT(varchar(19), po.[sent_at], 120) AS sent_at,
              CONVERT(varchar(19), po.[closed_at], 120) AS closed_at,
              po.[status],
              sup.[nombre_corto] AS supplier_name,
              mp.[descripcion] AS metodo_pago_descripcion
         FROM [CentroPodologico].[inventory].[purchase_orders] po
         JOIN [CentroPodologico].[inventory].[proveedores] sup
           ON sup.[id_proveedor] = po.[id_supplier]
         LEFT JOIN [CentroPodologico].[dbo].[MetodosPagos] mp
           ON mp.[idMetodoPago] = po.[id_metodo_pago]
        WHERE po.[id_purchase_order] = @id_purchase_order
          AND po.[id_empresa] = @id_empresa`,
      { id_purchase_order, id_empresa }
    );

    if (headerRows.length === 0) {
      return { ok: false, message: "La orden de compra no existe" };
    }

    const items = await db.queryParams(
      `SELECT [id_purchase_order_item],
              [id_purchase_order],
              [id_product],
              [product_name],
              [product_code],
              [brand],
              [id_unit_measurement],
              [conversion_factor],
              [quantity],
              [quantity_received],
              [unit_price],
              [discount],
              [line_total],
              [applies_iva],
              [tax_amount],
              CONVERT(varchar(19), [created_at], 120) AS created_at
         FROM [CentroPodologico].[inventory].[purchase_order_items]
        WHERE [id_purchase_order] = @id_purchase_order
        ORDER BY [id_purchase_order_item]`,
      { id_purchase_order }
    );

    const receptions = await db.queryParams(
      `SELECT pr.[id_reception],
              pr.[id_purchase_order],
              pr.[id_sucursal],
              pr.[id_user],
              pr.[notes],
              pr.[is_final],
              CONVERT(varchar(19), pr.[created_at], 120) AS created_at,
              u.[nombre] AS user_name
         FROM [CentroPodologico].[inventory].[purchase_receptions] pr
         JOIN [CentroPodologico].[dbo].[users] u
           ON u.[id_user] = pr.[id_user]
        WHERE pr.[id_purchase_order] = @id_purchase_order
        ORDER BY pr.[created_at] DESC`,
      { id_purchase_order }
    );

    const data: IPurchaseOrderDetailView = {
      ...(headerRows[0] as IPurchaseOrder & { supplier_name: string; metodo_pago_descripcion: string | null }),
      items: items as IPurchaseOrderItem[],
      receptions: receptions as IPurchaseReceptionListItem[],
    };

    return { ok: true, data };
  } catch {
    return { ok: false, message: "Error al obtener el detalle de la orden" };
  }
}

export interface IMarkOrderAsShippedInput {
  invoice_url:    string;
  invoice_number: string | null;
  invoice_date:   string | null;
}

/**
 * Sella la factura de una orden y la mueve de `Pedido` a `Enviado`. El servidor
 * impone la regla de negocio (no solo la UI): solo se puede salir de `Pedido`,
 * y solo con `invoice_url` presente.
 */
export async function markOrderAsShipped(
  id_purchase_order: number,
  input: IMarkOrderAsShippedInput
): Promise<ActionResult<void>> {
  try {
    const { id_empresa } = await getActiveUser();
    const { invoice_url, invoice_number, invoice_date } = input;

    if (!invoice_url || !invoice_url.trim()) {
      return { ok: false, message: "Debes cargar la factura antes de marcar la orden como enviada" };
    }

    const now = buildDate(new Date());
    const result = await db.queryParams(
      `UPDATE [CentroPodologico].[inventory].[purchase_orders]
          SET [id_status]      = 2,
              [invoice_url]    = @invoice_url,
              [invoice_number] = @invoice_number,
              [invoice_date]   = @invoice_date,
              [sent_at]        = @sent_at
        OUTPUT inserted.id_purchase_order
        WHERE [id_purchase_order] = @id_purchase_order
          AND [id_empresa] = @id_empresa
          AND [id_status] = 1`,
      {
        id_purchase_order,
        id_empresa,
        invoice_url,
        invoice_number: invoice_number || null,
        invoice_date: invoice_date || null,
        sent_at: now,
      }
    );

    if (result.length === 0) {
      return {
        ok: false,
        message: "La orden no existe o ya no está en estado Pedido",
      };
    }

    revalidatePath("/dashboard/pedidos");
    revalidatePath(`/dashboard/pedidos/${id_purchase_order}`);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, message: "Error al marcar la orden como enviada" };
  }
}

/**
 * Cancela una orden de compra. Solo permitido desde `Pedido` o `Enviado`, y solo
 * si no existe ninguna recepción registrada (regla explícita del spec: cancelar
 * una orden ya recibida no está en alcance).
 */
export async function cancelPurchaseOrder(
  id_purchase_order: number
): Promise<ActionResult<void>> {
  try {
    const { id_empresa } = await getActiveUser();

    const result = await db.queryParams(
      `UPDATE [CentroPodologico].[inventory].[purchase_orders]
          SET [id_status] = 5
        OUTPUT inserted.id_purchase_order
        WHERE [id_purchase_order] = @id_purchase_order
          AND [id_empresa] = @id_empresa
          AND [id_status] IN (1, 2)
          AND NOT EXISTS (
            SELECT 1
              FROM [CentroPodologico].[inventory].[purchase_receptions]
             WHERE [id_purchase_order] = @id_purchase_order
          )`,
      { id_purchase_order, id_empresa }
    );

    if (result.length === 0) {
      return {
        ok: false,
        message:
          "La orden no se puede cancelar: ya tiene recepciones registradas o no está en un estado cancelable",
      };
    }

    revalidatePath("/dashboard/pedidos");
    revalidatePath(`/dashboard/pedidos/${id_purchase_order}`);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, message: "Error al cancelar la orden de compra" };
  }
}

/**
 * Plantillas de pedido de la empresa (todas las sucursales), con agregados
 * calculados server-side sobre precios actuales: las líneas cuyo producto ya
 * no existe, no está activo o no es de la empresa quedan fuera de ambos
 * agregados (no hay snapshots de producto en una plantilla, ver spec 18).
 */
export async function getPurchaseOrderTemplates(): Promise<
  ActionResult<IPurchaseOrderTemplateListItem[]>
> {
  try {
    const { id_empresa } = await getActiveUser();

    const rows = await db.queryParams(
      `SELECT t.[id_purchase_order_template],
              t.[name],
              t.[id_empresa],
              t.[id_sucursal],
              t.[id_user_created],
              CONVERT(varchar(19), t.[created_at], 120) AS created_at,
              CONVERT(varchar(19), t.[updated_at], 120) AS updated_at,
              t.[status],
              ISNULL(agg.[items_count], 0) AS items_count,
              ISNULL(agg.[estimated_value], 0) AS estimated_value
         FROM [CentroPodologico].[inventory].[purchase_order_templates] t
         OUTER APPLY (
                SELECT COUNT(*) AS items_count,
                       SUM(i.[quantity] * p.[price]) AS estimated_value
                  FROM [CentroPodologico].[inventory].[purchase_order_template_items] i
                  JOIN [CentroPodologico].[inventory].[Products] p
                    ON p.[id_product] = i.[id_product]
                   AND p.[status] = 1
                   AND p.[activo] = 1
                   AND p.[id_empresa] = @id_empresa
                 WHERE i.[id_purchase_order_template] = t.[id_purchase_order_template]
              ) agg
        WHERE t.[id_empresa] = @id_empresa
          AND t.[status] = 1
        ORDER BY t.[updated_at] DESC`,
      { id_empresa }
    );

    const data: IPurchaseOrderTemplateListItem[] = rows.map((row) => ({
      id_purchase_order_template: row.id_purchase_order_template,
      name: row.name,
      id_empresa: row.id_empresa,
      id_sucursal: row.id_sucursal,
      id_user_created: row.id_user_created,
      created_at: row.created_at,
      updated_at: row.updated_at,
      status: Boolean(row.status),
      items_count: Number(row.items_count ?? 0),
      estimated_value: Number(row.estimated_value ?? 0),
    }));

    return { ok: true, data };
  } catch {
    return { ok: false, message: "Error al obtener las plantillas de pedido" };
  }
}

/** Encabezado + líneas resueltas contra el catálogo actual, para editar o usar una plantilla. */
export async function getPurchaseOrderTemplateById(
  id_purchase_order_template: number
): Promise<
  ActionResult<{ template: IPurchaseOrderTemplate; items: IPurchaseOrderTemplateItemDetail[] }>
> {
  try {
    const { id_empresa } = await getActiveUser();

    const headerRows = await db.queryParams(
      `SELECT [id_purchase_order_template],
              [name],
              [id_empresa],
              [id_sucursal],
              [id_user_created],
              CONVERT(varchar(19), [created_at], 120) AS created_at,
              CONVERT(varchar(19), [updated_at], 120) AS updated_at,
              [status]
         FROM [CentroPodologico].[inventory].[purchase_order_templates]
        WHERE [id_purchase_order_template] = @id_purchase_order_template
          AND [id_empresa] = @id_empresa
          AND [status] = 1`,
      { id_purchase_order_template, id_empresa }
    );

    if (headerRows.length === 0) {
      return { ok: false, message: "La plantilla no existe" };
    }

    const itemRows = await db.queryParams(
      `SELECT i.[id_purchase_order_template_item],
              i.[id_purchase_order_template],
              i.[id_product],
              i.[id_supplier],
              i.[quantity],
              ISNULL(p.[name], '') AS product_name,
              ISNULL(p.[product_code], '') AS product_code,
              ISNULL(p.[brand], '') AS brand,
              p.[id_unit_measurement],
              p.[pieces],
              p.[split],
              ISNULL(p.[price], 0) AS price,
              CASE
                WHEN p.[id_product] IS NOT NULL
                 AND p.[status] = 1
                 AND p.[activo] = 1
                 AND p.[id_empresa] = @id_empresa
                THEN 1 ELSE 0
              END AS is_available
         FROM [CentroPodologico].[inventory].[purchase_order_template_items] i
         LEFT JOIN [CentroPodologico].[inventory].[Products] p
           ON p.[id_product] = i.[id_product]
        WHERE i.[id_purchase_order_template] = @id_purchase_order_template
        ORDER BY i.[id_purchase_order_template_item]`,
      { id_purchase_order_template, id_empresa }
    );

    const template: IPurchaseOrderTemplate = {
      id_purchase_order_template: headerRows[0].id_purchase_order_template,
      name: headerRows[0].name,
      id_empresa: headerRows[0].id_empresa,
      id_sucursal: headerRows[0].id_sucursal,
      id_user_created: headerRows[0].id_user_created,
      created_at: headerRows[0].created_at,
      updated_at: headerRows[0].updated_at,
      status: Boolean(headerRows[0].status),
    };

    const items: IPurchaseOrderTemplateItemDetail[] = itemRows.map((row) => ({
      id_purchase_order_template_item: row.id_purchase_order_template_item,
      id_purchase_order_template: row.id_purchase_order_template,
      id_product: row.id_product,
      id_supplier: row.id_supplier,
      quantity: Number(row.quantity),
      product_name: row.product_name,
      product_code: row.product_code,
      brand: row.brand,
      id_unit_measurement: row.id_unit_measurement,
      pieces: row.pieces,
      split: Boolean(row.split),
      price: Number(row.price),
      is_available: Boolean(row.is_available),
    }));

    return { ok: true, data: { template, items } };
  } catch {
    return { ok: false, message: "Error al obtener el detalle de la plantilla" };
  }
}

export interface IPurchaseOrderTemplateLineInput {
  id_product:  number;
  id_supplier: number | null;
  quantity:    number;
}

/**
 * Valida las líneas comunes a crear/editar una plantilla: al menos una línea,
 * cantidades positivas, y cada producto existente/activo/de la empresa. Lanza
 * un `Error` (capturado por el caller) en el primer problema encontrado.
 */
async function validateTemplateLines(
  tx: ITransactionClient,
  id_empresa: number,
  lines: IPurchaseOrderTemplateLineInput[]
): Promise<void> {
  if (!lines || lines.length === 0) {
    throw new Error("La plantilla debe tener al menos una línea");
  }
  if (lines.some((line) => line.quantity <= 0)) {
    throw new Error("La cantidad de cada línea debe ser mayor a cero");
  }

  const productIds = [...new Set(lines.map((line) => line.id_product))];
  const productParams: Record<string, unknown> = { id_empresa };
  const productPlaceholders = productIds
    .map((id, index) => {
      productParams[`id_product_${index}`] = id;
      return `@id_product_${index}`;
    })
    .join(",");

  const productRows = await tx.queryParams(
    `SELECT [id_product]
       FROM [CentroPodologico].[inventory].[Products]
      WHERE [id_empresa] = @id_empresa
        AND [status] = 1
        AND [activo] = 1
        AND [id_product] IN (${productPlaceholders})`,
    productParams
  );
  const availableProductIds = new Set(productRows.map((product) => product.id_product));
  for (const line of lines) {
    if (!availableProductIds.has(line.id_product)) {
      throw new Error(
        `El producto con id ${line.id_product} no existe, no está activo o no pertenece a la empresa`
      );
    }
  }
}

/** Nombre único por empresa entre plantillas activas, ignorando mayúsculas/minúsculas. */
async function assertUniqueTemplateName(
  tx: ITransactionClient,
  id_empresa: number,
  name: string,
  excludeId: number | null
): Promise<void> {
  const rows = await tx.queryParams(
    `SELECT TOP 1 [id_purchase_order_template]
       FROM [CentroPodologico].[inventory].[purchase_order_templates]
      WHERE [id_empresa] = @id_empresa
        AND [status] = 1
        AND LOWER([name]) = LOWER(@name)
        AND [id_purchase_order_template] <> @excludeId`,
    { id_empresa, name, excludeId: excludeId ?? 0 }
  );
  if (rows.length > 0) {
    throw new Error("Ya existe una plantilla con ese nombre");
  }
}

export interface ICreatePurchaseOrderTemplateInput {
  name:        string;
  id_sucursal: number | null;
  lines:       IPurchaseOrderTemplateLineInput[];
}

/** Crea una plantilla (encabezado + líneas) en una sola transacción. */
export async function createPurchaseOrderTemplate(
  input: ICreatePurchaseOrderTemplateInput
): Promise<ActionResult<{ id_purchase_order_template: number }>> {
  try {
    const { id_empresa, id_user } = await getActiveUser();
    const name = input.name?.trim();

    if (!name) {
      return { ok: false, message: "El nombre de la plantilla es obligatorio" };
    }

    const id_purchase_order_template = await db.transaction(async (tx) => {
      await assertUniqueTemplateName(tx, id_empresa, name, null);
      await validateTemplateLines(tx, id_empresa, input.lines);

      const now = buildDate(new Date());
      const headerResult = await tx.queryParams(
        `INSERT INTO [CentroPodologico].[inventory].[purchase_order_templates]
           ([name],[id_empresa],[id_sucursal],[id_user_created],[created_at],[updated_at],[status])
         OUTPUT inserted.id_purchase_order_template
         VALUES
           (@name,@id_empresa,@id_sucursal,@id_user_created,@created_at,@updated_at,1)`,
        {
          name,
          id_empresa,
          id_sucursal: input.id_sucursal,
          id_user_created: id_user,
          created_at: now,
          updated_at: now,
        }
      );
      const id = headerResult[0].id_purchase_order_template;

      for (const line of input.lines) {
        await tx.queryParams(
          `INSERT INTO [CentroPodologico].[inventory].[purchase_order_template_items]
             ([id_purchase_order_template],[id_product],[id_supplier],[quantity])
           VALUES
             (@id_purchase_order_template,@id_product,@id_supplier,@quantity)`,
          {
            id_purchase_order_template: id,
            id_product: line.id_product,
            id_supplier: line.id_supplier,
            quantity: line.quantity,
          }
        );
      }

      return id;
    });

    revalidatePath("/dashboard/pedidos/nuevo");
    return { ok: true, data: { id_purchase_order_template } };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Error al guardar la plantilla",
    };
  }
}

export interface IUpdatePurchaseOrderTemplateInput {
  id_purchase_order_template: number;
  name:                        string;
  lines:                       IPurchaseOrderTemplateLineInput[];
}

/**
 * Actualiza una plantilla: renombra y reemplaza sus líneas completas
 * (`DELETE` + `INSERT`), en una sola transacción. Sella `updated_at`.
 */
export async function updatePurchaseOrderTemplate(
  input: IUpdatePurchaseOrderTemplateInput
): Promise<ActionResult<null>> {
  try {
    const { id_empresa } = await getActiveUser();
    const name = input.name?.trim();

    if (!name) {
      return { ok: false, message: "El nombre de la plantilla es obligatorio" };
    }

    await db.transaction(async (tx) => {
      const existingRows = await tx.queryParams(
        `SELECT [id_purchase_order_template]
           FROM [CentroPodologico].[inventory].[purchase_order_templates]
          WHERE [id_purchase_order_template] = @id_purchase_order_template
            AND [id_empresa] = @id_empresa
            AND [status] = 1`,
        { id_purchase_order_template: input.id_purchase_order_template, id_empresa }
      );
      if (existingRows.length === 0) {
        throw new Error("La plantilla no existe");
      }

      await assertUniqueTemplateName(tx, id_empresa, name, input.id_purchase_order_template);
      await validateTemplateLines(tx, id_empresa, input.lines);

      const now = buildDate(new Date());
      await tx.queryParams(
        `UPDATE [CentroPodologico].[inventory].[purchase_order_templates]
            SET [name] = @name,
                [updated_at] = @updated_at
          WHERE [id_purchase_order_template] = @id_purchase_order_template
            AND [id_empresa] = @id_empresa`,
        { name, updated_at: now, id_purchase_order_template: input.id_purchase_order_template, id_empresa }
      );

      await tx.queryParams(
        `DELETE FROM [CentroPodologico].[inventory].[purchase_order_template_items]
          WHERE [id_purchase_order_template] = @id_purchase_order_template`,
        { id_purchase_order_template: input.id_purchase_order_template }
      );

      for (const line of input.lines) {
        await tx.queryParams(
          `INSERT INTO [CentroPodologico].[inventory].[purchase_order_template_items]
             ([id_purchase_order_template],[id_product],[id_supplier],[quantity])
           VALUES
             (@id_purchase_order_template,@id_product,@id_supplier,@quantity)`,
          {
            id_purchase_order_template: input.id_purchase_order_template,
            id_product: line.id_product,
            id_supplier: line.id_supplier,
            quantity: line.quantity,
          }
        );
      }
    });

    revalidatePath("/dashboard/pedidos/nuevo");
    return { ok: true, data: null };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Error al actualizar la plantilla",
    };
  }
}

/** Borrado lógico (`status = 0`) de una plantilla. */
export async function deletePurchaseOrderTemplate(
  id_purchase_order_template: number
): Promise<ActionResult<null>> {
  try {
    const { id_empresa } = await getActiveUser();

    const result = await db.queryParams(
      `UPDATE [CentroPodologico].[inventory].[purchase_order_templates]
          SET [status] = 0
        OUTPUT inserted.id_purchase_order_template
        WHERE [id_purchase_order_template] = @id_purchase_order_template
          AND [id_empresa] = @id_empresa
          AND [status] = 1`,
      { id_purchase_order_template, id_empresa }
    );

    if (result.length === 0) {
      return { ok: false, message: "La plantilla no existe" };
    }

    revalidatePath("/dashboard/pedidos/nuevo");
    return { ok: true, data: null };
  } catch {
    return { ok: false, message: "Error al eliminar la plantilla" };
  }
}
