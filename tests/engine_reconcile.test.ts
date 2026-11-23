import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractLabelledQuantities } from "../src/utils/ocrLabels";
import { reconcile } from "../src/engine/reconcile";
import { fromOcr } from "../src/engine/readers";
import { Candidate } from "../src/engine/candidate";
const here = path.dirname(fileURLToPath(import.meta.url));
const rd = (n: string) => fs.readFileSync(path.join(here, "fixtures/ocr", n), "utf8");

// Real plan: printed floor total + printed store areas
const cands = fromOcr([...extractLabelledQuantities(rd("aldrais_p1.txt")), ...extractLabelledQuantities(rd("aldrais_p3.txt"))]);
const r = reconcile(cands);
const total = r.find((c) => /GROUND FLOOR AREA/i.test(c.description))!;
assert.ok(total.checks.some((t) => /14|من الإجمالي/.test(t)), "total gets a parts-vs-total note: " + total.checks.join("|"));
const park = r.find((c) => /CAR PARKING/i.test(c.description))!;
assert.equal(park.confidence, "low", "small OCR count is distrusted");

// Two independent sources agreeing -> merged and high confidence
const mk = (id: string, s: any, q: number): Candidate => ({ id, description: "d" + id, category: "x", dim: "area", unit: "م²", quantity: q, sources: [s], confidence: "medium", evidence: id, checks: [], selected: true });
const m = reconcile([mk("a", "cad", 512.3), mk("b", "ocr", 512.92)]);
assert.equal(m.length, 1); assert.equal(m[0].confidence, "high"); assert.deepEqual(m[0].sources.sort(), ["cad", "ocr"]);
// Parts larger than the printed total are flagged
const bad = reconcile([{ ...mk("t", "ocr", 1000), description: "GROUND FLOOR AREA" }, { ...mk("p1", "ocr", 700), description: "مخزن (STORE) — مساحة مدوّنة رقم 1" }, { ...mk("p2", "ocr", 600), description: "مخزن (STORE) — مساحة مدوّنة رقم 2" }]);
assert.ok(bad.filter((c) => c.confidence === "low").length === 2);
// zero quantity is never pre-selected
assert.equal(reconcile([mk("z", "ai", 0)])[0].selected, false);
console.log("engine_reconcile ok");
