import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { parseDxfContent, extractEngineeringQuantitiesFromDxf } from "../src/utils/dxfParser";

const dxfPath = path.resolve(process.cwd(), "tests/fixtures/synthetic_structural_test.dxf");
const rawDxf = fs.readFileSync(dxfPath, "utf-8");

// 1. Parse the raw DXF file using the bundled dxf-parser
const parsed = parseDxfContent(rawDxf);

assert.equal(parsed.unitInfo?.code, 4, "Expected $INSUNITS = 4 (mm)");
assert.equal(parsed.unitInfo?.toMeters, 0.001, "Expected mm -> m scale factor 0.001");
assert.equal(parsed.detectedBlocks.find((b) => b.name === "C1")?.count, 4, "Expected 4 C1 INSERT blocks");

// 2. Extract engineering quantities using auto-detected unitScaleFactor (no manual override needed)
const items = extractEngineeringQuantitiesFromDxf(parsed);
const find = (layer: string, type: string) => items.find((item) => item.layer === layer && item.type === type);

assert.equal(find("S-SLAB", "volume")?.value, 12, "Slab volume should be 12.00 m³");
assert.equal(find("S-FOOTINGS", "volume")?.value, 4.5, "Footings volume should be 4.50 m³");
assert.equal(find("S-BEAMS", "linear")?.value, 36, "Beams length should be 36.00 m");
assert.equal(items.find((item) => item.name === "C1" && item.type === "count")?.value, 4, "C1 count should be 4");
assert.equal(items.filter((item) => item.layer === "S-SLAB" && item.type === "linear").length, 0, "No duplicate slab perimeter line");
assert.equal(items.filter((item) => item.layer === "S-FOOTINGS" && item.type === "linear").length, 0, "No duplicate footing perimeter lines");

console.log("PASS [raw_dxf_integration]: Raw DXF parsed ($INSUNITS=mm), Slab=12m³, Footings=4.5m³, Beams=36m, C1=4, zero duplicates.");
