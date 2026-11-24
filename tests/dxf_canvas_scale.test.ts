import { strict as assert } from "node:assert";
import { analyzeParsedDxfObject, dxfMetersPerCanvasPixel } from "../src/utils/dxfParser";

// A 20 m x 10 m rectangle drawn on a 1000x700 canvas (40 px padding) must measure 20 m and 10 m on screen.
const rect = (s: number) => ({
  type: "LWPOLYLINE", layer: "WALL", shape: true,
  vertices: [{ x: 0, y: 0 }, { x: 20 * s, y: 0 }, { x: 20 * s, y: 10 * s }, { x: 0, y: 10 * s }],
});
const parse = (insunits: number, s: number) =>
  analyzeParsedDxfObject({ header: { $INSUNITS: insunits }, tables: { layer: { layers: {} } }, blocks: {}, entities: [rect(s)] } as any);

for (const [code, s, label] of [[6, 1, "m"], [4, 1000, "mm"], [5, 100, "cm"]] as const) {
  const p = parse(code, s);
  const mpp = dxfMetersPerCanvasPixel(p as any, 1000, 700);
  // width-limited: 920 px for 20 m
  const widthPx = 20 * s * Math.min(920 / (20 * s), 620 / (10 * s));
  assert.ok(Math.abs(widthPx * mpp - 20) < 1e-6, `${label}: 20 m wall measures ${widthPx * mpp}`);
}

// Unitless file: the unit is inferred from the span (20000 → mm), so the scale is still known.
const guessed = parse(0, 1000);
assert.ok(guessed.unitInfo?.guessed, "unit inferred");
assert.ok(dxfMetersPerCanvasPixel(guessed as any, 1000, 700) > 0, "inferred unit gives a scale");

assert.equal(dxfMetersPerCanvasPixel(undefined, 1000, 700), 0, "no summary → unknown");
console.log("dxf_canvas_scale ok");
