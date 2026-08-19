import { prisma } from "@/lib/prisma";
import { createContact } from "../actions";
import { ContactForm } from "../ContactForm";
import { PageHeader } from "../_ui";

export const dynamic = "force-dynamic";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { companyId } = await searchParams;
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="New contact" subtitle="Add a person at a client or supplier" />
      <ContactForm
        action={createContact}
        contact={{ companyId: companyId ?? null }}
        companies={companies}
        submitLabel="Create contact"
        cancelHref={companyId ? `/companies/${companyId}` : "/contacts"}
        returnTo={companyId ? `/companies/${companyId}` : undefined}
      />
    </div>
  );
}
