import type { Prisma } from "@prisma/client";
import { DELIVERY_LEG_STATUSES, DELIVERY_MODES } from "@/lib/constants";
import { loadBoardCollection } from "@/lib/loadBoardCollection";

/** Bound every status lane independently so busy pending queues cannot hide in-transit deliveries. */
export function loadDeliveryCollection<Row extends { id: string }>(
  query: (where: Prisma.DeliveryWhereInput, take?: number) => Promise<Row[]>,
  where: Prisma.DeliveryWhereInput,
  limit: number,
  queryIds: (where: Prisma.DeliveryWhereInput, take?: number) => Promise<{ id: string }[]> = query,
) {
  return loadBoardCollection<Row, Prisma.DeliveryWhereInput>(query, where, limit,
    [...DELIVERY_LEG_STATUSES.map(lane => ({ status: lane.value })), ...DELIVERY_MODES.map(lane => ({ mode: lane.value }))],
    AND => ({ AND }), ids => ({ id: { in: ids } }), queryIds);
}
