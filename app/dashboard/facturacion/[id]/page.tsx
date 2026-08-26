import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

/** `/dashboard/facturacion/[id]` no tiene contenido propio: la pestaña por defecto es General. */
export default async function OrganizationDetailPage({ params }: Props) {
  const { id } = await params;
  redirect(`/dashboard/facturacion/${id}/general`);
}
