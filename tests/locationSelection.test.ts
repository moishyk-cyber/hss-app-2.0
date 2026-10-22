import test from 'node:test';
import assert from 'node:assert/strict';
import { initialLocationSelection } from '../src/lib/LocationDropdown';
import { deliveryDestinationOptions } from '../src/lib/deliveryDestination';
const locations = [{ id: 'site', name: 'Second store', address: '456 Other Road' }];
const intake = { name: 'Intake site', address: '123 Intake Road' };
test('the intake address is the default even when a saved site address has since changed', () => {
  assert.equal(initialLocationSelection({ locationId: 'site', address: '123 Intake Road' }, intake, locations).choice, 'intake');
});
test('saved locations and custom delivery overrides remain distinct', () => {
  assert.equal(initialLocationSelection({ locationId: 'site', address: '456 Other Road' }, intake, locations).choice, 'site');
  assert.equal(initialLocationSelection({ locationId: 'site', address: '789 Temporary Dock' }, intake, locations).choice, 'elsewhere');
});
test('the delivery dropdown retains the original intake address after a destination override', () => {
  const options = deliveryDestinationOptions({ companyId: 'customer', deliveryAddress: '456 Other Road', locationId: 'site', location: { name: 'Second store', address: '456 Other Road' }, intakeDeliveryAddress: intake.address, intakeLocationName: intake.name, company: { locations } });
  assert.equal(options.address, '456 Other Road'); assert.equal(options.intakeAddress, '123 Intake Road'); assert.equal(options.intakeLocation, 'Intake site'); assert.deepEqual(options.locations, locations);
});
test('an intake with no address does not adopt a later one-off address as its original', () => {
  const options = deliveryDestinationOptions({ companyId: 'customer', deliveryAddress: 'Temporary dock', intakeDeliveryAddress: null, intakeLocationName: null });
  assert.equal(options.intakeAddress, null);
});
