'use client';
import { useState } from 'react';
export type LocationOption = { id: string; name: string; address: string };
export type LocationSelection = { choice: string; locationId: string; locationName: string; address: string };
export type IntakeLocation = { name: string | null; address: string | null };
export function initialLocationSelection(current: { locationId?: string | null; name?: string | null; address?: string | null }, intake: IntakeLocation, locations: LocationOption[]): LocationSelection {
  const address = current.address ?? intake.address ?? '';
  const sameIntake = address.trim() === (intake.address ?? '').trim();
  const saved = locations.find(location => location.id === current.locationId && location.address.trim() === address.trim());
  return { choice: sameIntake ? 'intake' : saved?.id ?? 'elsewhere', locationId: current.locationId ?? '', locationName: current.name ?? '', address };
}
export function LocationDropdown({ value, onChange, intake, locations, label = 'Location', disabled = false, postFields = true, required = false }: {
  value: LocationSelection; onChange: (value: LocationSelection) => void; intake: IntakeLocation; locations: LocationOption[]; label?: string; disabled?: boolean; postFields?: boolean; required?: boolean;
}) {
  return <div className="space-y-2 min-w-0">
    <label className="block"><span className="field-label">{label}</span><select aria-label={label} value={value.choice} disabled={disabled} className="input-klyne w-full" onChange={event => {
      const choice = event.target.value;
      if (choice === 'intake') onChange({ choice, address: intake.address ?? '', locationName: intake.name ?? '', locationId: locations.find(location => location.address.trim() === intake.address?.trim())?.id ?? '' });
      else if (choice === 'elsewhere') onChange({ choice, address: '', locationId: '', locationName: '' });
      else { const selected = locations.find(location => location.id === choice); if (selected) onChange({ choice, locationId: selected.id, locationName: selected.name, address: selected.address }); }
    }}><option value="intake" disabled={!intake.address}>Intake address{intake.address ? ` — ${intake.name ? `${intake.name}: ` : ''}${intake.address}` : ' — not provided'}</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name} — {location.address}</option>)}<option value="elsewhere">Deliver elsewhere…</option></select></label>
    {value.choice === 'elsewhere' ? <label className="block"><span className="field-label">New delivery address</span><input aria-label="New delivery address" name={postFields ? "deliveryAddress" : undefined} value={value.address} disabled={disabled} required={required} className="input-klyne w-full" placeholder="Where should this delivery go?" onChange={event => onChange({ ...value, address: event.target.value })} /></label> : value.address && <p className="text-xs text-gray-dark whitespace-pre-wrap">{value.address}</p>}
    {postFields && <><input type="hidden" name="destinationChoice" value={value.choice} /><input type="hidden" name="locationId" value={value.locationId} /><input type="hidden" name="locationName" value={value.locationName} />{value.choice !== "elsewhere" && <input type="hidden" name="deliveryAddress" value={value.address} />}</>}
  </div>;
}
export function LocationFormField({ intake, locations, locationId }: { intake: IntakeLocation; locations: LocationOption[]; locationId: string | null }) {
  const [value, setValue] = useState(() => initialLocationSelection({ locationId, name: intake.name, address: intake.address }, intake, locations));
  return <LocationDropdown value={value} onChange={setValue} intake={intake} locations={locations} />;
}
/** Pickup forms use the same saved-address-first pattern. */
export function PickupLocationDropdown({ current, supplierAddress }: { current: string | null; supplierAddress?: string | null }) {
  const defaults = [...new Set([supplierAddress, current].map(address => address?.trim()).filter((address): address is string => !!address))];
  const [choice, setChoice] = useState(current || supplierAddress || 'elsewhere');
  const [address, setAddress] = useState(current ?? '');
  return <div className="col-span-2 space-y-2"><label className="block"><span className="field-label">Pickup location</span><select aria-label="Pickup location" className="input-klyne w-full" value={choice} onChange={event => setChoice(event.target.value)}>{defaults.map(value => <option key={value} value={value}>{value === supplierAddress ? 'Supplier address' : 'Saved pickup address'} — {value}</option>)}<option value="elsewhere">Pick up elsewhere…</option></select></label>{choice === 'elsewhere' && <label className="block"><span className="field-label">New pickup address</span><input aria-label="New pickup address" value={address} onChange={event => setAddress(event.target.value)} className="input-klyne w-full" /></label>}<input type="hidden" name="pickupAddress" value={choice === 'elsewhere' ? address : choice} /></div>;
}
