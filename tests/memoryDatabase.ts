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
    if (key === "OR" && Array.isArray(value)) return value.some(clause => matches(row, clause));
    if (key === "AND" && Array.isArray(value)) return value.every(clause => matches(row, clause));
    if (value instanceof Date) return row[key] instanceof Date && (row[key] as Date).getTime() === value.getTime();
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const clause = value as { in?: unknown[]; notIn?: unknown[]; not?: unknown; equals?: unknown; mode?: string; startsWith?: string; lt?: Date; lte?: Date; gte?: Date };
      if (clause.startsWith !== undefined) return typeof row[key] === "string" && (row[key] as string).startsWith(clause.startsWith);
      if (clause.lte) return row[key] != null && new Date(row[key] as string | Date) <= clause.lte;
      if (clause.lt) return row[key] != null && new Date(row[key] as string | Date) < clause.lt;
      if (clause.gte) return row[key] != null && new Date(row[key] as string | Date) >= clause.gte;
      if ("equals" in clause) return clause.mode === "insensitive" && typeof row[key] === "string" && typeof clause.equals === "string" ? (row[key] as string).toLowerCase() === clause.equals.toLowerCase() : row[key] === clause.equals;
      if (clause.in) return clause.in.includes(row[key]);
      if (clause.notIn) return !clause.notIn.includes(row[key]);
      if ("not" in clause) return row[key] !== clause.not;
    }
    return row[key] === value;
  });
  function client(rows: State) {
    function relation(model: string, row: Row, key: string): { model: string; rows: Row[]; many: boolean } | null {
      const links: Record<string, [string, string, string, boolean]> = {
        'notification.user': ['user', 'id', 'userId', false],
        'notificationEmail.notification': ['notification', 'id', 'notificationId', false],
        'order.opportunity': ['opportunity', 'id', 'opportunityId', false],
        'order.serviceIssues': ['serviceIssue', 'orderId', 'id', true],
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
          const counts = config as { select: Record<string, Query> };
          result[key] = Object.fromEntries(Object.entries(counts.select).map(([name, spec]) => [name, relation(model, row, name)?.rows.filter(r => matches(r, spec.where)).length ?? 0]));
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
    for (const model of ['order', 'opportunity', 'lineItem', 'purchaseOrder', 'delivery', 'payment', 'company', 'document', 'user', 'task', 'serviceIssue', 'taskComment', 'activityLog', 'appSetting', 'intakeSubmission', 'notification', 'notificationEmail', 'notificationState', 'fieldRequirement']) {
      rows[model] ??= [];
      const fail = (operation: string) => {
        if (failure === `${model}.${operation}`) throw new Error(`Injected ${failure} failure`);
      };
      result[model] = {
        async findFirst(q: Query) { const row = rows[model].find(r => matches(r, q.where)); return row ? project(model, row, q) : null; },
        async findUnique(q: Query) { const row = rows[model].find(r => matches(r, q.where)); return row ? project(model, row, q) : null; },
        async findMany(q: Query = {}) { return rows[model].filter(r => matches(r, q.where)).slice(0,q.take).map(r => project(model, r, q)); },
        async count(q: Query = {}) { return rows[model].filter(r => matches(r, q.where)).length; },
        async create(q: Query) {
          fail('create');
          const defaults = model === 'delivery' ? { status: 'pending', deliveredAt: null, createdAt: new Date() }
            : model === 'lineItem' ? { orderId: null, opportunityId: null, deliveryId: null, purchaseOrderId: null, unitPrice: null, unitCost: null, deliveryStatus: 'pending' } : {};
          const row = { id: `new-${++sequence}`, ...defaults, ...q.data };
          rows[model].push(row);
          return project(model, row, q);
        },
        async createMany(q: { data: Record<string, unknown>[]; skipDuplicates?: boolean }) {
          fail('createMany');
          let count = 0;
          for (const data of q.data) {
            const duplicate = model === 'notification' ? rows[model].some(r => r.userId === data.userId && r.eventKey === data.eventKey) : model === 'notificationState' ? rows[model].some(r => r.key === data.key) : model === 'notificationEmail' ? rows[model].some(r => r.notificationId === data.notificationId) : false;
            if (q.skipDuplicates && duplicate) continue;
            const defaults = model === "notificationEmail" ? { status: "pending", attempts: 0, leaseUntil: null, firstAttemptAt: null, payload: null, resendId: null, createdAt: new Date(), availableAt: new Date() } : { readAt: null, createdAt: new Date() };
            rows[model].push({ id: `new-${++sequence}`, ...defaults, ...data }); count++;
          }
          return { count };
        },
        async upsert(q: { where: Query['where']; create: Record<string, unknown>; update: Record<string, unknown> }) {
          fail('upsert');
          const row = rows[model].find(r => matches(r, q.where));
          if (row) { Object.assign(row, q.update); return structuredClone(row); }
          const created = { id: `new-${++sequence}`, ...q.create }; rows[model].push(created); return structuredClone(created);
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
        async deleteMany(q: Query) {
          fail('deleteMany');
          const selected = rows[model].filter(r => matches(r, q.where));
          rows[model] = rows[model].filter(r => !matches(r, q.where));
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
      if (key === '$transaction') return async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { isolationLevel: string }) => {
        isolation.push(options?.isolationLevel ?? "default");
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
    company: [{ id: 'company', requiresDeposit: true, paymentTermsConfigured: true, depositPercent: 30 }],
    opportunity: [{ id: 'deal', stage: 'estimating', value: null, needsPricing: true }],
    order: [{ id: 'order', orderType: 'order', status: 'new', orderValue: 100, depositRequired: null, companyId: 'company' }],
    lineItem: [item], payment: [{ id: 'payment', orderId: 'order', status: 'paid', amount: 100 }],
    purchaseOrder: [{ id: 'po', orderId: 'order', supplierId: 'company', poNumber: 'PO-1', status: 'sent', ackDate: null, shipTo: 'hss' }],
    delivery: [], document: [],
  };
}
