import type { Prisma, PrismaClient } from "@prisma/client";

/** Retry only rolled-back serialization conflicts; effects run after commit. */
export async function serialTransaction<T>(
  db: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt >= 2 || !error || typeof error !== "object" ||
        !("code" in error) || error.code !== "P2034") throw error;
    }
  }
}
