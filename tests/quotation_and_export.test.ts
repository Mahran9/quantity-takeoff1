import { strict as assert } from "node:assert";
import { buildQuotation, buildQuotationSheetData, QUOTATION_LABELS } from "../src/utils/quotation";
import { parseLocaleNumber, normalizeUnit, uniqueSheetName, safeFileName, parseBoqRowsToItems, getExportWarnings } from "../src/utils/boqExporter";
import { EMPTY_COMPANY_PROFILE, TakeoffItem, BlueprintSheet, ProjectMetadata } from "../src/types";

const mk = (over: Partial<TakeoffItem>): TakeoffItem => ({
  id: Math.random().toString(36).slice(2),
  sheetId: "s1",
  itemCode: "X",
  description: "بند",
  category: "أعمال خرسانية مسلحة وعادية",
  location: "",
  count: 1,
  quantity: 1,
  unit: "م³",
  unitPrice: 0,
  totalPrice: 0,
  ...over,
});

const items: TakeoffItem[] = [
  mk({ id: "a", itemCode: "EXC", description: "حفر وردم", category: "أعمال الحفر والردم والأساسات", quantity: 100, unitPrice: 10, reviewStatus: "approved" }),
  mk({ id: "b", description: "قواعد خرسانية", quantity: 10.005, unitPrice: 100.1 }),
  mk({ id: "c", description: "بند مرفوض", quantity: 5, unitPrice: 1000, reviewStatus: "rejected" }),
  mk({ id: "d", description: "دهان", category: "أعمال الدهانات والديكورات", quantity: 3, unitPrice: 0, unit: "م²" }),
];

// Rejected lines never reach totals; sections follow site order; sub-totals add up exactly.
const q = buildQuotation(items, 15);
assert.equal(q.itemCount, 3, "rejected item excluded");
assert.deepEqual(q.sections.map((s) => s.title), [
  "أعمال الحفر والردم والأساسات",
  "أعمال خرسانية مسلحة وعادية",
  "أعمال الدهانات والديكورات",
]);
assert.equal(q.sections[0].subtotal, 1000);
const concreteRow = q.sections[1].rows[0];
assert.equal(concreteRow.quantity, 10.01, "quantity rounded for display");
assert.equal(concreteRow.total, Number((10.01 * 100.1).toFixed(2)), "row total uses the rounded numbers that are printed");
assert.equal(q.subtotal, Number((q.sections.reduce((s, x) => s + x.subtotal, 0)).toFixed(2)));
assert.equal(q.tax, Number((q.subtotal * 0.15).toFixed(2)));
assert.equal(q.grandTotal, Number((q.subtotal + q.tax).toFixed(2)));
assert.equal(q.zeroPriceCount, 1);
assert.deepEqual(q.sections.flatMap((s) => s.rows.map((r) => r.index)), [1, 2, 3], "continuous numbering");

// Excel layout: 6 columns, no empty rows or columns.
const md: ProjectMetadata = { projectName: "P", projectCode: "C", clientName: "العميل", contractorName: "", consultantName: "", currency: "SAR", currencySymbol: "ر.س", date: "2026-01-01", taxRate: 15 };
const sheet = buildQuotationSheetData(q, md, { ...EMPTY_COMPANY_PROFILE, name: "شركة" }, { number: "QT-1", subject: "", validityDays: 30, lang: "ar" });
assert.ok(sheet.rows.every((r) => r.length === 6));
assert.ok(sheet.rows.every((r) => r.some((c) => String(c).trim() !== "")), "no empty rows");
for (let c = 0; c < 6; c++) assert.ok(sheet.rows.some((r) => String(r[c]).trim() !== ""), `column ${c} not empty`);
assert.equal(QUOTATION_LABELS.ar.index, "م");

// Helpers
assert.equal(parseLocaleNumber("١٢٣٫٥"), 123.5);
assert.equal(parseLocaleNumber("1,250.50"), 1250.5);
assert.ok(Number.isNaN(parseLocaleNumber("قسم")));
assert.equal(parseLocaleNumber(""), 0);
assert.equal(normalizeUnit("م2"), "م²");
assert.equal(normalizeUnit("m3"), "م³");
assert.equal(normalizeUnit(""), "عدد");
const used = new Set<string>();
assert.equal(uniqueSheetName("S-01 إنشائي", used), "S-01 إنشائي");
assert.equal(uniqueSheetName("S-01 إنشائي", used), "S-01 إنشائي (2)");
assert.equal(uniqueSheetName("S-01 إنشائي", used), "S-01 إنشائي (3)");
assert.ok(uniqueSheetName("x".repeat(60), new Set()).length <= 31);
assert.ok(!/[:\\/?*[\]]/.test(uniqueSheetName("a:b/c?d", new Set())));
assert.equal(safeFileName('a/b:c*"d'), "a_b_c__d");

// Import: 6-column quotation with section rows, Arabic digits, no header → section titles skipped.
const act = { id: "s", code: "S", title: "T", discipline: "إنشائي", fileType: "pdf", fileName: "f", scale: "1:100", status: "new", measurementPins: [], createdAt: "" } as BlueprintSheet;
const imported = parseBoqRowsToItems(
  [
    ["م", "البيان", "الوحدة", "الكمية", "سعر الوحدة", "الإجمالي"],
    ["أعمال خرسانية", "", "", "", "", ""],
    [1, "خرسانة", "م3", "١٠٫٥", "٢٠٠", 2100],
    ["", "الإجمالي الفرعي - أعمال خرسانية", "", "", "", 2100],
  ],
  act
);
assert.equal(imported.length, 1);
assert.equal(imported[0].quantity, 10.5);
assert.equal(imported[0].unit, "م³");
assert.equal(imported[0].unitPrice, 200);

// A text file read as a sheet (no header, no numbers) must not turn every line into an item.
const junk = parseBoqRowsToItems([["TABLE:  \"PROGRAM CONTROL\""], ["   ProgramName=SAFE   Version=21"], [""], ["TABLE:  \"POINTS\""]], act);
assert.equal(junk.length, 0, "text lines are not BOQ items");

const w = getExportWarnings(items);
assert.deepEqual([w.rejectedExcluded, w.zeroPrice], [1, 1]);

console.log("PASS [quotation_and_export]: sections/subtotals consistent, rejected excluded, no empty rows/cols, helpers & import hardened.");

// Half-cent rounding must match Excel (311.775 -> 311.78).
import { round2 } from "../src/utils/quotation";
assert.equal(round2(2078.5 * 15 / 100), 311.78);
assert.equal(round2(1.005), 1.01);
assert.equal(round2(-0.004), -0);
