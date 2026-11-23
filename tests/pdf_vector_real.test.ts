import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractVectorPaths } from "../src/utils/pdfVector";
import { analyzePdfPaths, calibrateScale, parseDimensionNumbers, extractTextScale, measureGroup, buildPdfItems, denominatorFromKnownLength, ptToMetres, suggestRole } from "../src/utils/pdfPlan";

const here = path.dirname(fileURLToPath(import.meta.url));
async function loadPdfjs(): Promise<any | null> {
  for (const spec of ["pdfjs-dist/legacy/build/pdf.mjs", process.env.PDFJS_PATH || "", "/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs"]) {
    if (!spec) continue;
    try { return await import(spec); } catch { /* next */ }
  }
  return null;
}
const pdfjs = await loadPdfjs();
if (!pdfjs) { console.log("SKIP [pdf_vector_real]: pdfjs-dist not resolvable here (runs in CI after npm install)"); process.exit(0); }

async function read(name: string) {
  const data = new Uint8Array(fs.readFileSync(path.join(here, "fixtures/pdf", name)));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const [x0, y0, x1, y1] = page.view;
  const ext = extractVectorPaths(await page.getOperatorList(), pdfjs.OPS);
  const tc = await page.getTextContent();
  const texts: string[] = tc.items.map((i: any) => i.str).filter(Boolean);
  const pg = { width: x1 - x0, height: y1 - y0 };
  return { ext, texts, pg, analysis: analyzePdfPaths(ext.paths, pg) };
}
const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b}±${tol}`);
const D = 100;

// ---- basic plan: known quantities -------------------------------------------------------------
{
  const { ext, texts, pg, analysis } = await read("plan_basic.pdf");
  assert.equal(ext.stats.unsupportedOps, 0);
  assert.equal(analysis.excluded.frame, 1, "sheet border excluded");
  const byColor = (c: string) => analysis.groups.find((g) => g.color === c)!;
  const black = byColor("000000"), red = byColor("FF0000"), blue = byColor("0000FF"), green = byColor("008000") || analysis.groups.find((g) => g.color.startsWith("00") && g.color !== "0000FF");
  near(measureGroup(black, D).lengthM, 64, 0.05, "outline perimeter m");
  near(measureGroup(black, D).areaM2, 240, 0.1, "outline area m2");
  near(measureGroup(red, D).lengthM, 13, 0.05, "interior walls m");
  assert.equal(blue.rectCount, 6);
  assert.equal(blue.sizeClusters[0].count, 6);
  near(measureGroup(blue, D, 1, 0).areaM2, 1.5, 0.01, "column area");
  near(measureGroup(green, D).lengthM, 2 * Math.PI, 0.02, "circle circumference (bezier flattening)");
  assert.equal(suggestRole(blue, D).mode, "count");
  assert.equal(suggestRole(red, D).mode, "length");

  // scale detection: text + dimension agreement
  assert.equal(extractTextScale(texts.join(" ")), 100);
  const sc = calibrateScale(ext.paths, parseDimensionNumbers(texts), pg, 100);
  assert.equal(sc.confidence, "high", sc.message);
  assert.equal(sc.best!.denominator, 100);

  // items
  const items = buildPdfItems({
    groups: analysis.groups, denominator: D, sheetId: "s1", pageNumber: 1, idFactory: (() => { let i = 0; return () => `t${++i}`; })(),
    assignments: [
      { groupId: red.id, mode: "length", category: "أعمال البناء", description: "جدران داخلية" },
      { groupId: red.id, mode: "length", category: "أعمال البناء", description: "جدران داخلية م²", height: 3 },
      { groupId: blue.id, mode: "count", category: "خرسانة", description: "أعمدة" },
      { groupId: black.id, mode: "skip", category: "", description: "" },
    ],
  });
  assert.equal(items.length, 3);
  near(items[0].quantity, 13, 0.05, "item length"); assert.equal(items[0].unit, "م.ط");
  near(items[1].quantity, 39, 0.15, "item wall area"); assert.equal(items[1].unit, "م²");
  assert.equal(items[2].quantity, 6); assert.equal(items[2].unit, "عدد");
  assert.ok(items.every((i) => i.extractionSource === "pdf_vector" && i.reviewStatus === "needs_review"));
}

// ---- duplicates: overlay drawn twice must not double the outline ------------------------------
{
  const { analysis } = await read("plan_duplicates.pdf");
  assert.ok(analysis.excluded.duplicates >= 1, "duplicate removed");
  near(measureGroup(analysis.groups.find((g) => g.color === "000000")!, D).lengthM, 64, 0.05, "outline once");
}

// ---- CTM chain (save/scale/translate) must still give true size --------------------------------
{
  const { analysis } = await read("plan_ctm.pdf");
  const black = analysis.groups.find((g) => g.color === "000000")!;
  near(measureGroup(black, D).lengthM, 64, 0.1, "CTM-transformed outline");
  near(measureGroup(analysis.groups.find((g) => g.color === "FF0000")!, D).lengthM, 13, 0.05, "CTM-transformed walls");
}

// ---- wrong scale text is caught; missing scale text is recovered from dimensions ----------------
{
  const a = await read("plan_scale_mismatch.pdf");
  const sc = calibrateScale(a.ext.paths, parseDimensionNumbers(a.texts), a.pg, extractTextScale(a.texts.join(" ")));
  assert.equal(sc.confidence, "low"); assert.equal(sc.best!.denominator, 100);
  assert.match(sc.message, /1:50/);
  const b = await read("plan_no_scale_text.pdf");
  const sb = calibrateScale(b.ext.paths, parseDimensionNumbers(b.texts), b.pg, extractTextScale(b.texts.join(" ")));
  assert.equal(sb.best!.denominator, 100); assert.equal(sb.confidence, "medium");
}

// ---- rotated page + empty page -----------------------------------------------------------------
{
  const r = await read("plan_rotated.pdf");
  near(measureGroup(r.analysis.groups.find((g) => g.color === "000000")!, D).lengthM, 64, 0.05, "rotated page");
  const e = await read("page_empty.pdf");
  assert.equal(e.analysis.groups.length, 0); assert.ok(e.analysis.warnings.length > 0, "scanned/empty page warns");
}

// ---- optional-content layers (real OCG names) -------------------------------------------------
{
  const data = new Uint8Array(fs.readFileSync(path.join(here, "fixtures/pdf/plan_layers.pdf")));
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const oc = await doc.getOptionalContentConfig();
  const ext = extractVectorPaths(await page.getOperatorList(), pdfjs.OPS, { resolveLayer: (k: any) => oc.getGroup(k as string)?.name });
  const an = analyzePdfPaths(ext.paths, { width: 842, height: 595 });
  const wall = an.groups.find((g) => g.layer === "A-WALL")!, cols = an.groups.find((g) => g.layer === "S-COLS")!;
  near(measureGroup(wall, D).lengthM, 15, 0.05, "layer A-WALL = 10 m + 5 m");
  assert.equal(cols.rectCount, 2);
  assert.ok(an.groups.some((g) => !g.layer), "unlayered content stays in its own colour group");
}

// ---- manual calibration ------------------------------------------------------------------------
{
  const d = denominatorFromKnownLength(200 / (25.4 / 72), 20); // 200 mm on paper = 20 m
  near(d, 100, 0.01, "calibration from known length");
  near(ptToMetres(200 / (25.4 / 72), 100), 20, 1e-6, "pt->m");
}
console.log("PASS [pdf_vector_real]: real PDF.js op lists -> paths -> groups -> quantities match known values (perimeter, area, columns, circle, CTM, duplicates, scale check, rotation, empty page)");

// ---- Form XObjects (repeated typical floor), including a rotated instance -----------------------
{
  const f = await read("plan_forms.pdf");
  const g = f.analysis.groups.find((x) => x.color === "000000")!;
  // two instances: each = 10 m line + 1x1 m rect (4 m perimeter) => 28 m; 2 rectangles
  near(measureGroup(g, D).lengthM, 28, 0.05, "form XObject instances (incl. rotated)");
  assert.equal(g.rectCount, 2);
  near(measureGroup(g, D).areaM2, 2, 0.01, "rect areas");
}

// ---- persisted summary: compact, contains preview, round-trips through JSON ---------------------
{
  const { ext, texts, pg, analysis } = await read("plan_basic.pdf");
  const { summarizePdfPage } = await import("../src/utils/pdfPlan");
  const nums = parseDimensionNumbers(texts);
  const sum = summarizePdfPage({ analysis, page: pg, userUnit: 1, truncated: false, scale: calibrateScale(ext.paths, nums, pg, 100), numbers: nums });
  const json = JSON.stringify(sum);
  assert.ok(json.length < 20_000, `summary stays small (${json.length} bytes)`);
  const back = JSON.parse(json);
  assert.ok(back.groups.every((g: any) => !("paths" in g) && Array.isArray(g.preview) && g.preview.length % 4 === 0));
  assert.ok(back.groups.every((g: any) => g.preview.every((v: number) => v >= -0.01 && v <= 1.01 * (pg.height / pg.width) + 0.01 || v <= 1.01)), "preview normalised");
  assert.equal(back.scaleConfidence, "high");
  // re-measuring from the persisted summary equals measuring from live paths
  const g0 = back.groups.find((g: any) => g.color === "FF0000");
  near(measureGroup(g0, D).lengthM, 13, 0.05, "measure from persisted summary");
}
console.log("PASS [pdf_vector_real]: layers, forms, summary persistence OK");
