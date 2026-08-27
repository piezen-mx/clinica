import type { Customer, Product } from "facturapi";

import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import { addZeroToday } from "@/utils/date_helpper";
import { getOrganizationDetail } from "../../actions";
import { listInvoicesAction } from "./actions";
import InvoicesSection from "./componentes/InvoicesSection";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Server Component: resuelve el modo desde la base de datos (a través de
 * `getOrganizationDetail`/`getOrgClient`, nunca de un query param) y trae, además
 * del listado de facturas del mes actual, los clientes y productos de la
 * organización — insumos de `CreateInvoiceModal` para armar los renglones sin que
 * el modal tenga que volver a pedirlos al abrirse.
 *
 * El layout de la organización (`../../layout.tsx`) ya validó que existe y
 * pertenece a la empresa del usuario, así que un error aquí es de Facturapi (o de
 * la clave Test/Live), no de "organización no encontrada" — se muestra inline en
 * vez de `notFound()`, mismo criterio que `../customers/page.tsx`.
 */
export default async function OrganizationInvoicesPage({ params }: Props) {
  const { id } = await params;
  const currentMonth = addZeroToday(new Date()).slice(0, 7);

  const detailResult = await getOrganizationDetail(id);
  const isLive = detailResult.ok && detailResult.data.isLive;
  const hasLiveKey = detailResult.ok && detailResult.data.hasLiveKey;

  const invoicesResult = await listInvoicesAction(id, { month: currentMonth });
  const invoices = invoicesResult.ok ? invoicesResult.data : [];

  let customers: Customer[] = [];
  let products: Product[] = [];
  let catalogErrorMessage: string | null = null;
  try {
    const { id_empresa } = await requireBillingAccess();
    const client = await getOrgClient(id, id_empresa);
    const [customersResult, productsResult] = await Promise.all([
      client.customers.list({ limit: 50 }),
      client.products.list({ limit: 50 }),
    ]);
    customers = customersResult.data;
    products = productsResult.data;
  } catch (err) {
    catalogErrorMessage = toUserMessage(err);
  }

  const errorMessage = !invoicesResult.ok ? invoicesResult.message : catalogErrorMessage;

  return (
    <div className="flex flex-col gap-5">
      {errorMessage && (
        <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      {/* El original avisaba cuando falta la `live_key` (`InvoicesSection.tsx:113-118`):
          `is_live` puede quedar en `1` con la clave revocada después (`deleteLiveApiKey`
          no toca `is_live`), y sin este aviso el primer indicio sería el error opaco de
          Facturapi al intentar timbrar. */}
      {isLive && !hasLiveKey && (
        <p className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          Esta organización está en modo Live pero no tiene una clave Live configurada. Renuévala desde
          Configuración antes de intentar crear una factura.
        </p>
      )}

      <InvoicesSection
        orgId={id}
        initialInvoices={invoices}
        initialMonth={currentMonth}
        customers={customers}
        products={products}
        isLive={isLive}
      />
    </div>
  );
}
