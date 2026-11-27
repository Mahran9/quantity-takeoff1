import assert from "node:assert/strict";
import { basePlateKg, anchorBoltKg, pedestalM3, bracingMetres, sectionBox } from "../src/engine/steelRules";

assert.deepEqual(sectionBox("IPE600"), { d: 600, b: 270 });
assert.deepEqual(sectionBox("HEA240"), { d: 240, b: 240 });
assert.equal(sectionBox("SHS100"), null);
// IPE600 plate: (600+200)×(270+200)×20 mm × 7850 = 59.03 kg
assert.ok(Math.abs(basePlateKg("IPE600")! - 59.03) < 0.1);
// 4 × M24 × 0.7 m × 0.00617·24² = 4×0.7×3.554 = 9.95 kg
assert.ok(Math.abs(anchorBoltKg() - 9.95) < 0.05);
// pedestal IPE600: (0.6+0.3)×(0.27+0.3)→max(0.5,0.57)=0.57 × 0.9 × 0.6
assert.ok(Math.abs(pedestalM3("IPE600")! - 0.9 * 0.57 * 0.6) < 1e-9);
const b = bracingMetres({ L: 69.78, W: 29.8, eave: 8, slope: 15.3, bays: 11, purlinLines: 24 });
assert.equal(b.nb, 3); // end bays + bay 5
assert.equal(b.rows, 2); // bay 6.3 m ≥ 6
assert.ok(b.roofDiag > 150 && b.wallDiag > 100 && b.sag > 300);
console.log("PASS steel_rules");
