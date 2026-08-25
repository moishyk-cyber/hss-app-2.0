import { createCompany } from "../actions";
import { CompanyForm } from "../CompanyForm";
import { BackLink, PageHeader } from "../_ui";

export default function NewCompanyPage() {
  return (
    <div>
      <BackLink href="/phonebook" label="Phone Book" />
      <PageHeader title="New business" subtitle="Add a customer, supplier or partner" />
      <CompanyForm action={createCompany} submitLabel="Create business" cancelHref="/phonebook" />
    </div>
  );
}
