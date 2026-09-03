// GET /orders/[id]/po/[poId]/pdf - the "PDF" link on a PO row/modal (plan
// §3C.2). Builds the document with @/lib/poPdf and streams it inline so it
// opens in a new tab instead of downloading. Reads are not logged (see plan).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { buildPoPdf, type PoPdfItem } from "@/lib/poPdf";

const FALLBACK_COMPANY_NAME = "HSS Kitchen Equipment Inc";
const FALLBACK_COMPANY_ADDRESS = "Brooklyn, NY";

/** The HSS logo, embedded when it loads; a missing/unreadable file never fails the PDF. */
async function loadLogoBytes(): Promise<Uint8Array | null> {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "hss-logo.png"));
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> }
) {
  const { id: orderId, poId } = await params;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      order: {
        include: {
          company: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
      supplier: { select: { name: true, deliveryAddress: true, billingAddress: true } },
      lineItems: {
        where: { rfqStatus: { not: "removed" } },
        select: { name: true, description: true, moreDetails: true, qty: true, unitCost: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // A PO that doesn't belong to this order (wrong id in the URL, or it moved) is a 404,
  // not a leak of another order's purchase order.
  if (!po || po.orderId !== orderId) {
    return new Response("Not found", { status: 404 });
  }

  const [settings, logoPng] = await Promise.all([
    getSettings(["company.name", "company.address", "company.phone", "company.email", "po.pdfFooter"]),
    loadLogoBytes(),
  ]);

  const items: PoPdfItem[] = po.lineItems.map((li) => ({
    name: li.name,
    detail: [li.description, li.moreDetails].filter(Boolean).join(" - ") || null,
    qty: li.qty,
    unitCost: li.unitCost,
  }));

  const shipToHss = po.shipTo === "hss";
  const shipToLabel = shipToHss
    ? "HSS Warehouse"
    : po.order.location?.name ?? po.order.company?.name ?? "Client direct";
  const shipToAddress = shipToHss
    ? settings["company.address"] || FALLBACK_COMPANY_ADDRESS
    : po.order.deliveryAddress || "not set";

  const bytes = await buildPoPdf({
    poNumber: po.poNumber ?? po.id,
    autoQuotesPoNumber: po.autoQuotesPoNumber,
    date: po.createdAt,
    company: {
      name: settings["company.name"] || FALLBACK_COMPANY_NAME,
      address: settings["company.address"] || FALLBACK_COMPANY_ADDRESS,
      phone: settings["company.phone"],
      email: settings["company.email"],
    },
    supplier: {
      name: po.supplier?.name ?? "no vendor",
      address: po.supplier?.deliveryAddress ?? po.supplier?.billingAddress ?? null,
    },
    shipToLabel,
    shipToAddress,
    neededByDate: po.order.neededByDate,
    items,
    notes: po.notes,
    footer: settings["po.pdfFooter"],
    logoPng,
  });

  const fileName = `PO-${po.poNumber ?? po.id}.pdf`;
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
