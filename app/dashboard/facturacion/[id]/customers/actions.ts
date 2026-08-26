"use server";

/**
 * Server actions de clientes de una organización. Porta `app/actions/customers.ts`
 * del proyecto `factura` original (spec 29): `createCustomerAction`, `listCustomersAction`,
 * `searchCustomersAction`, `updateCustomerAction`.
 *
 * El original define su propio `getOrgClient` local (`customers.ts:9-13`, duplicado byte
 * a byte con el de `products.ts`) que usa siempre `test_key` sin mirar el modo. Aquí se
 * usa el `getOrgClient(uid, id_empresa)` compartido de `lib/billing/facturapiClient.ts`,
 * que además valida que `uid` pertenezca a `id_empresa` de la sesión antes de tocar
 * Facturapi — el original no hace ningún chequeo de tenant.
 */

import { revalidatePath } from "next/cache";
import type { Customer } from "facturapi";

import { ActionResult } from "@/app/actions/auth";
import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import { CustomerSchema } from "@/lib/billing/schemas";
import { writeAuditEntry } from "@/lib/billing/organizationsRepository";
import db from "@/database/connection";
import { ICustomerFormInput } from "@/interfaces/organization";

function toFacturapiCustomerPayload(data: ICustomerFormInput) {
  return {
    legal_name: data.legal_name,
    tax_id: data.tax_id,
    tax_system: data.tax_system,
    email: data.email,
    phone: data.phone ?? undefined,
    address: {
      street: data.street ?? undefined,
      exterior: data.exterior ?? undefined,
      interior: data.interior ?? undefined,
      neighborhood: data.neighborhood ?? undefined,
      zip: data.zip,
      city: data.city ?? undefined,
      municipality: data.municipality ?? undefined,
      state: data.state ?? undefined,
      country: data.country ?? undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

export async function createCustomerAction(orgId: string, input: unknown): Promise<ActionResult<Customer>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = CustomerSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const client = await getOrgClient(orgId, id_empresa);
    const customer = await client.customers.create(toFacturapiCustomerPayload(parsed.data));

    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "customer.create",
      org_uid: orgId,
      target_id: customer.id,
    });

    revalidatePath(`/dashboard/facturacion/${orgId}/customers`);
    return { ok: true, data: customer };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Listado y búsqueda
// ---------------------------------------------------------------------------

export async function listCustomersAction(orgId: string): Promise<ActionResult<Customer[]>> {
  try {
    const { id_empresa } = await requireBillingAccess();

    const client = await getOrgClient(orgId, id_empresa);
    const result = await client.customers.list({ limit: 50 });

    return { ok: true, data: result.data };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

/** `q` vacío se comporta como `listCustomersAction` — mismo criterio que el original. */
export async function searchCustomersAction(orgId: string, q: string): Promise<ActionResult<Customer[]>> {
  try {
    const { id_empresa } = await requireBillingAccess();

    const client = await getOrgClient(orgId, id_empresa);
    const trimmedQuery = q.trim();
    const result = await client.customers.list({ q: trimmedQuery || undefined, limit: 50 });

    return { ok: true, data: result.data };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Edición
// ---------------------------------------------------------------------------

export async function updateCustomerAction(
  orgId: string,
  customerId: string,
  input: unknown
): Promise<ActionResult<Customer>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = CustomerSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const client = await getOrgClient(orgId, id_empresa);
    const customer = await client.customers.update(customerId, toFacturapiCustomerPayload(parsed.data));

    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "customer.update",
      org_uid: orgId,
      target_id: customerId,
    });

    revalidatePath(`/dashboard/facturacion/${orgId}/customers`);
    return { ok: true, data: customer };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}
