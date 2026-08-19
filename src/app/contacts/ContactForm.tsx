import Link from "next/link";
import { CONTACT_STATUSES, CONTACT_TITLES, Field, Select, TextArea } from "./_ui";

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
  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));

  return (
    <form action={action} className="card max-w-3xl p-6">
      {contact?.id ? <input type="hidden" name="id" value={contact.id} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      {error === "company_required" ? (
        <div className="banner-warn mb-5">
          Every contact belongs to a business — pick one before saving. If the business isn&rsquo;t
          on the list yet, add it first.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" name="firstName" defaultValue={contact?.firstName} required />
        <Field label="Last name" name="lastName" defaultValue={contact?.lastName} />
        <Select
          label="Business"
          name="companyId"
          options={companyOptions}
          defaultValue={contact?.companyId}
          includeBlank="— select a business —"
          required
        />
        <Select
          label="Title"
          name="title"
          options={CONTACT_TITLES}
          defaultValue={contact?.title}
          includeBlank="— none —"
        />
        <Field label="Email" name="email" type="email" defaultValue={contact?.email} />
        <Field label="Phone" name="phone" defaultValue={contact?.phone} />
        <Field label="Phone extension" name="phoneExt" defaultValue={contact?.phoneExt} />
        <Field label="Cell phone" name="cellPhone" defaultValue={contact?.cellPhone} />
        <Select
          label="Status"
          name="status"
          options={CONTACT_STATUSES}
          defaultValue={contact?.status ?? "active"}
        />
      </div>

      <TextArea label="Notes" name="notes" defaultValue={contact?.notes} className="mt-4" />

      <div className="mt-6 flex items-center gap-2 border-t border-border pt-5">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
        <Link href={cancelHref} className="btn">
          Cancel
        </Link>
      </div>
    </form>
  );
}
