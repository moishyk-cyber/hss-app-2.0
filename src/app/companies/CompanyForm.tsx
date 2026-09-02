import Link from "next/link";
import { COMPANY_TYPES, COMPANY_VERTICALS } from "@/lib/constants";
import { FormAlert, PendingButton } from "@/lib/ui";
import { Checkbox, Field, Select, TextArea } from "./_ui";

type CompanyFormValues = {
  id?: string;
  name?: string | null;
  type?: string | null;
  vertical?: string | null;
  priorityClient?: boolean;
  requiresDeposit?: boolean;
  depositPercent?: number | null;
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
  error,
  duplicateCompany,
  requiredFields,
}: {
  action: (formData: FormData) => void | Promise<void>;
  company?: CompanyFormValues;
  submitLabel: string;
  cancelHref: string;
  error?: string;
  /** Name of the existing business that blocked this save. */
  duplicateCompany?: string;
  /** Which optional fields the Settings tab currently requires (see @/lib/fieldRequirements). */
  requiredFields?: { phone?: boolean; email?: boolean };
}) {
  return (
    <form action={action} className="card max-w-3xl">
      {error === "duplicate_company" ? (
        <FormAlert>
          <strong>{duplicateCompany ?? "A business with that name"}</strong> already exists -
          nothing was saved. Open it from{" "}
          <Link href="/companies" className="underline">
            Businesses
          </Link>{" "}
          and edit that record instead of creating a second one.
        </FormAlert>
      ) : error === "invalid_value" ? (
        <FormAlert>
          One of the dropdowns held a value this app doesn&rsquo;t recognise. Nothing was saved -
          please re-pick and try again.
        </FormAlert>
      ) : error === "missing_required" ? (
        <FormAlert>
          Phone and/or email is required (set in{" "}
          <Link href="/admin/settings" className="underline">
            Admin → Settings
          </Link>
          ). Please fill it in and save again.
        </FormAlert>
      ) : error === "save_failed" ? (
        <FormAlert>Something went wrong while saving. Please try again.</FormAlert>
      ) : null}
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
          includeBlank="None"
        />
        <Checkbox
          label="Priority client"
          name="priorityClient"
          defaultChecked={company?.priorityClient}
        />

        {/* Deposit terms are per-account: they drive the payment staged when a deal is won. */}
        <Checkbox
          label="Requires deposit"
          name="requiresDeposit"
          defaultChecked={company?.requiresDeposit ?? true}
        />
        <Field
          label="Deposit %"
          name="depositPercent"
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={company?.depositPercent ?? 30}
          hint="Only applies when a deposit is required."
        />

        <Field
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={company?.phone}
          required={requiredFields?.phone}
        />
        <Field
          label="Phone extension"
          name="phoneExt"
          type="tel"
          defaultValue={company?.phoneExt}
        />
        <Field label="Cell phone" name="cellPhone" type="tel" defaultValue={company?.cellPhone} />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={company?.email}
          required={requiredFields?.email}
        />

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
