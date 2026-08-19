"use client";

import { useMemo, useState } from "react";
import { submitIntake } from "./actions";

type IntakeContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  title: string | null;
};

type IntakeCompany = {
  id: string;
  name: string;
  deliveryAddress: string | null;
  locationName: string | null;
  contacts: IntakeContact[];
};

type ItemRow = { key: number; name: string; details: string; qty: string };

const inputClass =
  "w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-600";

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <header className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
            {step}
          </span>
          {title}
        </h2>
        {hint ? <p className="mt-1 pl-7 text-xs text-gray-500">{hint}</p> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  description?: string;
}) {
  return (
    <label
      className={`flex flex-1 cursor-pointer items-start gap-2 rounded border px-3 py-2 text-sm ${
        checked ? "border-gray-900 bg-gray-50" : "border-gray-300 bg-white hover:bg-gray-50"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-0.5 h-4 w-4"
      />
      <span>
        <span className="font-medium text-gray-900">{label}</span>
        {description ? <span className="block text-xs text-gray-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function IntakeForm({
  companies,
  salespeople,
}: {
  companies: IntakeCompany[];
  salespeople: { id: string; name: string }[];
}) {
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactMode, setContactMode] = useState<"existing" | "new">("existing");
  const [orderType, setOrderType] = useState<"project" | "order">("project");
  const [deliveryType, setDeliveryType] = useState<"curbside" | "inside">("curbside");
  const [installationNeeded, setInstallationNeeded] = useState("no");
  const [needsPricing, setNeedsPricing] = useState("yes");
  const [items, setItems] = useState<ItemRow[]>([
    { key: 1, name: "", details: "", qty: "1" },
  ]);
  const [nextKey, setNextKey] = useState(2);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, companyQuery]);

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;

  const goesToPipeline = orderType === "project" || needsPricing === "yes";

  function updateItem(key: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addItem() {
    setItems((rows) => [...rows, { key: nextKey, name: "", details: "", qty: "1" }]);
    setNextKey((k) => k + 1);
  }

  function removeItem(key: number) {
    setItems((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  return (
    <form action={submitIntake} className="max-w-4xl space-y-4">
      {/* hidden mirrors of the branching state so the server action sees plain fields */}
      <input type="hidden" name="clientMode" value={clientMode} />
      <input type="hidden" name="contactMode" value={contactMode} />
      <input type="hidden" name="orderType" value={orderType} />

      <Section step={1} title="Client">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Radio
            name="clientModeRadio"
            value="existing"
            checked={clientMode === "existing"}
            onChange={(v) => setClientMode(v as "existing" | "new")}
            label="Existing client"
            description="Pick a company we already work with"
          />
          <Radio
            name="clientModeRadio"
            value="new"
            checked={clientMode === "new"}
            onChange={(v) => setClientMode(v as "existing" | "new")}
            label="New client"
            description="Capture their details now"
          />
        </div>

        {clientMode === "existing" ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Search companies</span>
                <input
                  type="search"
                  value={companyQuery}
                  onChange={(e) => setCompanyQuery(e.target.value)}
                  placeholder="Start typing a name…"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Company</span>
                <select
                  name="companyId"
                  required
                  value={companyId}
                  onChange={(e) => {
                    setCompanyId(e.target.value);
                    setContactMode("existing");
                  }}
                  className={inputClass}
                >
                  <option value="">— select a company —</option>
                  {filteredCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedCompany ? (
              <p className="text-xs text-gray-500">
                {selectedCompany.locationName ? `${selectedCompany.locationName} · ` : ""}
                {selectedCompany.deliveryAddress ?? "No delivery address on file"}
              </p>
            ) : null}

            {selectedCompany ? (
              <div className="rounded border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2 flex flex-col gap-2 sm:flex-row">
                  <Radio
                    name="contactModeRadio"
                    value="existing"
                    checked={contactMode === "existing"}
                    onChange={(v) => setContactMode(v as "existing" | "new")}
                    label="Pick an existing contact"
                  />
                  <Radio
                    name="contactModeRadio"
                    value="new"
                    checked={contactMode === "new"}
                    onChange={(v) => setContactMode(v as "existing" | "new")}
                    label="Add a new contact"
                  />
                </div>

                {contactMode === "existing" ? (
                  selectedCompany.contacts.length > 0 ? (
                    <label className="block">
                      <span className={labelClass}>Contact at {selectedCompany.name}</span>
                      <select name="contactId" className={inputClass} defaultValue="">
                        <option value="">— none —</option>
                        {selectedCompany.contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                            {c.title ? ` (${c.title})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No contacts on file for {selectedCompany.name} — switch to &ldquo;Add a new
                      contact&rdquo;.
                    </p>
                  )
                ) : (
                  <NewContactFields />
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Business name</span>
                <input name="newCompanyName" required className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Business address</span>
                <input name="newCompanyAddress" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Phone</span>
                <input name="newCompanyPhone" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Phone extension</span>
                <input name="newCompanyPhoneExt" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Cell phone</span>
                <input name="newCompanyCellPhone" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Email</span>
                <input type="email" name="newCompanyEmail" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Delivery address</span>
                <input name="newCompanyDeliveryAddress" className={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Name of location</span>
                <input name="newCompanyLocationName" className={inputClass} />
              </label>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium text-gray-600">Primary contact</p>
              <NewContactFields />
            </div>
          </div>
        )}
      </Section>

      <Section
        step={2}
        title="Order type"
        hint="Projects need bids and measurements. Orders are straight equipment requests."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Radio
            name="orderTypeRadio"
            value="project"
            checked={orderType === "project"}
            onChange={(v) => setOrderType(v as "project" | "order")}
            label="Project"
            description="Bid / measurement work — full site details required"
          />
          <Radio
            name="orderTypeRadio"
            value="order"
            checked={orderType === "order"}
            onChange={(v) => setOrderType(v as "project" | "order")}
            label="Order"
            description="Simple equipment order"
          />
        </div>

        {orderType === "project" ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Facility type</span>
              <input name="facilityType" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Menu</span>
              <input name="menu" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Dimensions of room</span>
              <input name="roomDimensions" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Wall measurements</span>
              <input name="wallMeasurements" className={inputClass} />
            </label>

            <label className="block">
              <span className={labelClass}>Delivery type</span>
              <select
                name="deliveryType"
                value={deliveryType}
                onChange={(e) => setDeliveryType(e.target.value as "curbside" | "inside")}
                className={inputClass}
              >
                <option value="curbside">Curbside</option>
                <option value="inside">Inside</option>
              </select>
            </label>

            {deliveryType === "inside" ? (
              <label className="block">
                <span className={labelClass}>How large are the openings?</span>
                <input name="openingSize" className={inputClass} />
              </label>
            ) : (
              <div />
            )}

            {deliveryType === "inside" ? (
              <p className="sm:col-span-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Inside delivery: confirm the openings fit before ordering. Equipment that will not
                fit through the door comes back with a supplier restocking fee — tell the client up
                front.
              </p>
            ) : null}

            <div className="sm:col-span-2">
              <span className={labelClass}>Installation needed?</span>
              <div className="flex gap-2">
                <Radio
                  name="installationNeeded"
                  value="yes"
                  checked={installationNeeded === "yes"}
                  onChange={setInstallationNeeded}
                  label="Yes"
                />
                <Radio
                  name="installationNeeded"
                  value="no"
                  checked={installationNeeded === "no"}
                  onChange={setInstallationNeeded}
                  label="No"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <span className={labelClass}>Needs pricing?</span>
            <div className="flex gap-2">
              <Radio
                name="needsPricing"
                value="yes"
                checked={needsPricing === "yes"}
                onChange={setNeedsPricing}
                label="Yes"
                description="Goes to the pipeline for quoting"
              />
              <Radio
                name="needsPricing"
                value="no"
                checked={needsPricing === "no"}
                onChange={setNeedsPricing}
                label="No"
                description="Pricing already known — create the order directly"
              />
            </div>
          </div>
        )}
      </Section>

      <Section step={3} title="Timing & ownership">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={labelClass}>When do you need the order?</span>
            <input type="date" name="neededByDate" className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Salesperson</span>
            <select name="salespersonId" className={inputClass} defaultValue="">
              <option value="">— unassigned —</option>
              {salespeople.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Delivery address (if different)</span>
            <input name="deliveryAddress" className={inputClass} />
          </label>
        </div>
      </Section>

      <Section step={4} title="Items needed">
        <div className="space-y-2">
          {items.map((row, index) => (
            <div key={row.key} className="flex items-end gap-2">
              <label className="block flex-1">
                {index === 0 ? <span className={labelClass}>Item</span> : null}
                <input
                  name="itemName"
                  value={row.name}
                  onChange={(e) => updateItem(row.key, { name: e.target.value })}
                  placeholder="e.g. Double convection oven"
                  className={inputClass}
                />
              </label>
              <label className="block flex-1">
                {index === 0 ? <span className={labelClass}>Details</span> : null}
                <input
                  name="itemDetails"
                  value={row.details}
                  onChange={(e) => updateItem(row.key, { details: e.target.value })}
                  placeholder="Brand, model, notes…"
                  className={inputClass}
                />
              </label>
              <label className="block w-20">
                {index === 0 ? <span className={labelClass}>Qty</span> : null}
                <input
                  name="itemQty"
                  type="number"
                  min="1"
                  value={row.qty}
                  onChange={(e) => updateItem(row.key, { qty: e.target.value })}
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                onClick={() => removeItem(row.key)}
                disabled={items.length === 1}
                className="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          className="mt-3 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          + Add item
        </button>

        <label className="mt-4 block">
          <span className={labelClass}>Notes for the team</span>
          <textarea name="notes" rows={3} className={inputClass} />
        </label>
      </Section>

      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Submit intake
        </button>
        <p className="text-xs text-gray-500">
          {goesToPipeline
            ? "Creates an opportunity in the sales pipeline with items marked Needs Pricing."
            : "Creates an order directly with items marked Approved."}
        </p>
      </div>
    </form>
  );
}

function NewContactFields() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Contact first name</span>
        <input name="newContactFirstName" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Contact last name</span>
        <input name="newContactLastName" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Title</span>
        <select name="newContactTitle" className={inputClass} defaultValue="">
          <option value="">— none —</option>
          <option value="manager">Manager</option>
          <option value="purchasing">Purchasing</option>
          <option value="billing">Billing</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Contact email</span>
        <input type="email" name="newContactEmail" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Contact phone</span>
        <input name="newContactPhone" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Contact extension</span>
        <input name="newContactPhoneExt" className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Contact cell</span>
        <input name="newContactCellPhone" className={inputClass} />
      </label>
    </div>
  );
}
