import { strict as assert } from "node:assert";
import { readMarkStats } from "../src/engine/marks";

// Text items as pdfjs returns them from a real Tekla erection drawing: bolt notes are split into pieces.
const note = (n: number) => [String(n), "XM", "20", "X", "70"];
const p7 = [...note(14), ...note(14), ...note(12), ...note(12), "RF28", "RF33", "RF11", "RF9", "C3", "C35", "C36", "C4", "12500.00", "A", "B", "C"];
const s = readMarkStats(p7);
const b = s.bolts.find((x) => x.dia === 20 && x.len === 70)!;
assert.equal(b.n, 52, "14+14+12+12 bolts");
assert.equal(b.notes, 4);
assert.equal(s.families.find((f) => f.prefix === "RF")!.total, 4);
assert.equal(s.families.find((f) => f.prefix === "C")!.total, 4);
assert.equal(s.families.find((f) => f.prefix === "B"), undefined, "grid letters are not marks");
console.log("OK [marks_real]");
