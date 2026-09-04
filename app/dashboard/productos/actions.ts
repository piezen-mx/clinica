"use server";

import db from "@/database/connection";
import { IProduct } from "@/interfaces/product";
import { IProductCategory } from "@/interfaces/product_category";
import { IUnitMeasurement } from "@/interfaces/unit_measurement";
import { IAuthUser } from "@/interfaces/auth";
import { buildDate } from "@/utils/date_helpper";
import { revalidatePath } from "next/cache";
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

export async function getProducts(): Promise<IProduct[]> {
  const { id_empresa } = await getActiveUser();
  const data = await db.queryParams(
    `SELECT [id_product],
            [name],
            [id_category],
            [brand],
            [presentation],
            [id_unit_measurement],
            [size],
            [price],
            [sale_price],
            [product_code],
            [id_supplier],
            [pieces],
            [min_stock],
            [auto_consume],
            [consumption_per_consultation],
            [id_empresa],
            [description],
            CONVERT(varchar(19), [created_at], 120) AS created_at,
            [activo],
            [status],
            [split],
            [url_product],
            [bono_venta]
       FROM [CentroPodologico].[inventory].[Products]
      WHERE [status] = 1
        AND [id_empresa] = @id_empresa
      ORDER BY [name]`,
    { id_empresa }
  );
  return data as IProduct[];
}

export async function getCategories(): Promise<IProductCategory[]> {
  const { id_empresa } = await getActiveUser();
  const data = await db.queryParams(
    `SELECT [id_category],
            [name],
            [status],
            [activo],
            [id_empresa]
       FROM [CentroPodologico].[inventory].[categories]
      WHERE [status] = 1
        AND [id_empresa] = @id_empresa
      ORDER BY [name]`,
    { id_empresa }
  );
  return data as IProductCategory[];
}

export async function getUnitsMeasurement(): Promise<IUnitMeasurement[]> {
  const data = await db.queryParams(
    `SELECT [id_unit_measurement],
            [id_type],
            [name],
            [code],
            [value],
            [status]
       FROM [CentroPodologico].[inventory].[units_measurement]
      WHERE [status] = 1
      ORDER BY [name]`,
    {}
  );
  return data as IUnitMeasurement[];
}

