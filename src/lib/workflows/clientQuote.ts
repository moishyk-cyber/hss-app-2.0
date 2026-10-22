import type { PrismaClient } from "@prisma/client";
import { intakeIssues, pricingIssues, type DealRequirements } from "../dealWorkflow";
import { serialTransaction } from "./transaction";
import { plainMoney } from "../money";

export class ClientQuoteValidationError extends Error {}

export type ClientQuoteInput = { created: boolean; sent: boolean; url: string };
export function clientQuoteInputProblem(input: ClientQuoteInput): string | null {
  if (typeof input.created !== "boolean" || typeof input.sent !== "boolean" || typeof input.url !== "string" || input.url.length > 4000) return "Enter valid client quote details.";
  if (input.sent && !input.created) return "Confirm the client quote was created before marking it sent.";
  if (input.url.trim()) {
    try { const url = new URL(input.url.trim()); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "Enter a valid http or https quote link."; }
    catch { return "Enter a valid http or https quote link."; }
  }
  return null;
}
export async function saveClientQuote(db: PrismaClient, id: string, input: ClientQuoteInput, required: DealRequirements) {
  const problem = clientQuoteInputProblem(input);
  if (problem) throw new ClientQuoteValidationError(problem);
  return serialTransaction(db, async tx => {
    const row = await tx.opportunity.findUnique({ where: { id }, include: { lineItems: true } });
    if (!row || ["won", "lost"].includes(row.stage)) throw new ClientQuoteValidationError("This deal is closed or missing.");
    if (input.sent) {
      const issues = [...intakeIssues(plainMoney(row), required), ...pricingIssues(plainMoney(row))];
      if (issues.length) throw new ClientQuoteValidationError(issues[0].message);
    }
    return tx.opportunity.update({ where: { id }, data: {
      clientQuoteCreated: input.created, clientQuoteSent: input.sent, clientQuoteUrl: input.url.trim() || null,
    }, select: { clientQuoteCreated: true, clientQuoteSent: true, clientQuoteUrl: true } });
  });
}
