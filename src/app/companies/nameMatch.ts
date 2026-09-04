// Duplicate-business detection, shared by every surface that can create a Company
// (intake, /companies/new, the inline "create business" on the contact form).
//
// Two records for the same kitchen is the single most expensive data mistake in this
// app: the deal, the contacts and the deposit terms end up split across both.

import { prisma } from "@/lib/prisma";

/** Trim, lowercase, collapse internal whitespace - "  Acme  Kitchens " === "acme kitchens". */
function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The existing company whose name matches after normalization, or null.
 *
 * Searches ALL company types on purpose: the duplicate is just as likely to be filed
 * as a lost_lead or a supplier as it is a customer, and creating a second row anyway
 * is what we are trying to prevent. Compares in JS because Postgres cannot collapse
 * internal whitespace in a WHERE clause; the company table is small enough for this.
 */
export async function findCompanyByNormalizedName(
  name: string,
  excludeId?: string | null
): Promise<{ id: string; name: string; type: string } | null> {
  const target = normalizeCompanyName(name);
  if (!target) return null;

  const candidates = await prisma.company.findMany({
    select: { id: true, name: true, type: true },
  });
  return (
    candidates.find(
      (c) => c.id !== excludeId && normalizeCompanyName(c.name) === target
    ) ?? null
  );
}
