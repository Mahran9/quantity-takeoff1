/** Vector-PDF benchmark: a villa plan at 1:100 with dimension numbers; true quantities known by construction. */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import { extractVectorPaths } from "../../src/utils/pdfVector";
import { analyzePdfPaths, calibrateScale, parseDimensionNumbers, extractTextScale, summarizePdfPage } from "../../src/utils/pdfPlan";
import { readPdf } from "../../src/engine/readers";

async function loadPdfjs(): Promise<any | null> {
  for (const spec of ["pdfjs-dist/legacy/build/pdf.mjs", process.env.PDFJS_PATH || "", "/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs"]) {
    if (!spec) continue;
    try { return await import(spec); } catch { /* next */ }
  }
  return null;
}
const pdfjs = await loadPdfjs();
if (!pdfjs) { console.log("SKIP [benchmark_pdf]: pdfjs-dist not resolvable here (runs in CI)"); process.exit(0); }

const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(new URL("./villa.pdf", import.meta.url))), useSystemFonts: true }).promise;
const page = await doc.getPage(1);
const [x0, y0, x1, y1] = page.view;
const pg = { width: x1 - x0, height: y1 - y0 };
const ext = extractVectorPaths(await page.getOperatorList(), pdfjs.OPS);
const texts: string[] = (await page.getTextContent()).items.map((i: any) => i.str).filter(Boolean);
const analysis = analyzePdfPaths(ext.paths, pg);
const nums = parseDimensionNumbers(texts);
const scale = calibrateScale(ext.paths, nums, pg, extractTextScale(texts.join(" ")));
assert.equal(scale.best?.denominator, 100, "scale 1:100 detected from the drawing itself");
assert.equal(scale.confidence, "high");
const c = readPdf({ pdfVector: summarizePdfPage({ analysis, page: pg, userUnit: 1, truncated: false, scale, numbers: nums }) } as any);

const has = (unit: string, q: number, re?: RegExp) => c.some((x) => x.unit === unit && Math.abs(x.quantity - q) < 0.011 && (!re || re.test(x.description)) && x.selected);
const rows: [string, boolean][] = [
  ["قواعد 1.5×1.5 (8)", has("عدد", 8, /1\.50×1\.50/)],
  ["قواعد 1.2×1.2 (4)", has("عدد", 4, /1\.20×1\.20/)],
  ["أعمدة 0.25×0.5 (12)", has("عدد", 12, /0\.25×0\.50/)],
  ["جدران 66 م.ط", has("م.ط", 66)],
  ["كمرات 56 م.ط", has("م.ط", 56)],
  ["بلاطة 128.96 م²", has("م²", 128.96)],
];
console.log(rows.map(([n, ok]) => `${ok ? "✔" : "✘"} ${n}`).join("\n"));
assert.ok(rows.every(([, ok]) => ok), "a PDF benchmark quantity is wrong");
console.log(`benchmark_pdf ok: ${rows.length} values exact`);
