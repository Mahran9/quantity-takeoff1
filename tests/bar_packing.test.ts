import { strict as assert } from "node:assert";
import { packBarsFFD } from "../src/utils/barPacking";

// 1) 7 m columns: one per 12 m bar leaves 5 m; a 5 m piece fits into that leftover.
const a = packBarsFFD([{ length: 7, qty: 3 }, { length: 5, qty: 3 }], 12);
assert.equal(a.barCount, 3, "3 bars (7+5 each)");
assert.equal(a.wasteLength, 0);
assert.equal(a.usedLength, 36);

// 2) Without reuse possibility: 7 m × 2 => 2 bars, 10 m waste
const b = packBarsFFD([{ length: 7, qty: 2 }], 12);
assert.equal(b.barCount, 2);
assert.equal(b.wasteLength, 10);
assert.equal(b.wastePercent, 41.67);

// 3) First-fit-decreasing order: 6,6,4,4,4,4 on 10 m bars => 6+4 ×2 and 4+4 => 3 bars
const c = packBarsFFD([{ length: 4, qty: 4 }, { length: 6, qty: 2 }], 10);
assert.equal(c.barCount, 3);
assert.equal(c.bars[0].cuts.join(","), "6,4");

// 4) Cuts over stock length are reported, not packed; invalid rows ignored
const d = packBarsFFD([{ length: 13, qty: 2 }, { length: 0, qty: 5 }, { length: 3, qty: 0 }, { length: 6, qty: 1 }], 12);
assert.equal(d.barCount, 1);
assert.deepEqual(d.oversizedCuts, [13, 13]);

// 5) No floating point drift: 0.1 m × 120 pieces exactly fills one 12 m bar
const e = packBarsFFD([{ length: 0.1, qty: 120 }], 12);
assert.equal(e.barCount, 1);
assert.equal(e.wasteLength, 0);

// 6) Weight example: 3 bars of HEA300 (88.3 kg/m) × 12 m = 3.1788 t
assert.equal(Number(((a.barCount * 12 * 88.3) / 1000).toFixed(3)), 3.179);

console.log("PASS [bar_packing]: FFD reuse of leftovers, waste %, oversize cuts, mm-integer exactness verified.");
