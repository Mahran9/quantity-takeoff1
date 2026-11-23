import { strict as assert } from "node:assert";
import { extractStructuredTakeoffFromTokens } from "../src/utils/visualSearchEngine";
import { BlueprintSheet, VisualSearchToken } from "../src/types";

const mockSheet: BlueprintSheet = {
  id: "test-steel-rebar",
  code: "ST-01",
  title: "جدول التسليح والقطاعات المعدنية",
  discipline: "إنشائي",
  fileType: "pdf",
  fileName: "synthetic_rebar_steel.pdf",
  scale: "1:100",
  status: "new",
  measurementPins: [],
  createdAt: new Date().toISOString(),
};

const tokens: VisualSearchToken[] = [
  // Row 1: Rebar schedule for F1 -> 8Ø16 L=2.10m QTY=4 => (256/162.2)*2.10*32/1000 = 0.106 ton
  { id: "t1", text: "F1", x: 0.1, y: 0.10, w: 0.04, h: 0.02, source: "pdf_text" },
  { id: "t2", text: "8Ø16", x: 0.2, y: 0.10, w: 0.06, h: 0.02, source: "pdf_text" },
  { id: "t3", text: "L=2.10", x: 0.3, y: 0.10, w: 0.06, h: 0.02, source: "pdf_text" },
  { id: "t4", text: "QTY=4", x: 0.4, y: 0.10, w: 0.06, h: 0.02, source: "pdf_text" },

  // Row 2: Steel section schedule -> IPE 300 L=12.0 QTY=10 => 42.2 * 12 * 10 / 1000 = 5.064 ton
  { id: "t5", text: "IPE 300", x: 0.1, y: 0.20, w: 0.08, h: 0.02, source: "pdf_text" },
  { id: "t6", text: "L=12.0", x: 0.25, y: 0.20, w: 0.06, h: 0.02, source: "pdf_text" },
  { id: "t7", text: "QTY=10", x: 0.38, y: 0.20, w: 0.06, h: 0.02, source: "pdf_text" },

  // Row 3: Base Plate schedule -> PL 16mm 0.50x0.50 QTY=20 => 0.5*0.5*16*7.85*20/1000 = 0.628 ton
  { id: "t8", text: "PL 16mm 0.50x0.50", x: 0.1, y: 0.30, w: 0.15, h: 0.02, source: "pdf_text" },
  { id: "t9", text: "QTY=20", x: 0.35, y: 0.30, w: 0.06, h: 0.02, source: "pdf_text" },
];

const results = extractStructuredTakeoffFromTokens(mockSheet, tokens);

const rebar = results.find((r) => r.itemCode === "F1-Ø16");
assert.ok(rebar, "Rebar F1-Ø16 should be extracted");
assert.equal(rebar.unit, "طن");
assert.equal(rebar.quantity, 0.106, "Expected 0.106 ton for F1 rebar");

const ipe = results.find((r) => r.itemCode === "IPE 300");
assert.ok(ipe, "Steel section IPE 300 should be extracted");
assert.equal(ipe.unit, "طن");
assert.equal(ipe.quantity, 5.064, "Expected 5.064 ton for IPE 300");

const plate = results.find((r) => r.itemCode === "PL-16mm");
assert.ok(plate, "Steel plate PL-16mm should be extracted");
assert.equal(plate.unit, "طن");
assert.equal(plate.quantity, 0.628, "Expected 0.628 ton for PL 16mm");

console.log("PASS [rebar_steel_schedule]: Rebar=0.106t, IPE300=5.064t, BasePlate=0.628t.");
