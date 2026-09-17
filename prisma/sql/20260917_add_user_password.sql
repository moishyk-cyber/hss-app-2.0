-- Real login (Sep 17): a user needs a password hash to sign in. Null until
-- an admin sets one on Admin > Team, so existing rows aren't broken by this
-- column landing.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
