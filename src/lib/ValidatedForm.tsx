"use client";

import { useRef, useState, type ComponentProps } from "react";
import { ValidationDialog } from "./ValidationDialog";
import { stageIssues, type ValidationIssue, type DealFacts, type DealRequirements } from "./dealWorkflow";
import { useRouter } from "next/navigation";
import { highlightSection } from "./SectionLink";

/** Retains native constraints while presenting every invalid field together. */
export function ValidatedForm({ children, dealValidation, ...props }: ComponentProps<"form"> & { dealValidation?: { deal: DealFacts; required: DealRequirements } }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const invalid = useRef<(HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]>([]);
  function validate() {
    const controls = Array.from(ref.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea") ?? []);
    invalid.current = controls.filter(c => !c.disabled && c.type !== "hidden" && (!c.validity.valid || (c.required && !c.value.trim())));
    const next: ValidationIssue[] = invalid.current.map(c => ({ field: c.name, message: `${c.labels?.[0]?.querySelector(".field-label")?.textContent?.replace(/\*/g, "").trim() || c.getAttribute("aria-label") || c.name || "Field"}: ${c.value.trim() ? c.validationMessage || "Enter a valid value." : "Required — please fill this in."}` }));
    if (dealValidation && ref.current) {
      const data = new FormData(ref.current);
      const stage = String(data.get("stage") ?? "");
      if (stage !== dealValidation.deal.stage) next.push(...stageIssues({ ...dealValidation.deal, title: String(data.get("title") ?? ""), companyId: String(data.get("companyId") ?? "") || null, neededByDate: String(data.get("neededByDate") ?? "") || null }, stage, dealValidation.required).filter(i => !next.some(n => n.field === i.field)));
    }
    controls.forEach(c => c.setAttribute("aria-invalid", String(invalid.current.includes(c))));
    setIssues(next);
    return !next.length;
  }
  return <>
    <form {...props} ref={ref} noValidate onSubmit={event => { if (!validate()) event.preventDefault(); else props.onSubmit?.(event); }} onInput={event => { (event.target as HTMLElement).removeAttribute("aria-invalid"); }}>
      {children}
    </form>
    <ValidationDialog issues={issues} onClose={() => setIssues([])} onFix={() => {
      const target = issues[0];
      setIssues([]);
      if (!invalid.current.length && target?.href) { router.push(target.href.startsWith("#") && dealValidation ? `/pipeline/${dealValidation.deal.id}${target.href}` : target.href); return; }
      requestAnimationFrame(() => {
        const first = invalid.current[0];
        const id = first?.id || first?.closest("[id]")?.id;
        if (id) highlightSection(`#${id}`, first); else { first?.scrollIntoView({ block: "center" }); first?.focus(); }
      });
    }} />
  </>;
}
