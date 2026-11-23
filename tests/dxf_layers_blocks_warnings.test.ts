import { strict as assert } from "node:assert";
import {
  analyzeParsedDxfObject,
  extractEngineeringQuantitiesFromDxf,
  isIgnoredLayer,
  normalizeLayerName,
  loadLayerRules,
  saveLayerRules,
  computeEllipseGeometry,
  approximateSplineLength,
  expandBlockInstanceCounts,
} from "../src/utils/dxfParser";
import { makeMockParsedDxf } from "./testHelpers";

const M = { code: 6, name: "متر (m)", toMeters: 1.0 };

// ---- 1. Token based classification (no blind substring matching) ----
assert.equal(normalizeLayerName("A-WALL.EXT|01"), "A_WALL_EXT_01");
for (const n of ["TITLE_BLOCK", "SHEET_BORDER", "A-ANNO-DIMS", "DEFPOINTS", "S-NOTES", "G-GRID", "S-HATCH", "A-TXT"]) {
  assert.ok(isIgnoredLayer(n), `${n} should be ignored`);
}
for (const n of ["S-SLAB-HATCH", "ST-STEEL-FRAME", "A-BLOCK-WALLS", "S-BASEMENT-WALL"]) {
  assert.ok(!isIgnoredLayer(n), `${n} must NOT be ignored`);
}

const classified = extractEngineeringQuantitiesFromDxf(
  makeMockParsedDxf({
    unitInfo: M,
    layers: [
      { name: "TITLE_BLOCK", areaSum: 50, lineLength: 400 },
      { name: "SHEET_BORDER", areaSum: 900, lineLength: 120 },
      { name: "S-BASEMENT", areaSum: 40, closedPolylinesCount: 1 },
      { name: "BASE_PLATE", areaSum: 12, closedPolylinesCount: 3 },
      { name: "WATER_SUPPLY", lineLength: 75 },
      { name: "REBAR_STEEL", lineLength: 60 },
      { name: "A-BLOCK-WALLS", lineLength: 80 },
      { name: "S-FOOTINGS", areaSum: 10, closedPolylinesCount: 2 },
    ],
  })
);
const byLayer = (l: string, t?: string) => classified.find((i) => i.layer === l && (!t || i.type === t));
assert.equal(byLayer("TITLE_BLOCK"), undefined);
assert.equal(byLayer("SHEET_BORDER"), undefined);
assert.notEqual(byLayer("S-BASEMENT", "area")?.suggestedCategory, "أعمال خرسانية مسلحة وعادية", "BASEMENT is not a footing");
assert.equal(byLayer("BASE_PLATE", "area")?.suggestedCategory, "أعمال الهياكل المعدنية والهناجر");
assert.equal(byLayer("WATER_SUPPLY", "linear")?.suggestedCategory, "أعمال التغذية والصرف الصحي");
assert.equal(byLayer("REBAR_STEEL", "linear")?.suggestedCategory, "أعمال حديد التسليح");
assert.equal(byLayer("A-BLOCK-WALLS", "linear")?.suggestedCategory, "أعمال المباني والبلوك");
assert.equal(byLayer("S-FOOTINGS", "area")?.suggestedCategory, "أعمال خرسانية مسلحة وعادية");

// ---- 2. User rules win over built-ins ----
const ruled = extractEngineeringQuantitiesFromDxf(
  makeMockParsedDxf({
    unitInfo: M,
    layers: [
      { name: "A-BLOCK-WALLS", lineLength: 80 },
      { name: "XX-MISC", areaSum: 30, lineLength: 30 },
      { name: "S-FOOTINGS", areaSum: 10, closedPolylinesCount: 2 },
      { name: "CUSTOM-POSTS", entityCount: 7, closedPolylinesCount: 7, areaSum: 0.4 },
    ],
    detectedBlocks: [{ name: "DOOR_D1", count: 3 }],
  }),
  {
    layerRules: [
      { match: "block-walls", category: "", kind: "ignore" },
      { match: "XX-MISC", category: "أعمال الدهانات والديكورات", kind: "area" },
      { match: "CUSTOM-POSTS", category: "أعمال متنوعة أخرى", kind: "count" },
      { match: "DOOR_D1", category: "أعمال متنوعة أخرى" },
    ],
  }
);
assert.equal(ruled.filter((i) => i.layer === "A-BLOCK-WALLS").length, 0, "ignored by rule");
assert.equal(ruled.find((i) => i.layer === "XX-MISC" && i.type === "area")?.suggestedCategory, "أعمال الدهانات والديكورات");
assert.equal(ruled.filter((i) => i.layer === "XX-MISC" && i.type === "linear").length, 0, "kind=area drops the linear item");
assert.equal(ruled.find((i) => i.layer === "CUSTOM-POSTS" && i.type === "count")?.value, 7);
assert.equal(ruled.find((i) => i.name === "DOOR_D1")?.suggestedCategory, "أعمال متنوعة أخرى", "block rule overrides door detection");

