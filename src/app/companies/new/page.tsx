import { BackLink } from "@/lib/BackLink";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { createCompany } from "../actions";
import { CompanyForm } from "../CompanyForm";
import { PageHeader } from "../_ui";

export const dynamic = "force-dynamic";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; company?: string }>;
}) {
  const [{ error, company }, req] = await Promise.all([searchParams, getFieldRequirements()]);
  return (
    <div>
      <div className="mb-3">
        <BackLink href="/phonebook" label="Back to Phone Book" />
      </div>
      <PageHeader title="New business" subtitle="Add a customer, supplier or partner" />
      <CompanyForm
        action={createCompany}
        submitLabel="Create business"
        cancelHref="/phonebook"
        error={error}
        duplicateCompany={company}
        requiredFields={{ phone: req["company.phone"], email: req["company.email"] }}
      />
    </div>
  );
}
