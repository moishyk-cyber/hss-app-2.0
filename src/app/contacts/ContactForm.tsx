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
}: {
  action: (formData: FormData) => void | Promise<void>;
  contact?: ContactFormValues;
  companies: { id: string; name: string }[];
  submitLabel: string;
  cancelHref: string;
  returnTo?: string;
}) {
  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));

  return (
    <form action={action} className="max-w-3xl rounded-lg border border-gray-200 bg-white p-5">
      {contact?.id ? <input type="hidden" name="id" value={contact.id} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" name="firstName" defaultValue={contact?.firstName} required />
        <Field label="Last name" name="lastName" defaultValue={contact?.lastName} />
        <Select
          label="Company"
          name="companyId"
          options={companyOptions}
          defaultValue={contact?.companyId}
          includeBlank="— no company —"
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

      <div className="mt-5 flex items-center gap-2">
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          {submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
