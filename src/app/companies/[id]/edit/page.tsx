import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/lib/BackLink";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { updateCompany } from "../../actions";
import { CompanyForm } from "../../CompanyForm";
import { PageHeader } from "../../_ui";

export const dynamic = "force-dynamic";

export default async function EditCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const [company, req] = await Promise.all([
    prisma.company.findUnique({ where: { id } }),
    getFieldRequirements(),
  ]);
  if (!company) notFound();

  return (
    <div>
      <div className="mb-3">
        <BackLink href={`/companies/${company.id}`} label={`Back to ${company.name}`} />
      </div>
      <PageHeader title={`Edit ${company.name}`} subtitle="Company details" />
      <CompanyForm
        action={updateCompany}
        company={company}
        submitLabel="Save changes"
        cancelHref={`/companies/${company.id}`}
        error={error}
        requiredFields={{ phone: req["company.phone"], email: req["company.email"] }}
      />
    </div>
  );
}
