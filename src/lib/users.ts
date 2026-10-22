import { shareRead } from "./shareRead";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Share the small team directory within a render; overlapping requests share only their pending read. */
export const getActiveUsers = cache(() => shareRead("active-users-v1",()=>prisma.user.findMany({
  where: { active: true },
  select: { id: true, name: true },
  orderBy: { name: "asc" },
})));
