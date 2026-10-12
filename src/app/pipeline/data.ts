import type { Prisma } from "@prisma/client";
import { OPEN_SERVICE_ISSUE_STATUSES } from "@/lib/constants";

// Shared query shapes keep the board, record drawer and performance checks aligned.
export const ORDER_BALL_SELECT = {
  status: true,
  orderType: true,
  orderValue: true,
  depositRequired: true,
  quoteStatus: true,
  termsNotes: true,
  paymentTerms: true,
  payments: { select: { status: true, amount: true } },
  company: { select: { requiresDeposit: true, depositPercent: true } },
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
  title: true,
  stage: true,
  value: true,
  createdAt: true,
  nextFollowUp: true,
  company: { select: { id: true, name: true } },
  lineItems: { select: { rfqStatus: true } },
  orders: { select: ORDER_BALL_SELECT, orderBy: { createdAt: "asc" }, take: 1 },
} satisfies Prisma.OpportunitySelect;

export const PIPELINE_DETAIL_INCLUDE = {
  // locations feed the Close panel's picker (and the Location row below).
  company: {
    select: {
      id: true, name: true, requiresDeposit: true, depositPercent: true,
      locations: {
        select: { id: true, name: true, address: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      },
    },
  },
  location: { select: { id: true, name: true, address: true } },
  primaryContact: { select: { firstName: true, lastName: true } },
  salesperson: { select: { name: true } },
  lineItems: { orderBy: { createdAt: "asc" } },
  orders: { select: { id: true, title: true, ...ORDER_BALL_SELECT }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.OpportunityInclude;
