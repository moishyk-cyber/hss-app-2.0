import test from 'node:test';
import assert from 'node:assert/strict';
import { createLineItemPricing } from '../src/lib/workflows/pricing';
import { createFulfillment } from '../src/lib/workflows/fulfillment';
import { createAttachments } from '../src/lib/workflows/attachments';
import { memoryDatabase, fixture } from './memoryDatabase';

function effects() {
  const audits: unknown[][] = [];
  const refreshes: string[] = [];
  return { audits, refreshes, audit: async (...args: unknown[]) => { audits.push(args); }, refresh: (path: string) => { refreshes.push(path); } };
}

test('price and status changes reconcile the same open deal and refresh every view', async () => {
  const m = memoryDatabase(fixture()), e = effects();
  const pricing = createLineItemPricing(m.db, e);
  await pricing.change('item', { kind: 'price', unitPrice: 12.345, unitCost: 8 });
  assert.equal(m.state().lineItem[0].unitPrice, 12.35);
  assert.equal(m.state().lineItem[0].rfqStatus, 'quote_received');
  assert.equal(m.state().opportunity[0].needsPricing, false);
  assert.equal(m.state().opportunity[0].value, 12.35);
  await pricing.change('item', { kind: 'status', rfqStatus: 'rfq_sent' });
  assert.equal(m.state().opportunity[0].needsPricing, true);
  assert.ok(e.refreshes.includes('/pipeline/deal') && e.refreshes.includes('/dashboard'));
});

test('removing the final unpriced item clears pricing and initializes the complete live total', async () => {
  const seed = fixture();
  const m = memoryDatabase({ ...seed, lineItem: [...seed.lineItem,
    { ...seed.lineItem[0], id: 'priced', rfqStatus: 'approved', unitPrice: 50, qty: 2 }] });
  await createLineItemPricing(m.db, effects()).change('item', { kind: 'status', rfqStatus: 'removed' });
  assert.equal(m.state().opportunity[0].needsPricing, false);
  assert.equal(m.state().opportunity[0].value, 100);
});

test('adding an unpriced item reopens pricing without overwriting an agreed deal value', async () => {
  const seed = fixture();
  const m = memoryDatabase({ ...seed, opportunity: [{ ...seed.opportunity[0], value: 500, needsPricing: false }] });
  const pricing = createLineItemPricing(m.db, effects());
  await pricing.add({ opportunityId: 'deal', name: 'Oven', qty: 2, rfqStatus: 'needs_pricing' });
  assert.equal(m.state().opportunity[0].needsPricing, true);
  await pricing.change('item', { kind: 'quantity', qty: 3 });
  assert.equal(m.state().opportunity[0].value, 500);
});

test('post-win quantity updates the order and gate; manual statuses and closed deals survive', async () => {
  const seed = fixture();
  const m = memoryDatabase({ ...seed, purchaseOrder: [], opportunity: [{ ...seed.opportunity[0], stage: 'won', value: 100 }],
    lineItem: [{ ...seed.lineItem[0], orderId: 'order', unitPrice: 100, rfqStatus: 'approved' }] });
  const pricing = createLineItemPricing(m.db, effects());
  await pricing.change('item', { kind: 'quantity', qty: 2 });
  assert.equal(m.state().order[0].orderValue, 200);
  assert.equal(m.state().order[0].status, 'awaiting_payment');
  assert.equal(m.state().opportunity[0].value, 100);
  await m.db.order.update({ where: { id: 'order' }, data: { status: 'stuck' } });
  await pricing.change('item', { kind: 'quantity', qty: 1 });
  assert.equal(m.state().order[0].status, 'stuck');
  await pricing.change('item', { kind: 'clear' });
  assert.equal(m.state().order[0].orderValue, 100); // incomplete pricing cannot loosen the gate
});

