import { prisma } from "@/lib/prisma";
import { BackLink } from "@/lib/BackLink";
import { createContact } from "../actions";
import { ContactForm } from "../ContactForm";
import { PageHeader } from "../_ui";

export const dynamic = "force-dynamic";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; error?: string }>;
}) {
  const { companyId, error } = await searchParams;
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-3">
        <BackLink
          href={companyId ? `/companies/${companyId}` : "/phonebook"}
          label={companyId ? "Back to business" : "Back to Phone Book"}
        />
      </div>
      <PageHeader title="New contact" subtitle="Add a person at a business" />
      <ContactForm
        action={createContact}
        contact={{ companyId: companyId ?? null }}
        companies={companies}
        submitLabel="Create contact"
        cancelHref={companyId ? `/companies/${companyId}` : "/phonebook"}
        returnTo={companyId ? `/companies/${companyId}` : undefined}
        error={error}
      />
    </div>
  );
}
