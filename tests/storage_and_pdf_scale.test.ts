import { strict as assert } from "node:assert";
import { normalizeProjectRecord } from "../src/utils/projectStorage";
import { computeSafeRenderScale } from "../src/utils/pdfText";

const base = {
  id: "orig",
  metadata: { projectName: "P", taxRate: "15", currency: "XXX" },
  sheets: [{ id: "s1", code: "S", measurementPins: undefined }],
  takeoffItems: [
    { id: "i1", sheetId: "s1", quantity: "4", unitPrice: -5, description: 7 },
    { id: "i2", sheetId: "ghost", quantity: 1, unitPrice: 1 },
    { nope: true },
  ],
};
const rec = normalizeProjectRecord(base, "new-id");
assert.equal(rec.id, "new-id");
assert.equal(rec.metadata.taxRate, 15);
assert.equal(rec.metadata.currency, "SAR");
assert.equal(rec.takeoffItems.length, 1, "orphan and malformed items dropped");
assert.equal(rec.takeoffItems[0].unitPrice, 0, "negative price clamped");
assert.equal(rec.takeoffItems[0].description, "7");
assert.deepEqual(rec.sheets[0].measurementPins, []);
assert.throws(() => normalizeProjectRecord({ metadata: {}, sheets: {} }), /غير صالح|لا يحتوي/);
assert.throws(() => normalizeProjectRecord({ ...base, schemaVersion: 99 }), /أحدث/);
assert.throws(() => normalizeProjectRecord(null));

// A0 sheet (2384×3370 pt) at 2× would be ~32M px: must be capped for mobile canvases.
const s = computeSafeRenderScale(2384, 3370, 2);
assert.ok(s < 2 && 2384 * s * 3370 * s <= 14_000_001 && 3370 * s <= 4096);
assert.equal(computeSafeRenderScale(595, 842, 2), 2, "A4 keeps requested scale");

console.log("PASS [storage_and_pdf_scale]: import validation + mobile-safe PDF scale.");
