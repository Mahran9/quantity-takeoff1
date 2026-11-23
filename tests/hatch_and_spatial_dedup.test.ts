import { strict as assert } from "node:assert";
import {
  analyzeParsedDxfObject,
  computeHatchNetArea,
  isHatchSpatialDuplicateOfPolyline,
  extractEngineeringQuantitiesFromDxf,
} from "../src/utils/dxfParser";

const rect = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

// Scenario 1: Hatch with 1 internal opening (10x10 = 100 minus 2x2 = 4 => 96)
{
  const res = computeHatchNetArea([
    { polylineVertices: rect(0, 0, 10, 10) },
    { polylineVertices: rect(4, 4, 2, 2) },
  ]);
  assert.equal(Number(res.netArea.toFixed(2)), 96, "Scenario 1: 100 - 4 = 96");
  assert.equal(res.holeCount, 1);
}

// Scenario 2: Hatch with multiple internal openings (10x10 = 100 minus two 2x2 = 8 => 92)
{
  const res = computeHatchNetArea([
    { polylineVertices: rect(0, 0, 10, 10) },
    { polylineVertices: rect(1, 1, 2, 2) },
    { polylineVertices: rect(6, 6, 2, 2) },
  ]);
  assert.equal(Number(res.netArea.toFixed(2)), 92, "Scenario 2: 100 - 4 - 4 = 92");
  assert.equal(res.holeCount, 2);
}

// Scenario 3: Hole inside a hole (nested island): outer 100 - hole 36 + island 4 = 68
{
  const res = computeHatchNetArea([
    { polylineVertices: rect(0, 0, 10, 10) }, // 100 (depth 0 -> +)
    { polylineVertices: rect(2, 2, 6, 6) },   // 36  (depth 1 -> -)
    { polylineVertices: rect(4, 4, 2, 2) },   // 4   (depth 2 -> +)
  ]);
  assert.equal(Number(res.netArea.toFixed(2)), 68, "Scenario 3: 100 - 36 + 4 = 68");
  assert.equal(res.holeCount, 1);
}

// Scenario 4: Full circle opening inside a hatch (10x10 = 100 minus circle r=2 => 100 - 12.57 = 87.43)
{
  const res = computeHatchNetArea([
    { polylineVertices: rect(0, 0, 10, 10) },
    { center: { x: 5, y: 5 }, radius: 2 },
  ]);
  const expected = Number((100 - Math.PI * 4).toFixed(2)); // 87.43
  assert.ok(Math.abs(res.netArea - expected) < 0.05, `Scenario 4: expected ~${expected}, got ${res.netArea}`);
  assert.equal(res.holeCount, 1);
}

// Scenario 5: Almost-matching hatch & polyline (same location, 1% diff -> dedup; 10% diff -> keep)
{
  const polyFootprints = [{ area: 100, bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 } }];
  // 1% diff, almost identical bbox -> deduplicate
  assert.equal(
    isHatchSpatialDuplicateOfPolyline(99.0, { minX: 0.05, minY: 0.05, maxX: 10, maxY: 10 }, polyFootprints),
    true,
    "Scenario 5a: 1% diff at same location must deduplicate"
  );
  // 10% diff -> NOT duplicate
  assert.equal(
    isHatchSpatialDuplicateOfPolyline(90.0, { minX: 0, minY: 0, maxX: 9.5, maxY: 9.5 }, polyFootprints),
    false,
    "Scenario 5b: 10% diff must NOT deduplicate"
  );
}

// Scenario 6: Identical hatch & polyline on TWO DIFFERENT layers -> BOTH kept (no cross-layer dedup)
{
  const parsed = analyzeParsedDxfObject({
    header: { $INSUNITS: 6 },
    entities: [
      { type: "LWPOLYLINE", layer: "S-SLAB", shape: true, vertices: rect(0, 0, 10, 10) },
      { type: "HATCH", layer: "A-TILES", boundaryPaths: [{ polylineVertices: rect(0, 0, 10, 10) }] },
    ],
  });
  assert.equal(parsed.deduplicatedHatchCount, 0, "Scenario 6: Different layers must NOT deduplicate");
  assert.equal(parsed.layers.find((l) => l.name === "S-SLAB")?.areaSum, 100);
  assert.equal(parsed.layers.find((l) => l.name === "A-TILES")?.areaSum, 100);
}

