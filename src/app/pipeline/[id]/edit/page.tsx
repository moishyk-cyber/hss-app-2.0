import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OPPORTUNITY_STAGES } from "@/lib/constants";
import { PendingButton } from "@/lib/ui";
import { updateOpportunity } from "../../actions";
import {
  Checkbox,
  DELIVERY_TYPES,
  DESIGN_STATUSES,
  Field,
  ORDER_TYPES,
  PageHeader,
  Select,
  TextArea,
  dateInputValue,
} from "../../_ui";

export const dynamic = "force-dynamic";

export default async function EditOpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [opportunity, companies, contacts, users] = await Promise.all([
    prisma.opportunity.findUnique({ where: { id } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!opportunity) notFound();

  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));
  const contactOptions = contacts.map((c) => ({
    value: c.id,
    label: [c.firstName, c.lastName].filter(Boolean).join(" "),
  }));
  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  return (
    <div>
      <PageHeader title={`Edit ${opportunity.title}`} subtitle="Opportunity details" />

      <form action={updateOpportunity} className="card max-w-4xl space-y-6 p-6">
        <input type="hidden" name="id" value={opportunity.id} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Title" name="title" defaultValue={opportunity.title} required />
          <Select
            label="Stage"
            name="stage"
            options={OPPORTUNITY_STAGES}
            defaultValue={opportunity.stage}
          />
          <Select
            label="Company"
            name="companyId"
            options={companyOptions}
            defaultValue={opportunity.companyId}
            includeBlank="— none —"
          />
          <Select
            label="Primary contact"
            name="primaryContactId"
            options={contactOptions}
            defaultValue={opportunity.primaryContactId}
            includeBlank="— none —"
          />
          <Select
            label="Salesperson"
            name="salespersonId"
            options={userOptions}
            defaultValue={opportunity.salespersonId}
            includeBlank="— unassigned —"
          />
          <Select
            label="Order type"
            name="orderType"
            options={ORDER_TYPES}
            defaultValue={opportunity.orderType}
          />
          <Field
            label="Value ($)"
            name="value"
            type="number"
            step="0.01"
            defaultValue={opportunity.value?.toString() ?? ""}
          />
          <Field
            label="Budget ($)"
            name="budget"
            type="number"
            step="0.01"
            defaultValue={opportunity.budget?.toString() ?? ""}
          />
          <Field
            label="Needed by"
            name="neededByDate"
            type="date"
            defaultValue={dateInputValue(opportunity.neededByDate)}
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

        <fieldset className="border-t border-border pt-5">
          <legend className="section-label mb-3">Project details</legend>
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
            <Field
              label="Wall measurements"
              name="wallMeasurements"
              defaultValue={opportunity.wallMeasurements}
            />
            <Select
              label="Delivery type"
              name="deliveryType"
              options={DELIVERY_TYPES}
              defaultValue={opportunity.deliveryType}
              includeBlank="— none —"
            />
            <Field
              label="How large are the openings"
              name="openingSize"
              defaultValue={opportunity.openingSize}
            />
            <Select
              label="Design status"
              name="designStatus"
              options={DESIGN_STATUSES}
              defaultValue={opportunity.designStatus}
            />
            <Checkbox
              label="Installation needed"
              name="installationNeeded"
              defaultChecked={opportunity.installationNeeded}
            />
            <Field
              label="Location name"
              name="locationName"
              defaultValue={opportunity.locationName}
            />
            <Field
              label="Delivery address"
              name="deliveryAddress"
              defaultValue={opportunity.deliveryAddress}
            />
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
          <Field label="Lost reason" name="lostReason" defaultValue={opportunity.lostReason} />
          <TextArea label="Notes" name="notes" defaultValue={opportunity.notes} />
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-5">
          <PendingButton className="btn btn-primary active:scale-[0.99]" pendingText="Saving…">
            Save changes
          </PendingButton>
          <Link href={`/pipeline/${opportunity.id}`} className="btn active:scale-[0.99]">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
