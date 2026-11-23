import { strict as assert } from "node:assert";
import { extractEngineeringQuantitiesFromDxf } from "../src/utils/dxfParser";
import { makeMockParsedDxf } from "./testHelpers";

const parsed = makeMockParsedDxf({
  layers: [
    { name: "S-FOOTINGS", entityCount: 4, areaSum: 9_000_000, closedPolylinesCount: 4, lineLength: 0 },
    { name: "S-SLAB", entityCount: 1, areaSum: 80_000_000, closedPolylinesCount: 1, lineLength: 0 },
    { name: "S-BEAMS", entityCount: 4, areaSum: 0, closedPolylinesCount: 0, lineLength: 36_000 },
    { name: "S-COLUMNS", entityCount: 4, areaSum: 0, closedPolylinesCount: 0, lineLength: 0 },
    { name: "S-NOTES", entityCount: 4, areaSum: 0, closedPolylinesCount: 0, lineLength: 0 },
  ],
  detectedBlocks: [{ name: "C1", count: 4 }],
  textNotes: [
    "S-01 STRUCTURAL TEST PLAN",
    "SLAB THK = 150 mm; FOOTING THK = 500 mm",
    "COLUMN TYPE C1 = 300 x 300 mm",
    "BEAM TYPE B1 = 250 x 500 mm",
  ],
});

const result = extractEngineeringQuantitiesFromDxf(parsed, { unitScaleFactor: 0.001 });
const find = (layer: string, type: string) => result.find((item) => item.layer === layer && item.type === type);
assert.equal(find("S-SLAB", "volume")?.value, 12);
assert.equal(find("S-FOOTINGS", "volume")?.value, 4.5);
assert.equal(find("S-BEAMS", "linear")?.value, 36);
assert.equal(result.find((item) => item.name === "C1" && item.type === "count")?.value, 4);
assert.equal(result.filter((item) => item.layer === "S-SLAB" && item.type === "linear").length, 0);
assert.equal(result.filter((item) => item.layer === "S-FOOTINGS" && item.type === "linear").length, 0);
console.log("PASS: slab 12.00 m³; footings 4.50 m³; beams 36.00 m; C1 count 4; no closed-boundary duplicate lines");
