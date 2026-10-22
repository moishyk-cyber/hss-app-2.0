import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPath } from '../src/lib/recordPath';
test('intake and its order share one canonical record URL, including direct orders', () => {
  assert.equal(recordPath('deal'), '/records/deal');
  assert.equal(recordPath('order', 'deal'), '/records/deal');
  assert.equal(recordPath('direct-order', null), '/records/direct-order');
  assert.equal(recordPath('record/with spaces'), '/records/record%2Fwith%20spaces');
});
