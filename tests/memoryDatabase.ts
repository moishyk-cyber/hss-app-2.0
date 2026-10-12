import type { Prisma, PrismaClient } from "@prisma/client";

type Row = { id: string; [key: string]: unknown };
type Query = { where?: Record<string, unknown>; data?: Record<string, unknown>; select?: Record<string, unknown>; include?: Record<string, unknown>; take?: number };
type State = Record<string, Row[]>;

/** Test adapter with isolated transaction snapshots and deliberate write failures. */
export function memoryDatabase(seed: State) {
  let state = structuredClone(seed);
  let sequence = 0;
  let failure: string | undefined;
  let conflict = false;
  const isolation: string[] = [];
  const matches = (row: Row, where: Query["where"] = {}): boolean => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const clause = value as { in?: unknown[]; not?: unknown };
      if (clause.in) return clause.in.includes(row[key]);
      if ("not" in clause) return row[key] !== clause.not;
    }
    return row[key] === value;
  });
  function client(rows: State) {
    function relation(model: string, row: Row, key: string): { model: string; rows: Row[]; many: boolean } | null {
      const links: Record<string, [string, string, string, boolean]> = {
        'order.lineItems': ['lineItem', 'orderId', 'id', true],
        'order.payments': ['payment', 'orderId', 'id', true],
        'order.purchaseOrders': ['purchaseOrder', 'orderId', 'id', true],
        'order.deliveries': ['delivery', 'orderId', 'id', true],
        'order.company': ['company', 'id', 'companyId', false],
        'opportunity.lineItems': ['lineItem', 'opportunityId', 'id', true],
        'purchaseOrder.deliveries': ['delivery', 'purchaseOrderId', 'id', true],
        'purchaseOrder.order': ['order', 'id', 'orderId', false],
        'purchaseOrder.supplier': ['company', 'id', 'supplierId', false],
        'delivery.lineItems': ['lineItem', 'deliveryId', 'id', true],
        'delivery.purchaseOrder': ['purchaseOrder', 'id', 'purchaseOrderId', false],
      };
      const link = links[`${model}.${key}`];
      if (!link) return null;
      const [other, field, own, many] = link;
      return { model: other, rows: (rows[other] ?? []).filter(r => row[own] != null && r[field] === row[own]), many };
    }
    function project(model: string, row: Row, query: Query = {}): Row {
      const result = query.select ? {} as Row : structuredClone(row);
      for (const [key, config] of Object.entries(query.select ?? query.include ?? {})) {
        if (!config) continue;
        if (key === '_count') {
          const items = relation(model, row, 'lineItems');
          result[key] = { lineItems: items?.rows.length ?? 0 };
          continue;
        }
        const rel = relation(model, row, key);
        if (!rel) { result[key] = structuredClone(row[key]); continue; }
        const q = typeof config === 'object' ? config as Query : {};
        const selected = rel.rows.filter(r => matches(r, q.where)).slice(0, q.take);
        result[key] = rel.many ? selected.map(r => project(rel.model, r, q)) : selected[0] ? project(rel.model, selected[0], q) : null;
      }
      return result;
    }
    const result: Record<string, unknown> = {};
    for (const model of ['order', 'opportunity', 'lineItem', 'purchaseOrder', 'delivery', 'payment', 'company', 'document']) {
      rows[model] ??= [];
      const fail = (operation: string) => {
        if (failure === `${model}.${operation}`) throw new Error(`Injected ${failure} failure`);
      };
      result[model] = {
        async findUnique(q: Query) { const row = rows[model].find(r => matches(r, q.where)); return row ? project(model, row, q) : null; },
        async create(q: Query) {
          fail('create');
          const defaults = model === 'delivery' ? { status: 'pending', deliveredAt: null, createdAt: new Date() }
            : model === 'lineItem' ? { orderId: null, opportunityId: null, deliveryId: null, purchaseOrderId: null, unitPrice: null, unitCost: null, deliveryStatus: 'pending' } : {};
          const row = { id: `new-${++sequence}`, ...defaults, ...q.data };
          rows[model].push(row);
          return project(model, row, q);
        },
        async update(q: Query) {
          fail('update');
          const row = rows[model].find(r => matches(r, q.where));
          if (!row) throw new Error(`${model} not found`);
          Object.assign(row, q.data);
          return project(model, row, q);
        },
        async updateMany(q: Query) {
          fail('updateMany');
          const selected = rows[model].filter(r => matches(r, q.where));
          for (const row of selected) Object.assign(row, q.data);
          return { count: selected.length };
        },
        async delete(q: Query) {
          fail('delete');
          const index = rows[model].findIndex(r => matches(r, q.where));
          if (index < 0) throw new Error(`${model} not found`);
          return rows[model].splice(index, 1)[0];
        },
      };
    }
    return result as unknown as Prisma.TransactionClient;
  }
  const db = new Proxy({} as PrismaClient, {
    get(_, key) {
      if (key === '$transaction') return async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options: { isolationLevel: string }) => {
        isolation.push(options.isolationLevel);
        const next = structuredClone(state);
        const result = await work(client(next));
        if (conflict) { conflict = false; throw Object.assign(new Error('Serialization conflict'), { code: 'P2034' }); }
        state = next;
        return result;
      };
      return client(state)[key as keyof Prisma.TransactionClient];
    },
  });
  return { db, state: () => state, isolation,
    fail: (operation?: string) => { failure = operation; },
    conflictOnce: () => { conflict = true; },
  };
}

export function fixture() {
  const item = { id: 'item', name: 'Fryer', opportunityId: 'deal', orderId: null, qty: 1, unitPrice: null,
    unitCost: null, rfqStatus: 'needs_pricing', deliveryStatus: 'pending', deliveryId: null,
    purchaseOrderId: null, dateArrivedClient: null };
  return {
    company: [{ id: 'company', requiresDeposit: true, depositPercent: 30 }],
    opportunity: [{ id: 'deal', stage: 'estimating', value: null, needsPricing: true }],
    order: [{ id: 'order', orderType: 'order', status: 'new', orderValue: 100, depositRequired: null, companyId: 'company' }],
    lineItem: [item], payment: [{ id: 'payment', orderId: 'order', status: 'paid', amount: 100 }],
    purchaseOrder: [{ id: 'po', orderId: 'order', supplierId: 'company', poNumber: 'PO-1', status: 'sent', ackDate: null, shipTo: 'hss' }],
    delivery: [], document: [],
  };
}