export async function saveProduct(
  form: Omit<IProduct, "id_empresa" | "status" | "created_at">
): Promise<{ ok: boolean; message?: string }> {
  try {
    const {
      id_product,
      name,
      id_category,
      brand,
      presentation,
      id_unit_measurement,
      size,
      price,
      sale_price,
      product_code,
      id_supplier,
      pieces,
      min_stock,
      auto_consume,
      consumption_per_consultation,
      description,
      activo,
      split,
      url_product,
      bono_venta,
    } = form;

    if (!name || !name.trim()) {
      return { ok: false, message: "El nombre es obligatorio" };
    }

    // Si el producto se consume automáticamente en cada consulta, la cantidad
    // por consulta es obligatoria y debe ser positiva (ver spec 13).
    if (auto_consume === true) {
      if (
        consumption_per_consultation === null ||
        consumption_per_consultation === undefined ||
        Number(consumption_per_consultation) <= 0
      ) {
        return {
          ok: false,
          message:
            "La cantidad por consulta es obligatoria y debe ser mayor a 0 cuando el producto se consume automáticamente",
        };
      }
    }
    const effectiveConsumptionPerConsultation = auto_consume === true
      ? consumption_per_consultation
      : null;

    // Todo producto de categoría "Venta" (4) requiere precio de venta, sin
    // importar si se compra por paquete/caja (split) o no (ver spec 37).
    if (id_category === 4) {
      if (sale_price === null || sale_price === undefined || Number(sale_price) <= 0) {
        return {
          ok: false,
          message:
            "El precio de venta es obligatorio para productos de categoría Venta",
        };
      }
    }

    const { id_empresa, id_role } = await getActiveUser();

    // "El Stock Mínimo solo lo puede ajustar el administrador" (Inventario.md).
    // Un rol no autorizado no puede tocar este campo: se ignora lo enviado y se
    // conserva el valor previo (o null en un producto nuevo).
    const canEditMinStock = id_role === 1 || id_role === 4;
    let effectiveMinStock = min_stock;
    if (!canEditMinStock) {
      if (id_product === 0) {
        effectiveMinStock = null;
      } else {
        const existing = await db.queryParams(
          `SELECT [min_stock]
             FROM [CentroPodologico].[inventory].[Products]
            WHERE [id_product] = @id_product
              AND [id_empresa] = @id_empresa`,
          { id_product, id_empresa }
        );
        effectiveMinStock = existing[0]?.min_stock ?? null;
      }
    }

    const commonParams = {
      name,
      id_category,
      brand,
      presentation,
      id_unit_measurement,
      size,
      price,
      sale_price,
      product_code,
      id_supplier,
      pieces,
      min_stock: effectiveMinStock,
      auto_consume,
      consumption_per_consultation: effectiveConsumptionPerConsultation,
      description,
      activo,
      split,
      url_product,
      bono_venta,
    };

    if (id_product === 0) {
      await db.queryParams(
        `INSERT INTO [CentroPodologico].[inventory].[Products]
           ([id_product],[name],[id_category],[brand],[presentation],[id_unit_measurement],
            [size],[price],[sale_price],[product_code],[id_supplier],[pieces],[min_stock],
            [auto_consume],[consumption_per_consultation],[id_empresa],[description],
            [created_at],[activo],[status],[split],[url_product],[bono_venta])
         VALUES (
           (SELECT ISNULL(MAX([id_product]), 0) + 1 FROM [CentroPodologico].[inventory].[Products]),
           @name,@id_category,@brand,@presentation,@id_unit_measurement,
           @size,@price,@sale_price,@product_code,@id_supplier,@pieces,@min_stock,
           @auto_consume,@consumption_per_consultation,@id_empresa,@description,
           @created_at,@activo,1,@split,@url_product,@bono_venta
         )`,
        { ...commonParams, id_empresa, created_at: buildDate(new Date()) }
      );
    } else {
      await db.queryParams(
        `UPDATE [CentroPodologico].[inventory].[Products] SET
           [name]                = @name,
           [id_category]         = @id_category,
           [brand]                = @brand,
           [presentation]        = @presentation,
           [id_unit_measurement] = @id_unit_measurement,
           [size]                 = @size,
           [price]                = @price,
           [sale_price]           = @sale_price,
           [product_code]        = @product_code,
           [id_supplier]         = @id_supplier,
           [pieces]               = @pieces,
           [min_stock]            = @min_stock,
           [auto_consume]         = @auto_consume,
           [consumption_per_consultation] = @consumption_per_consultation,
           [description]         = @description,
           [activo]               = @activo,
           [split]                = @split,
           [url_product]         = @url_product,
           [bono_venta]          = @bono_venta
         WHERE [id_product] = @id_product
           AND [id_empresa] = @id_empresa`,
        { id_product, id_empresa, ...commonParams }
      );
    }

    revalidatePath("/dashboard/productos");
    return { ok: true };
  } catch(error) {
    
    return { ok: false, message: "Error al guardar el producto" };
  }
}

export async function deleteProduct(
  id_product: number
): Promise<{ ok: boolean; message?: string }> {
  try {
    const { id_empresa } = await getActiveUser();
    await db.queryParams(
      `UPDATE [CentroPodologico].[inventory].[Products]
          SET [status] = 0
        WHERE [id_product] = @id_product
          AND [id_empresa] = @id_empresa`,
      { id_product, id_empresa }
    );
    revalidatePath("/dashboard/productos");
    return { ok: true };
  } catch {
    return { ok: false, message: "Error al eliminar el producto" };
  }
}
