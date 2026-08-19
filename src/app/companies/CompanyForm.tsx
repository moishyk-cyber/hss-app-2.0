import Link from "next/link";
import { COMPANY_TYPES, COMPANY_VERTICALS } from "@/lib/constants";
import { Checkbox, Field, Select, TextArea } from "./_ui";

type CompanyFormValues = {
  id?: string;
  name?: string | null;
  type?: string | null;
  vertical?: string | null;
  priorityClient?: boolean;
  phone?: string | null;
  phoneExt?: string | null;
  cellPhone?: string | null;
  email?: string | null;
  website?: string | null;
  deliveryAddress?: string | null;
  billingAddress?: string | null;
  locationName?: string | null;
  zip?: string | null;
  notes?: string | null;
};

export function CompanyForm({
  action,
  company,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  company?: CompanyFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="max-w-3xl rounded-lg border border-gray-200 bg-white p-5">
      {company?.id ? <input type="hidden" name="id" value={company.id} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company name" name="name" defaultValue={company?.name} required />
        <Select
          label="Type"
          name="type"
          options={COMPANY_TYPES}
          defaultValue={company?.type ?? "customer"}
        />
        <Select
          label="Vertical"
          name="vertical"
          options={COMPANY_VERTICALS}
          defaultValue={company?.vertical}
          includeBlank="— none —"
        />
        <Checkbox
          label="Priority client"
          name="priorityClient"
          defaultChecked={company?.priorityClient}
        />

        <Field label="Phone" name="phone" defaultValue={company?.phone} />
        <Field label="Phone extension" name="phoneExt" defaultValue={company?.phoneExt} />
        <Field label="Cell phone" name="cellPhone" defaultValue={company?.cellPhone} />
        <Field label="Email" name="email" type="email" defaultValue={company?.email} />

        <Field label="Website" name="website" defaultValue={company?.website} />
        <Field label="Location name" name="locationName" defaultValue={company?.locationName} />
        <Field
          label="Delivery address"
          name="deliveryAddress"
          defaultValue={company?.deliveryAddress}
        />
        <Field
          label="Billing address"
          name="billingAddress"
          defaultValue={company?.billingAddress}
        />
        <Field label="Zip code" name="zip" defaultValue={company?.zip} />
      </div>

      <TextArea label="Notes" name="notes" defaultValue={company?.notes} className="mt-4" />

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
