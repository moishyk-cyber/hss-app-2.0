// Payment terms: turn the terms agreed at close (PAYMENT_TERMS) into the
// order's deposit gate amount and its auto-created invoices. Runs inside the
// caller's transaction (markOpportunityWon, intake, the Edit-terms card) or on
// the global client - pass whichever you have as `tx`.

import type { Prisma, PrismaClient } from "@prisma/client";
import { PAYMENT_TERMS, isValidValue, labelFor } from "@/lib/constants";
import { roundCents } from "@/lib/money";
import { logActivity } from "@/lib/log";

/** A transaction client or the global prisma client. */
export type TermsDb = Prisma.TransactionClient | PrismaClient;

export type DepositForTermsInput = {
  terms: string;
  /** Order value (dollars). */
  value: number;
  /** Company.depositPercent - used by deposit_balance when no amount was agreed. */
  depositPercent: number;
  /** Deposit typed in the Close panel / intake, when any. */
  agreedDeposit?: number | null;
};

/** The deposit amount a set of terms implies (what depositRequired should be). */
export function depositForTerms({ terms, value, depositPercent, agreedDeposit }: DepositForTermsInput): number {
  const agreed = agreedDeposit != null && agreedDeposit > 0 ? roundCents(agreedDeposit) : null;
  switch (terms) {
    case "deposit_balance":
      return agreed ?? roundCents((value * depositPercent) / 100);
    case "full_upfront":
      return roundCents(value);
    case "on_delivery":
    case "net_30":
      return 0;
    case "custom":
      return agreed ?? 0;
    default:
      return 0;
  }
}

export type ApplyTermsInput = {
  terms: string;
  /** Order value (dollars). */
  value: number;
  /** Deposit amount for deposit_balance / custom (ignored by the other terms). */
  depositAmount?: number | null;
  /** Free-text terms notes (required in spirit for "custom"). */
  notes?: string | null;
};

type TermsInvoice = {
  type: string;
  amount: number;
  status: string;
  dueNote: string | null;
};

export type ApplyTermsResult = {
  depositRequired: number;
  invoices: TermsInvoice[];
};

/**
 * Write the terms onto the order and (re)create its terms-generated invoices:
 *   deposit_balance -> deposit (invoiced) + balance (pending, "Balance due before delivery")
 *   full_upfront    -> full (invoiced)
 *   on_delivery     -> full (pending, "Due on delivery")
 *   net_30          -> full (pending, "Net 30 after delivery")
 *   custom          -> nothing, unless a deposit amount was agreed (then a deposit invoice)
 * Earlier `source = "terms"` payments that are not yet paid are replaced; paid
 * payments are never touched (callers guard re-applying terms once money has
 * landed). Logs one activity entry. Throws on invalid terms - run it under
 * safeAction or a transaction.
 */
export async function applyTermsToOrder(
  tx: TermsDb,
  orderId: string,
  { terms, value, depositAmount, notes }: ApplyTermsInput
): Promise<ApplyTermsResult> {
  if (!isValidValue(PAYMENT_TERMS, terms)) throw new Error(`Invalid payment terms: ${terms}`);
  const total = roundCents(value);
  const deposit = depositAmount != null && depositAmount > 0 ? roundCents(depositAmount) : 0;

  // depositRequired is the payment-gate amount (see evaluatePaymentGate).
  let depositRequired: number;
  switch (terms) {
    case "deposit_balance":
      depositRequired = deposit;
      break;
    case "full_upfront":
      depositRequired = total;
      break;
    case "custom":
      depositRequired = deposit;
      break;
    default: // on_delivery | net_30
      depositRequired = 0;
  }

  const invoices: TermsInvoice[] = [];
  const balance = roundCents(total - deposit);
  switch (terms) {
    case "deposit_balance":
      if (deposit > 0) {
        invoices.push({ type: "deposit", amount: deposit, status: "invoiced", dueNote: "Due before POs are sent" });
      }
      if (balance > 0) {
        invoices.push({ type: "final", amount: balance, status: "pending", dueNote: "Balance due before delivery" });
      }
      break;
    case "full_upfront":
      if (total > 0) {
        invoices.push({ type: "full", amount: total, status: "invoiced", dueNote: "Due before POs are sent" });
      }
      break;
    case "on_delivery":
      if (total > 0) invoices.push({ type: "full", amount: total, status: "pending", dueNote: "Due on delivery" });
      break;
    case "net_30":
      if (total > 0) {
        invoices.push({ type: "full", amount: total, status: "pending", dueNote: "Net 30 after delivery" });
      }
      break;
    case "custom":
      if (deposit > 0) {
        invoices.push({ type: "deposit", amount: deposit, status: "invoiced", dueNote: "Due before POs are sent" });
      }
      break;
  }

  await tx.order.update({
    where: { id: orderId },
    data: { paymentTerms: terms, termsNotes: notes?.trim() || null, depositRequired },
  });

  // Replace the previous terms-generated invoices - but never a paid one.
  await tx.payment.deleteMany({
    where: { orderId, source: "terms", status: { not: "paid" } },
  });
  if (invoices.length > 0) {
    const termsLabel = labelFor(PAYMENT_TERMS, terms);
    await tx.payment.createMany({
      data: invoices.map((inv) => ({
        orderId,
        type: inv.type,
        amount: inv.amount,
        status: inv.status,
        source: "terms",
        dueNote: inv.dueNote,
        notes: `${inv.type === "deposit" ? "Deposit" : inv.type === "final" ? "Balance" : "Full payment"} per terms: ${termsLabel}`,
      })),
    });
  }

  await logActivity(
    "order",
    orderId,
    "terms_applied",
    `Terms set to ${labelFor(PAYMENT_TERMS, terms)} - deposit required $${depositRequired}${
      invoices.length > 0
        ? `; ${invoices.map((i) => `${i.type} $${i.amount} (${i.status})`).join(", ")}`
        : "; no invoices generated"
    }`
  );

  return { depositRequired, invoices };
}
