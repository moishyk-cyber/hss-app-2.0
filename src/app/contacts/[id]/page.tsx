import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { labelFor } from "@/lib/constants";
import {
  Avatar,
  CONTACT_STATUSES,
  CONTACT_STATUS_BADGES,
  Card,
  DetailHeader,
  DetailRow,
  EmailLink,
  PhoneLink,
  fmtDate,
} from "../_ui";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { company: true },
  });
  if (!contact) notFound();

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

  return (
    <div>
      <DetailHeader
        backHref="/phonebook"
        backLabel="Back to Phone Book"
        title={name}
        subtitle={contact.title ?? undefined}
        avatar={<Avatar name={name} kind="person" />}
        badges={
          <span className={`badge ${CONTACT_STATUS_BADGES[contact.status] ?? "badge-gray"}`}>
            {labelFor(CONTACT_STATUSES, contact.status)}
          </span>
        }
        secondary={
          <Link href={`/contacts/${contact.id}/edit`} className="btn active:scale-[0.99]">
            Edit
          </Link>
        }
        action={
          contact.company ? (
            <Link
              href={`/intake?companyId=${contact.company.id}`}
              className="btn btn-primary active:scale-[0.99]"
            >
              New intake for this business
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card title="Details">
            <DetailRow
              label="Business"
              value={
                contact.company ? (
                  <Link
                    href={`/companies/${contact.company.id}`}
                    className="text-primary transition-colors hover:underline"
                  >
                    {contact.company.name}
                  </Link>
                ) : null
              }
              emptyLabel="no business on file"
            />
            <DetailRow label="Title" value={contact.title} />
            <DetailRow
              label="Phone"
              value={<PhoneLink phone={contact.phone} ext={contact.phoneExt} />}
              emptyLabel="no number on file"
            />
            <DetailRow
              label="Cell phone"
              value={<PhoneLink phone={contact.cellPhone} />}
            />
            <DetailRow
              label="Email"
              value={<EmailLink email={contact.email} />}
              emptyLabel="no email on file"
            />
            <DetailRow label="Notes" value={contact.notes} />
            <DetailRow label="Created" value={fmtDate(contact.createdAt)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
