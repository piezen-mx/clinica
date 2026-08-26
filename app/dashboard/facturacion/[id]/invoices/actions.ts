"use server";

/**
 * Server actions de facturas de una organización. Porta `app/actions/invoices.ts`
 * del proyecto `factura` original (114 líneas, 3 exports + un `getOrgClient` privado).
 * Cambios respecto al original — ver Decisiones tomadas, spec 30:
 *
 * 1. **Ninguna de las tres funciones acepta un parámetro `mode`.** El original las
 *    declara como `createInvoiceAction(orgId, mode, data)`,
 *    `cancelInvoiceAction(orgId, invoiceId, motive, mode)` y
 *    `sendInvoiceByEmailAction(orgId, invoiceId, mode, email?)`. El modo se resuelve
 *    siempre dentro de `getOrgClient`, a partir de `is_live`.
 * 2. Se elimina el `getOrgClient` privado (duplicado en `customers.ts`/`products.ts`
 *    del original) y se usa el compartido de `lib/billing/facturapiClient.ts`.
 * 3. **`sendInvoiceByEmailAction` deja de aceptar un destinatario arbitrario.** El
 *    original recibe `email?` del cliente y se lo pasa a Facturapi: con o sin
 *    autenticación, es una vía para mandar comprobantes fiscales a cualquier
 *    dirección sin dejar rastro. Aquí se llama a Facturapi sin destinatario, que
 *    usa el correo registrado del cliente del comprobante.
 * 4. Cantidades pasan por `money()` (vía `CreateInvoiceSchema`) — nunca
 *    `parseFloat`/`parseInt` sin validar (`invoices.ts:47,51,57` del original).
 */

import { revalidatePath } from "next/cache";
import type { Invoice } from "facturapi";

import db from "@/database/connection";
import { ActionResult } from "@/app/actions/auth";
import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import { CreateInvoiceSchema, CancelInvoiceSchema, SendInvoiceEmailSchema, CreateInvoiceInput } from "@/lib/billing/schemas";
import { getOrganizationByUid, writeAuditEntry } from "@/lib/billing/organizationsRepository";

function toFacturapiInvoicePayload(data: CreateInvoiceInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    customer: data.customer_id,
    items: data.lines.map((line) => ({ quantity: line.quantity, product: line.product_id })),
    payment_form: data.payment_form,
    payment_method: data.payment_method,
    use: data.use,
  };
  if (data.series) payload.series = data.series;
  if (data.folio_number !== null) payload.folio_number = data.folio_number;
  return payload;
}

/**
 * Resuelve `mode` ("test" | "live") para la bitácora. `getOrgClient` ya resuelve
 * el modo internamente para construir el cliente correcto, pero no lo expone —
 * aquí se lee de nuevo la misma fila (`getOrganizationByUid`, con el mismo filtro
 * de tenant) solo para poder registrarlo en `audit_log`.
 */
async function resolveMode(uid: string, idEmpresa: number): Promise<"test" | "live"> {
  const organization = await getOrganizationByUid(db, uid, idEmpresa);
  return organization?.is_live ? "live" : "test";
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

export async function createInvoiceAction(uid: string, input: unknown): Promise<ActionResult<Invoice>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = CreateInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const client = await getOrgClient(uid, id_empresa);
    const invoice = await client.invoices.create(toFacturapiInvoicePayload(parsed.data));

    // Se escribe después de que Facturapi confirma el timbrado, para que la
    // bitácora no afirme facturas que no llegaron a existir.
    const mode = await resolveMode(uid, id_empresa);
    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "invoice.create",
      org_uid: uid,
      target_id: String(invoice.folio_number),
      mode,
    });

    revalidatePath(`/dashboard/facturacion/${uid}/invoices`);
    return { ok: true, data: invoice };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Cancelación
// ---------------------------------------------------------------------------

export async function cancelInvoiceAction(
  uid: string,
  invoiceId: string,
  motive: unknown
): Promise<ActionResult<Invoice>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = CancelInvoiceSchema.safeParse({ invoiceId, motive });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const client = await getOrgClient(uid, id_empresa);
    const invoice = await client.invoices.cancel(parsed.data.invoiceId, { motive: parsed.data.motive });

    const mode = await resolveMode(uid, id_empresa);
    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "invoice.cancel",
      org_uid: uid,
      target_id: String(invoice.folio_number),
      mode,
    });

    revalidatePath(`/dashboard/facturacion/${uid}/invoices`);
    return { ok: true, data: invoice };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Envío por correo
// ---------------------------------------------------------------------------

/**
 * Envía el PDF/XML de la factura al correo **registrado del cliente del
 * comprobante**, nunca a uno provisto por quien llama. Se lee la factura antes
 * de enviarla solo para tener su folio a la mano en la bitácora — `sendByEmail`
 * no devuelve más que `{ ok: true }`.
 */
export async function sendInvoiceByEmailAction(uid: string, invoiceId: string): Promise<ActionResult<void>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = SendInvoiceEmailSchema.safeParse({ invoiceId });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const client = await getOrgClient(uid, id_empresa);
    const invoice = await client.invoices.retrieve(parsed.data.invoiceId);
    await client.invoices.sendByEmail(parsed.data.invoiceId);

    const mode = await resolveMode(uid, id_empresa);
    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "invoice.email",
      org_uid: uid,
      target_id: String(invoice.folio_number),
      mode,
    });

    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}
