export const ACCOUNT_TERMS_REQUIRED = 'Set payment terms on the customer account before creating an order. Open the customer account, choose its payment terms, and save.';
export class AccountTermsRequiredError extends Error {
 constructor(){ super(ACCOUNT_TERMS_REQUIRED); }
}
export function hasAccountPaymentTerms(account: { paymentTermsConfigured?: boolean; requiresDeposit: boolean; depositPercent: number } | null | undefined) {
 return account?.paymentTermsConfigured === true && (!account.requiresDeposit || (Number.isInteger(account.depositPercent) && account.depositPercent > 0 && account.depositPercent <= 100));
}
export async function requireAccountPaymentTerms(db: {company:{findUnique(args: {where:{id:string};select:{paymentTermsConfigured:true;requiresDeposit:true;depositPercent:true}}):PromiseLike<{paymentTermsConfigured:boolean;requiresDeposit:boolean;depositPercent:number}|null>}}, companyId: string | null) {
 const account=companyId ? await db.company.findUnique({where:{id:companyId},select:{paymentTermsConfigured:true,requiresDeposit:true,depositPercent:true}}) : null;
 if (!hasAccountPaymentTerms(account)) throw new AccountTermsRequiredError();
}
