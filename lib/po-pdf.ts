import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PoPrintData } from "@/lib/po-data";

const W = 595.28; // A5 landscape, close to the proportions of the company form
const H = 419.53;
const LEFT = 30;
const RIGHT = W - 30;

/** The standard PDF fonts only cover Latin-1; anything else becomes "?" instead of crashing. */
const safe = (s: string) => (s ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("en-US", { maximumFractionDigits: 4 });

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > maxWidth) t = t.slice(0, -1);
  return t + "...";
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
      out.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) out.push(line);
  return out;
}

const COLS = [
  { key: "qty", label: "Qty", w: 34, align: "center" },
  { key: "unit", label: "Unit", w: 30, align: "center" },
  { key: "bound", label: "Bound", w: 68, align: "left" },
  { key: "item", label: "Item", w: 92, align: "left" },
  { key: "description", label: "Description", w: 88, align: "left" },
  { key: "price", label: "Price", w: 50, align: "right" },
  { key: "disc", label: "Disc", w: 30, align: "center" },
  { key: "net", label: "Price", w: 50, align: "right" },
  { key: "amount", label: "Amount", w: 93, align: "right" },
] as const;

export async function buildPoPdf(data: PoPrintData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const black = rgb(0, 0, 0);

  const text = (page: PDFPage, t: string, x: number, y: number, size: number, font: PDFFont) =>
    page.drawText(safe(t), { x, y, size, font, color: black });

  const rightText = (page: PDFPage, t: string, xRight: number, y: number, size: number, font: PDFFont) =>
    text(page, t, xRight - font.widthOfTextAtSize(safe(t), size), y, size, font);

  const line = (page: PDFPage, x1: number, y1: number, x2: number, y2: number, thickness = 0.6) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: black });

  function drawHeader(page: PDFPage) {
    const title = "VITSON INTERNATIONAL, INCORPORATED";
    text(page, title, (W - serifBold.widthOfTextAtSize(title, 15)) / 2, H - 38, 15, serifBold);
    const sub = "PURCHASE ORDER";
    text(page, sub, (W - serif.widthOfTextAtSize(sub, 10.5)) / 2, H - 58, 10.5, serif);
  }

  function drawParties(page: PDFPage) {
    const rows: [string, string][] = [
      ["To :", data.supplierName],
      ["Attention", data.attention],
      ["Sort", data.sort],
      ["Group", `${data.groupNumber}${data.groupNumber && data.groupName ? "    " : ""}${data.groupName}`],
    ];
    rows.forEach(([label, value], i) => {
      const y = H - 82 - i * 15;
      text(page, label, LEFT, y, 9, serif);
      text(page, fit(value, sans, 9, 235), 100, y, 9, sans);
      line(page, 98, y - 3, 335, y - 3);
    });

    const right: [string, string][] = [
      ["No.", String(data.poNo)],
      ["Date", data.date],
      ["Reference", data.reference],
      ["Terms", data.terms],
    ];
    right.forEach(([label, value], i) => {
      const y = H - 82 - i * 15;
      text(page, label, 365, y, 9, serif);
      if (label === "No.") rightText(page, value, RIGHT, y, 9, sans);
      else text(page, fit(value, sans, 9, 130), 430, y, 9, sans);
      line(page, 428, y - 3, RIGHT, y - 3);
    });
  }

  function drawTableHeader(page: PDFPage, top: number) {
    let x = LEFT;
    for (const c of COLS) {
      page.drawRectangle({ x, y: top - 15, width: c.w, height: 15, borderColor: black, borderWidth: 0.6 });
      const f = serifBold;
      const lw = f.widthOfTextAtSize(c.label, 8);
      const tx = c.align === "right" ? x + c.w - lw - 3 : c.align === "left" ? x + 3 : x + (c.w - lw) / 2;
      text(page, c.label, c.align === "right" ? x + c.w - lw - 3 : tx, top - 11, 8, f);
      x += c.w;
    }
    return top - 15;
  }

  function drawRow(page: PDFPage, top: number, l: PoPrintData["lines"][number]) {
    const rowH = 19;
    const cells: Record<string, string> = {
      qty: qtyText(l.qty),
      unit: l.unit,
      bound: l.bound,
      item: l.item,
      description: l.description,
      price: money(l.price),
      disc: `${Math.round(l.discount * 100) / 100}%`,
      net: money(l.netPrice),
      amount: money(l.amount),
    };
    let x = LEFT;
    for (const c of COLS) {
      page.drawRectangle({ x, y: top - rowH, width: c.w, height: rowH, borderColor: black, borderWidth: 0.6 });
      const t = fit(cells[c.key], sans, 8, c.w - 6);
      const tw = sans.widthOfTextAtSize(t, 8);
      const tx = c.align === "right" ? x + c.w - tw - 3 : c.align === "left" ? x + 3 : x + (c.w - tw) / 2;
      text(page, t, tx, top - 12, 8, sans);
      x += c.w;
    }
    return top - rowH;
  }

  function drawFooter(page: PDFPage, top: number) {
    // total
    text(page, "Total", RIGHT - 93 - 40, top - 15, 9, serifBold);
    page.drawRectangle({ x: RIGHT - 93, y: top - 20, width: 93, height: 16, borderColor: black, borderWidth: 0.6 });
    rightText(page, money(data.total), RIGHT - 4, top - 15, 9, sans);

    const para =
      "The above order must be delivered as per specs/sample submitted. Our receiving officer has the right to reject any delivery which is not in confirmity with specs/sample submitted. Please indicate PO Number on all copies of invoice.";
    wrap(para, serifItalic, 7.5, 285).forEach((ln, i) => text(page, ln, LEFT, top - 40 - i * 9.5, 7.5, serifItalic));

    text(page, "Vitson International Inc.", 360, top - 40, 9, serif);
    line(page, 340, top - 82, RIGHT - 20, top - 82);
    text(page, "Authorized Signature", 395, top - 93, 9, serif);

    text(page, "CONFIRMED :", LEFT, top - 105, 9, serif);
    line(page, 100, top - 107, 250, top - 107);
  }

  // lay the lines out over as many pages as needed; the footer goes after the last row
  const FOOTER_H = 125;
  const ROW_H = 19;
  let page = pdf.addPage([W, H]);
  drawHeader(page);
  drawParties(page);
  let y = drawTableHeader(page, H - 150);

  for (const l of data.lines) {
    if (y - ROW_H < 28) {
      page = pdf.addPage([W, H]);
      drawHeader(page);
      y = drawTableHeader(page, H - 75);
    }
    y = drawRow(page, y, l);
  }

  if (y - FOOTER_H < 14) {
    page = pdf.addPage([W, H]);
    drawHeader(page);
    y = H - 80;
  }
  drawFooter(page, y - 4);

  return pdf.save();
}
