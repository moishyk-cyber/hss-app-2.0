"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOrderTermsText } from "@/lib/workflowActions";
import { PendingButton } from "@/lib/ui";
import { useToast } from "@/lib/toast";
import { usePaymentTermsConversion, PaymentTermsPreview } from "@/lib/PaymentTermsField";
import { MoneyInput } from "@/lib/MoneyInput";
import { paymentPlanAmounts } from "@/lib/paymentTerms";
export default function TermsCard({orderId,termsNotes,orderValue}:{orderId:string;termsNotes:string|null;paymentTerms:string|null;orderValue?:number|null}) {
 const router=useRouter();
 const [text,setText]=useState(termsNotes ?? "");
 const [total,setTotal]=useState("");
 const effectiveTotal=orderValue??(total.trim()?Number(total):null);
 const [open,setOpen]=useState(false);
 const conversion=usePaymentTermsConversion(text,open);
 let invalid=!!text.trim() && (conversion.loading || !!conversion.error || conversion.plan?.status!=="ready" || !conversion.token);
 try { if(conversion.plan?.status==="ready") paymentPlanAmounts(conversion.plan,effectiveTotal); } catch { invalid=true; }
 const [error,setError]=useState<string|null>(null);const {toast}=useToast();
 async function save(){const result=await updateOrderTermsText(orderId,text,conversion.token,orderValue==null&&total.trim()?Number(total):undefined);if(result.ok){setError(null);toast({kind:"success",message:"Payment terms applied"});router.refresh();}else setError(result.message);}
 return <details id="order-terms" onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-medium">Payment terms</summary><form action={save} className="space-y-3 pt-3">
 <label className="block"><span className="field-label">Payment terms</span><textarea name="termsNotes" value={text} onChange={e=>{setText(e.target.value);setError(null);}} rows={3} maxLength={4000} placeholder="e.g. 30% deposit before ordering; balance before delivery" className="input-klyne w-full" /></label>
 {orderValue==null&&<label className="block max-w-xs"><span className="field-label">Agreed order total</span><MoneyInput value={total} onValueChange={setTotal} aria-label="Agreed order total" className="input-klyne w-full" /><span className="mt-1 block text-xs text-gray-dark">Set the total to calculate percentage-based payments.</span></label>}
 <PaymentTermsPreview conversion={conversion} total={effectiveTotal} />
 {error&&<p role="alert" className="banner-alert">{error}</p>}<fieldset disabled={invalid}><PendingButton className="btn btn-sm" pendingText="Saving…">Save payment terms</PendingButton></fieldset>
 </form></details>;
}
