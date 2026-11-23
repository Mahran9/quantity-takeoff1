/**
 * End-to-end: bytes → decodeDxfBuffer → miniDxf (test-only reader) → analyzeParsedDxfObject
 *             → extractEngineeringQuantitiesFromDxf → auditExtraction.
 * miniDxf only approximates dxf-parser; scripts/verify-dxf.ts with the REAL parser is authoritative.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodeDxfBuffer } from "../src/utils/dxfDecode";
import {
  analyzeParsedDxfObject,
  extractEngineeringQuantitiesFromDxf,
  auditExtraction,
  summarizeAudit,
  cleanDxfText,
  decodeCadCodes,
  ParsedDxfResult,
} from "../src/utils/dxfParser";
import { parseMiniDxf } from "./helpers/miniDxf";
import { makeMockParsedDxf } from "./testHelpers";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function run(file: string, opts: any = {}, analyzeOpts: any = {}) {
  const dec = decodeDxfBuffer(new Uint8Array(readFileSync(join(dir, file))));
  const parsed = analyzeParsedDxfObject(parseMiniDxf(dec.text), analyzeOpts);
  const extracted = extractEngineeringQuantitiesFromDxf(parsed, opts);
  const audit = auditExtraction(parsed, extracted, { ...opts, includeHiddenLayers: analyzeOpts.includeHiddenLayers });
  const val = (layerOrName: string, type: string) =>
    extracted.find((e) => (e.layer === layerOrName || e.name === layerOrName) && e.type === type)?.value;
  const ids = audit.checks.map((c) => c.id);
  return { dec, parsed, extracted, audit, val, ids };
}
const near = (a: number | undefined, b: number, tol = 0.01) =>
  assert.ok(a !== undefined && Math.abs(a - b) <= tol, `expected ≈${b}, got ${a}`);

// ---------------------------------------------------------------------------
// 0. text codes
// ---------------------------------------------------------------------------
assert.equal(cleanDxfText("\\U+0639\\U+0645\\U+0648\\U+062F"), "عمود");
assert.equal(cleanDxfText("%%c16 @ 200 %%d45 %%p5 %%uunder%%u"), "Ø16 @ 200 °45 ±5 under");
assert.equal(decodeCadCodes("%%o%%cX"), "ØX");
assert.equal(cleanDxfText("{\\fArial|b1;SLAB\\P THK=200}"), "SLAB THK=200");

// ---------------------------------------------------------------------------
// (a) the real ezdxf-generated fixture
//     slab 12.00 m³ footings 4.50 m³ beams 36.00 m, C1 ×4
// ---------------------------------------------------------------------------
{
  const r = run("synthetic_structural_test.dxf");
  near(r.val("S-SLAB", "volume"), 12);
  near(r.val("S-FOOTINGS", "volume"), 4.5);
  near(r.val("S-BEAMS", "linear"), 36);
  assert.equal(r.val("C1", "count"), 4);
  assert.ok(r.audit.level !== "error", JSON.stringify(r.audit.checks));
  assert.ok(r.audit.confidence !== "low");
  assert.equal(r.audit.checks.some((c) => c.id === "implausible_span" || c.id === "text_encoding"), false);
}

// ---------------------------------------------------------------------------
// (b) warehouse_mm.dxf — hand computations (mm drawing, $INSUNITS=4):
//   S-SLAB       20000×10000 mm = 200 m²; note "ROOF SLAB THK = 200 MM" → 200×0.2 = 40.00 m³
//   S-OLD-SLAB   frozen layer, identical slab        → excluded
//   S-FOOTINGS   6 × (1.5×1.5=2.25) = 13.50 m²; depth 0.6 → 8.10 m³ (2 exact duplicates removed)
//   FLOOR-FINISH hatch 200 m² minus 2×2 hole          → 196.00 m²
//   A-WALL       2×20 m + 2×10 m = 60 m raw; ÷2 → 30 m; ×3 m → 90 m² (1 reversed duplicate line removed)
//   S-BEAMS      3 × 6 m = 18 m
//   C1: 4 distinct inserts + 2 nested in COLGROUP = 6 (1 duplicate insert removed); COLGROUP 1; SC1 MINSERT 3×2 = 6
//   paper space: 3 entities skipped
// ---------------------------------------------------------------------------
{
  const opts = { defaultFootingDepth: 0.6, defaultWallHeight: 3, wallLineDivisor: 2 as const };
  const r = run("warehouse_mm.dxf", opts);
  near(r.val("S-SLAB", "volume"), 40);
  near(r.val("S-FOOTINGS", "volume"), 8.1);
  near(r.val("FLOOR-FINISH", "area"), 196);
  near(r.val("A-WALL", "linear"), 30);
  near(r.extracted.find((e) => e.layer === "A-WALL" && e.type === "area")?.value, 90);
  near(r.val("S-BEAMS", "linear"), 18);
  assert.equal(r.val("C1", "count"), 6);
  assert.equal(r.val("COLGROUP", "count"), 1);
  assert.equal(r.val("SC1", "count"), 6);
  // nothing from the frozen / paper-space content
  assert.equal(r.extracted.some((e) => e.layer === "S-OLD-SLAB"), false);
  assert.equal(r.parsed.skippedPaperSpaceCount, 3);
  assert.deepEqual(r.parsed.hiddenLayers?.map((h) => [h.name, h.entityCount]), [["S-OLD-SLAB", 1]]);
  const dupCount = (layer: string, kind: string) => r.parsed.duplicates?.find((d) => d.layer === layer && d.kind === kind)?.count;
  assert.equal(dupCount("S-FOOTINGS", "LWPOLYLINE"), 2);
  assert.equal(dupCount("A-WALL", "LINE"), 1);
  assert.equal(dupCount("S-COLUMNS", "INSERT"), 1);
  assert.ok(r.parsed.textNotes.some((t) => t.includes("Ø400") && t.includes("Ø16")), "%%c decoded in notes");
  for (const id of ["hidden_layers", "duplicates_removed", "paper_space_skipped"]) assert.ok(r.ids.includes(id), id);
  assert.equal(r.ids.includes("unit_guessed"), false);
  assert.equal(r.ids.includes("implausible_span"), false);
  assert.equal(r.audit.level, "warn");
  assert.equal(r.audit.confidence, "medium");
  assert.ok(summarizeAudit(r.audit).includes("ثقة متوسطة"));

  // the same drawing with hidden layers included counts the frozen slab (area 200 → 400 m² total on that layer name)
  const inc = run("warehouse_mm.dxf", opts, { includeHiddenLayers: true });
  assert.ok(inc.extracted.some((e) => e.layer === "S-OLD-SLAB"), "frozen layer included on request");
}

// ---------------------------------------------------------------------------
// Arabic layer names — UTF-8 and ANSI_1256 bytes must give identical results
//   بلاطة_سقف 10×5 = 50 m², default thickness 0.15 → 7.50 m³ ; جدران 12+8 = 20 m, ×3 = 60 m²
// ---------------------------------------------------------------------------
for (const f of ["warehouse_arabic_utf8.dxf", "warehouse_arabic_cp1256.dxf"]) {
  const r = run(f, { defaultSlabThickness: 0.15, defaultWallHeight: 3 });
  assert.equal(r.dec.encoding, f.includes("1256") ? "windows-1256" : "utf-8", f);
  assert.ok(r.parsed.layers.some((l) => l.name === "بلاطة_سقف"), `${f}: Arabic layer name decoded`);
  near(r.val("بلاطة_سقف", "volume"), 7.5);
  near(r.val("جدران", "linear"), 20);
  near(r.extracted.find((e) => e.layer === "جدران" && e.type === "area")?.value, 60);
  assert.equal(r.ids.includes("text_encoding"), false);
  assert.equal(r.audit.level, "ok", `${f}: ${JSON.stringify(r.audit.checks)}`);
  assert.equal(r.audit.confidence, "high");
  assert.ok(r.parsed.textNotes.includes("Ø16 @ 200"));
}

// wrong-encoding read of the same Arabic UTF-8 bytes (Latin-1 mojibake) must be an ERROR
{
  const bytes = new Uint8Array(readFileSync(join(dir, "warehouse_arabic_utf8.dxf")));
  const mojibake = new TextDecoder("latin1").decode(bytes);
  const parsed = analyzeParsedDxfObject(parseMiniDxf(mojibake));
  const audit = auditExtraction(parsed, extractEngineeringQuantitiesFromDxf(parsed, { defaultSlabThickness: 0.15 }));
  assert.ok(audit.checks.some((c) => c.id === "text_encoding" && c.level === "error"));
  assert.equal(audit.level, "error");
  assert.equal(audit.confidence, "low");
}

// ---------------------------------------------------------------------------
// Deliberately broken #1: no $INSUNITS (mm drawing), slab without thickness, walls without height,
// large unclassified layer.  Total area 450+300 = 750 m² (MISC-STUFF = 40%).
// ---------------------------------------------------------------------------
{
  const r = run("broken_unitless_mm.dxf");
  assert.equal(r.parsed.unitInfo?.guessed, true);
  for (const id of ["unit_guessed", "insunits_missing", "missing_thickness", "wall_no_height", "unclassified_large"]) {
    assert.ok(r.ids.includes(id), `missing check ${id}; got ${r.ids}`);
  }
  assert.equal(r.audit.level, "warn");
  assert.equal(r.audit.confidence, "medium");
  assert.equal(r.audit.unclassified[0].layer, "MISC-STUFF");
  near(r.audit.unclassified[0].areaM2, 300);
  // coverage = mean(area share 450/750 = 60%, length share 30/30 = 100%) = 80%
  assert.equal(r.audit.coveragePct, 80);
  // confirming the unit removes only the "guessed" check
  const c = run("broken_unitless_mm.dxf", { unitScaleFactor: 0.001 });
  assert.equal(c.ids.includes("unit_guessed"), false);
  assert.ok(c.ids.includes("insunits_missing"));
}

// Deliberately broken #2: header says metres, coordinates are mm → 30 000 m span → ERROR
{
  const r = run("broken_wrong_unit.dxf");
  assert.ok(r.ids.includes("implausible_span"));
  assert.equal(r.audit.level, "error");
  assert.equal(r.audit.confidence, "low");
}

// ---------------------------------------------------------------------------
// Pure audit checks on mock results
// ---------------------------------------------------------------------------
{
  const p: ParsedDxfResult = makeMockParsedDxf({
    unitInfo: { code: 6, name: "m", toMeters: 1 },
    layers: [{ name: "S-SLAB", areaSum: 2_000_000, closedPolylinesCount: 3 }], // bbox is 1000×1000 = 1e6 → 2× > 1.5×
  });
  p.overlaps = [{ layer: "S-SLAB", nested: 1, duplicates: 0 }];
  p.drawingSpan = 1000;
  const audit = auditExtraction(p, extractEngineeringQuantitiesFromDxf(p, { unitScaleFactor: 0.001 }), { unitScaleFactor: 0.001 });
  assert.ok(audit.checks.some((c) => c.id === "area_exceeds_bbox" && c.level === "error"));
  assert.ok(audit.checks.some((c) => c.id === "nested_overlap"));
}
{
  const p = makeMockParsedDxf({ unitInfo: { code: 4, name: "mm", toMeters: 0.001 }, layers: [] });
  const audit = auditExtraction(p, []);
  assert.ok(audit.checks.some((c) => c.id === "nothing_extracted" && c.level === "error"));
}

console.log("PASS [dxf_end_to_end]: text codes, real fixture, warehouse (nested/MINSERT/hatch hole/paper space/frozen/duplicates/double walls), Arabic UTF-8 + CP1256, broken cases flagged.");
