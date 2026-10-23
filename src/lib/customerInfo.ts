type Party = { name?: string | null; phone?: string | null; phoneExt?: string | null; cellPhone?: string | null; email?: string | null; billingAddress?: string | null; deliveryAddress?: string | null };
type Contact = { firstName: string; lastName?: string | null; phone?: string | null; phoneExt?: string | null; cellPhone?: string | null; email?: string | null };
export type PickupInfo = { label: string; address: string | null };
export type CustomerInfo = {
  name: string; contact: string | null; phone: string | null; mobile: string | null; email: string | null;
  businessPhone: string | null; businessEmail: string | null; billingAddress: string | null; accountAddress: string | null;
  deliveryAddress: string | null; location: string | null; siteContact: string | null; sitePhone: string | null;
  deliveryType: string | null; installationNeeded: boolean; floorNote: string | null; pickups: PickupInfo[];
};
type Source = {
  company?: Party | null; contact?: Contact | null; primaryContact?: Contact | null;
  deliveryAddress?: string | null; intakeDeliveryAddress?: string | null; intakeLocationName?: string | null; locationName?: string | null;
  location?: { name: string; address: string | null; contactName?: string | null; contactPhone?: string | null } | null;
  deliveryType?: string | null; installationNeeded?: boolean; floorNote?: string | null;
  purchaseOrders?: { poNumber: string; supplier?: Party | null }[];
  deliveries?: { pickupAddress: string | null; purchaseOrderId?: string | null }[];
};
const clean = (value?: string | null) => value?.trim() || null;
function phone(party?: Party | Contact | null) { const number = clean(party?.phone); return number ? `${number}${clean(party?.phoneExt) ? ` ext. ${party!.phoneExt!.trim()}` : ''}` : null; }
export function customerInfo(source: Source): CustomerInfo {
  const contact = source.contact ?? source.primaryContact;
  const pickups: PickupInfo[] = [];
  for (const delivery of source.deliveries ?? []) if (clean(delivery.pickupAddress)) pickups.push({ label: 'Saved pickup address', address: clean(delivery.pickupAddress) });
  for (const po of source.purchaseOrders ?? []) if (clean(po.supplier?.deliveryAddress)) pickups.push({ label: `${po.poNumber} · ${po.supplier?.name ?? 'Supplier'}`, address: clean(po.supplier?.deliveryAddress) });
  return {
    name: clean(source.company?.name) ?? 'No customer linked', contact: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : null,
    phone: phone(contact) ?? clean(contact?.cellPhone) ?? phone(source.company) ?? clean(source.company?.cellPhone), mobile: clean(contact?.cellPhone) ?? clean(source.company?.cellPhone), email: clean(contact?.email) ?? clean(source.company?.email),
    businessPhone: phone(source.company), businessEmail: clean(source.company?.email), billingAddress: clean(source.company?.billingAddress), accountAddress: clean(source.company?.deliveryAddress),
    deliveryAddress: clean(source.deliveryAddress) ?? clean(source.location?.address) ?? clean(source.intakeDeliveryAddress),
    location: clean(source.location?.name) ?? clean(source.locationName) ?? ((!clean(source.deliveryAddress) || clean(source.deliveryAddress) === clean(source.intakeDeliveryAddress)) ? clean(source.intakeLocationName) : null), siteContact: clean(source.location?.contactName), sitePhone: clean(source.location?.contactPhone),
    deliveryType: clean(source.deliveryType), installationNeeded: source.installationNeeded ?? false, floorNote: clean(source.floorNote),
    pickups: pickups.filter((pickup, index) => pickups.findIndex(other => other.address === pickup.address) === index),
  };
}
