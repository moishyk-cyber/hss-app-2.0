// Purchase-order PDF document builder (pdf-lib). Pure function over plain
// data - no Prisma types, no fetches, no Next.js - so it's easy to sanity-test
// standalone and easy to call from the route handler once it has assembled
// the data. StandardFonts only (Helvetica / HelveticaBold); the HSS logo is
// embedded via embedPng when the caller has bytes for it, and simply skipped
// otherwise (a missing/unreadable logo must never fail the PDF).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type PoPdfCompany = {
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
};

export type PoPdfParty = {
  name: string;
  address: string | null;
};

export type PoPdfItem = {
  name: string;
  detail: string | null;
  qty: number;
  /** null renders as a blank cell - unit cost isn't always filled in yet. */
  unitCost: number | null;
};

export type PoPdfData = {
  poNumber: string;
  autoQuotesPoNumber: string | null;
  date: Date;
  company: PoPdfCompany;
  supplier: PoPdfParty;
  /** "HSS warehouse" or "Client direct" - the plain-language ship-to label. */
  shipToLabel: string;
  shipToAddress: string;
  neededByDate: Date | null;
  items: PoPdfItem[];
  notes: string | null;
  footer: string | null;
  /** PNG bytes for the HSS logo, when it loaded. Skipped (no error) when null. */
  logoPng: Uint8Array | null;
};

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 48;
const INK = rgb(0.11, 0.13, 0.16);
const GRAY = rgb(0.45, 0.47, 0.52);
const LINE = rgb(0.82, 0.83, 0.86);

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(d);
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Greedy word-wrap to fit `maxWidth` points at `size`, using `font`'s real metrics. */
function wrapText(str: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Builds the PO PDF and returns its bytes. Paginates the items table as needed. */
export async function buildPoPdf(data: PoPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (data.logoPng) {
    try {
      logo = await doc.embedPng(data.logoPng);
    } catch {
      logo = null; // A corrupt/missing logo must never fail the PDF.
    }
  }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const footerText = data.footer?.trim() || null;

  function drawFooter(p: PDFPage) {
    if (!footerText) return;
    const lines = wrapText(footerText, font, 8, PAGE_W - MARGIN * 2);
    let fy = MARGIN - 4 + lines.length * 10;
    for (const line of lines) {
      p.drawText(line, { x: MARGIN, y: fy, size: 8, font, color: GRAY });
      fy -= 10;
    }
  }

  function newPage() {
    drawFooter(page);
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  /** Ensures `needed` points of room remain before the footer band; else starts a new page. */
  function ensureRoom(needed: number) {
    const floor = footerText ? MARGIN + 28 : MARGIN;
    if (y - needed < floor) newPage();
  }

  function text(str: string, x: number, size: number, opts?: { font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right"; maxX?: number }) {
    const f = opts?.font ?? font;
    const color = opts?.color ?? INK;
    const drawX = opts?.align === "right" && opts.maxX != null ? opts.maxX - f.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: drawX, y, size, font: f, color });
  }

  // ---- Header: logo + company block (left), title + PO facts (right) ----
  const rightColX = PAGE_W - MARGIN;
  if (logo) {
    const targetW = 90;
    const scale = targetW / logo.width;
    const h = logo.height * scale;
    page.drawImage(logo, { x: MARGIN, y: y - h, width: targetW, height: h });
    y -= h + 8;
  }
  text(data.company.name, MARGIN, 12, { font: bold });
  y -= 14;
  for (const line of wrapText(data.company.address, font, 9, 260)) {
    text(line, MARGIN, 9, { color: GRAY });
    y -= 12;
  }
  const contactBits = [data.company.phone, data.company.email].filter(Boolean).join("  |  ");
  if (contactBits) {
    text(contactBits, MARGIN, 9, { color: GRAY });
    y -= 12;
  }

  // Title block, right-aligned, anchored to the top of the page.
  const titleY = PAGE_H - MARGIN;
  page.drawText("PURCHASE ORDER", {
    x: rightColX - bold.widthOfTextAtSize("PURCHASE ORDER", 16),
    y: titleY,
    size: 16,
    font: bold,
    color: INK,
  });
  const rightLines: string[] = [`PO #: ${data.poNumber}`];
  if (data.autoQuotesPoNumber) rightLines.push(`AutoQuotes PO #: ${data.autoQuotesPoNumber}`);
  rightLines.push(`Date: ${fmtDate(data.date)}`);
  if (data.neededByDate) rightLines.push(`Needed by: ${fmtDate(data.neededByDate)}`);
  let ry = titleY - 22;
  for (const line of rightLines) {
    page.drawText(line, { x: rightColX - font.widthOfTextAtSize(line, 10), y: ry, size: 10, font, color: GRAY });
    ry -= 13;
  }
  y = Math.min(y, ry) - 14;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: rightColX, y }, thickness: 1, color: LINE });
  y -= 20;

  // ---- Supplier / ship-to two-up block ----
  const colW = (rightColX - MARGIN - 24) / 2;
  const blockTop = y;
  text("VENDOR", MARGIN, 8.5, { font: bold, color: GRAY });
  text("SHIP TO", MARGIN + colW + 24, 8.5, { font: bold, color: GRAY });
  y -= 13;
  let leftY = y;
  let rightY = y;
  const supplierLines = [data.supplier.name, ...wrapText(data.supplier.address ?? "not on file", font, 10, colW)];
  for (const line of supplierLines) {
    page.drawText(line, { x: MARGIN, y: leftY, size: 10, font, color: INK });
    leftY -= 13;
  }
  const shipLines = [data.shipToLabel, ...wrapText(data.shipToAddress, font, 10, colW)];
  for (const line of shipLines) {
    page.drawText(line, { x: MARGIN + colW + 24, y: rightY, size: 10, font, color: INK });
    rightY -= 13;
  }
  y = Math.min(leftY, rightY, blockTop - 13) - 12;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: rightColX, y }, thickness: 1, color: LINE });
  y -= 20;

  // ---- Items table ----
  const cols = {
    name: { x: MARGIN, w: 150 },
    detail: { x: MARGIN + 150, w: 156 },
    qty: { x: MARGIN + 150 + 156, w: 36 },
    unitCost: { x: MARGIN + 150 + 156 + 36, w: 74 },
    lineTotal: { x: MARGIN + 150 + 156 + 36 + 74, w: 74 },
  };
  const tableRight = cols.lineTotal.x + cols.lineTotal.w;

  function drawTableHeader() {
    ensureRoom(18);
    text("ITEM", cols.name.x, 8.5, { font: bold, color: GRAY });
    text("DETAILS", cols.detail.x, 8.5, { font: bold, color: GRAY });
    text("QTY", cols.qty.x, 8.5, { font: bold, color: GRAY, align: "right", maxX: cols.qty.x + cols.qty.w });
    text("UNIT COST", cols.unitCost.x, 8.5, {
      font: bold,
      color: GRAY,
      align: "right",
      maxX: cols.unitCost.x + cols.unitCost.w,
    });
    text("LINE TOTAL", cols.lineTotal.x, 8.5, {
      font: bold,
      color: GRAY,
      align: "right",
      maxX: tableRight,
    });
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: tableRight, y }, thickness: 1, color: LINE });
    y -= 14;
  }

  drawTableHeader();

  let subtotal = 0;
  for (const item of data.items) {
    const nameLines = wrapText(item.name, font, 9.5, cols.name.w - 6);
    const detailLines = item.detail ? wrapText(item.detail, font, 9, cols.detail.w - 6) : [];
    const rowLines = Math.max(nameLines.length, detailLines.length, 1);
    const rowHeight = rowLines * 12 + 6;

    ensureRoom(rowHeight);
    if (y === PAGE_H - MARGIN) {
      // Fresh page from a mid-table overflow - repeat the header.
      drawTableHeader();
    }

    const rowTopY = y;
    let ny = rowTopY;
    for (const line of nameLines) {
      page.drawText(line, { x: cols.name.x, y: ny, size: 9.5, font, color: INK });
      ny -= 12;
    }
    let dy = rowTopY;
    for (const line of detailLines) {
      page.drawText(line, { x: cols.detail.x, y: dy, size: 9, font, color: GRAY });
      dy -= 12;
    }
    const lineTotal = item.unitCost != null ? item.unitCost * item.qty : null;
    if (lineTotal != null) subtotal += lineTotal;

    page.drawText(String(item.qty), {
      x: cols.qty.x + cols.qty.w - font.widthOfTextAtSize(String(item.qty), 9.5),
      y: rowTopY,
      size: 9.5,
      font,
      color: INK,
    });
    const unitCostStr = item.unitCost != null ? fmtMoney(item.unitCost) : "-";
    page.drawText(unitCostStr, {
      x: cols.unitCost.x + cols.unitCost.w - font.widthOfTextAtSize(unitCostStr, 9.5),
      y: rowTopY,
      size: 9.5,
      font,
      color: INK,
    });
    const lineTotalStr = lineTotal != null ? fmtMoney(lineTotal) : "-";
    page.drawText(lineTotalStr, {
      x: tableRight - font.widthOfTextAtSize(lineTotalStr, 9.5),
      y: rowTopY,
      size: 9.5,
      font,
      color: INK,
    });

    y = rowTopY - rowHeight;
  }

  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: tableRight, y: y + 6 }, thickness: 1, color: LINE });
  y -= 10;

  // ---- Subtotal ----
  ensureRoom(20);
  const subtotalLabel = "SUBTOTAL";
  page.drawText(subtotalLabel, {
    x: cols.unitCost.x - font.widthOfTextAtSize(subtotalLabel, 9.5) - 8,
    y,
    size: 9.5,
    font: bold,
    color: GRAY,
  });
  const subtotalStr = fmtMoney(subtotal);
  page.drawText(subtotalStr, {
    x: tableRight - bold.widthOfTextAtSize(subtotalStr, 10.5),
    y,
    size: 10.5,
    font: bold,
    color: INK,
  });
  y -= 26;

  // ---- Notes ----
  if (data.notes?.trim()) {
    ensureRoom(16);
    text("NOTES", MARGIN, 8.5, { font: bold, color: GRAY });
    y -= 13;
    for (const line of wrapText(data.notes.trim(), font, 9.5, tableRight - MARGIN)) {
      ensureRoom(12);
      text(line, MARGIN, 9.5, { color: INK });
      y -= 12;
    }
  }

  drawFooter(page);

  return doc.save();
}
