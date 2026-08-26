import Link from "next/link";
import { FormAlert, PendingButton } from "@/lib/ui";
import { BusinessField } from "./BusinessField";
import { CONTACT_STATUSES, Field, Select, TextArea, TitleField } from "./_ui";

type ContactFormValues = {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  companyId?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneExt?: string | null;
  cellPhone?: string | null;
  status?: string | null;
  notes?: string | null;
};

export function ContactForm({
  action,
  contact,
  companies,
  submitLabel,
  cancelHref,
  returnTo,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  contact?: ContactFormValues;
  companies: { id: string; name: string }[];
  submitLabel: string;
  cancelHref: string;
  returnTo?: string;
  error?: string;
}) {
  const defaultCompanyName =
    companies.find((c) => c.id === contact?.companyId)?.name ?? null;

  return (
    <form action={action} className="card max-w-3xl">
      {contact?.id ? <input type="hidden" name="id" value={contact.id} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      {error === "company_required" ? (
        <FormAlert>
          Every contact belongs to a business — pick one before saving. If the business isn&rsquo;t
          on the list yet, add it first.
        </FormAlert>
      ) : error === "save_failed" ? (
        <FormAlert>Something went wrong while saving. Please try again.</FormAlert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" name="firstName" defaultValue={contact?.firstName} required />
        <Field label="Last name" name="lastName" defaultValue={contact?.lastName} />
        <BusinessField
          companies={companies}
          defaultCompanyId={contact?.companyId}
          defaultCompanyName={defaultCompanyName}
        />
        <TitleField defaultValue={contact?.title} />
        <Field label="Email" name="email" type="email" defaultValue={contact?.email} />
        <Field label="Phone" name="phone" type="tel" defaultValue={contact?.phone} />
        <Field
          label="Phone extension"
          name="phoneExt"
          type="tel"
          defaultValue={contact?.phoneExt}
        />
        <Field label="Cell phone" name="cellPhone" type="tel" defaultValue={contact?.cellPhone} />
        <Select
          label="Status"
          name="status"
          options={CONTACT_STATUSES}
          defaultValue={contact?.status ?? "active"}
        />
      </div>

      <TextArea label="Notes" name="notes" defaultValue={contact?.notes} className="mt-4" />

      <div className="mt-6 flex items-center gap-2 border-t border-border pt-5">
        <PendingButton className="btn btn-primary active:scale-[0.99]" pendingText="Saving…">
          {submitLabel}
        </PendingButton>
        <Link href={cancelHref} className="btn active:scale-[0.99]">
          Cancel
        </Link>
      </div>
    </form>
  );
}
