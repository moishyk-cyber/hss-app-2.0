import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateContact } from "../../actions";
import { ContactForm } from "../../ContactForm";
import { BackLink, PageHeader } from "../../_ui";

export const dynamic = "force-dynamic";

export default async function EditContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const [contact, companies] = await Promise.all([
    prisma.contact.findUnique({ where: { id } }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!contact) notFound();

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

  return (
    <div>
      <BackLink href="/phonebook" label="Phone Book" />
      <PageHeader title={`Edit ${fullName}`} subtitle="Contact details" />
      <ContactForm
        action={updateContact}
        contact={contact}
        companies={companies}
        submitLabel="Save changes"
        cancelHref="/phonebook"
        error={error}
      />
    </div>
  );
}
