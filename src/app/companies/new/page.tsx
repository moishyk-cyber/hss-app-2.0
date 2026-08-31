import { BackLink } from "@/lib/BackLink";
import { createCompany } from "../actions";
import { CompanyForm } from "../CompanyForm";
import { PageHeader } from "../_ui";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; company?: string }>;
}) {
  const { error, company } = await searchParams;
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
      />
    </div>
  );
}
