import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOrganizationDetail } from "../actions";
import OrgTabs from "./componentes/OrgTabs";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export default async function OrganizationDetailLayout({ params, children }: Props) {
  const { id } = await params;

  const result = await getOrganizationDetail(id);
  if (!result.ok) notFound();

  const { organization } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/facturacion"
          className="inline-flex items-center gap-1 text-sm text-[#44474f] dark:text-zinc-400 hover:text-[#0051d5] dark:hover:text-blue-400 mb-2"
        >
          <ArrowLeft size={14} />
          Facturación
        </Link>
        <h2 className="text-2xl font-bold text-[#0b1c30] dark:text-zinc-50">
          {organization.legal.name || organization.legal.legal_name}
        </h2>
      </div>

      <OrgTabs orgId={id} />

      {children}
    </div>
  );
}
