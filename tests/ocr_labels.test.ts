import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractLabelledQuantities } from "../src/utils/ocrLabels";
const here = path.dirname(fileURLToPath(import.meta.url));
const rd = (n: string) => fs.readFileSync(path.join(here, "fixtures/ocr", n), "utf8");
// Real Tesseract output from a real A2 plan set (text outlined in the PDF, so only OCR can read it)
const p3 = extractLabelledQuantities(rd("aldrais_p3.txt")).filter((q) => q.kind === "area-label").map((q) => q.value);
assert.deepEqual(p3.slice(0, 8), [330.38, 327.34, 327.34, 360.75, 360.75, 327.34, 327.34, 330.38]);
assert.ok(p3.includes(508.91) && p3.includes(512.92) && p3.includes(552.6) && p3.length === 14, `got ${p3.length}`);
const p1 = extractLabelledQuantities(rd("aldrais_p1.txt"));
const g = p1.find((q) => /GROUND FLOOR AREA/i.test(q.label));
assert.ok(g && g.value === 7861.36 && g.unit === "م²");
const per = p1.find((q) => /PERIMETER/i.test(q.label));
assert.ok(per && per.value === 351.62 && per.unit === "م.ط");
assert.ok(p1.some((q) => /CAR PARKING/i.test(q.label) && q.unit === "عدد"));
console.log("ocr_labels ok");
