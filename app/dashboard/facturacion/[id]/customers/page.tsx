import { listCustomersAction } from "./actions";
import CustomersSection from "./componentes/CustomersSection";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * El layout de la organización (`../layout.tsx`) ya validó que existe y pertenece a la
 * empresa del usuario antes de renderizar esta pestaña — una falla aquí es de Facturapi
 * (o de la clave Test), no de "organización no encontrada", así que se muestra inline
 * en vez de `notFound()` (mismo criterio que `app/dashboard/facturacion/page.tsx`).
 */
export default async function OrganizationCustomersPage({ params }: Props) {
  const { id } = await params;

  const result = await listCustomersAction(id);
  const customers = result.ok ? result.data : [];

  return (
    <div className="flex flex-col gap-5">
      {!result.ok && (
        <p className="rounded-md bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {result.message}
        </p>
      )}

      <CustomersSection orgId={id} initialCustomers={customers} />
    </div>
  );
}
