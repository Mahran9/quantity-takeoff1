/**
 * verify-pdf — see what the app reads from a PDF drawing, using the REAL PDF.js.
 *
 * Usage:  npx tsx scripts/verify-pdf.ts plan.pdf [--page 1] [--scale 100] [--expected expected.json]
 *
 * expected.json maps a group label fragment (colour hex or layer name) to an expected length in metres:
 *   { "FF0000": 13, "A-WALL": 15 }       tolerance 2%
 * Exit code 1 if an expectation fails or no vector geometry is found.
 */
import { readFileSync, existsSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractVectorPaths } from "../src/utils/pdfVector.js";
import { analyzePdfPaths, calibrateScale, extractTextScale, measureGroup, parseDimensionNumbers, suggestRole } from "../src/utils/pdfPlan.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
if (!file || !existsSync(file)) { console.error("usage: tsx scripts/verify-pdf.ts plan.pdf [--page N] [--scale D] [--expected f.json]"); process.exit(2); }

const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise;
const pageNo = Math.max(1, Math.min(doc.numPages, Number(opt("page") || 1)));
const page = await doc.getPage(pageNo);
const [x0, y0, x1, y1] = page.view;
const pg = { width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
let oc: any = null; try { oc = await doc.getOptionalContentConfig(); } catch { /* none */ }
const ext = extractVectorPaths(await page.getOperatorList(), (pdfjs as any).OPS, { resolveLayer: (k: any) => oc?.getGroup?.(k)?.name });
const texts: string[] = (await page.getTextContent()).items.map((i: any) => i.str).filter(Boolean);
const analysis = analyzePdfPaths(ext.paths, pg);
const sc = calibrateScale(ext.paths, parseDimensionNumbers(texts), pg, extractTextScale(texts.join(" ")));
const den = Number(opt("scale")) || sc.best?.denominator || sc.textScale || 100;

console.log(`pages: ${doc.numPages}  (reading page ${pageNo})  paths: ${ext.paths.length}${ext.truncated ? " (TRUNCATED)" : ""}`);
console.log(`scale: 1:${den}  [${sc.confidence}] ${sc.message}`);
analysis.warnings.forEach((w) => console.log("warn:", w));
console.log("\ngroup".padEnd(48), "paths".padStart(7), "len m".padStart(10), "area m²".padStart(10), "closed".padStart(7), " hint");
for (const g of analysis.groups.slice(0, 40)) {
  const m = measureGroup(g, den);
  console.log(g.label.padEnd(47).slice(0, 47), String(g.pathCount).padStart(7), m.lengthM.toFixed(2).padStart(10), m.areaM2.toFixed(2).padStart(10), String(g.closedCount).padStart(7), " " + suggestRole(g, den).mode);
}

let failed = ext.paths.length === 0;
const exp = opt("expected");
if (exp) {
  const want: Record<string, number> = JSON.parse(readFileSync(exp, "utf8"));
  for (const [k, v] of Object.entries(want)) {
    const g = analysis.groups.find((x) => x.label.includes(k) || x.color === k || x.layer === k);
    const got = g ? measureGroup(g, den).lengthM : NaN;
    const ok = g && Math.abs(got - v) <= Math.abs(v) * 0.02;
    console.log(`${ok ? "PASS" : "FAIL"} ${k}: expected ${v} m, got ${Number.isNaN(got) ? "not found" : got.toFixed(2)}`);
    if (!ok) failed = true;
  }
}
process.exit(failed ? 1 : 0);
