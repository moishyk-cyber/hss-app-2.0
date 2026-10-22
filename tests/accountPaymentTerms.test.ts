import test from 'node:test';
import assert from 'node:assert/strict';
import {hasAccountPaymentTerms, requireAccountPaymentTerms, AccountTermsRequiredError} from '../src/lib/accountPaymentTerms';
import {evaluatePaymentGate} from '../src/lib/flowRules';

const account={paymentTermsConfigured:true,requiresDeposit:true,depositPercent:30};
test('only explicitly saved, valid account terms allow a new order',async()=>{
 for(const value of [null,{...account,paymentTermsConfigured:false},{...account,depositPercent:0},{...account,depositPercent:101}]){
  assert.equal(hasAccountPaymentTerms(value),false);
  await assert.rejects(requireAccountPaymentTerms({company:{findUnique:async()=>value}},'customer'),AccountTermsRequiredError);
 }
 for(const value of [account,{...account,depositPercent:100},{...account,requiresDeposit:false,depositPercent:0}]){
  assert.equal(hasAccountPaymentTerms(value),true);
  await requireAccountPaymentTerms({company:{findUnique:async()=>value}},'customer');
 }
 await assert.rejects(requireAccountPaymentTerms({company:{findUnique:async()=>{throw Error('should not query')}}},null),AccountTermsRequiredError);
});
test('missing account terms never invent a payment amount, even with the former 30 percent default',()=>{
 for(const company of [null,{requiresDeposit:true,depositPercent:30},{...account,paymentTermsConfigured:false}]){
  const gate=evaluatePaymentGate({orderType:'order',orderValue:1000,company,payments:[]});
  assert.equal(gate.open,false);assert.equal(gate.requiredTotal,null);assert.equal(gate.shortfall,0);
  assert.match(gate.reason,/Set payment terms on the customer account/);
 }
});
