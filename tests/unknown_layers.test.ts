import { strict as assert } from "node:assert";
import { extractEngineeringQuantitiesFromDxf } from "../src/utils/dxfParser";
import { makeMockParsedDxf } from "./testHelpers";

const dxf = makeMockParsedDxf({
  unitInfo: { code: 6, name: "متر (m)", toMeters: 1.0 },
  layers: [
    { name: "S-WALL", entityCount: 4, areaSum: 960, closedPolylinesCount: 1, lineLength: 128 },
    { name: "S-COL", entityCount: 10, areaSum: 0.9, closedPolylinesCount: 10, lineLength: 0 },
    { name: "XYZ-777", entityCount: 3, areaSum: 40, closedPolylinesCount: 3, lineLength: 0 },
    { name: "DIM1", entityCount: 9, areaSum: 0, closedPolylinesCount: 0, lineLength: 3.56 },
    { name: "FIRNTUR", entityCount: 9, areaSum: 0, closedPolylinesCount: 0, lineLength: 28.66 },
    { name: "cen", entityCount: 9, areaSum: 0, closedPolylinesCount: 0, lineLength: 1.66 },
    { name: "ZZ-OTHER", entityCount: 9, areaSum: 0, closedPolylinesCount: 0, lineLength: 35.5 },
  ],
  detectedBlocks: [],
  textNotes: [],
});
const items = extractEngineeringQuantitiesFromDxf(dxf, {});
// Wall / column outlines never become "floors" area lines.
assert.equal(items.find((i) => i.layer === "S-WALL" && i.type === "area"), undefined);
assert.equal(items.find((i) => i.layer === "S-COL" && i.type === "area"), undefined);
// Dimension / furniture / centre-line layers never reach the table; an unrecognised layer is unticked.
for (const l of ["DIM1", "FIRNTUR", "cen"]) assert.equal(items.find((i) => i.layer === l), undefined, l + " ignored");
assert.equal(items.find((i) => i.layer === "ZZ-OTHER" && i.type === "linear")?.selected, false);
// An unknown layer is offered, but unticked and not filed under floors.
const unk = items.find((i) => i.layer === "XYZ-777" && i.type === "area");
assert.ok(unk);
assert.equal(unk!.selected, false);
assert.notEqual(unk!.suggestedCategory, "أعمال الأرضيات والرخام والبورسلين");
// Footing depth typed by the user produces a volume whose description no longer says "unknown".
const f = extractEngineeringQuantitiesFromDxf(
  makeMockParsedDxf({ unitInfo: { code: 6, name: "m", toMeters: 1 }, layers: [{ name: "S-FOOT", entityCount: 5, areaSum: 22.5, closedPolylinesCount: 10, lineLength: 0 }], detectedBlocks: [], textNotes: [] }),
  { defaultFootingDepth: 0.6 }
).find((i) => i.type === "volume");
assert.equal(f?.value, 13.5);
assert.ok(!/غير محدد/.test(f?.description || ""));
console.log("unknown_layers ok");

// Vector PDF reader: nothing without a trustworthy scale; measured candidates with one.
import { readPdf } from "../src/engine/readers";
const grp = (id: string, lengthPt: number): any => ({ id, label: id, color: "#000", lineWidthMm: 0.3, pathCount: 10, lengthPt, closedCount: 0, areaPt2: 0, rectCount: 0, filledCount: 0, sizeClusters: [], maxPathPt: 100 });
const base: any = { pageWidthPt: 842, pageHeightPt: 595, userUnit: 1, groups: [grp("g1", 2834.6)], excluded: { frame: 0, duplicates: 0, background: 0, hairline: 0 }, warnings: [], truncated: false, scaleMessage: "", dimensionNumbers: [] };
assert.equal(readPdf({ pdfVector: { ...base, scaleConfidence: "low", detectedDenominator: 100 } } as any).length, 0, "low-confidence scale gives nothing");
assert.equal(readPdf({ pdfVector: { ...base, scaleConfidence: "high" } } as any).length, 0, "no scale gives nothing");
const ok = readPdf({ pdfVector: { ...base, scaleConfidence: "high", detectedDenominator: 100 } } as any);
assert.equal(ok.length, 1);
assert.equal(ok[0].unit, "م.ط");
assert.equal(ok[0].quantity, 100, "1000 mm of paper at 1:100 = 100 m");
assert.equal(ok[0].selected, false, "unnamed colour/thickness bucket is never pre-selected");
const named = readPdf({ pdfVector: { ...base, groups: [{ ...grp("g1", 2834.6), layer: "WALLS" }], scaleConfidence: "high", detectedDenominator: 100 } } as any);
assert.equal(named[0].selected, true, "a layer named by the drawing itself is an element");
const med = readPdf({ pdfVector: { ...base, scaleConfidence: "medium", detectedDenominator: 100 } } as any);
assert.equal(med[0].selected, false);
assert.equal(med[0].confidence, "low");
console.log("readPdf ok");