test('a reconciliation failure rolls back the item edit and produces no post-commit effects', async () => {
  const seed = fixture();
  const m = memoryDatabase({ ...seed, lineItem: [{ ...seed.lineItem[0], orderId: 'order', unitPrice: 100 }] }), e = effects();
  m.fail('order.update');
  await assert.rejects(createLineItemPricing(m.db, e).change('item', { kind: 'quantity', qty: 2 }));
  assert.equal(m.state().lineItem[0].qty, 1);
  assert.equal(m.state().order[0].orderValue, 100);
  assert.deepEqual(e.audits, []);
  assert.deepEqual(e.refreshes, []);
});

test('serialization retries publish pricing effects only once', async () => {
  const m = memoryDatabase(fixture()), e = effects();
  m.conflictOnce();
  await createLineItemPricing(m.db, e).change('item', { kind: 'price', unitPrice: 10, unitCost: null });
  assert.equal(e.audits.length, 1);
  assert.deepEqual(m.isolation, ['Serializable', 'Serializable']);
});

function fulfillmentFixture() {
  const seed = fixture();
  return { ...seed, lineItem: [{ ...seed.lineItem[0], orderId: 'order', purchaseOrderId: 'po', unitPrice: 100, rfqStatus: 'approved' }] };
}

test('acknowledgment is repeatable and correcting delivery does not regress a shipped PO', async () => {
  const m = memoryDatabase(fulfillmentFixture()), e = effects();
  const fulfillment = createFulfillment(m.db, e);
  assert.deepEqual(await fulfillment.acknowledgePo('po', { mode: 'manufacturer_to_customer' }), { ok: true });
  assert.equal(m.state().purchaseOrder[0].status, 'acknowledged');
  const leg = m.state().delivery[0].id;
  assert.equal(m.state().lineItem[0].deliveryId, leg);
  assert.deepEqual(await fulfillment.advancePoStatus('po'), { ok: true });
  assert.equal(m.state().delivery[0].status, 'in_transit');
  assert.equal(m.state().lineItem[0].deliveryStatus, 'in_transit_to_client');
  await fulfillment.acknowledgePo('po', { mode: 'manufacturer_to_customer', trackingCarrier: 'UPS' });
  assert.equal(m.state().delivery.length, 1);
  assert.equal(m.state().purchaseOrder[0].status, 'shipped');
});

test('acknowledgment rolls back a new delivery and item assignments if the PO write fails', async () => {
  const m = memoryDatabase(fulfillmentFixture()), e = effects();
  m.fail('purchaseOrder.update');
  assert.equal((await createFulfillment(m.db, e).acknowledgePo('po', { mode: 'hss_to_customer' })).ok, false);
  assert.equal(m.state().delivery.length, 0);
  assert.equal(m.state().lineItem[0].deliveryId, null);
  assert.equal(m.state().purchaseOrder[0].status, 'sent');
  assert.deepEqual(e.audits, []);
  assert.deepEqual(e.refreshes, []);
});

test('delivery completion stamps active items and order together; failures roll back', async () => {
  const seed = fulfillmentFixture();
  const m = memoryDatabase({ ...seed, delivery: [{ id: 'leg', orderId: 'order', purchaseOrderId: 'po', mode: 'hss_to_customer', status: 'pending', deliveredAt: null }],
    lineItem: [{ ...seed.lineItem[0], deliveryId: 'leg' }, { ...seed.lineItem[0], id: 'removed', deliveryId: 'leg', rfqStatus: 'removed' }] }), e = effects();
  const fulfillment = createFulfillment(m.db, e);
  m.fail('lineItem.updateMany');
  assert.equal((await fulfillment.setDeliveryStatus('leg', 'delivered_full')).ok, false);
  assert.equal(m.state().delivery[0].status, 'pending');
  m.fail();
  assert.equal((await fulfillment.setDeliveryStatus('leg', 'delivered_full')).ok, true);
  assert.equal(m.state().lineItem[0].deliveryStatus, 'arrived_complete');
  assert.ok(m.state().lineItem[0].dateArrivedClient instanceof Date);
  assert.equal(m.state().lineItem[1].deliveryStatus, 'pending');
  assert.equal(m.state().order[0].status, 'delivered');
});

