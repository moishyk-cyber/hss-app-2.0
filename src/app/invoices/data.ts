import type { Prisma } from "@prisma/client";
import { PAYMENT_STATUSES } from "@/lib/constants";
import { PAYMENT_TYPES } from "@/app/orders/utils";
import { parseListQuery, type ListField } from "@/lib/listQuery";
import { compileFilterTree } from "@/lib/nestedFilters";

export const INVOICE_FIELDS: ListField[] = [
  { key: "order", label: "Order", type: "text" },
  { key: "company", label: "Customer", type: "text" },
  { key: "type", label: "Type", type: "enum", options: PAYMENT_TYPES },
  { key: "amount", label: "Amount", type: "number" },
  { key: "status", label: "Status", type: "enum", options: PAYMENT_STATUSES },
  { key: "dueDate", label: "Due date", type: "date" },
  { key: "attention", label: "Billing queue", type: "enum", sortable: false, options: [
    { value: "overdue", label: "Overdue" },
    { value: "unpaid", label: "Unpaid" },
    { value: "no_due_date", label: "Missing due date" },
  ] },
];

export function invoiceQuery(sp: Record<string, string | string[] | undefined>, today: string) {
  const { filters, sortKey, sortDir } = parseListQuery(INVOICE_FIELDS, sp);
  const attention = (value: string): Prisma.PaymentWhereInput => value === "overdue"
    ? { status: { not: "paid" }, dueDate: { lt: new Date(`${today}T00:00:00.000Z`) } }
    : value === "unpaid" ? { status: { not: "paid" } } : { status: { not: "paid" }, dueDate: null };
  const where: Prisma.PaymentWhereInput = {};
  if (filters.order) where.order = { title: { contains: filters.order, mode: "insensitive" } };
  if (filters.company) where.AND = [{ order: { company: { name: { contains: filters.company, mode: "insensitive" } } } }];
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  if (filters.amount) where.amount = Number(filters.amount);
  if (filters.dueDate) where.dueDate = new Date(`${filters.dueDate}T00:00:00.000Z`);
  const nested = compileFilterTree<Prisma.PaymentWhereInput>(INVOICE_FIELDS, sp.filter_tree, {
    order: "order.title", company: "order.company.name", type: "type", amount: "amount",
    status: "status", dueDate: "dueDate", attention: condition => attention(condition.value) as Record<string, unknown>,
  });
  const and = [...(Array.isArray(where.AND) ? where.AND : []), ...(filters.attention ? [attention(filters.attention)] : []), ...(nested ? [nested] : [])];
  if (and.length) where.AND = and;
  const sorts: Record<string, Prisma.PaymentOrderByWithRelationInput> = {
    order: { order: { title: sortDir } }, company: { order: { company: { name: sortDir } } },
    type: { type: sortDir }, amount: { amount: sortDir }, status: { status: sortDir },
    dueDate: { dueDate: { sort: sortDir, nulls: "last" } },
  };
  const orderBy: Prisma.PaymentOrderByWithRelationInput[] = sortKey ? [sorts[sortKey], { id: "asc" }]
    : [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }];
  return { where, orderBy, prioritizeUnpaid: !sortKey, filtered: Object.keys(filters).length > 0 || !!nested };
}
