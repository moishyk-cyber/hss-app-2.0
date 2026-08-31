// Shared contact-detail treatment (phonebook style, app-wide): dialable phone,
// mailto email, and address line with the small stroke icons. One copy for
// phonebook, companies, contacts, and anything else that lists people.

function PhoneIcon() {
  return (
    <span className="field-icon" aria-hidden>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
      </svg>
    </span>
  );
}

function MailIcon() {
  return (
    <span className="field-icon" aria-hidden>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    </span>
  );
}

function PinIcon() {
  return (
    <span className="field-icon" aria-hidden>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    </span>
  );
}

/** Dialable phone link. Renders nothing when there's no number (no bare dashes). */
export function PhoneLink({
  phone,
  ext,
  label,
}: {
  phone: string | null;
  ext?: string | null;
  label?: string;
}) {
  if (!phone) return null;
  const dial = phone.replace(/[^\d+]/g, "");
  return (
    <a
      href={`tel:${dial}${ext ? `,${ext}` : ""}`}
      className="inline-flex items-center gap-2 text-[13px] text-gray-dark transition-colors hover:text-ink"
      title={label ? `${label}: ${phone}` : phone}
    >
      <PhoneIcon />
      <span className="tabular-nums">{phone}</span>
      {ext ? <span className="text-gray">ext {ext}</span> : null}
    </a>
  );
}

export function EmailLink({ email }: { email: string | null }) {
  if (!email) return null;
  return (
    <a
      href={`mailto:${email}`}
      className="inline-flex min-w-0 items-center gap-2 text-[13px] text-gray-dark transition-colors hover:text-ink"
      title={email}
    >
      <MailIcon />
      <span className="truncate">{email}</span>
    </a>
  );
}

export function AddressLine({ address }: { address: string | null }) {
  if (!address) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[13px] text-gray">
      <PinIcon />
      <span className="truncate">{address}</span>
    </span>
  );
}
