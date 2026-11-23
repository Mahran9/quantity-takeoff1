import { strict as assert } from "node:assert";
import { computeHatchNetArea, isAreaDuplicateOfPolyline } from "../src/utils/dxfParser";

// 1. Hatch with internal opening (10x10 = 100 m² outer minus 2x2 = 4 m² opening => 96 m² net)
const outerSquare = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
const innerOpening = [
  { x: 4, y: 4 },
  { x: 6, y: 4 },
  { x: 6, y: 6 },
  { x: 4, y: 6 },
];

const res = computeHatchNetArea([
  { polylineVertices: outerSquare },
  { polylineVertices: innerOpening },
]);
assert.equal(Number(res.netArea.toFixed(2)), 96, `Expected 96 m² net area, got ${res.netArea}`);
assert.equal(res.holeCount, 1, "Expected 1 internal hole subtracted");

// 2. Deduplication against existing closed LWPOLYLINE on the same layer
assert.equal(isAreaDuplicateOfPolyline(100, [100]), true, "Exact match should be deduplicated");
assert.equal(isAreaDuplicateOfPolyline(99.2, [100]), true, "Within 2% tolerance should be deduplicated");
assert.equal(isAreaDuplicateOfPolyline(50, [100]), false, "Different area should NOT be deduplicated");

console.log("PASS [hatch_dedup_and_holes]: Hatch net area with hole=96 m² (100 - 4), duplicate polyline guard verified.");
