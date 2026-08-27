import { NextResponse } from "next/server";

import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import { SatCatalogQuerySchema } from "@/lib/billing/schemas";
import { ISatProductSuggestion } from "@/interfaces/organization";

export const runtime = "nodejs";

/**
 * Búsqueda en el catálogo SAT de productos, portada de
 * `app/api/catalogs/products/route.ts` del proyecto original (spec 29).
 *
 * Es un route handler y no una server action porque el buscador de
 * `ProductFormModal` es un `fetch` incremental disparado desde un campo de
 * texto, no un submit — mismo criterio que justifica `app/api/upload` y el
 * webhook de los checadores (`app/api/asistencias/iclock/*`). No lo "corrijas"
 * a server action.
 *
 * **Se le agrega autenticación y scoping**, ausentes en el original: el endpoint
 * de origen es anónimo, recibe `?orgId=` del query string, resuelve la clave de
 * esa organización y ejecuta llamadas a Facturapi con ella — cualquiera puede
 * enumerar `orgId`s ajenos y generar tráfico facturado a cuentas que no son
 * suyas. Aquí `requireBillingAccess()` exige sesión y `getOrgClient` valida que
 * `orgId` pertenezca al `id_empresa` de esa sesión antes de tocar Facturapi.
 *
 * Recordatorio: el `matcher` de `proxy.ts` no cubre `/api/*` — esta
 * autenticación dentro del handler es la única que protege esta ruta.
 */
export const GET = async (req: Request) => {
  let id_empresa: number;
  try {
    ({ id_empresa } = await requireBillingAccess());
  } catch (err) {
    return NextResponse.json({ ok: false, message: toUserMessage(err) }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = SatCatalogQuerySchema.safeParse({
    orgId: searchParams.get("orgId") ?? "",
    q: searchParams.get("q") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Solicitud inválida" },
      { status: 400 }
    );
  }
  const { orgId, q } = parsed.data;

  try {
    const client = await getOrgClient(orgId, id_empresa);
    const result = await client.catalogs.searchProducts({ q });

    const suggestions: ISatProductSuggestion[] = (result?.data ?? []).map(
      (item: Record<string, string>) => ({
        key: item.key ?? item.c_ClaveProdServ ?? "",
        description: item.description ?? item.name ?? item.descripcion ?? "",
      })
    );

    return NextResponse.json({ ok: true, data: suggestions });
  } catch (err) {
    return NextResponse.json({ ok: false, message: toUserMessage(err) }, { status: 400 });
  }
};
