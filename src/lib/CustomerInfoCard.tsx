'use client';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { CustomerInfo, PickupInfo } from './customerInfo';

const stickyPreferenceKey = 'hss.customer-card.sticky';
const stickyPreferenceEvent = 'hss:customer-card-sticky';
let stickyFallback = true;
function readStickyPreference() {
  try { return window.localStorage.getItem(stickyPreferenceKey) !== 'false'; }
  catch { return stickyFallback; }
}
function subscribeToStickyPreference(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === stickyPreferenceKey || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(stickyPreferenceEvent, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(stickyPreferenceEvent, onChange);
  };
}
function setStickyPreference(sticky: boolean) {
  stickyFallback = sticky;
  try { window.localStorage.setItem(stickyPreferenceKey, String(sticky)); } catch { /* Keep the session preference when storage is unavailable. */ }
  window.dispatchEvent(new Event(stickyPreferenceEvent));
}
function serverStickyPreference() { return true; }

const CustomerContext = createContext<CustomerInfo | null>(null);
export function CustomerInfoProvider({ value, children }: { value: CustomerInfo; children: ReactNode }) {
  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}
function Phone({ value }: { value: string | null }) { return value ? <a href={`tel:${value.split(' ext. ')[0].replace(/[^+\d]/g, '')}`}>{value}</a> : <>Not provided</>; }
function Email({ value }: { value: string | null }) { return value ? <a href={`mailto:${encodeURIComponent(value)}`}>{value}</a> : <>Not provided</>; }
export function CustomerInfoCard({ info, pickups, deliveryPhone }: { info?: CustomerInfo; pickups?: PickupInfo[]; deliveryPhone?: string | null }) {
  const context = useContext(CustomerContext);
  const sticky = useSyncExternalStore(subscribeToStickyPreference, readStickyPreference, serverStickyPreference);
  const customer = info ?? context;
  if (!customer) return null;
  const addresses = pickups ?? customer.pickups;
  return <details className="customer-info-card" data-sticky={sticky}>
    <summary aria-label={`Customer information: ${customer.name}`}><span className="customer-info-heading"><span>Customer</span><strong>{customer.name}</strong><span>{customer.contact ?? 'Contact not provided'}{customer.phone ? ` · ${customer.phone}` : ''}</span></span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary>
    <div className="customer-info-preference"><span>Keep visible while scrolling</span><button type="button" role="switch" aria-label="Keep customer card visible while scrolling" aria-checked={sticky} onClick={() => setStickyPreference(!sticky)}><span aria-hidden="true" /><span>{sticky ? 'On' : 'Off'}</span></button></div>
    <div className="customer-info-body"><dl>
      <div><dt>Contact</dt><dd>{customer.contact ?? 'Not provided'}</dd></div>
      <div><dt>Phone</dt><dd><Phone value={customer.phone} /></dd></div>
      {customer.mobile && customer.mobile !== customer.phone && <div><dt>Mobile</dt><dd><Phone value={customer.mobile} /></dd></div>}
      <div><dt>Email</dt><dd><Email value={customer.email} /></dd></div>
      <div className="customer-info-address"><dt>{addresses.length > 1 ? 'Pickup addresses' : 'Pickup address'}</dt><dd>{addresses.length ? addresses.map((pickup, index) => <div key={index}><span className="customer-info-address-label">{pickup.label}</span>{pickup.address || 'Not provided'}</div>) : 'Not provided yet'}</dd></div>
      <div className="customer-info-address"><dt>Delivery address</dt><dd>{customer.location && <span className="customer-info-address-label">{customer.location}</span>}{customer.deliveryAddress ?? 'Not provided'}</dd></div>
      {(customer.siteContact || customer.sitePhone || deliveryPhone) && <div><dt>On-site contact</dt><dd>{customer.siteContact && <span className="block">{customer.siteContact}</span>}<Phone value={deliveryPhone || customer.sitePhone} /></dd></div>}
      {customer.deliveryType && <div><dt>Delivery type</dt><dd>{customer.deliveryType === 'inside' ? 'Inside' : customer.deliveryType === 'curbside' ? 'Curbside' : customer.deliveryType}</dd></div>}
      <div><dt>Installation</dt><dd>{customer.installationNeeded ? 'Needed' : 'Not requested'}</dd></div>
      {customer.floorNote && <div><dt>Floor / access</dt><dd>{customer.floorNote}</dd></div>}
      {customer.businessPhone && customer.businessPhone !== customer.phone && <div><dt>Business phone</dt><dd><Phone value={customer.businessPhone} /></dd></div>}
      {customer.businessEmail && customer.businessEmail !== customer.email && <div><dt>Business email</dt><dd><Email value={customer.businessEmail} /></dd></div>}
      {customer.accountAddress && customer.accountAddress !== customer.deliveryAddress && <div><dt>Account address</dt><dd>{customer.accountAddress}</dd></div>}
      {customer.billingAddress && <div><dt>Billing address</dt><dd>{customer.billingAddress}</dd></div>}
    </dl></div>
  </details>;
}
