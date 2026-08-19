import { prisma } from "@/lib/prisma";
import { IntakeForm } from "./IntakeForm";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
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

  return (
    <div>
      <div className="mb-6 max-w-4xl">
        <h1 className="page-title">New Order Intake</h1>
        <p className="page-sub">
          Sales Process 2.0 — one form for every incoming request. Projects and anything that
          still needs pricing land in the pipeline; priced re-orders become orders straight away.
        </p>
      </div>
      <IntakeForm companies={companies} salespeople={salespeople} />
    </div>
  );
}
