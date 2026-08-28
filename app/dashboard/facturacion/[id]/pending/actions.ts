"use server";

/**
 * Server actions de la pestaña "Por facturar" (spec 34): listado de cobros de
 * consultas y tratamientos totalmente pagados y aún no facturados, y su
 * timbrado como CFDI de ingreso de un solo concepto por operación.
 *
 * El SQL del dominio clínico vive en `lib/billing/billableOperations.ts` (lo
 * comparte con `../invoices/actions.ts`, que lo usa para revertir el
 * estampado al cancelar); aquí solo la orquestación de la pestaña.
 */

import { revalidatePath } from "next/cache";
import type { Invoice, Product } from "facturapi";

import db from "@/database/connection";
import { ActionResult } from "@/app/actions/auth";
import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import { CreateBillableInvoiceSchema } from "@/lib/billing/schemas";
import { getOrganizationByUid, writeAuditEntry } from "@/lib/billing/organizationsRepository";
import {
  listBillableOperations,
  resolveBillableOperation,
  markOperationInvoiced,
} from "@/lib/billing/billableOperations";
import { IBillableOperation } from "@/interfaces/organization";

/**
 * Confirma que `uid` pertenece a `idEmpresa` antes de tocar Facturapi o el
 * dominio clínico — mismo chequeo duplicado en cada `actions.ts` de pestaña
 * (ver nota en `../customize/actions.ts` sobre por qué no está compartido).
 */
async function assertOwnedOrganization(uid: string, idEmpresa: number) {
  const organization = await getOrganizationByUid(db, uid, idEmpresa);
  if (!organization) {
    throw new Error("Organización no encontrada en la base de datos");
  }
  return organization;
}

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

/**
 * Filtros que manda el cliente. `id_sucursal` sale de `SucursalContext`
 * (estado de cliente), igual que `getSaleProducts(id_sucursal)` en
 * `../../ventas/actions.ts` — no se valida contra las sucursales del usuario
 * porque hoy ningún listado de este tipo en el repo lo hace; `id_empresa` (del
 * JWT vía `requireBillingAccess`) es el límite de tenant real.
 */
export interface IBillableOperationsQuery {
  id_sucursal: number;
  date_from?: string | null;
  date_to?: string | null;
  id_podologo?: number | null;
  search?: string | null;
}

export async function getBillableOperationsAction(
  uid: string,
  filters: IBillableOperationsQuery
): Promise<ActionResult<IBillableOperation[]>> {
  try {
    const { id_empresa } = await requireBillingAccess();
    await assertOwnedOrganization(uid, id_empresa);

    const operations = await listBillableOperations({ id_empresa, ...filters });
    return { ok: true, data: operations };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Timbrado
// ---------------------------------------------------------------------------

/**
 * Facturapi rechaza `items[0].price` cuando `product` es el `id` de un producto
 * del catálogo — con un `id`, el precio y la descripción son los que ya tiene
 * guardado ese producto, no se pueden sobreescribir a su lado. Para facturar el
 * total real de la operación (que no es el precio de catálogo del producto por
 * defecto) hay que mandar el renglón como un producto **inline**: mismo
 * `product_key`/`unit_key`/`tax_included`/`taxes` que el producto configurado
 * en Personalizar, pero con `price` y `description` propios de esta factura.
 */
function toFacturapiBillablePayload(input: {
  customerId: string;
  description: string;
  use: string;
  defaultProduct: Product;
  price: number;
  paymentForm: string;
}): Record<string, unknown> {
  return {
    customer: input.customerId,
    items: [
      {
        quantity: 1,
        product: {
          description: input.description,
          product_key: input.defaultProduct.product_key,
          unit_key: input.defaultProduct.unit_key,
          price: input.price,
          tax_included: input.defaultProduct.tax_included,
          taxes: input.defaultProduct.taxes,
        },
      },
    ],
    payment_form: input.paymentForm,
    payment_method: "PUE",
    use: input.use,
  };
}

/**
 * Timbra un CFDI de ingreso de un solo concepto por el cobro de una operación
 * (consulta o tratamiento) totalmente pagada y no facturada.
 *
 * `idSucursal` viaja como parámetro aparte del payload validado — mismo
 * criterio que `orgId` en `../products/actions.ts` — porque sale de
 * `SucursalContext`, no de datos capturados en el modal.
 *
 * El importe, la forma de pago y el producto **nunca** llegan del cliente:
 * `resolveBillableOperation` los recalcula contra la base de datos en este
 * mismo instante, cerrando la ventana entre el render de la lista y el clic.
 */
export async function createBillableInvoiceAction(
  uid: string,
  idSucursal: number,
  input: unknown
): Promise<ActionResult<Invoice>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = CreateBillableInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const data = parsed.data;

    const organization = await assertOwnedOrganization(uid, id_empresa);
    if (!organization.default_product_id) {
      return {
        ok: false,
        message: "Configura un producto por defecto en la pestaña Personalizar antes de facturar cobros",
      };
    }

    const resolved = await resolveBillableOperation(data.source, data.source_id, id_empresa, idSucursal);
    if (!resolved) {
      return { ok: false, message: "Este cobro ya no está pendiente de facturar" };
    }

    const client = await getOrgClient(uid, id_empresa);
    const defaultProduct = await client.products.retrieve(organization.default_product_id);
    const invoice = await client.invoices.create(
      toFacturapiBillablePayload({
        customerId: data.customer_id,
        description: data.description,
        use: data.use,
        defaultProduct,
        price: resolved.total,
        paymentForm: resolved.payment_form,
      })
    );

    // El orden importa: se timbra primero y se estampa después, igual que el
    // spec 30 escribe la bitácora tras la confirmación de Facturapi. Si el
    // `UPDATE` falla, la factura existe y el cobro sigue apareciendo como
    // pendiente — falso pendiente, no falso facturado (ver Riesgos, spec 34).
    await db.transaction(async (tx) => {
      await markOperationInvoiced(tx, data.source, data.source_id, invoice.uuid);
      await writeAuditEntry(tx, {
        id_empresa,
        id_user,
        action: "invoice.create",
        org_uid: uid,
        target_id: String(invoice.folio_number),
        mode: organization.is_live ? "live" : "test",
        detail: JSON.stringify({ source: data.source, source_id: data.source_id }),
      });
    });

    revalidatePath(`/dashboard/facturacion/${uid}/pending`);
    revalidatePath(`/dashboard/facturacion/${uid}/invoices`);
    return { ok: true, data: invoice };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}
