"use server";

/**
 * Server actions de la pestaña Personalizar. Porta `uploadOrganizationLogo`
 * (`organizations.ts:257-270`) y `updateOrganizationCustomization`
 * (`organizations.ts:293-305`) del proyecto `factura` original, que hoy viven en
 * el `actions.ts` de organizaciones junto a CSD y API keys. Aquí quedan en su
 * propia carpeta porque la pestaña tiene su propio `actions.ts`, igual que las
 * sub-pestañas del expediente de empleado (`empleados/[id]/documentos/actions.ts`).
 *
 * Cambios respecto al original (spec 31):
 * 1. El original acepta cualquier archivo de cualquier tamaño para el logo
 *    (`organizations.ts:261-262`, con casts `as File`). Aquí pasa por
 *    `UploadLogoSchema`, que valida extensión, tamaño y tipo real por magic bytes.
 * 2. Ambas actions usan `getOrgClient(uid, id_empresa)`, que valida pertenencia
 *    (vía `getOrganizationByUid`) antes de tocar Facturapi — el original no
 *    filtra por tenant.
 * 3. `org.upload_logo` y `org.update_customization` quedan en `audit_log`; el
 *    original no registra ninguna de las dos operaciones.
 */

import { revalidatePath } from "next/cache";
import type { Organization } from "facturapi";

import db from "@/database/connection";
import { ActionResult } from "@/app/actions/auth";
import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import { UploadLogoSchema, OrganizationCustomizationSchema } from "@/lib/billing/schemas";
import { getOrganizationByUid, writeAuditEntry } from "@/lib/billing/organizationsRepository";

const INVOICE_SERIES_TYPE = "I" as const;

/**
 * Resuelve `mode` ("test" | "live") leyendo la misma fila que `getOrgClient` ya
 * consultó para construir el cliente. Se necesita aparte porque el siguiente
 * folio vive en dos campos distintos de la serie (`next_folio`/`next_folio_test`)
 * y hay que saber cuál tocar; el mismo patrón que `resolveMode` en
 * `invoices/actions.ts`.
 */
async function resolveMode(uid: string, idEmpresa: number): Promise<"test" | "live"> {
  const organization = await getOrganizationByUid(db, uid, idEmpresa);
  return organization?.is_live ? "live" : "test";
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export async function uploadOrganizationLogo(formData: FormData): Promise<ActionResult<Organization>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = await UploadLogoSchema.safeParseAsync({
      orgId: formData.get("orgId"),
      logoFile: formData.get("logo"),
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Archivo inválido" };
    }
    const { orgId, logoFile } = parsed.data;

    const client = await getOrgClient(orgId, id_empresa);
    const organization = await client.organizations.uploadLogo(orgId, logoFile);

    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "org.upload_logo",
      org_uid: orgId,
    });

    revalidatePath(`/dashboard/facturacion/${orgId}/customize`);
    return { ok: true, data: organization };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Apariencia y series por defecto
// ---------------------------------------------------------------------------

/**
 * Color y `pdf_extra` se actualizan con `updateCustomization`; la serie y el
 * siguiente folio requieren dos llamadas más (`updateDefaultSeries` y
 * `updateSeriesGroup`), porque en Facturapi son entidades separadas de la
 * personalización de apariencia. Cada llamada solo se hace si el usuario tocó
 * ese campo — de lo contrario se preserva lo que ya tiene la organización.
 */
export async function updateOrganizationCustomization(
  orgId: string,
  input: unknown
): Promise<ActionResult<Organization>> {
  try {
    const { id_empresa, id_user } = await requireBillingAccess();

    const parsed = OrganizationCustomizationSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const data = parsed.data;

    const client = await getOrgClient(orgId, id_empresa);
    const current = await client.organizations.retrieve(orgId);

    await client.organizations.updateCustomization(orgId, {
      color: data.color ?? current.customization.color,
      pdf_extra: { ...current.customization.pdf_extra, ...data.pdf_extra },
    });

    const targetSeries = data.invoice_series ?? current.customization.default_series[INVOICE_SERIES_TYPE];
    if (data.invoice_series && data.invoice_series !== current.customization.default_series[INVOICE_SERIES_TYPE]) {
      await client.organizations.updateDefaultSeries(orgId, {
        type: INVOICE_SERIES_TYPE,
        series: data.invoice_series,
      });
    }

    if (data.next_folio !== null) {
      const mode = await resolveMode(orgId, id_empresa);
      const existingSeries = (await client.organizations.listSeriesGroup(orgId)).find(
        (series) => series.series === targetSeries
      );
      await client.organizations.updateSeriesGroup(orgId, targetSeries, {
        next_folio: mode === "live" ? data.next_folio : existingSeries?.next_folio ?? 1,
        next_folio_test: mode === "test" ? data.next_folio : existingSeries?.next_folio_test ?? 1,
      });
    }

    const organization = await client.organizations.retrieve(orgId);

    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "org.update_customization",
      org_uid: orgId,
    });

    revalidatePath(`/dashboard/facturacion/${orgId}/customize`);
    return { ok: true, data: organization };
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}