// ---- 3. Double line walls ----
const walls = makeMockParsedDxf({ unitInfo: M, layers: [{ name: "A-WALLS", lineLength: 80 }] });
const single = extractEngineeringQuantitiesFromDxf(walls, { defaultWallHeight: 3 });
const dbl = extractEngineeringQuantitiesFromDxf(walls, { defaultWallHeight: 3, wallLineDivisor: 2 });
assert.equal(single.find((i) => i.type === "linear")?.value, 80);
assert.equal(dbl.find((i) => i.type === "linear")?.value, 40);
assert.equal(dbl.find((i) => i.type === "area")?.value, 120);

// ---- 4. Closed perimeter tracked and optionally added ----
const closedDxf = analyzeParsedDxfObject({
  header: { $INSUNITS: 6 },
  entities: [
    { type: "LWPOLYLINE", layer: "A-WALLS", shape: true, vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    { type: "LINE", layer: "A-WALLS", vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }] },
  ],
});
const wl = closedDxf.layers.find((l) => l.name === "A-WALLS")!;
assert.equal(wl.closedPerimeterSum, 40);
assert.equal(wl.lineLength, 5);
const without = extractEngineeringQuantitiesFromDxf(closedDxf);
const withP = extractEngineeringQuantitiesFromDxf(closedDxf, { includeClosedPerimeter: true });
assert.equal(without.find((i) => i.layer === "A-WALLS" && i.type === "linear")?.value, 5);
assert.equal(withP.find((i) => i.layer === "A-WALLS" && i.type === "linear")?.value, 45);

// ---- 5. Nested blocks + MINSERT ----
const nestedDxf = analyzeParsedDxfObject({
  header: { $INSUNITS: 6 },
  blocks: {
    A: { name: "A", entities: [{ type: "INSERT", name: "B" }, { type: "INSERT", name: "B" }] },
    B: { name: "B", entities: [{ type: "INSERT", name: "C" }] },
    C: { name: "C", entities: [{ type: "LINE", vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }] },
  },
  entities: [
    { type: "INSERT", layer: "0", name: "A", rowCount: 2, columnCount: 2 },
    { type: "INSERT", layer: "0", name: "A" },
    { type: "INSERT", layer: "0", name: "SOLO" },
  ],
});
const cnt = (n: string) => nestedDxf.detectedBlocks.find((b) => b.name === n)?.count;
assert.equal(cnt("A"), 5, "MINSERT 2x2 + 1 single");
assert.equal(cnt("B"), 10, "each A holds 2 B");
assert.equal(cnt("C"), 10, "each B holds 1 C");
assert.equal(cnt("SOLO"), 1);
assert.ok(nestedDxf.warnings?.some((w) => w.includes("بلوك متداخل")), "nested expansion warning");

// top-level only drawings are unchanged
const flat = expandBlockInstanceCounts(
  [{ name: "C1" }, { name: "C1" }, { name: "C1" }, { name: "C1" }],
  undefined
);
assert.deepEqual(flat.counts, { C1: 4 });
assert.equal(flat.nestedExpanded, 0);

// cycle guard: X <-> Y must terminate and flag truncation
const cyc = expandBlockInstanceCounts([{ name: "X" }], {
  X: { entities: [{ type: "INSERT", name: "Y" }] },
  Y: { entities: [{ type: "INSERT", name: "X" }] },
});
assert.equal(cyc.truncated, true);
assert.ok(cyc.counts.X >= 1);

// depth limit
const deepBlocks: Record<string, any> = {};
for (let i = 0; i < 12; i++) deepBlocks[`L${i}`] = { entities: [{ type: "INSERT", name: `L${i + 1}` }] };
deepBlocks["L12"] = { entities: [] };
const deep = expandBlockInstanceCounts([{ name: "L0" }], deepBlocks);
assert.equal(deep.truncated, true, "depth limit of 6 reached");
assert.ok(!deep.counts["L12"], "levels beyond the limit are not expanded");

