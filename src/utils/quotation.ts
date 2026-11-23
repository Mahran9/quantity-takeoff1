import { CompanyProfile, ProjectMetadata, TakeoffItem } from "../types";
import { getSiteExecutionRank } from "./executionOrder";

/**
 * Pure quotation model: groups priced items into trade sections with sub-totals,
 * so the on-screen table, the printed PDF and the Excel file always show identical numbers.
 */

export type QuotationLang = "ar" | "en";

export interface QuotationRow {
  id: string;
  index: number;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface QuotationSection {
  title: string;
  rows: QuotationRow[];
  subtotal: number;
}

export interface QuotationData {
  sections: QuotationSection[];
  subtotal: number;
  taxRate: number;
  tax: number;
  grandTotal: number;
  itemCount: number;
  zeroPriceCount: number;
  pendingCount: number;
}

// Half-cent safe: (2078.5*15/100 = 311.775) must round to 311.78 like Excel does, not 311.77.
export const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

export function isExportable(item: TakeoffItem): boolean {
  return item.reviewStatus !== "rejected";
}

export function buildQuotation(items: TakeoffItem[], taxRate: number): QuotationData {
  const live = items.filter(isExportable);
  const groups = new Map<string, { rank: number; items: { item: TakeoffItem; order: number }[] }>();

  live.forEach((item, order) => {
    const key = item.category || "أعمال متنوعة أخرى";
    const rank = getSiteExecutionRank(item);
    const g = groups.get(key);
    if (g) {
      g.rank = Math.min(g.rank, rank);
      g.items.push({ item, order });
    } else {
      groups.set(key, { rank, items: [{ item, order }] });
    }
  });

  const ordered = [...groups.entries()].sort((a, b) => a[1].rank - b[1].rank);
  let counter = 0;
  let subtotal = 0;
  const sections: QuotationSection[] = ordered.map(([title, g]) => {
    const sorted = [...g.items].sort(
      (a, b) => getSiteExecutionRank(a.item) - getSiteExecutionRank(b.item) || a.order - b.order
    );
    const rows: QuotationRow[] = sorted.map(({ item }) => {
      const quantity = round2(item.quantity || 0);
      const unitPrice = round2(item.unitPrice || 0);
      return {
        id: item.id,
        index: ++counter,
        description: item.description || item.itemCode || "—",
        unit: item.unit || "",
        quantity,
        unitPrice,
        total: round2(quantity * unitPrice),
      };
    });
    const sectionSubtotal = round2(rows.reduce((s, r) => s + r.total, 0));
    subtotal += sectionSubtotal;
    return { title, rows, subtotal: sectionSubtotal };
  });

  subtotal = round2(subtotal);
  const safeRate = Number.isFinite(taxRate) ? Math.max(0, taxRate) : 0;
  const tax = round2((subtotal * safeRate) / 100);
  return {
    sections,
    subtotal,
    taxRate: safeRate,
    tax,
    grandTotal: round2(subtotal + tax),
    itemCount: counter,
    zeroPriceCount: live.filter((i) => !(i.unitPrice > 0)).length,
    pendingCount: live.filter((i) => i.reviewStatus !== "approved" && !i.isVerified).length,
  };
}

export const QUOTATION_LABELS: Record<QuotationLang, Record<string, string>> = {
  ar: {
    title: "عرض سعر",
    number: "رقم العرض",
    date: "التاريخ",
    to: "إلى السادة",
    project: "المشروع",
    subject: "الموضوع",
    validity: "صلاحية العرض",
    days: "يوم",
    index: "م",
    description: "البيان",
    unit: "الوحدة",
    quantity: "الكمية",
    unitPrice: "سعر الوحدة",
    total: "الإجمالي",
    sectionSubtotal: "الإجمالي الفرعي",
    subtotal: "إجمالي قيمة الأعمال",
    vat: "ضريبة القيمة المضافة",
    grandTotal: "الإجمالي الكلي شامل الضريبة",
    terms: "الشروط والأحكام",
    signature: "التوقيع والختم",
    taxNumber: "الرقم الضريبي",
    crNumber: "السجل التجاري",
    sheetName: "عرض السعر",
    respectfully: "المحترمين",
  },
  en: {
    title: "Quotation",
    number: "Quotation No.",
    date: "Date",
    to: "To",
    project: "Project",
    subject: "Subject",
    validity: "Validity",
    days: "days",
    index: "#",
    description: "Description",
    unit: "Unit",
    quantity: "Qty",
    unitPrice: "Unit price",
    total: "Total",
    sectionSubtotal: "Sub-total",
    subtotal: "Total works value",
    vat: "VAT",
    grandTotal: "Grand total incl. VAT",
    terms: "Terms & conditions",
    signature: "Signature & stamp",
    taxNumber: "VAT No.",
    crNumber: "C.R. No.",
    sheetName: "Quotation",
    respectfully: "",
  },
};

export interface QuotationMeta {
  number: string;
  subject: string;
  validityDays: number;
  lang: QuotationLang;
}

/** Excel layout: no empty rows, merged section/summary labels, 6 columns. */
export function buildQuotationSheetData(
  data: QuotationData,
  metadata: ProjectMetadata,
  company: CompanyProfile,
  meta: QuotationMeta
): { rows: (string | number)[][]; merges: { s: { r: number; c: number }; e: { r: number; c: number } }[]; moneyCells: [number, number][] } {
  const L = QUOTATION_LABELS[meta.lang];
  const sym = metadata.currencySymbol;
  const rows: (string | number)[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const moneyCells: [number, number][] = [];
  const mergeRow = (r: number, c1: number, c2: number) => merges.push({ s: { r, c: c1 }, e: { r, c: c2 } });
  const companyName = (meta.lang === "en" ? company.nameEn || company.name : company.name || company.nameEn) || "";

  rows.push([[companyName, L.title].filter(Boolean).join(" — "), "", "", "", "", ""]);
  mergeRow(0, 0, 5);

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
    rows.push([k, v, "", "", "", ""]);
    mergeRow(r, 1, 5);
  });

  rows.push([L.index, L.description, L.unit, L.quantity, `${L.unitPrice} (${sym})`, `${L.total} (${sym})`]);

  data.sections.forEach((section) => {
    let r = rows.length;
    rows.push([section.title, "", "", "", "", ""]);
    mergeRow(r, 0, 5);
    section.rows.forEach((row) => {
      r = rows.length;
      rows.push([row.index, row.description, row.unit, row.quantity, row.unitPrice, row.total]);
      moneyCells.push([r, 3], [r, 4], [r, 5]);
    });
    r = rows.length;
    rows.push([`${L.sectionSubtotal} - ${section.title}`, "", "", "", "", section.subtotal]);
    mergeRow(r, 0, 4);
    moneyCells.push([r, 5]);
  });

  const summary: [string, number][] = [
    [L.subtotal, data.subtotal],
    [`${L.vat} (${data.taxRate}%)`, data.tax],
    [L.grandTotal, data.grandTotal],
  ];
  summary.forEach(([label, value]) => {
    const r = rows.length;
    rows.push([label, "", "", "", "", value]);
    mergeRow(r, 0, 4);
    moneyCells.push([r, 5]);
  });

  return { rows, merges, moneyCells };
}
