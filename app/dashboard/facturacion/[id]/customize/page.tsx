import { notFound } from "next/navigation";
import { getOrganizationDetail } from "../../actions";
import { getInvoiceSeriesFolio } from "./actions";
import LogoSection from "./componentes/LogoSection";
import CustomizationSection from "./componentes/CustomizationSection";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrganizationCustomizePage({ params }: Props) {
  const { id } = await params;

  const detailResult = await getOrganizationDetail(id);
  if (!detailResult.ok) notFound();
  const { organization } = detailResult.data;

  // Si la lectura del folio falla (por ejemplo, sin clave configurada todavía),
  // la pestaña sigue mostrando logo y apariencia — solo se pierde el dato informativo.
  const folioResult = await getInvoiceSeriesFolio(id);

  return (
    <div className="flex flex-col gap-6">
      <LogoSection orgId={id} organization={organization} />
      <CustomizationSection
        orgId={id}
        organization={organization}
        currentFolio={folioResult.ok ? folioResult.data : null}
      />
    </div>
  );
}