// ---- 6. Warnings ----
const warnDxf = analyzeParsedDxfObject({
  header: {},
  entities: [
    // two nested closed shapes + one duplicate on the same layer
    { type: "LWPOLYLINE", layer: "S-SLAB", shape: true, vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] },
    { type: "LWPOLYLINE", layer: "S-SLAB", shape: true, vertices: [{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 10 }, { x: 5, y: 10 }] },
    { type: "LWPOLYLINE", layer: "S-SLAB", shape: true, vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] },
    { type: "3DFACE", layer: "S-SLAB" },
    { type: "SPLINE", layer: "S-CURVE", controlPoints: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }] },
  ],
});
assert.equal(warnDxf.unitInfo?.guessed, true, "no $INSUNITS => guessed");
assert.ok(warnDxf.warnings?.some((w) => w.includes("وحدة الرسم غير محددة")));
assert.ok(warnDxf.warnings?.some((w) => w.includes("S-SLAB") && w.includes("داخل شكل آخر")));
assert.ok(warnDxf.warnings?.some((w) => w.includes("S-SLAB") && w.includes("مكرر")));
assert.ok(warnDxf.warnings?.some((w) => w.includes("3DFACE")));
assert.ok(warnDxf.warnings?.some((w) => w.includes("SPLINE")));
assert.ok(warnDxf.drawingSpan && warnDxf.drawingSpan >= 20);

const knownUnit = analyzeParsedDxfObject({ header: { $INSUNITS: 4 }, entities: [] });
assert.notEqual(knownUnit.unitInfo?.guessed, true);
assert.ok(!(knownUnit.warnings || []).some((w) => w.includes("وحدة الرسم")));

// ---- 7. ELLIPSE / SPLINE ----
const full = computeEllipseGeometry({ majorAxisEndPoint: { x: 5, y: 0 }, axisRatio: 0.5, startAngle: 0, endAngle: Math.PI * 2 });
assert.ok(Math.abs(full.area - Math.PI * 5 * 2.5) < 1e-9);
assert.ok(Math.abs(full.length - 24.2211) < 1e-3, `Ramanujan perimeter ${full.length}`);
const circleAsEllipse = computeEllipseGeometry({ majorAxisEndPoint: { x: 2, y: 0 }, axisRatio: 1, startAngle: 0, endAngle: Math.PI });
assert.ok(Math.abs(circleAsEllipse.length - Math.PI * 2) < 1e-6, "half circle r=2 => 2π");
assert.equal(circleAsEllipse.isFull, false);
const ellDxf = analyzeParsedDxfObject({
  header: { $INSUNITS: 6 },
  entities: [{ type: "ELLIPSE", layer: "S-FOOTINGS", center: { x: 0, y: 0 }, majorAxisEndPoint: { x: 5, y: 0 }, axisRatio: 0.5, startAngle: 0, endAngle: Math.PI * 2 }],
});
assert.ok(Math.abs((ellDxf.layers.find((l) => l.name === "S-FOOTINGS")?.areaSum || 0) - 39.2699) < 1e-3);

// straight "spline" through fit points = polygon length; clamped quadratic B-spline sample
assert.equal(approximateSplineLength({ fitPoints: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }), 5);
const bs = approximateSplineLength({
  degreeOfSplineCurve: 2,
  controlPoints: [{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }],
  knotValues: [0, 0, 0, 1, 1, 1],
});
assert.ok(bs > 10 && bs < 22.37, `B-spline shorter than its control polygon (${bs})`);

// ---- 8. Rules persistence (localStorage may be missing or throw) ----
assert.deepEqual(loadLayerRules(), [], "no localStorage => empty list, no throw");
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
};
saveLayerRules([{ match: "WALL-EXT", category: "أعمال المباني والبلوك", kind: "linear" }, { match: "TMP", category: "", kind: "ignore" }]);
assert.deepEqual(loadLayerRules(), [
  { match: "WALL-EXT", category: "أعمال المباني والبلوك", kind: "linear" },
  { match: "TMP", category: "", kind: "ignore" },
]);
store["qto_layer_rules_v1"] = "{not json";
assert.deepEqual(loadLayerRules(), [], "corrupt JSON => empty list");
(globalThis as any).localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
assert.doesNotThrow(() => saveLayerRules([]));
assert.deepEqual(loadLayerRules(), []);

console.log("PASS [dxf_layers_blocks_warnings]: token classification, ignore list, user rules, double-line walls, closed perimeter, nested blocks/MINSERT/cycles, warnings, ellipse/spline, rules storage.");
