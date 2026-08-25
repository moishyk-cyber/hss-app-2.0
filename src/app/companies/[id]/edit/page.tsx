import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateCompany } from "../../actions";
import { CompanyForm } from "../../CompanyForm";
import { BackLink, PageHeader } from "../../_ui";

export const dynamic = "force-dynamic";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) notFound();

  return (
    <div>
      <BackLink href={`/companies/${company.id}`} label={company.name} />
      <PageHeader title={`Edit ${company.name}`} subtitle="Company details" />
      <CompanyForm
        action={updateCompany}
        company={company}
        submitLabel="Save changes"
        cancelHref={`/companies/${company.id}`}
      />
    </div>
  );
}
