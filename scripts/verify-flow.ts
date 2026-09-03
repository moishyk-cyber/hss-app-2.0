// End-to-end verification of the flow engine against the real DB.
// Creates clearly-marked test rows (ZZ-KLYNE-FLOW-TEST), asserts gate/derivation
// behavior at every stage, and deletes everything it created.
// Run: npx tsx --tsconfig tsconfig.json scripts/verify-flow.ts

import { prisma } from "@/lib/prisma";
import { evaluatePaymentGate, deriveOrderStatus, canCompleteOrder, recomputeOrderStatus } from "@/lib/flow";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
}

async function main() {
  const TAG = "ZZ-KLYNE-FLOW-TEST";

  // --- setup: deposit-requiring customer, project order $10,000, one item ---
  const company = await prisma.company.create({
    data: { name: `${TAG} Depositor`, type: "customer", requiresDeposit: true, depositPercent: 30 },
  });
  const supplier = await prisma.company.create({
    data: { name: `${TAG} Vendor`, type: "supplier" },
  });
  const order = await prisma.order.create({
    data: { title: `${TAG} order`, companyId: company.id, orderType: "project", status: "new", orderValue: 10000 },
  });
  const item = await prisma.lineItem.create({
    data: { orderId: order.id, name: `${TAG} item`, qty: 1, rfqStatus: "approved", deliveryStatus: "pending" },
  });

  const load = () =>
    prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        payments: true,
        purchaseOrders: true,
        lineItems: true,
        deliveries: true,
        company: { select: { requiresDeposit: true, depositPercent: true } },
      },
    });

  // 1. Fresh order: gate closed, needs $3,000 deposit; derived = awaiting_payment
  let o = await load();
  let gate = evaluatePaymentGate(o);
  check("fresh gate closed", gate.open, false);
  check("required = 30% deposit", gate.requiredTotal, 3000);
  check("derive: awaiting_payment", deriveOrderStatus(o), "awaiting_payment");

  // 2. Token payment ($0.01 paid) must NOT open the gate (the old bypass)
  const penny = await prisma.payment.create({
    data: { orderId: order.id, type: "deposit", amount: 0.01, status: "paid" },
  });
  o = await load();
  gate = evaluatePaymentGate(o);
  check("penny payment does not open gate", gate.open, false);
  check("shortfall reported", Math.round(gate.shortfall), 3000);

  // 3. Real deposit opens the gate; derived = payment_received
  await prisma.payment.create({
    data: { orderId: order.id, type: "deposit", amount: 3000, status: "paid" },
  });
  o = await load();
  gate = evaluatePaymentGate(o);
  check("deposit opens gate", gate.open, true);
  check("derive: payment_received", deriveOrderStatus(o), "payment_received");
  check("cannot complete yet (item pending)", canCompleteOrder(o), false);

  // 4. PO ladder drives status: draft -> pos_in_progress, shipped -> in_transit,
  //    delivery scheduled -> delivery_scheduled, item arrived -> delivered
  const po = await prisma.purchaseOrder.create({
    data: { orderId: order.id, supplierId: supplier.id, poNumber: `${TAG}-1`, status: "draft" },
  });
  o = await load();
  check("derive: pos_in_progress", deriveOrderStatus(o), "pos_in_progress");

  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "shipped" } });
  o = await load();
  check("derive: in_transit", deriveOrderStatus(o), "in_transit");

  // Logistics live on the Delivery leg now (Sep 3 2026), not on the PO.
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, purchaseOrderId: po.id, status: "scheduled" },
  });
  o = await load();
  check("derive: delivery_scheduled", deriveOrderStatus(o), "delivery_scheduled");

  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "received" } });
  await prisma.delivery.update({ where: { id: delivery.id }, data: { status: "delivered_full" } });
  await prisma.lineItem.update({ where: { id: item.id }, data: { deliveryStatus: "arrived_complete" } });
  o = await load();
  check("derive: delivered", deriveOrderStatus(o), "delivered");
  check("can complete now", canCompleteOrder(o), true);

  // 5. recomputeOrderStatus persists, but respects manual stuck/complete
  const derived = await recomputeOrderStatus(order.id);
  check("recompute persists delivered", derived, "delivered");
  await prisma.order.update({ where: { id: order.id }, data: { status: "stuck" } });
  check("recompute leaves stuck alone", await recomputeOrderStatus(order.id), "stuck");

  // 6. No-deposit account: project with zero payments is exempt (gate open)
  const trusted = await prisma.company.create({
    data: { name: `${TAG} Trusted`, type: "customer", requiresDeposit: false, depositPercent: 30 },
  });
  const trustedOrder = await prisma.order.create({
    data: { title: `${TAG} trusted order`, companyId: trusted.id, orderType: "project", status: "new", orderValue: 50000 },
  });
  const to = await prisma.order.findUniqueOrThrow({
    where: { id: trustedOrder.id },
    include: {
      payments: true,
      purchaseOrders: true,
      lineItems: true,
      deliveries: true,
      company: { select: { requiresDeposit: true, depositPercent: true } },
    },
  });
  const tGate = evaluatePaymentGate(to);
  check("no-deposit project: gate open with zero payments", tGate.open, true);
  check("no-deposit project: exempt flag", tGate.exempt, true);
  check("no-deposit project fresh derive: new", deriveOrderStatus(to), "new");

  // 7. Order-type order (non-project) at the same trusted company still needs full payment
  const trustedSimple = await prisma.order.create({
    data: { title: `${TAG} trusted simple`, companyId: trusted.id, orderType: "order", status: "new", orderValue: 500 },
  });
  const ts = await prisma.order.findUniqueOrThrow({
    where: { id: trustedSimple.id },
    include: {
      payments: true,
      purchaseOrders: true,
      lineItems: true,
      deliveries: true,
      company: { select: { requiresDeposit: true, depositPercent: true } },
    },
  });
  check("simple order at trusted co: gate still closed", evaluatePaymentGate(ts).open, false);

  // 8. Close-dialog override: order.depositRequired beats the company-percent formula
  const custom = await prisma.order.create({
    data: {
      title: `${TAG} custom deposit`,
      companyId: company.id,
      orderType: "project",
      status: "new",
      orderValue: 10000,
      depositRequired: 500,
    },
  });
  const co = await prisma.order.findUniqueOrThrow({
    where: { id: custom.id },
    include: {
      payments: true,
      purchaseOrders: true,
      lineItems: true,
      deliveries: true,
      company: { select: { requiresDeposit: true, depositPercent: true } },
    },
  });
  check("custom deposit: required is the agreed amount", evaluatePaymentGate(co).requiredTotal, 500);
  await prisma.payment.create({
    data: { orderId: custom.id, type: "deposit", amount: 500, status: "paid" },
  });
  const co2 = await prisma.order.findUniqueOrThrow({
    where: { id: custom.id },
    include: {
      payments: true,
      purchaseOrders: true,
      lineItems: true,
      deliveries: true,
      company: { select: { requiresDeposit: true, depositPercent: true } },
    },
  });
  check("custom deposit: paying the agreed amount opens the gate", evaluatePaymentGate(co2).open, true);

  // --- cleanup ---
  await prisma.lineItem.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.delivery.deleteMany({ where: { order: { title: { startsWith: TAG } } } });
  await prisma.purchaseOrder.deleteMany({ where: { poNumber: { startsWith: TAG } } });
  await prisma.payment.deleteMany({
    where: { orderId: { in: [order.id, trustedOrder.id, trustedSimple.id, custom.id] } },
  });
  await prisma.order.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.company.deleteMany({ where: { name: { startsWith: TAG } } });
  console.log("cleanup done");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
