import { strict as assert } from "node:assert";
import { extractEngineeringQuantitiesFromDxf } from "../src/utils/dxfParser";
import { sortItemsBySiteExecutionOrder } from "../src/utils/boqExporter";
import { TakeoffItem } from "../src/types";
import { makeMockParsedDxf } from "./testHelpers";

// Complete warehouse + admin building DXF scenario covering all site execution stages
const fullSiteDxf = makeMockParsedDxf({
  unitInfo: { code: 6, name: "متر (m)", toMeters: 1.0 },
  layers: [
    { name: "S-BLINDING", entityCount: 8, areaSum: 32, closedPolylinesCount: 8, lineLength: 0 },
    { name: "S-FOOTINGS", entityCount: 8, areaSum: 24, closedPolylinesCount: 8, lineLength: 0 },
    { name: "S-MIDA-GB", entityCount: 10, areaSum: 0, closedPolylinesCount: 0, lineLength: 120 },
    { name: "S-SOG-FLOOR", entityCount: 1, areaSum: 500, closedPolylinesCount: 1, lineLength: 0 },
    { name: "ST-IPE-RAFTER", entityCount: 12, areaSum: 0, closedPolylinesCount: 0, lineLength: 180 },
    { name: "ST-TUBE-PURLIN", entityCount: 25, areaSum: 0, closedPolylinesCount: 0, lineLength: 400 },
    { name: "ST-SHINKO-ROOF", entityCount: 2, areaSum: 540, closedPolylinesCount: 2, lineLength: 0 },
    { name: "A-BLOCK-WALLS", entityCount: 10, areaSum: 0, closedPolylinesCount: 0, lineLength: 90 },
  ],
  detectedBlocks: [
    { name: "C1", count: 6 },       // Concrete columns (admin building)
    { name: "SC1", count: 14 },     // Steel I-Beam columns (warehouse)
    { name: "BP-16", count: 14 },   // Base plates
    { name: "RS-01", count: 2 },    // Roll shutter doors
  ],
  textNotes: [
    "BLINDING THK = 100 mm",
    "FOOTING THK = 600 mm",
    "SOG THK = 150 mm",
  ],
});

const extracted = extractEngineeringQuantitiesFromDxf(fullSiteDxf, { defaultWallHeight: 3.5 });

// Verify Blinding, Footings, Floor Concrete (SOG), Mida, Walls, Shinko
assert.equal(extracted.find((i) => i.layer === "S-BLINDING" && i.type === "volume")?.value, 3.2, "Blinding 32 * 0.1 = 3.2 m³");
assert.equal(extracted.find((i) => i.layer === "S-FOOTINGS" && i.type === "volume")?.value, 14.4, "Footings 24 * 0.6 = 14.4 m³");
assert.equal(extracted.find((i) => i.layer === "S-SOG-FLOOR" && i.type === "volume")?.value, 75, "Floor SOG 500 * 0.15 = 75 m³");
assert.equal(extracted.find((i) => i.layer === "S-MIDA-GB")?.value, 120, "Mida length = 120 m");
assert.equal(extracted.find((i) => i.layer === "A-BLOCK-WALLS" && i.type === "area")?.value, 315, "Walls 90 * 3.5 = 315 m²");
assert.equal(extracted.find((i) => i.layer === "ST-SHINKO-ROOF")?.value, 540, "Shinko area = 540 m²");

// Verify STRICT separation between Concrete Columns (C1) and Steel I-Beam Columns (SC1)
const rcCol = extracted.find((i) => i.name === "C1");
const stCol = extracted.find((i) => i.name === "SC1");
assert.equal(rcCol?.suggestedCategory, "أعمال خرسانية مسلحة وعادية", "C1 must be Concrete");
assert.equal(stCol?.suggestedCategory, "أعمال الهياكل المعدنية والهناجر", "SC1 must be Steel I-Beam");
assert.ok(stCol?.description.includes("أيبيم"), "SC1 description must specify Steel I-Beam");

// Verify Base Plates & Roll Shutters
assert.equal(extracted.find((i) => i.name === "BP-16")?.suggestedCategory, "أعمال الهياكل المعدنية والهناجر");
assert.equal(extracted.find((i) => i.name === "RS-01")?.suggestedCategory, "أعمال الأبواب والشبابيك والألمنيوم");

// Verify Quotation Site Execution Order Sorting
const unsorted: TakeoffItem[] = [
  { id: "1", sheetId: "s", itemCode: "RS-01", description: "أبواب رول شتر", category: "أعمال الأبواب والشبابيك والألمنيوم", location: "", count: 2, quantity: 2, unit: "عدد", unitPrice: 0, totalPrice: 0 },
  { id: "2", sheetId: "s", itemCode: "SHK", description: "شينكو سقف المستودع", category: "أعمال الساندوتش بانل والكلادينج", location: "", count: 1, quantity: 540, unit: "م²", unitPrice: 0, totalPrice: 0 },
  { id: "3", sheetId: "s", itemCode: "SC1", description: "عمدان أيبيم هيكل معدني", category: "أعمال الهياكل المعدنية والهناجر", location: "", count: 14, quantity: 14, unit: "عدد", unitPrice: 0, totalPrice: 0 },
  { id: "4", sheetId: "s", itemCode: "SOG", description: "خرسانة الأرضية SOG", category: "أعمال خرسانية مسلحة وعادية", location: "", count: 1, quantity: 75, unit: "م³", unitPrice: 0, totalPrice: 0 },
  { id: "5", sheetId: "s", itemCode: "BLD", description: "صبة نظافة أسفل القواعد", category: "أعمال خرسانية مسلحة وعادية", location: "", count: 8, quantity: 3.2, unit: "م³", unitPrice: 0, totalPrice: 0 },
  { id: "6", sheetId: "s", itemCode: "F1", description: "قواعد خرسانية مسلحة", category: "أعمال خرسانية مسلحة وعادية", location: "", count: 8, quantity: 14.4, unit: "م³", unitPrice: 0, totalPrice: 0 },
  { id: "7", sheetId: "s", itemCode: "EXC", description: "حفر وردم الأساسات", category: "أعمال الحفر والردم والأساسات", location: "", count: 1, quantity: 120, unit: "م³", unitPrice: 0, totalPrice: 0 },
];

const sortedCodes = sortItemsBySiteExecutionOrder(unsorted).map((i) => i.itemCode);
assert.deepEqual(
  sortedCodes,
  ["EXC", "BLD", "F1", "SOG", "SC1", "SHK", "RS-01"],
  `Expected exact site execution order, got: ${sortedCodes.join(" -> ")}`
);

console.log("PASS [site_execution_workflow]: All stages verified (Blinding=3.2m³, Footings=14.4m³, SOG=75m³, RC C1 vs Steel SC1 separated, quotation execution order exact).");
