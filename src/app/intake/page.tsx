import { getActiveUsers } from "@/lib/users";
import { DetailHeader } from "@/lib/PageLayout";
import { prisma } from "@/lib/prisma";
import { IntakeForm } from "./IntakeForm";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; error?: string; company?: string }>;
}) {
  const { companyId, error, company } = await searchParams;

  const [companies, contacts, salespeople] = await Promise.all([
    prisma.company.findMany({
      where: { type: { in: ["customer", "lead"] } },
      // deliveryAddress is shown read-only under the picked business - the intake
      // reuses it unless the caller says the delivery goes somewhere else.
      select: {
        id: true,
        name: true,
        deliveryAddress: true,
        locationName: true,
        // Sites on file - the location picker in step 1 (a new location typed
        // here is created with the intake).
        locations: {
          select: { id: true, name: true, address: true, isDefault: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    }),
    // Loaded whole and filtered client-side by the picked company, so the contact
    // search behaves exactly like the business search (no round-trip per keystroke).
    prisma.contact.findMany({
      select: { id: true, firstName: true, lastName: true, companyId: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    getActiveUsers(),
  ]);

  const preselected = companyId ? companies.find((c) => c.id === companyId) : undefined;

  return (
    <div>
      <DetailHeader backHref="/pipeline" backLabel="Back to Pipeline" title="New intake" subtitle={preselected ? `New request for ${preselected.name}.` : "Take the call and capture it here — projects and requests needing a price go to the pipeline; priced re-orders become orders."}/>
      <div className="mb-6"/>

      <IntakeForm
        companies={companies}
        contacts={contacts}
        salespeople={salespeople}
        initialCompanyId={preselected?.id}
        error={error}
        duplicateCompany={company}
      />
    </div>
  );
}
