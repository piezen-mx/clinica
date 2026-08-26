import { NextResponse } from "next/server";
import { Readable } from "node:stream";

import db from "@/database/connection";
import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import { InvoicePdfParamsSchema } from "@/lib/billing/schemas";
import { getOrganizationByUid, writeAuditEntry } from "@/lib/billing/organizationsRepository";

export const runtime = "nodejs";

/**
 * Descarga el PDF de una factura, portada de la ruta homónima del proyecto
 * original (`pdf/route.ts`; su `await params` ya es correcto en Next 16, así que
 * se conserva). Cambios respecto al original:
 *
 * - **Autenticación y scoping, ausentes en el original.** Ahí la ruta es pública:
 *   cualquiera que conozca o adivine un `orgId` y un `invoiceId` descarga el PDF
 *   fiscal real, incluidos los de modo Live. Aquí `requireBillingAccess()` exige
 *   sesión (`401` sin ella) y `getOrgClient` valida que `orgId` pertenezca al
 *   `id_empresa` de esa sesión antes de tocar Facturapi.
 * - **El modo se resuelve dentro de `getOrgClient`, nunca del query string.** Se
 *   elimina el `?mode=` con su cast `as 'test' | 'live'` (`pdf/route.ts:20` del
 *   original).
 * - Los errores pasan por `toUserMessage`: no se devuelve el `message` crudo de
 *   Facturapi en el cuerpo del 500/400.
 * - Se registra `invoice.pdf` en `audit_log`, con el folio en `target_id`: una
 *   descarga de comprobante fiscal es un acceso que conviene poder rastrear, a
 *   diferencia del resto de lecturas del módulo (que no se registran).
 *
 * Recordatorio: el `matcher` de `proxy.ts` no cubre `/api/*` — esta autenticación
 * dentro del handler es la única que protege esta ruta.
 */
export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ orgId: string; invoiceId: string }> }
) => {
  let id_empresa: number;
  let id_user: number;
  try {
    ({ id_empresa, id_user } = await requireBillingAccess());
  } catch (err) {
    return NextResponse.json({ ok: false, message: toUserMessage(err) }, { status: 401 });
  }

  const parsed = InvoicePdfParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Solicitud inválida" },
      { status: 400 }
    );
  }
  const { orgId, invoiceId } = parsed.data;

  try {
    const client = await getOrgClient(orgId, id_empresa);

    // Se resuelve antes de descargar solo para tener el folio a la mano para la
    // bitácora — `downloadPdf` no devuelve más que el binario.
    const invoice = await client.invoices.retrieve(invoiceId);
    const download = await client.invoices.downloadPdf(invoiceId);

    const organization = await getOrganizationByUid(db, orgId, id_empresa);
    await writeAuditEntry(db, {
      id_empresa,
      id_user,
      action: "invoice.pdf",
      org_uid: orgId,
      target_id: String(invoice.folio_number),
      mode: organization?.is_live ? "live" : "test",
    });

    // `downloadPdf` devuelve `Blob | NodeLikeReadableStream`: en Node.js (este
    // handler corre con `runtime = "nodejs"`) llega como stream, que hay que
    // convertir a `ReadableStream` web para poder usarlo como cuerpo de la
    // respuesta; un `Blob` (entorno de navegador) ya es un `BodyInit` válido.
    const body = download instanceof Readable ? (Readable.toWeb(download) as ReadableStream) : (download as Blob);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="factura-${invoice.folio_number}.pdf"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, message: toUserMessage(err) }, { status: 400 });
  }
};
