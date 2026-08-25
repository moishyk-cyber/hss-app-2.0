// One-time security hardening (Supabase advisor: rls_disabled_in_public).
// Enables Row-Level Security on every public table. Our app connects as the
// table owner via Prisma and is unaffected; this closes the PostgREST/API path.
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const tables: { tablename: string; rowsecurity: boolean }[] = await p.$queryRawUnsafe(
    `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`
  );
  for (const t of tables) {
    if (!t.rowsecurity) {
      await p.$executeRawUnsafe(`ALTER TABLE "public"."${t.tablename}" ENABLE ROW LEVEL SECURITY`);
      console.log(`RLS enabled: ${t.tablename}`);
    } else {
      console.log(`already enabled: ${t.tablename}`);
    }
  }
  const after: { tablename: string; rowsecurity: boolean }[] = await p.$queryRawUnsafe(
    `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`
  );
  console.log("all tables secured:", after.every((t) => t.rowsecurity));
}

main().finally(() => p.$disconnect());
