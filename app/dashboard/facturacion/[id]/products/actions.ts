"use server";

/**
 * Server actions de productos de una organización. Porta `app/actions/products.ts`
 * del proyecto `factura` original (spec 29): `createProductAction`, `updateProductAction`.
 * Mismos cambios que `../customers/actions.ts` (`getOrgClient` compartido,
 * `requireBillingAccess`, `safeParse`, `ActionResult<T>`, `revalidatePath`, audit log),
 * más: el precio ya validado por `ProductSchema` (nunca `NaN`, ver `products.ts:33,58`
 * del original) y el IVA hardcodeado en una constante nombrada en vez de un literal
 * enterrado en el payload.
 */

import { revalidatePath } from "next/cache";
import type { Product } from "facturapi";

import { ActionResult } from "@/app/actions/auth";
import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import { ProductSchema } from "@/lib/billing/schemas";
import { writeAuditEntry } from "@/lib/billing/organizationsRepository";
import db from "@/database/connection";
import { IProductFormInput } from "@/interfaces/organization";

/** IVA general de México. El original lo trae hardcodeado inline en el payload de creación. */
const DEFAULT_VAT_RATE = 0.16;

function toFacturapiProductPayload(data: IProductFormInput) {
  return {
    description: data.description,
    product_key: data.product_key,
    price: data.price,
    unit_key: data.unit_key,
    tax_included: data.tax_included,
  };
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

export async function createProductAction(orgId: string, input: unknown): Promise<ActionResult<Product>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = ProductSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const client = await getOrgClient(orgId, id_empresa);
    const product = await client.products.create({
      ...toFacturapiProductPayload(parsed.data),
      taxes: [{ type: "IVA", rate: DEFAULT_VAT_RATE, factor: "Tasa" }],
    });

    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "product.create",
      org_uid: orgId,
      target_id: product.id,
    });

    revalidatePath(`/dashboard/facturacion/${orgId}/products`);
    return { ok: true, data: product };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Edición
// ---------------------------------------------------------------------------

export async function updateProductAction(
  orgId: string,
  productId: string,
  input: unknown
): Promise<ActionResult<Product>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = ProductSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const client = await getOrgClient(orgId, id_empresa);
    const product = await client.products.update(productId, toFacturapiProductPayload(parsed.data));

    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "product.update",
      org_uid: orgId,
      target_id: productId,
    });

    revalidatePath(`/dashboard/facturacion/${orgId}/products`);
    return { ok: true, data: product };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}
