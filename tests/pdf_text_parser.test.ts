import { strict as assert } from "node:assert";
import { parsePdfEngineeringText } from "../src/utils/pdfText";

const samplePdfText = `S-01 STRUCTURAL TEST PLAN
C1 C1 C1 C1
SLAB: 10.00 x 8.00 m; thickness 150 mm
FOOTINGS: 4 x (1.50 x 1.50 x 0.50 m)
COLUMNS: C1 300 x 300 mm (4 No.); BEAMS: B1 250 x 500 mm; perimeter length 36.00 m`;

const parsed = parsePdfEngineeringText(samplePdfText);
assert.equal(parsed.detectedCode, "S-01");
assert.ok(parsed.detectedSchedules.includes("C1"), "Should detect C1");
assert.ok(parsed.detectedSchedules.includes("B1"), "Should detect B1");
assert.ok(parsed.detectedDimensions.length >= 3, "Should detect at least 3 explicit dimensions");

console.log("PASS [pdf_text_parser]: Code=S-01, Schedules=", parsed.detectedSchedules, "Dims=", parsed.detectedDimensions);
