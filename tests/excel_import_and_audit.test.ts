import { strict as assert } from "node:assert";
import { parseBoqRowsToItems } from "../src/utils/boqExporter";
import { BlueprintSheet } from "../src/types";

const mockSheet: BlueprintSheet = {
  id: "s-xls",
  code: "BOQ-01",
  title: "جدول مناقصة مستورد",
  discipline: "إنشائي",
  fileType: "pdf",
  fileName: "tender.xlsx",
  scale: "1:100",
  status: "new",
  measurementPins: [],
  createdAt: new Date().toISOString(),
};

const quotationExcelRows = [
  ["عرض سعر"],
  ["المشروع:", "مستودع تجريبي"],
  [],
  ["البند", "الوحدة", "الكمية", "سعر الوحدة (ر.س)", "الإجمالي (ر.س)"],
  ["خرسانة مسلحة للقواعد", "م³", 45.5, 420, 19110],
  ["توريد وتركيب شينكو سقف 5 سم", "م²", 600, 95, 57000],
  [],
  ["الإجمالي قبل الضريبة", "", "", "", 76110],
  ["ضريبة القيمة المضافة (15%)", "", "", "", 11416.5],
];

const imported = parseBoqRowsToItems(quotationExcelRows, mockSheet);
assert.equal(imported.length, 2, "Should import 2 items and skip summary/VAT rows");
assert.equal(imported[0].quantity, 45.5);
assert.equal(imported[0].unit, "م³");
assert.equal(imported[0].reviewStatus, "needs_review");
assert.equal(imported[0].extractionSource, "excel_import");
assert.ok(imported[0].auditLog && imported[0].auditLog.length === 1, "Audit log should record import");
assert.equal(imported[1].totalPrice, 57000);

console.log("PASS [excel_import_and_audit]: Imported 2 quotation rows cleanly, skipped VAT/totals, recorded auditLog.");
