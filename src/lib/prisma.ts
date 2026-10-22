import { PrismaClient } from "@prisma/client";
import { databaseConnectionUrl } from './environmentMode';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Keep one pool per process, including production route bundles. Allow a bounded
// queue during bursts instead of failing reads after Prisma's default ten seconds.
const databaseUrl = new URL(databaseConnectionUrl());
if (databaseUrl && !databaseUrl.searchParams.has("pool_timeout")) databaseUrl.searchParams.set("pool_timeout", "30");
export const prisma = globalForPrisma.prisma ?? new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl.toString() } : undefined);
globalForPrisma.prisma = prisma;
