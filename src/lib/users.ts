import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Share the small team directory within one render, never across requests. */
export const getActiveUsers = cache(() => prisma.user.findMany({
  where: { active: true },
  select: { id: true, name: true },
  orderBy: { name: "asc" },
}));
