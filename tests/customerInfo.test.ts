import test from 'node:test';
import assert from 'node:assert/strict';
import { customerInfo } from '../src/lib/customerInfo';

test('customer card uses the actual contact and saved deal destination ahead of account defaults', () => {
  const card = customerInfo({ company: { name: 'Client', phone: '100', email: 'office@example.test', deliveryAddress: 'Account address' }, contact: { firstName: 'Sam', lastName: 'Client', phone: '200', phoneExt: '12', email: 'sam@example.test' }, deliveryAddress: 'Intake destination', location: { name: 'Site', address: 'Location address', contactName: 'Site manager', contactPhone: '300' } });
  assert.equal(card.contact, 'Sam Client'); assert.equal(card.phone, '200 ext. 12'); assert.equal(card.email, 'sam@example.test');
  assert.equal(card.businessPhone, '100'); assert.equal(card.deliveryAddress, 'Intake destination'); assert.equal(card.sitePhone, '300');
});
test('customer card handles missing contacts and distinguishes supplier pickup from customer delivery', () => {
  const card = customerInfo({ company: { name: 'Client', phone: '100', email: 'office@example.test' }, deliveryAddress: 'Customer delivery', deliveries: [{ pickupAddress: 'Saved warehouse' }, { pickupAddress: 'Saved warehouse' }], purchaseOrders: [{ poNumber: 'PO-1', supplier: { name: 'Vendor', deliveryAddress: 'Supplier warehouse' } }] });
  assert.equal(card.phone, '100'); assert.equal(card.email, 'office@example.test'); assert.equal(card.contact, null);
  assert.deepEqual(card.pickups.map(row => row.address), ['Saved warehouse', 'Supplier warehouse']);
  assert.equal(card.deliveryAddress, 'Customer delivery');
  assert.equal(customerInfo({}).deliveryAddress, null); assert.deepEqual(customerInfo({}).pickups, []);
});
test('intake contacts and mobile-only contacts remain available before an order exists', () => {
  const card = customerInfo({ primaryContact: { firstName: 'Client', cellPhone: '200' }, company: { phone: '100' }, intakeDeliveryAddress: 'Original intake address' });
  assert.equal(card.phone, '200'); assert.equal(card.deliveryAddress, 'Original intake address');
});

test('an account address is never presented as a confirmed delivery destination', () => {
  const card = customerInfo({ company: { deliveryAddress: 'Account office' } });
  assert.equal(card.deliveryAddress, null); assert.equal(card.accountAddress, 'Account office');
});
