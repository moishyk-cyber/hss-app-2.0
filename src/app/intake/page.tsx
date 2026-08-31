import Link from "next/link";
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
      select: { id: true, name: true, deliveryAddress: true, locationName: true },
      orderBy: { name: "asc" },
    }),
    // Loaded whole and filtered client-side by the picked company, so the contact
    // search behaves exactly like the business search (no round-trip per keystroke).
    prisma.contact.findMany({
      select: { id: true, firstName: true, lastName: true, companyId: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const preselected = companyId ? companies.find((c) => c.id === companyId) : undefined;

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">New Intake</h1>
          <p className="page-sub">
            {preselected
              ? `New request for ${preselected.name}.`
              : "Take the call and capture it here - projects and anything needing a price go to the pipeline, priced re-orders become orders."}
          </p>
        </div>
        <Link href="/pipeline" className="btn active:scale-[0.99]">
          View pipeline
        </Link>
      </div>

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