test('split rolls back its new leg if moving items fails', async () => {
  const seed = fulfillmentFixture();
  const m = memoryDatabase({ ...seed, delivery: [{ id: 'leg', orderId: 'order', purchaseOrderId: 'po', mode: 'hss_to_customer', status: 'pending' }],
    lineItem: [{ ...seed.lineItem[0], deliveryId: 'leg' }, { ...seed.lineItem[0], id: 'second', deliveryId: 'leg' }] });
  m.fail('lineItem.updateMany');
  assert.equal((await createFulfillment(m.db, effects()).splitDelivery('leg', ['item'])).ok, false);
  assert.equal(m.state().delivery.length, 1);
  assert.equal(m.state().lineItem[0].deliveryId, 'leg');
});

function storageFixture() {
  const objects = new Map<string, { mimeType: string; sizeBytes: number }>();
  let configured = true;
  const storage = {
    configured: () => configured, maxBytes: 25 * 1024 * 1024,
    path: (type: string, id: string, name: string) => `${type}/${id}/random-${name}`,
    sign: async (path: string) => ({ storagePath: path, uploadUrl: 'https://upload.example', token: 'token' }),
    upload: async (path: string, bytes: ArrayBuffer, mime: string) => { objects.set(path, { mimeType: mime, sizeBytes: bytes.byteLength }); },
    info: async (path: string) => { const info = objects.get(path); if (!info) throw new Error('Missing upload'); return info; },
    remove: async (path: string) => { objects.delete(path); },
  };
  return { storage, objects, disable: () => { configured = false; } };
}
const target = { linkedType: 'order' as const, linkedId: 'order', uploadedBy: 'Sales' };
const metadata = { fileName: 'drawing.pdf', mimeType: 'application/pdf', sizeBytes: 4 };

test('both attachment paths share metadata and classify Google links; links work without storage', async () => {
  const m = memoryDatabase(fixture()), s = storageFixture();
  const attachments = createAttachments(m.db, s.storage);
  const signed = await attachments.start(target, metadata);
  s.objects.set(signed.storagePath, { mimeType: metadata.mimeType, sizeBytes: 4 });
  await attachments.finalize(target, { ...metadata, ...signed, kind: 'drawing' });
  await attachments.upload(target, { name: 'intake.pdf', type: metadata.mimeType, size: 4, arrayBuffer: async () => new ArrayBuffer(4) }, { kind: 'drawing' });
  assert.equal(m.state().document[0].mimeType, m.state().document[1].mimeType);
  assert.equal(m.state().document[0].sizeBytes, m.state().document[1].sizeBytes);
  s.disable();
  await attachments.link(target, { url: 'https://drive.google.com/file/d/123', kind: 'other' });
  assert.equal(m.state().document[2].source, 'google_drive');
  await assert.rejects(attachments.start(target, metadata), /configured/);
});

test('initiation and finalization reject invalid metadata; finalization verifies object ownership and bytes', async () => {
  const m = memoryDatabase(fixture()), s = storageFixture();
  const attachments = createAttachments(m.db, s.storage);
  for (const invalid of [{ sizeBytes: NaN }, { sizeBytes: -1 }, { sizeBytes: Infinity }, { sizeBytes: 30 * 1024 * 1024 }, { mimeType: 'text/html' }, { fileName: '' }]) {
    await assert.rejects(attachments.start(target, { ...metadata, ...invalid }));
    await assert.rejects(attachments.finalize(target, { ...metadata, ...invalid, kind: 'drawing', storagePath: 'order/order/file' }));
  }
  await assert.rejects(attachments.finalize(target, { ...metadata, kind: 'drawing', storagePath: 'order/another/file' }), /belong/);
  await assert.rejects(attachments.finalize(target, { ...metadata, kind: 'drawing', storagePath: 'order/order/../file' }), /belong/);
  const path = 'order/order/file';
  s.objects.set(path, { mimeType: 'application/pdf', sizeBytes: 5 });
  await assert.rejects(attachments.finalize(target, { ...metadata, kind: 'drawing', storagePath: path }), /match/);
  assert.equal(m.state().document.length, 0);
});

