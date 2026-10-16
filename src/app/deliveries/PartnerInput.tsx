"use client";
import { createContext, useContext, useId } from "react";
import type { DeliveryPartners, PartnerKind } from "@/lib/workflows/deliveryPartners";

const Partners = createContext<DeliveryPartners>({ carriers: [], truckers: [] });
export function DeliveryPartnersProvider({ partners, children }: { partners: DeliveryPartners; children: React.ReactNode }) {
  return <Partners.Provider value={partners}>{children}</Partners.Provider>;
}
export function PartnerInput({ kind, name, defaultValue, className }: {
  kind: PartnerKind; name: string; defaultValue: string; className?: string;
}) {
  const id = useId();
  const options = useContext(Partners)[kind];
  return <>
    <input name={name} list={id} defaultValue={defaultValue} maxLength={200}
      placeholder={`Choose or type a ${kind === "carriers" ? "carrier" : "trucker"}…`} className={className} />
    <datalist id={id}>{options.map(value => <option key={value} value={value} />)}</datalist>
  </>;
}
