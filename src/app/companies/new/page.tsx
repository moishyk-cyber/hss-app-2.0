import { createCompany } from "../actions";
import { CompanyForm } from "../CompanyForm";
import { PageHeader } from "../_ui";

export default function NewCompanyPage() {
  return (
    <div>
      <PageHeader title="New company" subtitle="Add a customer, supplier or partner" />
      <CompanyForm action={createCompany} submitLabel="Create company" cancelHref="/companies" />
    </div>
  );
}
