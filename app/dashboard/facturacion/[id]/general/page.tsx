import { notFound } from "next/navigation";
import { getOrganizationDetail } from "../../actions";
import OrganizationLegalSection from "./componentes/OrganizationLegalSection";
import OrganizationCertificateSection from "./componentes/OrganizationCertificateSection";
import OrganizationApiKeysSection from "./componentes/OrganizationApiKeysSection";
import DeleteOrganizationSection from "./componentes/DeleteOrganizationSection";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrganizationGeneralPage({ params }: Props) {
  const { id } = await params;

  const result = await getOrganizationDetail(id);
  if (!result.ok) notFound();

  const { organization, hasTestKey, hasLiveKey } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <OrganizationLegalSection orgId={id} organization={organization} />
      <OrganizationCertificateSection orgId={id} organization={organization} />
      <OrganizationApiKeysSection orgId={id} hasTestKey={hasTestKey} hasLiveKey={hasLiveKey} />
      <DeleteOrganizationSection orgId={id} organizationName={organization.legal.name || organization.legal.legal_name} />
    </div>
  );
}
