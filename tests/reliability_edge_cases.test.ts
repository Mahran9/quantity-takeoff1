import { strict as assert } from "node:assert";
import { cleanDxfText, extractEngineeringQuantitiesFromDxf } from "../src/utils/dxfParser";
import { makeMockParsedDxf } from "./testHelpers";

const dirtyMtext = "{\\fArial|b1;SLAB THK = 180 mm}\\P{\\H0.8x;FOOTING THK = 600 mm}";
const clean = cleanDxfText(dirtyMtext);
assert.ok(clean.includes("SLAB THK = 180 mm"), "Should strip MTEXT font tags");
assert.ok(clean.includes("FOOTING THK = 600 mm"), "Should replace \\P with space");

const mockParsed = makeMockParsedDxf({
  unitInfo: { code: 4, name: "مليمتر (مستنتج)", toMeters: 0.001 },
  layers: [
    { name: "S-SLAB", entityCount: 1, areaSum: 100_000_000, closedPolylinesCount: 1, lineLength: 0 },
    { name: "S-FOOTINGS", entityCount: 2, areaSum: 8_000_000, closedPolylinesCount: 2, lineLength: 0 },
  ],
  detectedBlocks: [],
  textNotes: [clean],
});
const items = extractEngineeringQuantitiesFromDxf(mockParsed);
assert.equal(items.find((i) => i.layer === "S-SLAB" && i.type === "volume")?.value, 18, "100m² x 0.18m = 18m³");
assert.equal(items.find((i) => i.layer === "S-FOOTINGS" && i.type === "volume")?.value, 4.8, "8m² x 0.60m = 4.8m³");

console.log("PASS [reliability_edge_cases]: MTEXT cleaned, inferred mm units applied, Slab=18m³, Footings=4.8m³.");
