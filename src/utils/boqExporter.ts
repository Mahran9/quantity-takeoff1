import * as XLSX from "xlsx";
import { buildXlsx, CellInput, CellStyle, colLetter, downloadXlsx, SheetSpec } from "./xlsxWriter";
import { BlueprintSheet, CompanyProfile, EMPTY_COMPANY_PROFILE, ProjectMetadata, TakeoffItem } from "../types";
import { getSiteExecutionRank, sortItemsBySiteExecutionOrder } from "./executionOrder";
import { buildMarksTable } from "../engine/marks";
import { buildQuotation, isExportable, QUOTATION_LABELS, QuotationMeta } from "./quotation";

// Re-exported for existing imports/tests.
export { getSiteExecutionRank, sortItemsBySiteExecutionOrder };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const MAX_SHEET_NAME = 31;

/** Excel sheet names: ≤31 chars, no : \ / ? * [ ], unique (case-insensitive) within the workbook. */
export function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = (raw || "Sheet").replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SHEET_NAME) || "Sheet";
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = base.slice(0, MAX_SHEET_NAME - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

export function safeFileName(raw: string, fallback = "file"): string {
  const cleaned = (raw || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

/** Prevent spreadsheet formula injection when a text cell starts with = + - @ (CSV opened in Excel). */
function csvText(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const DIM_NAMES: Record<string, string> = {
  volume: "حجوم (م³)",
  area: "مساحات (م²)",
  linear: "أطوال (م.ط)",
  count: "أعداد وقطع",
};
const dimName = (d?: string) => (d && DIM_NAMES[d]) || "-";

function sourceLabel(item: TakeoffItem): string {
  switch (item.extractionSource) {
    case "cad_geometry":
      return `AutoCAD (${item.sourceDetails?.layer || "CAD"})`;
    case "pdf_vector":
      return `PDF متجه (${item.sourceDetails?.layer || "PDF"})`;
    case "visual_search":
      return item.sourceEvidence?.startsWith("السطر المقروء:") ? "OCR — نص مطبوع على اللوحة" : "بحث بصري محلي";
    case "manual_pin":
      return "قياس مباشر على المخطط";
    case "excel_import":
      return "مستورد من Excel";
    case "ai_vision":
      return "قراءة بالذكاء الاصطناعي";
    case "structural_model":
      return `نموذج إنشائي (${item.sourceDetails?.layer || "ETABS/SAFE"})`;
    case "manual_input":
      return "إدخال يدوي";
    default:
      return "حصر يدوي";
  }
}

export interface ExportWarnings {
  rejectedExcluded: number;
  zeroPrice: number;
  pending: number;
}

export function getExportWarnings(items: TakeoffItem[]): ExportWarnings {
  const live = items.filter(isExportable);
  return {
    rejectedExcluded: items.length - live.length,
    zeroPrice: live.filter((i) => !(i.unitPrice > 0)).length,
    pending: live.filter((i) => i.reviewStatus !== "approved" && !i.isVerified).length,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ------------------------------------------------------------------ */
/* Quotation worksheet (6 columns, sections + sub-totals, no empty rows) */
/* ------------------------------------------------------------------ */

export function defaultQuotationMeta(metadata: ProjectMetadata, company: CompanyProfile): QuotationMeta {
  const year = (metadata.date || new Date().toISOString()).slice(0, 4);
  const code = (metadata.projectCode || "").replace(/[^A-Za-z0-9-]/g, "").slice(-6);
  return {
    number: [company.quotationPrefix || "QT", year, code].filter(Boolean).join("-"),
    subject: metadata.projectName,
    validityDays: 30,
    lang: company.quotationLanguage || "ar",
  };
}

const C = { navy: "1F4E79", blue: "2E75B6", light: "D9E2F3", white: "FFFFFF", gold: "FFD966", black: "000000", warn: "FCE4D6" };
const MONEY = "#,##0.00";

/** Styled quotation sheet with live formulas (editing a price in Excel recalculates totals). */
export function buildQuotationSheetSpec(
  metadata: ProjectMetadata,
  company: CompanyProfile,
  items: TakeoffItem[],
  meta: QuotationMeta,
  name: string
): SheetSpec {
  const data = buildQuotation(items, metadata.taxRate);
  const L = QUOTATION_LABELS[meta.lang];
  const sym = metadata.currencySymbol;
  const rows: CellInput[][] = [];
  const merges: SheetSpec["merges"] = [];
  const heights: Record<number, number> = {};
  const mergeRow = (r: number, c1: number, c2: number) => merges!.push({ r1: r, c1, r2: r, c2 });
  const fillRow = (cells: CellInput[], style: CellStyle, from = 0) => {
    for (let c = from; c < 6; c++) if (cells[c] === undefined) cells[c] = { v: "", s: style };
    return cells;
  };

  const ar = meta.lang === "ar";
  const side: "left" | "right" = ar ? "right" : "left";
  const companyName = (meta.lang === "en" ? company.nameEn || company.name : company.name || company.nameEn) || "";
  const titleStyle: CellStyle = { bold: true, fontSize: 16, color: C.white, fill: C.navy, align: "center", border: true };
  rows.push(fillRow([{ v: L.title, s: titleStyle }], titleStyle, 1));
  mergeRow(0, 0, 5);
  heights[0] = 30;

  const contact = [companyName, company.address, company.phone, company.email].filter(Boolean).join("  |  ");
  if (contact) {
    const r = rows.length;
    const cs: CellStyle = { align: "center", fontSize: 10, color: "404040", border: true, wrap: true };
    rows.push(fillRow([{ v: contact, s: cs }], cs, 1));
    mergeRow(r, 0, 5);
    heights[r] = contact.length > 90 ? 30 : 20;
  }

  const info: [string, string][] = [
    [L.number, meta.number],
    [L.date, metadata.date],
    [L.to, metadata.clientName],
    [L.project, metadata.projectName],
  ];
  if (meta.subject && meta.subject !== metadata.projectName) info.push([L.subject, meta.subject]);
  info.push([L.validity, `${meta.validityDays} ${L.days}`]);
  if (company.taxNumber) info.push([L.taxNumber, company.taxNumber]);
  if (company.crNumber) info.push([L.crNumber, company.crNumber]);
  // No empty rows: lines without a value are simply left out.
  info
    .filter(([, v]) => String(v ?? "").trim() !== "")
    .forEach(([k, v]) => {
      const r = rows.length;
      const ls: CellStyle = { bold: true, fill: C.light, border: true, align: side };
      const vs: CellStyle = { border: true, align: side };
      const cells: CellInput[] = [{ v: k, s: ls }, { v: "", s: ls }, { v, s: vs }, { v: "", s: vs }, { v: "", s: vs }, { v: "", s: vs }];
      rows.push(cells);
      mergeRow(r, 0, 1);
      mergeRow(r, 2, 5);
    });

  const hs: CellStyle = { bold: true, color: C.white, fill: C.blue, align: "center", border: true, wrap: true };
  const headerRow = rows.length;
  rows.push([L.index, L.description, L.unit, L.quantity, `${L.unitPrice} (${sym})`, `${L.total} (${sym})`].map((v) => ({ v, s: hs })));
  heights[headerRow] = 24;

  const subtotalRefs: string[] = [];
  data.sections.forEach((section) => {
    let r = rows.length;
    const ss: CellStyle = { bold: true, color: C.white, fill: C.navy, border: true, align: meta.lang === "ar" ? "right" : "left" };
    rows.push(fillRow([{ v: section.title, s: ss }], ss, 1));
    mergeRow(r, 0, 5);
    const first = rows.length + 1; // 1-based excel row of first item
    section.rows.forEach((row) => {
      r = rows.length;
      const er = r + 1;
      const base: CellStyle = { border: true, valign: "center" };
      const lines = Math.ceil((row.description || "").length / 54);
      if (lines > 1) heights[r] = 15 * lines + 2;
      rows.push([
        { v: row.index, s: { ...base, align: "center" } },
        { v: row.description, s: { ...base, wrap: true, align: meta.lang === "ar" ? "right" : "left" } },
        { v: row.unit, s: { ...base, align: "center" } },
        { v: row.quantity, s: { ...base, numFmt: MONEY, align: "center" } },
        { v: row.unitPrice, s: { ...base, numFmt: MONEY, align: "center" } },
        { v: row.total, f: `ROUND(ROUND(D${er}*E${er}*100,4),0)/100`, s: { ...base, numFmt: MONEY, align: "center" } },
      ]);
    });
    const last = rows.length;
    r = rows.length;
    const st: CellStyle = { bold: true, fill: C.light, border: true, align: "center" };
    const cells = fillRow([{ v: `${L.sectionSubtotal} - ${section.title}`, s: { ...st, align: meta.lang === "ar" ? "right" : "left" } }], st, 1);
    cells[5] = { v: section.subtotal, f: section.rows.length ? `SUM(F${first}:F${last})` : undefined, s: { ...st, numFmt: MONEY } };
    rows.push(cells);
    mergeRow(r, 0, 4);
    subtotalRefs.push(`F${r + 1}`);
  });

  const sumStyle: CellStyle = { bold: true, fill: C.light, border: true };
  const subRow = rows.length + 1;
  const taxRow = subRow + 1;
  const summary: [string, number, string | undefined, boolean][] = [
    [L.subtotal, data.subtotal, subtotalRefs.length ? `ROUND(${subtotalRefs.join("+")},2)` : undefined, false],
    [`${L.vat} (${data.taxRate}%)`, data.tax, `ROUND(ROUND(F${subRow}*${data.taxRate},4),0)/100`, false],
    [L.grandTotal, data.grandTotal, `ROUND(F${subRow}+F${taxRow},2)`, true],
  ];
  summary.forEach(([label, value, f, grand]) => {
    const r = rows.length;
    const st: CellStyle = grand
      ? { bold: true, fontSize: 13, color: C.gold, fill: C.black, border: true }
      : sumStyle;
    const cells = fillRow([{ v: label, s: { ...st, align: meta.lang === "ar" ? "right" : "left" } }], st, 1);
    cells[5] = { v: value, f, s: { ...st, numFmt: MONEY, align: "center" } };
    rows.push(cells);
    mergeRow(r, 0, 4);
    heights[r] = grand ? 26 : 20;
  });

  // Terms and conditions (from company settings) and the signature box, like the printed quotation.
  const terms = (meta.lang === "en" ? company.termsTextEn : company.termsText || "")
    ?.split("\n")
    .map((t) => t.trim())
    .filter(Boolean) || [];
  if (terms.length) {
    let r = rows.length;
    const hs2: CellStyle = { bold: true, color: C.white, fill: C.navy, border: true, align: side };
    rows.push(fillRow([{ v: L.terms, s: hs2 }], hs2, 1));
    mergeRow(r, 0, 5);
    terms.forEach((t, i) => {
      r = rows.length;
      const ts: CellStyle = { border: true, wrap: true, valign: "top", align: side };
      rows.push(fillRow([{ v: `${i + 1}. ${t}`, s: ts }], ts, 1));
      mergeRow(r, 0, 5);
      heights[r] = 16 * Math.max(1, Math.ceil(t.length / 105)) + 4;
    });
  }
  {
    const r = rows.length;
    const lab: CellStyle = { bold: true, border: true, align: "center", valign: "top", fill: C.light };
    const box: CellStyle = { border: true, align: "center", valign: "bottom", wrap: true };
    const who = [company.signatoryName, company.signatoryTitle].filter(Boolean).join(" - ");
    const cells: CellInput[] = [
      { v: who || companyName || L.signature, s: box }, { v: "", s: box }, { v: "", s: box },
      { v: L.signature, s: lab }, { v: "", s: lab }, { v: "", s: lab },
    ];
    rows.push(cells);
    mergeRow(r, 0, 2);
    mergeRow(r, 3, 5);
    heights[r] = 60;
  }

  return {
    name,
    rows,
    merges,
    colWidths: [6, 58, 10, 12, 16, 18],
    rowHeights: heights,
    rtl: meta.lang === "ar",
    freezeRows: headerRow + 1,
  };
}

export function buildQuotationWorkbookBytes(
  metadata: ProjectMetadata,
  company: CompanyProfile,
  takeoffItems: TakeoffItem[],
  meta?: QuotationMeta
): Uint8Array {
  const qm = meta || defaultQuotationMeta(metadata, company);
  const used = new Set<string>();
  const name = uniqueSheetName(QUOTATION_LABELS[qm.lang].sheetName, used);
  return buildXlsx([buildQuotationSheetSpec(metadata, company, takeoffItems, qm, name)]);
}

export function exportQuotationExcel(
  metadata: ProjectMetadata,
  company: CompanyProfile,
  takeoffItems: TakeoffItem[],
  meta?: QuotationMeta
) {
  const qm = meta || defaultQuotationMeta(metadata, company);
  const base = qm.lang === "ar" ? "عرض سعر" : "Quotation";
  downloadXlsx(
    buildQuotationWorkbookBytes(metadata, company, takeoffItems, qm),
    `${safeFileName(`${base} - ${metadata.clientName || metadata.projectName}`)}.xlsx`
  );
}

/* ------------------------------------------------------------------ */
/* Full workbook                                                       */
/* ------------------------------------------------------------------ */

interface Col {
  header: string;
  width: number;
  kind: "text" | "num" | "money";
  /** Column is only written if at least one row has a meaningful value. */
  optional?: boolean;
  get: (item: TakeoffItem, i: number) => string | number | "";
}

const hasValue = (v: unknown) => v !== "" && v !== null && v !== undefined && v !== 0 && v !== "-";

/** Table with only the columns that carry data (no empty columns), title bar, info line and totals. */
function dynamicTableSheet(
  name: string,
  title: string,
  infoLine: string,
  cols: Col[],
  items: TakeoffItem[],
  totals: { taxRate?: number; sym: string; label: string }
): SheetSpec {
  const active = cols.filter((c) => !c.optional || items.some((it, i) => hasValue(c.get(it, i))));
  const n = active.length;
  const idxOf = (h: string) => active.findIndex((c) => c.header === h);
  const rows: CellInput[][] = [];
  const merges: NonNullable<SheetSpec["merges"]> = [];
  const heights: Record<number, number> = {};
  const fill = (cells: CellInput[], st: CellStyle) => {
    for (let c = 0; c < n; c++) if (cells[c] === undefined) cells[c] = { v: "", s: st };
    return cells;
  };

  const ts: CellStyle = { bold: true, fontSize: 14, color: C.white, fill: C.navy, align: "center", border: true };
  rows.push(fill([{ v: title, s: ts }], ts));
  merges.push({ r1: 0, c1: 0, r2: 0, c2: n - 1 });
  heights[0] = 28;
  if (infoLine) {
    const is: CellStyle = { align: "right", border: true, fill: C.light, wrap: true };
    rows.push(fill([{ v: infoLine, s: is }], is));
    merges.push({ r1: 1, c1: 0, r2: 1, c2: n - 1 });
    heights[1] = infoLine.length > 110 ? 32 : 20;
  }

  const hs: CellStyle = { bold: true, color: C.white, fill: C.blue, align: "center", border: true, wrap: true, valign: "center" };
  const headerRow = rows.length;
  rows.push(active.map((c) => ({ v: c.header, s: hs })));
  heights[headerRow] = 26;

  const qtyI = idxOf("الكمية");
  const priceI = idxOf(`سعر الوحدة (${totals.sym})`);
  const totI = idxOf(`الإجمالي (${totals.sym})`);
  const first = rows.length + 1;
  let sum = 0;
  items.forEach((item, i) => {
    const r = rows.length;
    const er = r + 1;
    const cells: CellInput[] = active.map((c) => {
      const v = c.get(item, i);
      const long = typeof v === "string" && v.length > c.width;
      return {
        v,
        s: {
          border: true,
          valign: "center" as const,
          wrap: c.kind === "text",
          align: c.kind === "text" ? ("right" as const) : ("center" as const),
          numFmt: c.kind === "money" ? MONEY : undefined,
        },
        ...(long ? {} : {}),
      } as CellInput;
    });
    if (qtyI >= 0 && priceI >= 0 && totI >= 0) {
      const qty = Number(((item.quantity as number) || 0).toFixed(2));
      const price = Number(((item.unitPrice as number) || 0).toFixed(2));
      const total = Number((qty * price).toFixed(2));
      sum += total;
      (cells[totI] as any).f = `ROUND(ROUND(${colLetter(qtyI)}${er}*${colLetter(priceI)}${er}*100,4),0)/100`;
      (cells[totI] as any).v = total;
    }
    const descLen = Math.max(...active.map((c, k) => (c.kind === "text" ? String(c.get(item, i) ?? "").length / Math.max(8, c.width) : 0)));
    if (descLen > 1) heights[r] = 15 * Math.ceil(descLen) + 3;
    rows.push(cells);
  });
  const last = rows.length;

  if (totI >= 0 && items.length) {
    sum = Number(sum.toFixed(2));
    const tax = totals.taxRate ? Number(((sum * totals.taxRate) / 100).toFixed(2)) : 0;
    const grand = Number((sum + tax).toFixed(2));
    const totalStyle: CellStyle = { bold: true, fill: C.light, border: true, numFmt: MONEY, align: "center" };
    const labelStyle: CellStyle = { ...totalStyle, numFmt: undefined, align: "right" };
    const addRow = (label: string, v: number, f: string, st: CellStyle, ls: CellStyle, h?: number) => {
      const r = rows.length;
      const cells: CellInput[] = [{ v: label, s: ls }];
      for (let c = 1; c < totI; c++) cells[c] = { v: "", s: ls };
      cells[totI] = { v, f, s: st };
      rows.push(cells);
      if (totI > 0) merges.push({ r1: r, c1: 0, r2: r, c2: totI - 1 });
      if (h) heights[r] = h;
      return r + 1;
    };
    const T = colLetter(totI);
    const subR = addRow(totals.label, sum, `ROUND(SUM(${T}${first}:${T}${last}),2)`, totalStyle, labelStyle);
    if (totals.taxRate) {
      const taxR = addRow(`ضريبة القيمة المضافة (${totals.taxRate}%)`, tax, `ROUND(ROUND(${T}${subR}*${totals.taxRate},4),0)/100`, totalStyle, labelStyle);
      const gs: CellStyle = { ...totalStyle, color: C.gold, fill: C.black, fontSize: 12 };
      addRow("الإجمالي شامل الضريبة", grand, `ROUND(${T}${subR}+${T}${taxR},2)`, gs, { ...gs, numFmt: undefined, align: "right" }, 24);
    }
  }

  return {
    name,
    rows,
    merges,
    colWidths: active.map((c) => c.width),
    rtl: true,
    freezeRows: headerRow + 1,
    filter: items.length > 1 ? { headerRow, lastRow: last - 1 } : undefined,
    landscape: n > 7,
    rowHeights: heights,
  };
}

export function buildBoqWorkbookBytes(
  metadata: ProjectMetadata,
  sheets: BlueprintSheet[],
  allItems: TakeoffItem[],
  company: CompanyProfile = EMPTY_COMPANY_PROFILE
): Uint8Array {
  // Same population as the on-screen totals: rejected lines never reach a file.
  const takeoffItems = allItems.filter(isExportable);
  const used = new Set<string>();
  const qm = defaultQuotationMeta(metadata, company);
  const specs: SheetSpec[] = [];
  const sym = metadata.currencySymbol;

  specs.push(
    buildQuotationSheetSpec(metadata, company, takeoffItems, qm, uniqueSheetName(QUOTATION_LABELS[qm.lang].sheetName, used))
  );

  const infoLine = [
    metadata.projectName && `المشروع: ${metadata.projectName}`,
    metadata.projectCode && `الكود: ${metadata.projectCode}`,
    metadata.clientName && `العميل: ${metadata.clientName}`,
    metadata.consultantName && `الاستشاري: ${metadata.consultantName}`,
    metadata.date && `التاريخ: ${metadata.date}`,
  ]
    .filter(Boolean)
    .join("   |   ");

  const pending = takeoffItems.some((i) => !(i.reviewStatus === "approved" || i.isVerified));
  const sheetOf = (item: TakeoffItem) => sheets.find((s) => s.id === item.sheetId);
  const q2 = (n: unknown) => Number((Number(n || 0)).toFixed(2));

  // Detailed table across all drawings (execution order).
  const ordered = sortItemsBySiteExecutionOrder(takeoffItems);
  const master: Col[] = [
    { header: "م", width: 6, kind: "num", get: (_i, k) => k + 1 },
    { header: "اللوحة", width: 12, kind: "text", optional: true, get: (i) => sheetOf(i)?.code || i.sheetCode || "" },
    { header: "تصنيف الأعمال", width: 24, kind: "text", get: (i) => i.category || "" },
    { header: "وصف البند والمواصفات", width: 46, kind: "text", get: (i) => i.description || "" },
    { header: "الموقع / المحاور", width: 18, kind: "text", optional: true, get: (i) => i.location || "" },
    { header: "معادلة الحساب", width: 24, kind: "text", optional: true, get: (i) => i.formula || "" },
    { header: "الخصومات", width: 10, kind: "num", optional: true, get: (i) => i.deduction || 0 },
    { header: "الكمية", width: 12, kind: "money", get: (i) => q2(i.quantity) },
    { header: "الوحدة", width: 9, kind: "text", get: (i) => i.unit || "" },
    { header: `سعر الوحدة (${sym})`, width: 14, kind: "money", get: (i) => q2(i.unitPrice) },
    { header: `الإجمالي (${sym})`, width: 16, kind: "money", get: (i) => q2(q2(i.quantity) * q2(i.unitPrice)) },
    { header: "المصدر", width: 18, kind: "text", optional: true, get: (i) => sourceLabel(i) },
    { header: "المراجعة", width: 12, kind: "text", optional: true, get: (i) => (pending ? (i.reviewStatus === "approved" || i.isVerified ? "معتمد" : "قيد المراجعة") : "") },
    { header: "ملاحظات", width: 28, kind: "text", optional: true, get: (i) => i.notes || "" },
  ];
  specs.push(
    dynamicTableSheet(uniqueSheetName("جدول الكميات", used), "جدول الكميات التفصيلي", infoLine, master, ordered, {
      taxRate: metadata.taxRate,
      sym,
      label: "الإجمالي قبل الضريبة",
    })
  );


  // Summary of drawings: one line per sheet.
  {
    const hs: CellStyle = { bold: true, color: C.white, fill: C.blue, align: "center", border: true, wrap: true };
    const cs: CellStyle = { border: true, align: "center" };
    const ts: CellStyle = { border: true, align: "right", wrap: true };
    const head: CellInput[] = ["اللوحة", "العنوان", "التخصص", "عدد البنود", "بنود قيد المراجعة", `الإجمالي (${sym})`].map((v) => ({ v, s: hs }));
    const body: CellInput[][] = sheets
      .map((sh) => {
        const its = takeoffItems.filter((i) => i.sheetId === sh.id);
        if (!its.length) return null;
        const pend = its.filter((i) => !(i.reviewStatus === "approved" || i.isVerified)).length;
        const tot = its.reduce((a, i) => a + q2(q2(i.quantity) * q2(i.unitPrice)), 0);
        return [{ v: sh.code, s: cs }, { v: sh.title, s: ts }, { v: sh.discipline, s: cs }, { v: its.length, s: cs }, { v: pend, s: cs }, { v: q2(tot), s: { ...cs, numFmt: MONEY } }] as CellInput[];
      })
      .filter(Boolean) as CellInput[][];
    if (body.length > 1) {
      specs.push({ name: uniqueSheetName("ملخص اللوحات", used), rows: [head, ...body], colWidths: [12, 40, 18, 12, 16, 18], rtl: true, freezeRows: 1 });
    }
  }

  // Unified table of marks written on the drawings (never summed across sheets).
  {
    const { rows: mrows, codes } = buildMarksTable(sheets);
    if (mrows.length) {
      const hs: CellStyle = { bold: true, color: C.white, fill: C.blue, align: "center", border: true, wrap: true };
      const cs: CellStyle = { border: true, align: "center" };
      const ws: CellStyle = { border: true, align: "right", wrap: true, fill: C.warn };
      const head: CellInput[] = ["النوع", "العلامة", ...codes, "الأرجح", "تنبيه"].map((v) => ({ v, s: hs }));
      const body: CellInput[][] = mrows.map((r) => [
        { v: r.kind, s: cs }, { v: r.label, s: cs },
        ...codes.map((c) => ({ v: r.perSheet[c] ?? "", s: cs })),
        { v: r.best, s: { ...cs, bold: true } },
        { v: r.warning, s: r.warning ? ws : { border: true, align: "right" as const } },
      ]);
      specs.push({
        name: uniqueSheetName("جدول العلامات", used),
        rows: [head, ...body],
        colWidths: [10, 26, ...codes.map(() => 11), 10, 48],
        rtl: true,
        freezeRows: 1,
        filter: { headerRow: 0, lastRow: body.length },
      });
    }
  }

  // One compact sheet per drawing.
  sheets.forEach((sheet) => {
    const sheetItems = takeoffItems.filter((i) => i.sheetId === sheet.id);
    if (sheetItems.length === 0) return;
    const per: Col[] = [
      { header: "م", width: 6, kind: "num", get: (_i, k) => k + 1 },
      { header: "تصنيف الأعمال", width: 22, kind: "text", get: (i) => i.category || "" },
      { header: "وصف البند والمواصفة", width: 44, kind: "text", get: (i) => i.description || "" },
      { header: "الموقع والمحاور", width: 18, kind: "text", optional: true, get: (i) => i.location || "" },
      { header: "العدد", width: 8, kind: "num", optional: true, get: (i) => (i.count && i.count !== 1 ? i.count : "") },
      { header: "الطول (م)", width: 10, kind: "money", optional: true, get: (i) => i.length ?? "" },
      { header: "العرض (م)", width: 10, kind: "money", optional: true, get: (i) => i.width ?? "" },
      { header: "الارتفاع (م)", width: 11, kind: "money", optional: true, get: (i) => i.height ?? "" },
      { header: "معادلة الحساب", width: 24, kind: "text", optional: true, get: (i) => i.formula || "" },
      { header: "الخصم", width: 9, kind: "num", optional: true, get: (i) => i.deduction || 0 },
      { header: "الكمية", width: 12, kind: "money", get: (i) => q2(i.quantity) },
      { header: "الوحدة", width: 9, kind: "text", get: (i) => i.unit || "" },
      { header: `سعر الوحدة (${sym})`, width: 14, kind: "money", get: (i) => q2(i.unitPrice) },
      { header: `الإجمالي (${sym})`, width: 16, kind: "money", get: (i) => q2(q2(i.quantity) * q2(i.unitPrice)) },
      { header: "ملاحظات", width: 26, kind: "text", optional: true, get: (i) => [i.extractionSource === "cad_geometry" ? `[CAD: ${i.sourceDetails?.layer || "Geometry"}]` : "", i.notes || ""].filter(Boolean).join(" ") },
    ];
    specs.push(
      dynamicTableSheet(
        uniqueSheetName(`${sheet.code} ${sheet.discipline}`, used),
        `${sheet.code} - ${sheet.title}`,
        [`التخصص: ${sheet.discipline}`, sheet.scale && `المقياس: ${sheet.scale}`, sheet.fileName && `الملف: ${sheet.fileName}`].filter(Boolean).join("   |   "),
        per,
        sheetItems,
        { sym, label: "إجمالي اللوحة" }
      )
    );
  });

  return buildXlsx(specs);
}

export function exportBoqToExcel(
  metadata: ProjectMetadata,
  sheets: BlueprintSheet[],
  allItems: TakeoffItem[],
  company: CompanyProfile = EMPTY_COMPANY_PROFILE
) {
  if (!allItems.some(isExportable)) {
    window.alert("لا توجد بنود حصر لتصديرها. أضف الكميات أو اقرأ اللوحات أولاً، ثم أعد تصدير Excel.");
    return;
  }
  downloadXlsx(
    buildBoqWorkbookBytes(metadata, sheets, allItems, company),
    `${safeFileName(`BOQ_${metadata.projectCode || metadata.projectName}`)}_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export function exportBoqToCsv(metadata: ProjectMetadata, sheets: BlueprintSheet[], allItems: TakeoffItem[]) {
  const header = [
    "كود البند", "رمز المخطط", "اسم المخطط", "التخصص", "نوع القياس", "التصنيف", "الوصف الهندسي", "الموقع",
    "معادلة الحساب", "الخصم", "الكمية الصافية", "الوحدة", "سعر الوحدة", "الإجمالي", "مصدر الحصر", "ملاحظات",
  ].map(csvText);
  const lines: string[] = [header.join(",")];

  sortItemsBySiteExecutionOrder(allItems.filter(isExportable)).forEach((item) => {
    const sheet = sheets.find((s) => s.id === item.sheetId);
    const qty = item.quantity || 0;
    const price = item.unitPrice || 0;
    lines.push(
      [
        csvText(item.itemCode),
        csvText(sheet?.code || item.sheetCode),
        csvText(sheet?.title),
        csvText(sheet?.discipline),
        csvText(dimName(item.dimensionType)),
        csvText(item.category),
        csvText(item.description),
        csvText(item.location),
        csvText(item.formula),
        String(item.deduction || 0),
        String(qty),
        csvText(item.unit),
        String(price),
        String(Number((qty * price).toFixed(2))),
        csvText(sourceLabel(item)),
        csvText(item.notes),
      ].join(",")
    );
  });

  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${safeFileName(`BOQ_${metadata.projectCode || metadata.projectName}`)}.csv`);
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/** Parses "1,250.50", "١٢٣٫٥", " 45 " … ; returns NaN when the cell is not numeric. */
export function parseLocaleNumber(value: unknown): number {
  if (typeof value === "number") return value;
  let s = String(value ?? "").trim();
  if (!s) return 0;
  s = s.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d);
  s = s.replace(/٫/g, ".").replace(/[٬,\s]/g, "");
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

export function normalizeUnit(raw: string): string {
  const u = (raw || "").trim().replace(/\s+/g, "").toLowerCase();
  if (!u) return "عدد";
  if (["م3", "م³", "m3", "m³", "مترمكعب"].includes(u)) return "م³";
  if (["م2", "م²", "m2", "m²", "مترمربع", "متر²"].includes(u)) return "م²";
  if (["م.ط", "مط", "م/ط", "m", "lm", "متر", "مترطولي"].includes(u)) return "م.ط";
  if (["طن", "ton", "tons", "t"].includes(u)) return "طن";
  if (["كجم", "كغ", "kg"].includes(u)) return "كجم";
  if (["عدد", "no", "nos", "ea", "pcs", "قطعة"].includes(u)) return "عدد";
  return raw.trim();
}

export function parseBoqRowsToItems(rows: any[][], activeSheet: BlueprintSheet): TakeoffItem[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  let headerIdx = -1;
  let colDesc = -1, colUnit = -1, colQty = -1, colPrice = -1, colCode = -1, colCat = -1;

  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    row.forEach((cell, cIdx) => {
      const s = String(cell ?? "").trim().toLowerCase();
      if (!s) return;
      if (colDesc === -1 && (s === "البند" || s === "البيان" || s.includes("وصف البند") || s.includes("الوصف") || s.includes("description") || s === "item")) {
        colDesc = cIdx;
      } else if (colUnit === -1 && (s.includes("الوحدة") || s === "unit")) {
        colUnit = cIdx;
      } else if (colQty === -1 && (s.includes("الكمية") || s.includes("qty") || s.includes("quantity"))) {
        colQty = cIdx;
      } else if (colPrice === -1 && (s.includes("سعر الوحدة") || s.includes("السعر") || s.includes("unit price") || s === "rate" || s === "price")) {
        colPrice = cIdx;
      } else if (colCode === -1 && (s.includes("كود") || s.includes("الرمز") || s === "code" || s === "item code")) {
        colCode = cIdx;
      } else if (colCat === -1 && (s.includes("التصنيف") || s.includes("category"))) {
        colCat = cIdx;
      }
    });
    if (colDesc !== -1 && (colQty !== -1 || colUnit !== -1)) {
      headerIdx = r;
      break;
    }
    colDesc = colUnit = colQty = colPrice = colCode = colCat = -1;
  }

  const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
  if (colDesc === -1) {
    // No header: 5-column layout (description, unit, qty, price, total) or 6-column with a leading "#" column.
    const first = rows.find((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
    const shift = first && Number.isFinite(parseLocaleNumber(first[0])) && String(first[0] ?? "").trim() !== "" ? 1 : 0;
    colDesc = shift;
    colUnit = shift + 1;
    colQty = shift + 2;
    colPrice = shift + 3;
  }

  const now = new Date().toISOString();
  const items: TakeoffItem[] = [];
  const stamp = Date.now();

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const desc = String(row[colDesc] ?? "").trim();
    if (!desc) continue;

    const lower = desc.toLowerCase();
    if (
      lower.startsWith("الإجمالي") || lower.startsWith("الاجمالي") || lower.includes("ضريبة القيمة المضافة") ||
      lower.startsWith("total") || lower.startsWith("subtotal") || lower === "vat" || lower.startsWith("grand total") ||
      lower.startsWith("sub-total")
    ) {
      continue;
    }

    const rawQty = colQty >= 0 ? parseLocaleNumber(row[colQty]) : 0;
    const rawPrice = colPrice >= 0 ? parseLocaleNumber(row[colPrice]) : 0;
    // A row whose quantity cell is non-numeric text is a section title / note, not a BOQ line.
    if (colQty >= 0 && Number.isNaN(rawQty)) continue;
    const qty = Number(rawQty.toFixed(3));
    const price = Number.isFinite(rawPrice) ? Math.max(0, Number(rawPrice.toFixed(2))) : 0;
    const unit = normalizeUnit(colUnit >= 0 ? String(row[colUnit] ?? "") : "");
    const code = colCode >= 0 && row[colCode] ? String(row[colCode]).trim() : `XLS-${items.length + 1}`;
    const cat = colCat >= 0 && row[colCat] ? String(row[colCat]).trim() : "أعمال متنوعة أخرى";
    const dimType = unit === "م³" ? "volume" : unit === "م²" ? "area" : unit === "م.ط" ? "linear" : "count";

    items.push({
      id: `item-xls-${stamp}-${r}`,
      sheetId: activeSheet.id,
      sheetCode: activeSheet.code,
      sheetTitle: activeSheet.title,
      itemCode: code,
      description: desc,
      category: cat,
      dimensionType: dimType,
      location: activeSheet.title,
      count: 1,
      quantity: qty,
      unit,
      unitPrice: price,
      totalPrice: Number((qty * price).toFixed(2)),
      extractionSource: "excel_import",
      reviewStatus: "needs_review",
      sourceEvidence: "مستورد من ملف Excel خارجي",
      auditLog: [{ timestamp: now, action: "استيراد بند من Excel", newQty: qty, status: "needs_review" }],
    });
  }

  return items;
}

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

export async function importBoqFromExcel(file: File, activeSheet: BlueprintSheet): Promise<TakeoffItem[]> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("الملف كبير جداً (الحد الأقصى 15 ميجابايت).");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[firstSheetName], { header: 1, defval: "" });
  return parseBoqRowsToItems(rows, activeSheet);
}