test('failed direct attachment recording cleans up storage; signed upload remains available for retry', async () => {
  const m = memoryDatabase(fixture()), s = storageFixture();
  const attachments = createAttachments(m.db, s.storage);
  m.fail('document.create');
  await assert.rejects(attachments.upload(target, { name: metadata.fileName, type: metadata.mimeType, size: 4,
    arrayBuffer: async () => new ArrayBuffer(4) }, { kind: 'drawing' }));
  assert.equal(s.objects.size, 0);
  s.objects.set('order/order/file', { mimeType: 'application/pdf', sizeBytes: 4 });
  await assert.rejects(attachments.finalize(target, { ...metadata, kind: 'drawing', storagePath: 'order/order/file' }));
  assert.equal(s.objects.size, 1);
  assert.equal(m.state().order.length, 1);
  m.fail();
  await attachments.finalize(target, { ...metadata, kind: 'drawing', storagePath: 'order/order/file' });
  assert.equal(m.state().document.length, 1);
});

test('sending a PO still enforces payment; acknowledgment cannot be bypassed', async () => {
  const seed = fulfillmentFixture();
  const m = memoryDatabase({ ...seed, payment: [], purchaseOrder: [{ ...seed.purchaseOrder[0], status: 'draft' }] });
  const fulfillment = createFulfillment(m.db, effects());
  assert.equal((await fulfillment.advancePoStatus('po')).ok, false);
  assert.equal(m.state().purchaseOrder[0].status, 'draft');
  await m.db.payment.create({ data: { orderId: 'order', status: 'paid', amount: 100, type: 'full' } });
  assert.equal((await fulfillment.advancePoStatus('po')).ok, true);
  assert.equal(m.state().purchaseOrder[0].status, 'sent');
  assert.equal((await fulfillment.advancePoStatus('po')).ok, false);
  assert.equal(m.state().delivery.length, 0);
});

test('new delivery rejects a PO from a different order without writing anything', async () => {
  const m = memoryDatabase(fulfillmentFixture());
  const result = await createFulfillment(m.db, effects()).createDelivery('other-order', 'hss_to_customer', ['item'], 'po');
  assert.deepEqual(result, { ok: false, message: 'That purchase order belongs to a different order.' });
  assert.equal(m.state().delivery.length, 0);
});

test('partial delivery does not mark every item arrived', async () => {
  const seed = fulfillmentFixture();
  const m = memoryDatabase({ ...seed, delivery: [{ id: 'leg', orderId: 'order', purchaseOrderId: 'po', mode: 'hss_to_customer', status: 'pending', deliveredAt: null }],
    lineItem: [{ ...seed.lineItem[0], deliveryId: 'leg' }] });
  await createFulfillment(m.db, effects()).setDeliveryStatus('leg', 'delivered_partial');
  assert.equal(m.state().lineItem[0].deliveryStatus, 'pending');
  assert.equal(m.state().lineItem[0].dateArrivedClient, null);
});

test('adding an order item reconciles status while retaining the incomplete total', async () => {
  const seed = fixture();
  const m = memoryDatabase({ ...seed, purchaseOrder: [], payment: [] });
  await createLineItemPricing(m.db, effects()).add({ orderId: 'order', name: 'Late oven', qty: 1, rfqStatus: 'needs_pricing' });
  assert.equal(m.state().order[0].orderValue, 100);
  assert.equal(m.state().order[0].status, 'awaiting_payment');
});
