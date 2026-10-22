-- Do not infer confirmed terms from the former automatic 30% default.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "paymentTermsConfigured" BOOLEAN NOT NULL DEFAULT false;
