import assert from "node:assert/strict";
import { calibrateScale } from "../src/utils/pdfPlan";

// Sheet shrunk to fit the paper: drawn at ~1:157, not a standard ratio.
const R = 1000 / (0.352778 * 157); // pt per metre
const seg = (m: number, y: number) => ({ closed: false, points: [[50, y], [50 + m * R, y]] }) as any;
const dims = [22, 16, 25, 8.5, 5, 3.5, 6, 9.55, 17.9, 28, 12, 4.5, 7.2, 10, 13.5];
const paths = dims.map((m, i) => seg(m, 100 + i * 20));
// noise edges so a common scale cannot match by luck
for (let i = 0; i < 40; i++) paths.push(seg(1.3 + i * 0.37, 400 + i * 5));
const r = calibrateScale(paths, dims, { width: 842, height: 1191 });
assert.ok(r.best, "free scale found");
assert.ok(Math.abs(r.best!.denominator - 157) < 4, `denominator ${r.best!.denominator}`);
assert.equal(r.confidence, "medium");
console.log("PASS [pdf_free_scale]");

// Few numbers (levels only, no dimensions): must NOT invent a scale.
const few = calibrateScale(paths, [5900, 11000, 12500, 0.5, 3, 7], { width: 842, height: 1191 });
assert.ok(!few.best || Number.isInteger(few.best.denominator), "no free scale from a handful of numbers");
console.log("PASS [pdf_free_scale: no false positive]");
