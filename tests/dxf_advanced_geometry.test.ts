import { strict as assert } from "node:assert";
import { computePolylineGeometry } from "../src/utils/dxfParser";

// 1. Semicircle arc test: chord from (0,0) to (10,0) with bulge = 1 (180 deg CCW semicircle, r = 5)
const semiOpen = computePolylineGeometry(
  [
    { x: 0, y: 0, bulge: 1 },
    { x: 10, y: 0 },
  ],
  false
);
const expectedArcLen = Math.PI * 5; // 15.70796...
assert.ok(Math.abs(semiOpen.length - expectedArcLen) < 0.01, `Expected arc length ~${expectedArcLen}, got ${semiOpen.length}`);

// 2. Closed D-shape (semicircle closed by straight diameter): area = 0.5 * PI * r^2 = 39.27
const semiClosed = computePolylineGeometry(
  [
    { x: 0, y: 0, bulge: 1 },
    { x: 10, y: 0 },
  ],
  true
);
const expectedArea = 0.5 * Math.PI * 25; // 39.2699...
assert.ok(Math.abs(semiClosed.area - expectedArea) < 0.05, `Expected semicircle area ~${expectedArea}, got ${semiClosed.area}`);

// 3. Full circle made of two bulge=1 segments (r = 5): area = PI * 25 = 78.54
const fullCircle = computePolylineGeometry(
  [
    { x: 0, y: 0, bulge: 1 },
    { x: 10, y: 0, bulge: 1 },
  ],
  true
);
const expectedCircleArea = Math.PI * 25;
assert.ok(Math.abs(fullCircle.area - expectedCircleArea) < 0.05, `Expected full circle area ~${expectedCircleArea}, got ${fullCircle.area}`);

console.log("PASS [dxf_advanced_geometry]: Bulge arc length, semicircle area, and full-circle polyline area verified.");
