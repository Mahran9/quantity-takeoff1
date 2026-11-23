import { strict as assert } from "node:assert";
import { extractEngineeringQuantitiesFromDxf } from "../src/utils/dxfParser";
import { extractStructuredTakeoffFromTokens } from "../src/utils/visualSearchEngine";
import { BlueprintSheet, VisualSearchToken } from "../src/types";
import { makeMockParsedDxf } from "./testHelpers";

const warehouseDxf = makeMockParsedDxf({
  unitInfo: { code: 6, name: "متر (m)", toMeters: 1.0 },
  layers: [
    { name: "S-FOOTINGS", entityCount: 8, areaSum: 24, closedPolylinesCount: 8, lineLength: 0 },
    { name: "S-MIDA-GB", entityCount: 10, areaSum: 0, closedPolylinesCount: 0, lineLength: 120 },
    { name: "A-BLOCK-WALLS", entityCount: 12, areaSum: 0, closedPolylinesCount: 0, lineLength: 80 },
    { name: "ST-IPE-RAFTER", entityCount: 14, areaSum: 0, closedPolylinesCount: 0, lineLength: 210 },
    { name: "ST-TUBE-PURLIN", entityCount: 30, areaSum: 0, closedPolylinesCount: 0, lineLength: 450 },
    { name: "ST-SHINKO-ROOF", entityCount: 2, areaSum: 600, closedPolylinesCount: 2, lineLength: 0 },
  ],
  detectedBlocks: [],
  textNotes: ["FOOTING THK = 600 mm"],
});

const dxfItems = extractEngineeringQuantitiesFromDxf(warehouseDxf, { defaultWallHeight: 3.0 });

assert.equal(dxfItems.find((i) => i.layer === "S-FOOTINGS" && i.type === "volume")?.value, 14.4);
assert.equal(dxfItems.find((i) => i.layer === "S-MIDA-GB")?.suggestedCategory, "أعمال خرسانية مسلحة وعادية");
assert.equal(dxfItems.find((i) => i.layer === "S-MIDA-GB")?.value, 120);
assert.equal(dxfItems.find((i) => i.layer === "A-BLOCK-WALLS" && i.type === "area")?.value, 240);
assert.equal(dxfItems.find((i) => i.layer === "ST-IPE-RAFTER")?.suggestedCategory, "أعمال الهياكل المعدنية والهناجر");
assert.equal(dxfItems.find((i) => i.layer === "ST-TUBE-PURLIN")?.suggestedCategory, "أعمال الهياكل المعدنية والهناجر");
assert.equal(dxfItems.find((i) => i.layer === "ST-SHINKO-ROOF")?.suggestedCategory, "أعمال الساندوتش بانل والكلادينج");
assert.equal(dxfItems.find((i) => i.layer === "ST-SHINKO-ROOF")?.value, 600);

const sheet: BlueprintSheet = {
  id: "wh-1", code: "ST-01", title: "هنجر مستودع", discipline: "إنشائي",
  fileType: "pdf", fileName: "wh.pdf", scale: "1:100", status: "new",
  measurementPins: [], createdAt: new Date().toISOString(),
};
const tokens: VisualSearchToken[] = [
  { id: "1", text: "SHS 100x100", x: 0.1, y: 0.1, w: 0.1, h: 0.02, source: "pdf_text" },
  { id: "2", text: "L=6.0", x: 0.25, y: 0.1, w: 0.05, h: 0.02, source: "pdf_text" },
  { id: "3", text: "QTY=20", x: 0.35, y: 0.1, w: 0.05, h: 0.02, source: "pdf_text" },
];
const pdfItems = extractStructuredTakeoffFromTokens(sheet, tokens);
const tubeItem = pdfItems.find((i) => i.itemCode === "SHS 100X100");
assert.ok(tubeItem, "SHS 100x100 tube should be extracted");
assert.equal(tubeItem.unit, "طن");
assert.equal(tubeItem.quantity, 1.408);

console.log("PASS [warehouse_and_blocks]: Footings=14.4m³, Mida=120m, BlockWalls=240m², IPE/Tube/Shinko=600m², SHS100=1.408t.");
