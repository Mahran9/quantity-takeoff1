import { strict as assert } from "node:assert";
import { claddingAreas } from "../src/utils/cladding";
// 69.78 x 29.8 m gable, eave 7.5 m, ridge 9 m; block walls -> no sheeted walls.
const a = claddingAreas(69.78, 29.8, 7.5, 9, 0, 0);
assert.ok(Math.abs(a.roof - 2 * 69.78 * Math.hypot(14.9, 1.5)) < 0.01, "roof = 2 x L x slope length");
assert.ok(Math.abs(a.roof - 2090.0) < 0.6, String(a.roof));
assert.equal(a.walls, 0);
const w = claddingAreas(69.78, 29.8, 7.5, 9, 100, 100);
assert.ok(Math.abs(w.gross - 1538.4) < 0.2, String(w.gross));
assert.ok(Math.abs(w.walls - (w.gross - 100)) < 0.01);
console.log("OK [cladding]");
