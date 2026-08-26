import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { IntakeForm } from "./IntakeForm";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; error?: string }>;
}) {
  const { companyId, error } = await searchParams;

  const [companies, salespeople] = await Promise.all([
    prisma.company.findMany({
      where: { type: { in: ["customer", "lead"] } },
      select: {
        id: true,
        name: true,
        deliveryAddress: true,
        locationName: true,
        contacts: {
          select: { id: true, firstName: true, lastName: true, title: true },
          orderBy: { firstName: "asc" },
        },
      },
      orderBy: { name: "asc" },
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
              : "Take the call and capture it here — projects and anything needing a price go to the pipeline, priced re-orders become orders."}
          </p>
        </div>
        <Link href="/pipeline" className="btn active:scale-[0.99]">
          View pipeline
        </Link>
      </div>

      <IntakeForm
        companies={companies}
        salespeople={salespeople}
        initialCompanyId={preselected?.id}
        error={error}
      />
    </div>
  );
}
