import * as XLSX from "xlsx";
import { buildXlsx, CellInput, CellStyle, downloadXlsx, SheetSpec } from "./xlsxWriter";
import { BlueprintSheet, CompanyProfile, EMPTY_COMPANY_PROFILE, ProjectMetadata, TakeoffItem } from "../types";
import { getSiteExecutionRank, sortItemsBySiteExecutionOrder } from "./executionOrder";
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
      return "بحث بصري محلي";
    case "manual_pin":
      return "قياس مباشر على المخطط";
    case "excel_import":
      return "مستورد من Excel";
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

  const companyName = (meta.lang === "en" ? company.nameEn || company.name : company.name || company.nameEn) || "";
  const titleStyle: CellStyle = { bold: true, fontSize: 16, color: C.white, fill: C.navy, align: "center", border: true };
  rows.push(fillRow([{ v: [companyName, L.title].filter(Boolean).join(" — "), s: titleStyle }], titleStyle, 1));
  mergeRow(0, 0, 5);
  heights[0] = 30;

  const info: [string, string][] = [
    [L.number, meta.number],
    [L.date, metadata.date],
    [L.to, metadata.clientName],
    [L.project, metadata.projectName],
  ];
  if (meta.subject) info.push([L.subject, meta.subject]);
  info.push([L.validity, `${meta.validityDays} ${L.days}`]);
  if (company.taxNumber) info.push([L.taxNumber, company.taxNumber]);
  info.forEach(([k, v]) => {
    const r = rows.length;
    const vs: CellStyle = { align: meta.lang === "ar" ? "right" : "left", border: true };
    rows.push(fillRow([{ v: k, s: { bold: true, fill: C.light, border: true, align: "center" } }, { v, s: vs }], vs, 2));
    mergeRow(r, 1, 5);
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

function tableSheet(
  name: string,
  headRows: CellInput[][],
  header: string[],
  body: CellInput[][],
  footer: CellInput[][],
  widths: number[],
  numericCols: number[],
  moneyCols: number[]
): SheetSpec {
  const hs: CellStyle = { bold: true, color: C.white, fill: C.blue, align: "center", border: true, wrap: true };
  const rows: CellInput[][] = [];
  headRows.forEach((r) => rows.push(r.map((v) => (v === "" || v == null ? null : typeof v === "object" ? v : { v, s: { bold: true } }))));
  const headerIdx = rows.length;
  rows.push(header.map((v) => ({ v, s: hs })));
  body.forEach((row) =>
    rows.push(
      row.map((v, c) => ({
        v: v as string | number,
        s: {
          border: true,
          valign: "center" as const,
          wrap: typeof v === "string" && v.length > 28,
          align: numericCols.includes(c) ? ("center" as const) : undefined,
          numFmt: moneyCols.includes(c) ? MONEY : undefined,
        },
      }))
    )
  );
  footer.forEach((row) => rows.push(row));
  return { name, rows, colWidths: widths, rtl: true, freezeRows: headerIdx + 1, landscape: true, rowHeights: { [headerIdx]: 28 } };
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
  const contractor = metadata.contractorName || company.name || "";
  const specs: SheetSpec[] = [];

  specs.push(
    buildQuotationSheetSpec(metadata, company, takeoffItems, qm, uniqueSheetName(QUOTATION_LABELS[qm.lang].sheetName, used))
  );

  const totalStyle: CellStyle = { bold: true, fill: C.light, border: true, numFmt: MONEY, align: "center" };
  const ordered = sortItemsBySiteExecutionOrder(takeoffItems);
  const masterBody: CellInput[][] = [];
  let subtotalCost = 0;
  ordered.forEach((item, i) => {
    const parentSheet = sheets.find((s) => s.id === item.sheetId);
    const qty = Number((item.quantity || 0).toFixed(2));
    const price = Number((item.unitPrice || 0).toFixed(2));
    const itemTotal = Number((qty * price).toFixed(2));
    subtotalCost += itemTotal;
    masterBody.push([
      i + 1,
      item.itemCode || "",
      parentSheet?.code || item.sheetCode || "",
      parentSheet?.title || "لوحة عامة",
      parentSheet?.discipline || "",
      dimName(item.dimensionType),
      item.category || "",
      item.description || "",
      item.location || "",
      item.formula || "",
      item.deduction || 0,
      qty,
      item.unit || "",
      price,
      itemTotal,
      sourceLabel(item),
      item.reviewStatus === "approved" || item.isVerified ? "معتمد" : "قيد المراجعة",
      item.notes || "",
    ]);
  });
  subtotalCost = Number(subtotalCost.toFixed(2));
  const taxAmount = Number(((subtotalCost * metadata.taxRate) / 100).toFixed(2));
  const grand = Number((subtotalCost + taxAmount).toFixed(2));
  const first = 6; // header is on row 5
  const lastRow = first + masterBody.length - 1;
  const pad = (label: string, v: number, f?: string, st: CellStyle = totalStyle): CellInput[] => {
    const r: CellInput[] = Array(18).fill(null);
    r[13] = { v: label, s: { ...st, numFmt: undefined } };
    r[14] = { v, f, s: st };
    return r;
  };
  const sumRow = first + masterBody.length;
  specs.push(
    tableSheet(
      uniqueSheetName("جدول الكميات العام", used),
      [
        ["مشروع:", metadata.projectName, "", "كود المشروع:", metadata.projectCode],
        ["المالك / العميل:", metadata.clientName, "", "الاستشاري:", metadata.consultantName],
        ["المقاول العام:", contractor, "", "التاريخ:", metadata.date],
        ["العملة:", metadata.currencySymbol, "", "معدل الضريبة:", `${metadata.taxRate}%`],
      ],
      [
        "م", "كود البند", "رمز اللوحة", "اسم المخطط الهندسي", "التخصص", "نوع القياس الهندسي", "تصنيف الأعمال",
        "وصف البند والمواصفات الفنية", "الموقع / المحاور", "معادلة الحساب", "الخصومات", "الكمية الصافية", "الوحدة",
        `سعر الوحدة (${metadata.currencySymbol})`, `الإجمالي (${metadata.currencySymbol})`, "مصدر الحصر", "حالة المراجعة", "ملاحظات هندسية",
      ],
      masterBody,
      [
        pad("الإجمالي قبل الضريبة", subtotalCost, masterBody.length ? `ROUND(SUM(O${first}:O${lastRow}),2)` : undefined),
        pad(`ضريبة القيمة المضافة (${metadata.taxRate}%)`, taxAmount, `ROUND(ROUND(O${sumRow}*${metadata.taxRate},4),0)/100`),
        pad("الإجمالي العام النهائي", grand, `ROUND(O${sumRow}+O${sumRow + 1},2)`, { ...totalStyle, color: C.gold, fill: C.black }),
      ],
      [6, 14, 12, 22, 14, 16, 22, 50, 20, 24, 10, 14, 10, 14, 16, 16, 14, 30],
      [0, 10, 11, 13],
      [13, 14]
    )
  );

  sheets.forEach((sheet) => {
    const sheetItems = takeoffItems.filter((i) => i.sheetId === sheet.id);
    let sheetTotal = 0;
    const body: CellInput[][] = sheetItems.map((item, idx) => {
      const qty = Number((item.quantity || 0).toFixed(2));
      const price = Number((item.unitPrice || 0).toFixed(2));
      const total = Number((qty * price).toFixed(2));
      sheetTotal += total;
      return [
        idx + 1,
        item.itemCode || "",
        dimName(item.dimensionType),
        item.category || "",
        item.description || "",
        item.location || "",
        item.count || 1,
        item.length ?? "",
        item.width ?? "",
        item.height ?? "",
        item.formula || "",
        item.deduction || 0,
        qty,
        item.unit || "",
        price,
        total,
        [item.extractionSource === "cad_geometry" ? `[CAD: ${item.sourceDetails?.layer || "Geometry"}]` : "", item.notes || ""]
          .filter(Boolean)
          .join(" "),
      ];
    });
    const foot: CellInput[] = Array(17).fill(null);
    foot[14] = { v: "إجمالي كميات اللوحة", s: { ...totalStyle, numFmt: undefined } };
    foot[15] = { v: Number(sheetTotal.toFixed(2)), s: totalStyle };
    specs.push(
      tableSheet(
        uniqueSheetName(`${sheet.code} ${sheet.discipline}`, used),
        [
          ["المخطط الهندسي:", `${sheet.code} - ${sheet.title}`, "التخصص:", sheet.discipline, "مقياس الرسم:", sheet.scale],
          ["اسم الملف المصدري:", sheet.fileName, "تاريخ الحصر:", metadata.date],
        ],
        [
          "ت", "كود البند", "نوع القياس", "تصنيف الأعمال", "وصف البند والمواصفة الفنية", "الموقع والمحاور", "العدد", "الطول (م)",
          "العرض (م)", "الارتفاع/السمك (م)", "معادلة الحساب", "الخصم", "الكمية الصافية", "الوحدة",
          `سعر الوحدة (${metadata.currencySymbol})`, `الإجمالي (${metadata.currencySymbol})`, "الملاحظات ومصدر الحصر",
        ],
        body,
        [foot],
        [6, 14, 16, 22, 48, 20, 8, 11, 11, 14, 24, 9, 14, 10, 14, 16, 30],
        [0, 6, 7, 8, 9, 11, 12, 14, 15],
        [7, 8, 9, 11, 12, 14, 15]
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