// Scenario 7: Multiple slabs on the SAME layer in DIFFERENT locations (50 m² poly + 50 m² hatch elsewhere => 100 m² total!)
{
  const parsed = analyzeParsedDxfObject({
    header: { $INSUNITS: 6 },
    entities: [
      { type: "LWPOLYLINE", layer: "S-SLAB", shape: true, vertices: rect(0, 0, 10, 5) },          // 50 m² at x=[0..10]
      { type: "HATCH", layer: "S-SLAB", boundaryPaths: [{ polylineVertices: rect(20, 0, 10, 5) }] }, // 50 m² at x=[20..30]
    ],
  });
  assert.equal(parsed.deduplicatedHatchCount, 0, "Scenario 7: Separate slabs on same layer must NOT deduplicate");
  assert.equal(parsed.layers.find((l) => l.name === "S-SLAB")?.areaSum, 100, "Scenario 7: Total slab area = 50 + 50 = 100 m²");
}

// Scenario 8: Repeated INSERT blocks on a layer
{
  const parsed = analyzeParsedDxfObject({
    header: { $INSUNITS: 6 },
    entities: [
      { type: "INSERT", layer: "ST-COLS", name: "SC1", position: { x: 0, y: 0 } },
      { type: "INSERT", layer: "ST-COLS", name: "SC1", position: { x: 6, y: 0 } },
      { type: "INSERT", layer: "ST-COLS", name: "SC1", position: { x: 12, y: 0 } },
    ],
  });
  assert.equal(parsed.detectedBlocks.find((b) => b.name === "SC1")?.count, 3, "Scenario 8: 3 repeated SC1 INSERTs");
}

// Scenario 9: Model Space + Paper Space together (Paper Space must be skipped)
{
  const parsed = analyzeParsedDxfObject({
    header: { $INSUNITS: 6 },
    entities: [
      { type: "LWPOLYLINE", layer: "S-SLAB", shape: true, vertices: rect(0, 0, 10, 8), inPaperSpace: false },
      { type: "LWPOLYLINE", layer: "S-SLAB", shape: true, vertices: rect(0, 0, 10, 8), inPaperSpace: true },
    ],
  });
  assert.equal(parsed.skippedPaperSpaceCount, 1, "Scenario 9: 1 Paper Space entity skipped");
  assert.equal(parsed.layers.find((l) => l.name === "S-SLAB")?.areaSum, 80, "Scenario 9: Only Model Space 80 m² counted");
}

// Scenario 10: Millimeter units ($INSUNITS=4) with bulge arcs + hatch + thickness note
{
  // Full circle of radius 5000 mm (5 m) via 2 bulge=1 vertices => area = PI * 25 = 78.54 m²
  const parsed = analyzeParsedDxfObject({
    header: { $INSUNITS: 4 },
    entities: [
      {
        type: "HATCH",
        layer: "S-SOG-FLOOR",
        boundaryPaths: [
          {
            polylineVertices: [
              { x: 0, y: 0, bulge: 1 },
              { x: 10000, y: 0, bulge: 1 },
            ],
          },
        ],
      },
      { type: "TEXT", layer: "S-NOTES", text: "SOG THK = 200 mm", position: { x: 0, y: 0 } },
    ],
  });
  assert.equal(parsed.unitInfo?.toMeters, 0.001, "Scenario 10: mm -> m = 0.001");
  const items = extractEngineeringQuantitiesFromDxf(parsed);
  const sogVol = items.find((i) => i.layer === "S-SOG-FLOOR" && i.type === "volume");
  const expectedVol = Number((Math.PI * 25 * 0.2).toFixed(2)); // 15.71 m³
  assert.ok(sogVol && Math.abs(sogVol.value - expectedVol) < 0.05, `Scenario 10: expected ~${expectedVol} m³, got ${sogVol?.value}`);
}

// Scenario 11: Verify deduplicatedHatches audit list records layer, diff%, IoU%, and reason
{
  const parsed = analyzeParsedDxfObject({
    header: { $INSUNITS: 6 },
    entities: [
      { type: "LWPOLYLINE", layer: "S-SLAB", shape: true, vertices: rect(0, 0, 10, 10) },
      { type: "HATCH", layer: "S-SLAB", boundaryPaths: [{ polylineVertices: rect(0, 0, 10, 10) }] },
    ],
  });
  assert.equal(parsed.deduplicatedHatchCount, 1, "Scenario 11: 1 duplicate hatch excluded");
  assert.equal(parsed.deduplicatedHatches?.length, 1, "Scenario 11: excluded list has 1 record");
  const rec = parsed.deduplicatedHatches![0];
  assert.equal(rec.layer, "S-SLAB");
  assert.equal(rec.netAreaRaw, 100);
  assert.equal(rec.matchedPolylineAreaRaw, 100);
  assert.equal(rec.areaDiffPercent, 0);
  assert.equal(rec.bboxIoU, 100);
  assert.ok(rec.reason.includes("LWPOLYLINE"), "Scenario 11: reason must explain match");
}

console.log("PASS [hatch_and_spatial_dedup]: All 11 spatial dedup, nested holes, circle, PaperSpace, mm+bulge+hatch, and excluded audit list scenarios passed.");
