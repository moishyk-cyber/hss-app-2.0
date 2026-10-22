import { LocationFormField } from "@/lib/LocationDropdown";
import { ValidatedForm } from "@/lib/ValidatedForm";
import { FormFooter } from "@/lib/PageLayout";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PendingButton } from "@/lib/ui";
import { getFieldRequirements } from "@/lib/fieldRequirements";
import { plainMoney } from "@/lib/money";
import { updateOpportunity } from "../../actions";
import {
  Checkbox,
  DELIVERY_TYPES,
  DESIGN_STATUSES,
  Field,
  ORDER_TYPES,
  Select,
  TextArea,
  dateInputValue,
} from "../../_ui";

export async function IntakeEditor({
  params,
  searchParams,
  projectOnly = false,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; workflow?: string }>;
  projectOnly?: boolean;
}) {
  const [{ id }, { error, workflow }] = await Promise.all([params, searchParams]);
  const [opportunityRow, companies, contacts, users, req] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id },
      // Fetch the business's sites with the deal, while dropdown lookups run.
      // This avoids a second round trip after the slowest lookup finishes.
      include: {
        lineItems: { select: { id: true, name: true, rfqStatus: true, unitPrice: true } },
        company: {
          select: {
            locations: {
              select: { id: true, name: true, address: true },
              orderBy: [{ isDefault: "desc" }, { name: "asc" }],
            },
          },
        },
      },
    }),
    projectOnly ? Promise.resolve([]) : prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    projectOnly ? Promise.resolve([]) : prisma.contact.findMany({
      where: { companyId: (await prisma.opportunity.findUnique({ where: { id }, select: { companyId: true } }))?.companyId ?? "__none__" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
    projectOnly ? Promise.resolve([]) : prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getFieldRequirements(),
  ]);
  // value/budget come back as Decimal; plain numbers for the form defaults.
  const opportunity = plainMoney(opportunityRow);
  if (!opportunity) notFound();

  // The deal's business supplies the location options (a site on another
  // business is refused by the action anyway).
  const locations = opportunity.company?.locations ?? [];

  const companyRequired = req["opportunity.companyId"];
  const neededByRequired = req["opportunity.neededByDate"];

  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));
  const contactOptions = contacts.map((c) => ({
    value: c.id,
    label: [c.firstName, c.lastName].filter(Boolean).join(" "),
  }));
  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  return (
      <ValidatedForm dealValidation={{ deal: opportunity, required: { company: companyRequired, neededBy: neededByRequired } }} action={updateOpportunity} className="card space-y-8" id="deal-intake">
        {error === "stage_locked" ? (
          <div className="banner-alert">
            Won and Lost can&rsquo;t be set from this form - they create the order, carry the line
            items across and stage the payment. Use the{" "}
            <Link href={`/pipeline/${opportunity.id}#close`} className="underline">
              Close panel on the deal page
            </Link>{" "}
            instead. Nothing else was saved.
          </div>
        ) : error === "invalid_value" ? (
          <div className="banner-alert">
            One of the dropdowns held a value this app doesn&rsquo;t recognise. Nothing was saved -
            please re-pick and try again.
          </div>
        ) : error === "missing_required" ? (
          <div className="banner-alert">
            Company and/or needed-by date is required (set in{" "}
            <Link href="/admin/settings" className="underline">
              Admin → Settings
            </Link>
            ). Please fill it in and save again.
          </div>
        ) : error === "stage_requirements" ? (
          <div className="banner-alert">This stage needs complete intake information and confirmed item pricing. <Link href={`/pipeline/${opportunity.id}`} className="underline">Review missing requirements on the deal</Link>. Nothing was saved.</div>
        ) : error === "title_required" ? (
          <div className="banner-alert">Enter a title before saving. Nothing was saved.</div>
        ) : error === "save_failed" ? (
          <div className="banner-alert">Something went wrong while saving. Please try again.</div>
        ) : error === "not_allowed" ? (
          <div className="banner-alert">Your role can&rsquo;t edit deals. Ask an admin if you need it.</div>
        ) : error === "invalid_date" ? (
          <div className="banner-alert">One of the dates isn&rsquo;t valid. Nothing was saved - please re-pick it and save again.</div>
        ) : error === "invalid_amount" ? (
          <div className="banner-alert">Value and budget must be zero or more. Nothing was saved - please fix the amount and save again.</div>
        ) : error === "inactive_assignee" ? (
          <div className="banner-alert">That salesperson is inactive and can&rsquo;t be assigned. Nothing was saved - pick an active teammate.</div>
        ) : error === "contact_mismatch" ? (
          <div className="banner-alert">That contact belongs to a different business. Nothing was saved - pick a contact from this business.</div>
        ) : null}
        <input type="hidden" name="id" value={opportunity.id} /><input type="hidden" name="returnStep" value="sales" /><input type="hidden" name="returnWorkflow" value={workflow === "sales" ? "sales" : ""} />

        {projectOnly ? <>
          {Object.entries({ title: opportunity.title, stage: opportunity.stage, companyId: opportunity.companyId, primaryContactId: opportunity.primaryContactId, salespersonId: opportunity.salespersonId, orderType: opportunity.orderType, neededByDate: dateInputValue(opportunity.neededByDate), estDueDate: dateInputValue(opportunity.estDueDate), nextFollowUp: dateInputValue(opportunity.nextFollowUp), needsPricing: opportunity.needsPricing ? "on" : "", lostReason: opportunity.lostReason, locationId: opportunity.locationId, locationName: opportunity.locationName, deliveryAddress: opportunity.deliveryAddress }).map(([name, value]) => <input key={name} type="hidden" name={name} value={value ?? ""} />)}
          <h2 className="section-label">Original intake details</h2>
          <Field label="Budget ($)" name="budget" type="money" defaultValue={opportunity.budget?.toString() ?? ""} />
        </> : <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Title" name="title" defaultValue={opportunity.title} required />
          <input type="hidden" name="stage" value={opportunity.stage} />
          <Select
            label="Company"
            name="companyId"
            options={companyOptions}
            defaultValue={opportunity.companyId}
            includeBlank="None"
            required={companyRequired}
          />
          <Select
            label="Primary contact"
            name="primaryContactId"
            options={contactOptions}
            defaultValue={opportunity.primaryContactId}
            includeBlank="None"
          />
          <Select
            label="Salesperson"
            name="salespersonId"
            options={userOptions}
            defaultValue={opportunity.salespersonId}
            includeBlank="Unassigned"
          />
          <Select
            label="Order type"
            name="orderType"
            options={ORDER_TYPES}
            defaultValue={opportunity.orderType}
          />
          <Field
            label="Budget ($)"
            name="budget"
            type="money"
            defaultValue={opportunity.budget?.toString() ?? ""}
          />
          <Field
            label="Needed by"
            name="neededByDate"
            type="date"
            defaultValue={dateInputValue(opportunity.neededByDate)}
            required={neededByRequired}
          />
          <Field
            label="Est./order due date"
            name="estDueDate"
            type="date"
            defaultValue={dateInputValue(opportunity.estDueDate)}
          />
          <Field
            label="Next follow-up"
            name="nextFollowUp"
            type="date"
            defaultValue={dateInputValue(opportunity.nextFollowUp)}
          />
          <Checkbox
            label="Needs pricing"
            name="needsPricing"
            defaultChecked={opportunity.needsPricing}
          />
        </div>

        </>}
        <fieldset className="border-t border-border pt-5"><legend className="section-label mb-3">Delivery &amp; installation</legend><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Delivery type"
              name="deliveryType"
              options={DELIVERY_TYPES}
              defaultValue={opportunity.deliveryType}
              includeBlank="None"
            />
            <Field
              label="How large are the openings"
              name="openingSize"
              defaultValue={opportunity.openingSize}
            />
            <Checkbox
              label="Installation needed"
              name="installationNeeded"
              defaultChecked={opportunity.installationNeeded}
            />
            <Field label="Floor note" name="floorNote" defaultValue={opportunity.floorNote} />
        </div></fieldset>
        <fieldset className="border-t border-border pt-5">
          <legend className="section-label mb-3">{opportunity.orderType === "project" ? "Project details" : "Site details"}</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Facility type"
              name="facilityType"
              defaultValue={opportunity.facilityType}
            />
            <Field label="Menu" name="menu" defaultValue={opportunity.menu} />
            <Field
              label="Room dimensions"
              name="roomDimensions"
              defaultValue={opportunity.roomDimensions}
            />
            {opportunity.orderType === "project" && <Field label="Wall measurements" name="wallMeasurements" defaultValue={opportunity.wallMeasurements} />}
            <Select
              label="Design status"
              name="designStatus"
              options={DESIGN_STATUSES}
              defaultValue={opportunity.designStatus}
            />
            {!projectOnly && <>
            <div className="sm:col-span-2"><LocationFormField locationId={opportunity.locationId} intake={{ name: opportunity.locationName, address: opportunity.deliveryAddress }} locations={locations} /></div>
            </>}
          </div>
          <TextArea
            label="Plumbing / electrical notes"
            name="plumbingElectricalNotes"
            defaultValue={opportunity.plumbingElectricalNotes}
            className="mt-4"
          />
          <TextArea
            label="Client vision notes"
            name="clientVisionNotes"
            defaultValue={opportunity.clientVisionNotes}
            className="mt-4"
          />
        </fieldset>

        <div className="grid grid-cols-1 gap-4">
          {!projectOnly && <Field label="Lost reason" name="lostReason" defaultValue={opportunity.lostReason} />}
          <TextArea label={projectOnly ? "Original intake notes" : "Notes"} name="notes" defaultValue={opportunity.notes} />
        </div>

        <FormFooter>
          <PendingButton className="btn btn-primary active:scale-[0.99]" pendingText="Saving…">Save changes</PendingButton>
        </FormFooter>
      </ValidatedForm>
  );
}
