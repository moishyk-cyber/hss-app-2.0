import { createCompany } from "../actions";
import { CompanyForm } from "../CompanyForm";
import { BackLink, PageHeader } from "../_ui";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; company?: string }>;
}) {
  const { error, company } = await searchParams;
  return (
    <div>
      <BackLink href="/phonebook" label="Phone Book" />
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
