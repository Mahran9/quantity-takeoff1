import { strict as assert } from "node:assert";
import { parseColumnSchedule, parseFootingSchedule, scheduleVolumes, DEFAULT_COLUMN_HEIGHT } from "../src/engine/schedules";
import { readMarks } from "../src/engine/marks";
import { mergeRepeatedMarks } from "../src/engine/candidate";

const near = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} ≠ ${b}`);

// Column schedule written as "C1 (20x50)".
const cs = parseColumnSchedule(["C1 (20x50)", "C2 (30x50)", "C8 (20 X 100)", "LATERAL TIES"]);
assert.deepEqual(cs, { C1: { b: 0.2, h: 0.5 }, C2: { b: 0.3, h: 0.5 }, C8: { b: 0.2, h: 1 } });

// Footing schedule as displayed on a rotated sheet: one row per footing, headings "P.C DIMENSIONS (CM)" and
// "R.C DIMENSIONS (CM)" each centred over their L / W / H columns (the layout of a real villa set).
type T = { text: string; x: number; y: number; w: number };
const tok = (text: string, x: number, y: number, w = 0.009): T => ({ text, x, y, w });
const heads: T[] = [
  tok("P.C DIMENSIONS (CM)", 0.3586, 0.4035, 0.059), tok("R.C DIMENSIONS (CM)", 0.4504, 0.4035, 0.0593),
  tok("L", 0.3617, 0.4199, 0.0041), tok("W", 0.3908, 0.4199, 0.0069), tok("H", 0.4216, 0.4199, 0.0053),
  tok("L", 0.4509, 0.4199, 0.0041), tok("W", 0.4789, 0.4199, 0.0069), tok("H", 0.5100, 0.4199, 0.0053),
];
const rows: [string, number[], number[]][] = [
  ["F1", [160, 120, 10], [140, 110, 50]],
  ["F2", [190, 130, 10], [170, 120, 50]],
  ["F3", [210, 90, 10], [190, 80, 50]],
  ["F4", [170, 120, 10], [150, 110, 50]],
  ["F5", [], []], // "as PLAN"
];
const xs = [0.3606, 0.3899, 0.4195, 0.4485, 0.4778, 0.5085];
const grid: T[] = [...heads];
rows.forEach(([m, pc, rc], i) => {
  const y = 0.45 + i * 0.027;
  grid.push(tok(m, 0.33, y, 0.008));
  [...pc, ...rc].forEach((v, k) => grid.push(tok(String(v), xs[k], y)));
});
const fs = parseFootingSchedule(grid)!;
assert.equal(fs.unit, "cm");
assert.deepEqual(fs.marks.F1, { pc: { L: 1.6, W: 1.2, H: 0.1 }, rc: { L: 1.4, W: 1.1, H: 0.5 } });
assert.deepEqual(fs.marks.F3.rc, { L: 1.9, W: 0.8, H: 0.5 });

// Joined with the counted marks: footing plan (F) + two floor plans (C) + schedules on their own sheets.
const sheetOf = (id: string, words: { text: string; x?: number; y?: number; w?: number }[]): any => ({
  id, code: id.toUpperCase(), title: id,
  visualTokens: words.map((t, i) => ({ id: `${id}${i}`, text: t.text, x: t.x ?? 0.1, y: t.y ?? 0.1, w: t.w ?? 0.01, h: 0.01, source: "pdf_text" })),
});
const w = (s: string, n: number) => Array.from({ length: n }, () => ({ text: s }));
const plan = sheetOf("p3", [...w("F1", 2), ...w("F3", 1), ...w("F5", 1), ...w("C1", 2), { text: "FOOTING" }, { text: "Ø12" }]);
const ground = sheetOf("p2", [...w("C1", 2), ...w("C2", 1), { text: "Ø12" }, { text: "SLAB" }, { text: "FOOTING" }]);
const sched = sheetOf("p12", grid);
const colSched = sheetOf("p11", [{ text: "C1 (20x50)" }, { text: "C2 (30x50)" }, ...w("SCHEDULE", 4)]);
const sheets = [plan, ground, sched, colSched];
const counted = mergeRepeatedMarks(sheets.map((s) => ({ sheetId: s.id, code: s.code, cands: readMarks(s).filter((c) => c.selected) })));
const vol = scheduleVolumes(sheets, counted);
const get = (id: string) => vol.lines.find((l) => l.cand.id === id)!;
near(get("sch-footing-rc").cand.quantity, 2 * 1.4 * 1.1 * 0.5 + 1.9 * 0.8 * 0.5, "RC footings");
near(get("sch-footing-pc").cand.quantity, Math.round((2 * 1.6 * 1.2 * 0.1 + 2.1 * 0.9 * 0.1) * 1000) / 1000, "blinding");
assert.ok(get("sch-footing-rc").cand.checks.some((c) => /F5/.test(c)), "missing sizes reported");
const col = get("sch-columns");
assert.equal(col.sheetId, "p2", "columns from the floor plan, not the footing plan");
near(col.cand.quantity, Math.round((2 * 0.2 * 0.5 + 0.3 * 0.5) * DEFAULT_COLUMN_HEIGHT * 1000) / 1000, "columns");
assert.equal(col.cand.review, true, "assumed height → needs review");
assert.ok(vol.replaced.some((r) => r.sheetId === "p3" && r.id === "mrk-F"), "footing count replaced by its volume");
assert.ok(vol.replaced.some((r) => r.sheetId === "p12" && r.id === "mrk-F"), "schedule header row is not a plan");

// Second layout (a real commercial set): marks down the first column (F… and combined CF…), LENGTH / WIDTH /
// DEPTH across, values in metres, headings "PLAIN CONCRETE" / "REINF. CONCRETE" starting at their group's edge,
// and rebar columns headed "SHORT REINFORCEMENT" right after them — not a concrete heading.
const g2: T[] = [
  tok("MARK", 0.182, 0.252, 0.015), tok("PLAIN CONCRETE", 0.216, 0.244, 0.04), tok("REINF. CONCRETE", 0.282, 0.244, 0.042),
  tok("SHORT REINFORCEMENT", 0.34, 0.244, 0.05), tok("LONG REINFORCEMENT", 0.409, 0.244, 0.05),
  tok("LENGTH", 0.202, 0.259, 0.016), tok("WIDTH", 0.226, 0.259, 0.014), tok("DEPTH", 0.248, 0.259, 0.014),
  tok("LENGTH", 0.269, 0.259, 0.016), tok("WIDTH", 0.293, 0.259, 0.014), tok("DEPTH", 0.315, 0.259, 0.014),
];
const rows2: [string, number[]][] = [
  ["F1", [1.4, 1.4, 0.1, 1.2, 1.2, 0.6]], ["F2", [2.7, 2.3, 0.1, 2.5, 2.1, 0.6]], ["F3", [3, 2.6, 0.1, 2.8, 2.4, 0.6]],
  ["CF1", [4.7, 2.7, 0.1, 4.5, 2.5, 0.6]], ["CF2", [15.2, 5, 0.1, 15, 4.8, 0.6]],
];
const xs2 = [0.209, 0.229, 0.249, 0.271, 0.295, 0.315];
rows2.forEach(([m, v], i) => {
  const y = 0.275 + i * 0.016;
  g2.push(tok(m, 0.184, y, 0.01));
  v.forEach((n, k) => g2.push(tok(n.toFixed(2), xs2[k], y, 0.011)));
  g2.push(tok("Ø16@150", 0.345, y, 0.03));
});
const fs2 = parseFootingSchedule(g2)!;
assert.equal(fs2.unit, "m");
assert.deepEqual(fs2.marks.F1, { pc: { L: 1.4, W: 1.4, H: 0.1 }, rc: { L: 1.2, W: 1.2, H: 0.6 } });
assert.deepEqual(fs2.marks.CF2.rc, { L: 15, W: 4.8, H: 0.6 });
// F and CF counted on one footing plan both join the schedule.
const plan2 = sheetOf("p5", [...w("F1", 3), ...w("F2", 1), ...w("CF1", 2), ...w("CF2", 1), { text: "FOOTING" }, { text: "Ø16" }]);
const sched2 = sheetOf("p14", g2);
const sheets2 = [plan2, sched2];
const counted2 = mergeRepeatedMarks(sheets2.map((s) => ({ sheetId: s.id, code: s.code, cands: readMarks(s).filter((c) => c.selected) })));
const vol2 = scheduleVolumes(sheets2, counted2);
const rc2 = vol2.lines.find((l) => l.cand.id === "sch-footing-rc")!;
near(rc2.cand.quantity, Math.round((3 * 1.2 * 1.2 * 0.6 + 2.5 * 2.1 * 0.6 + 2 * 4.5 * 2.5 * 0.6 + 15 * 4.8 * 0.6) * 1000) / 1000, "RC with CF");
for (const id of ["mrk-F", "mrk-CF"]) assert.ok(vol2.replaced.some((r) => r.sheetId === "p5" && r.id === id), `${id} replaced by volume`);
console.log("schedules ok");
