'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LocationDropdown, initialLocationSelection, type LocationSelection } from '@/lib/LocationDropdown';
import type { DeliveryDestination } from '@/lib/deliveryDestination';
import { setOrderDestination } from '../actions';
export function OrderLocationField({ orderId, destination }: { orderId: string; destination: DeliveryDestination }) {
  const intake = { name: destination.intakeLocation === undefined ? destination.location : destination.intakeLocation, address: destination.intakeAddress === undefined ? destination.address : destination.intakeAddress };
  const locations = destination.locations ?? [];
  const [value, setValue] = useState(() => initialLocationSelection({ locationId: destination.locationId, name: destination.location, address: destination.address }, intake, locations));
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const router = useRouter();
  function save(next: LocationSelection) {
    start(async () => {
      setError('');
      const result = await setOrderDestination(orderId, next.choice, next.address);
      if (result.ok) router.refresh(); else setError(result.message);
    });
  }
  return <div className="space-y-2"><LocationDropdown intake={intake} locations={locations} value={value} disabled={pending} postFields={false} onChange={next => { setValue(next); setError(''); if (next.choice !== 'elsewhere') save(next); }} />
    {value.choice === 'elsewhere' && <button type="button" className="btn btn-sm" disabled={pending || !value.address.trim()} onClick={() => save(value)}>{pending ? 'Saving…' : 'Save address'}</button>}
    {pending && <p role="status" className="text-xs text-gray-dark">Saving location…</p>}{error && <p role="alert" className="text-xs text-red">{error}</p>}
  </div>;
}
