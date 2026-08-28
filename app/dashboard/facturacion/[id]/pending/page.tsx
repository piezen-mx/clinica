import Link from "next/link";
import { notFound } from "next/navigation";
import type { Customer } from "facturapi";

import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import { getOrganizationDetail } from "../../actions";
import BillableOperationsSection from "./componentes/BillableOperationsSection";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Server Component: resuelve `default_product_id` (spec 34) — sin él, la
 * pestaña muestra un aviso que remite a Personalizar y no permite timbrar.
 * También trae el padrón de clientes (insumo del modal de timbrado, mismo
 * criterio que `../invoices/page.tsx`). Los podólogos del filtro **no** se
 * traen aquí: son por sucursal (`getPodologosBySucursal`) y la sucursal activa
 * es estado de cliente (`SucursalContext`), así que `BillableOperationsSection`
 * los pide junto con el listado, cada vez que cambia la sucursal.
 */
export default async function OrganizationPendingPage({ params }: Props) {
  const { id } = await params;

  const detailResult = await getOrganizationDetail(id);
  if (!detailResult.ok) notFound();
  const { defaultProductId, isLive } = detailResult.data;

  let customers: Customer[] = [];
  let errorMessage: string | null = null;
  try {
    const { id_empresa } = await requireBillingAccess();
    const client = await getOrgClient(id, id_empresa);
    const customersResult = await client.customers.list({ limit: 50 });
    customers = customersResult.data;
  } catch (err) {
    errorMessage = toUserMessage(err);
  }

  return (
    <div className="flex flex-col gap-5">
      {errorMessage && (
        <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      {!defaultProductId && (
        <p className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          Configura un producto por defecto en{" "}
          <Link href={`/dashboard/facturacion/${id}/customize`} className="font-semibold underline">
            Personalizar
          </Link>{" "}
          antes de poder facturar cobros desde esta pestaña.
        </p>
      )}

      <BillableOperationsSection
        orgId={id}
        customers={customers}
        hasDefaultProduct={Boolean(defaultProductId)}
        isLive={isLive}
      />
    </div>
  );
}
