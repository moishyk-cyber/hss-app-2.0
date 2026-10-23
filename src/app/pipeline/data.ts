import type { Prisma } from "@prisma/client";
import { OPEN_SERVICE_ISSUE_STATUSES } from "@/lib/constants";

// Shared query shapes keep the board, record drawer and performance checks aligned.
export const ORDER_BALL_SELECT = {
  status: true,
  orderType: true,
  orderValue: true,
  depositRequired: true, paymentPlan: true,
  termsNotes: true,
  salesOrderSentAt: true,
  paymentTerms: true,
  payments: { select: { status: true, amount: true } },
  company: { select: { requiresDeposit: true, depositPercent: true, paymentTermsConfigured: true } },
  lineItems: {
    select: { rfqStatus: true, deliveryStatus: true, purchaseOrderId: true },
  },
  purchaseOrders: { select: { status: true } },
  deliveries: { select: { status: true } },
  _count: {
    select: {
      serviceIssues: {
        where: { status: { in: [...OPEN_SERVICE_ISSUE_STATUSES] } },
      },
    },
  },
} satisfies Prisma.OrderSelect;

export const PIPELINE_CARD_SELECT = {
  id: true,
  orderType: true,
  companyId: true,
  neededByDate: true,
  title: true,
  stage: true,
  clientQuoteCreated: true,
  clientQuoteSent: true,
  value: true,
  createdAt: true,
  nextFollowUp: true,
  company: { select: { id: true, name: true } },
  salesperson: { select: { name: true, active: true } },
  lineItems: { select: { id: true, name: true, rfqStatus: true, unitPrice: true } },
  orders: { select: { id: true, ...ORDER_BALL_SELECT }, orderBy: { createdAt: "asc" }, take: 1 },
} satisfies Prisma.OpportunitySelect;

export const PIPELINE_DETAIL_INCLUDE = {
  // locations feed the Close panel's picker (and the Location row below).
  company: {
    select: {
      id: true, name: true, phone: true, phoneExt: true, cellPhone: true, email: true, billingAddress: true, deliveryAddress: true, requiresDeposit: true, depositPercent: true, paymentTermsConfigured: true,
      locations: {
        select: { id: true, name: true, address: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      },
    },
  },
  location: { select: { id: true, name: true, address: true, contactName: true, contactPhone: true } },
  primaryContact: { select: { firstName: true, lastName: true, phone: true, phoneExt: true, cellPhone: true, email: true } },
  salesperson: { select: { name: true, active: true } },
  lineItems: { orderBy: { createdAt: "asc" } },
  orders: { select: { id: true, title: true, ...ORDER_BALL_SELECT }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.OpportunityInclude;

/** Minimal evidence for the full filtered board index; display fields hydrate only for visible cards. */
export const PIPELINE_WORKFLOW_INDEX_SELECT = {
  id: true, title: true, stage: true, companyId: true, neededByDate: true,
  clientQuoteCreated: true, clientQuoteSent: true,
  lineItems: { select: { id: true, name: true, rfqStatus: true, unitPrice: true } },
  orders: { select: { id: true, ...ORDER_BALL_SELECT }, orderBy: { createdAt: "asc" }, take: 1 },
} satisfies Prisma.OpportunitySelect;
