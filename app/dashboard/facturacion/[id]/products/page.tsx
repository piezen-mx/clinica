import type { Product } from "facturapi";
import { requireBillingAccess } from "@/lib/auth/session";
import { getOrgClient } from "@/lib/billing/facturapiClient";
import { toUserMessage } from "@/lib/billing/errors";
import ProductsSection from "./componentes/ProductsSection";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * El original arma el listado con un `new Facturapi(record.test_key)` inline
 * (`products/page.tsx:13`), lo que el spec 29 prohíbe explícitamente. Aquí se usa
 * el `getOrgClient` compartido, igual que en `../general/page.tsx` y `../customers`.
 * No hay `listProductsAction` en `actions.ts` (a diferencia de `customers/actions.ts`):
 * el original tampoco lo tenía — el listado vivía siempre en el Server Component.
 */
export default async function OrganizationProductsPage({ params }: Props) {
  const { id } = await params;

  let products: Product[] = [];
  let errorMessage: string | null = null;
  try {
    const { id_empresa } = await requireBillingAccess();
    const client = await getOrgClient(id, id_empresa);
    const result = await client.products.list({ limit: 50 });
    products = result.data;
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

      <ProductsSection orgId={id} initialProducts={products} />
    </div>
  );
}
