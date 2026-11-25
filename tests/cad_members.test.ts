import { strict as assert } from "node:assert";
import { readCadMembers, parseBeamSchedules, parseBar, parseStirrup, kgPerM, beamRebarKg, columnRebarKg, footingRebarKg } from "../src/engine/cadMembers";

// Synthetic framing plan in metres: four beams drawn as edge pairs between columns, labelled GB1 / GB2, with the
// beam schedule pasted as a block (as real DWG sets do), plus noise that must not count as beams.
const L = (x1: number, y1: number, x2: number, y2: number, layer = "BEAM") => ({ type: "LINE", layer, vertices: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });
const T = (text: string, x: number, y: number, layer = "TEXT") => ({ type: "TEXT", layer, text, startPoint: { x, y }, position: { x, y } });

const schedule = [
  T("SCHEDULE OF GRADE BEAMS", 0, 5), T("MARK", 0, 4), T("WIDTH", 3, 4), T("DEPTH", 5, 4),
  T("GB1", 0, 3), T("0.20", 3, 3.1), T("0.60", 5, 3),
  T("GB2", 0, 1.5), T("0.30", 3, 1.5), T("0.60", 5, 1.5),
  T("GB9", 0, 0), T("%%U0.50", 3, 0), T("0.60", 5, 0),
];
const plan = [
  L(0, 0, 10, 0), L(0, 0.2, 10, 0.2), T("GB1", 5, 0.5), // 10 m, 0.20 wide
  L(0, 10, 10, 10), L(0, 10.2, 10, 10.2), T("GB1", 5, 10.5), // 10 m
  L(0, 1, 0, 9), L(0.3, 1, 0.3, 9), T("GB2", 0.8, 5), // 8 m, 0.30 wide
  L(10, 1, 10, 9), L(10.3, 1, 10.3, 9), T("GB2", 10.8, 5), // 8 m
  // Dimension line with its extension lines: parallel but far from any label.
  L(0, -4, 10, -4, "DIM"), L(0, -4.5, 10, -4.5, "DIM"),
  T("GRADE BEAM FRAMING PLAN", 5, -8),
];
const dxf = {
  unitInfo: { toMeters: 1 },
  parsedData: {
    entities: [...plan, { type: "INSERT", layer: "0", name: "TBL", position: { x: 500, y: 500 } }],
    blocks: { TBL: { entities: schedule }, UNUSED: { entities: [T("GB1", 0, 0), T("0.25", 3, 0), T("0.90", 5, 0), T("GB2", 0, 1), T("0.25", 3, 1), T("0.90", 5, 1)] } },
  },
};

const s = parseBeamSchedules(schedule.map((t) => ({ s: t.text.replace("%%U", ""), x: t.startPoint.x, y: t.startPoint.y })));
assert.deepEqual([s.sections.GB1.b, s.sections.GB1.h], [0.2, 0.6]);
assert.deepEqual([s.sections.GB9.b, s.sections.GB9.h], [0.5, 0.6]);

const out = readCadMembers(dxf);
assert.equal(out.filter((c) => c.id.endsWith("-GB")).length, 1, "one ground-beam line for the one plan");
const gb = out.find((c) => c.id.endsWith("-GB"))!;
assert.ok(Math.abs(gb.quantity - (20 * 0.2 * 0.6 + 16 * 0.3 * 0.6)) < 1e-6, `GB volume ${gb.quantity}`);
assert.match(gb.description, /للميدات/);
assert.match(gb.description, /GRADE BEAM FRAMING PLAN/);
assert.equal(gb.layer, "BEAM", "dimension layer not taken as beams");
assert.equal(gb.unit, "م³");

// Same plan in millimetres: the unit factor scales everything.
const mm = JSON.parse(JSON.stringify(dxf, (k, v) => (k === "x" || k === "y" ? v * 1000 : v)));
mm.unitInfo.toMeters = 0.001;
const outMm = readCadMembers(mm);
assert.ok(Math.abs(outMm[0].quantity - gb.quantity) < 1e-6, "mm drawing gives the same m³");

// The ground-beam plan also gives the slab-on-grade area enclosed by its beams (≈ 10.15 × 10.1 m between centrelines).
const sog = out.find((c) => c.id.endsWith("-SOG"))!;
assert.equal(sog.unit, "م²");
assert.ok(sog.quantity > 95 && sog.quantity < 108, `slab-on-grade area ${sog.quantity}`);

// A floor framing plan: dropped beams DB1 round a 10 × 8 m bay, a C1 column at each corner, column schedule in model.
const ox = 100;
const floor = [
  L(ox + 0.3, -0.1, ox + 9.7, -0.1), L(ox + 0.3, 0.1, ox + 9.7, 0.1), T("DB1", ox + 5, 0.5),
  L(ox + 0.3, 7.9, ox + 9.7, 7.9), L(ox + 0.3, 8.1, ox + 9.7, 8.1), T("DB1", ox + 5, 8.5),
  L(ox - 0.1, 0.3, ox - 0.1, 7.7), L(ox + 0.1, 0.3, ox + 0.1, 7.7), T("DB1", ox + 0.5, 4),
  L(ox + 9.9, 0.3, ox + 9.9, 7.7), L(ox + 10.1, 0.3, ox + 10.1, 7.7), T("DB1", ox + 9.5, 4),
  T("C1", ox, -0.6), T("C1", ox + 10, -0.6), T("C1", ox, 8.6), T("C1", ox + 10, 8.6),
  T("FIRST FLOOR FRAMING PLAN", ox + 5, -6),
  T("C1", 300, 10), T("20 x 60 cm", 302, 9.5), T("C2", 300, 6), T("30 x 30 cm", 302, 5.5),
];
const dxf2 = {
  unitInfo: { toMeters: 1 },
  parsedData: {
    entities: [...floor, { type: "INSERT", layer: "0", name: "TBL2", position: { x: 500, y: 500 } }],
    blocks: { TBL2: { entities: [T("DB1", 0, 3), T("0.20", 3, 3), T("0.70", 5, 3), T("DB2", 0, 1.5), T("0.30", 3, 1.5), T("0.70", 5, 1.5)] } },
  },
};
const fl = readCadMembers(dxf2, { storeyHeight: 4, slabThickness: 0.25 });
const db = fl.find((c) => c.id.endsWith("-DB"))!;
assert.ok(Math.abs(db.quantity - 33.6 * 0.2 * 0.7) < 1e-6, `dropped beams full depth ${db.quantity}`);
const col = fl.find((c) => c.id.endsWith("-C"))!;
assert.ok(Math.abs(col.quantity - 4 * 0.2 * 0.6 * 4) < 1e-6, `columns ${col.quantity}`);
assert.match(col.description, /4 عمود/);
assert.equal(col.review, false, "height given → no review");
const slab = fl.find((c) => c.id.endsWith("-S"))!;
assert.equal(slab.unit, "م³");
assert.ok(slab.quantity > 76 * 0.25 && slab.quantity < 84 * 0.25, `slab ${slab.quantity}`);
// A beam drawn wider than its schedule is taken as drawn: GB2 is 0.30 in the schedule, drawn 0.40 here.
const wide = JSON.parse(JSON.stringify(dxf));
for (const e of wide.parsedData.entities) if (e.type === "LINE" && (e.vertices[0].x === 0.3 || e.vertices[0].x === 10.3) && e.vertices[1].x === e.vertices[0].x) { e.vertices[0].x += 0.1; e.vertices[1].x += 0.1; }
wide.parsedData.entities.push(L(0, 20, 10, 20), L(0, 20.2, 10, 20.2), T("GB1", 5, 20.5));
const gbw = readCadMembers(wide).find((c) => c.id.endsWith("-GB"))!;
assert.ok(Math.abs(gbw.quantity - (30 * 0.2 * 0.6 + 16 * 0.4 * 0.6)) < 1e-6, `drawn width taken ${gbw.quantity}`);
assert.ok(gbw.checks.some((c) => /أُخذ العرض المرسوم/.test(c)));

// Without the two numbers: columns at the default height under review, slab as an area, beams full depth.
const fl0 = readCadMembers(dxf2);
assert.equal(fl0.find((c) => c.id.endsWith("-C"))!.review, true);
assert.equal(fl0.find((c) => c.id.endsWith("-S"))!.unit, "م²");
assert.ok(Math.abs(fl0.find((c) => c.id.endsWith("-DB"))!.quantity - 33.6 * 0.2 * 0.7) < 1e-6);

// Footings: schedule (plain then reinforced L W H, metres) pasted as a block; foundation plan with repeated marks;
// a legend listing each mark once must not count as a plan.
const fsched = [
  T("PLAIN CONCRETE", 2, 12), T("REINF. CONCRETE", 8, 12), T("SHORT REINFORCEMENT", 14, 12),
  T("F1", 0, 10), ...[1.4, 1.4, 0.1, 1.2, 1.2, 0.6].map((v, i) => T(v.toFixed(2), 2 + 2 * i, 10)), T("5Ø14MM/M", 15, 10),
  T("F2", 0, 8.5), ...[2, 2, 0.1, 1.8, 1.8, 0.6].map((v, i) => T(v.toFixed(2), 2 + 2 * i, 8.5)),
  T("CF1", 0, 7), ...[4.7, 2.7, 0.1, 4.5, 2.5, 0.6].map((v, i) => T(v.toFixed(2), 2 + 2 * i, 7)),
];
const fplan = [
  ...[0, 4, 8, 12, 16, 20].map((x) => T("F1", 200 + x, 0)), T("F2", 200, 5), T("F2", 204, 5), T("CF1", 210, 5),
  T("FOUNDATION PLAN", 210, -8),
  ...["F1", "F2", "CF1", "F1", "F2", "CF1", "F1", "F2"].map((m, i) => T(m, 400 + i * 3, 0)).slice(0, 3), // legend
];
const dxf3 = { unitInfo: { toMeters: 1 }, parsedData: { entities: [...fplan, { type: "INSERT", layer: "0", name: "FS", position: { x: 600, y: 0 } }], blocks: { FS: { entities: fsched } } } };
const ft = readCadMembers(dxf3);
const frc = ft.find((c) => c.id.endsWith("-rc"))!, fpc = ft.find((c) => c.id.endsWith("-pc"))!;
assert.equal(ft.filter((c) => c.id.endsWith("-rc")).length, 1, "only the foundation plan counts");
assert.ok(Math.abs(frc.quantity - (6 * 1.2 * 1.2 * 0.6 + 2 * 1.8 * 1.8 * 0.6 + 4.5 * 2.5 * 0.6)) < 1e-6, `RC footings ${frc.quantity}`);
assert.ok(Math.abs(fpc.quantity - Math.round((6 * 1.4 * 1.4 * 0.1 + 2 * 2 * 2 * 0.1 + 4.7 * 2.7 * 0.1) * 1000) / 1000) < 1e-6, `blinding ${fpc.quantity}`);
assert.match(frc.description, /FOUNDATION PLAN \(9 قاعدة\)/);

// Rebar: notation, unit weights and the per-element formulas.
{
  assert.deepEqual(parseBar("4Ø16"), { n: 4, d: 16 });
  assert.deepEqual(parseStirrup("6Ø8/m'"), { d: 8, perM: 6 });
  assert.deepEqual(parseStirrup("1Ø10@15cm"), { d: 10, perM: 100 / 15 });
  assert.deepEqual(parseStirrup("5Ø14MM/M"), { d: 14, perM: 5 });
  assert.ok(Math.abs(kgPerM(16) - 1.580) < 0.001 && Math.abs(kgPerM(12) - 0.889) < 0.001);
  // 10 m beam in 2 spans, 0.2×0.6, 3Ø16 bottom & top, 6Ø8/m stirrups.
  const bk = beamRebarKg(10, 2, 0.2, 0.6, { bot: { n: 3, d: 16 }, top: { n: 3, d: 16 }, stirrup: { d: 8, perM: 6 } });
  const exp = 2 * 3 * (10 + 2 * 2 * 0.64) * kgPerM(16) + 6 * 10 * (2 * (0.12 + 0.52) + 0.16) * kgPerM(8);
  assert.ok(Math.abs(bk - exp) < 1e-6, `beam rebar ${bk}`);
  // 4 m column 0.2×0.6, 10Ø16, 6Ø8/m × 2 sets.
  const ck = columnRebarKg(4, { b: 0.2, h: 0.6, vert: { n: 10, d: 16 }, stirrup: { d: 8, perM: 6 }, sets: 2 });
  assert.ok(Math.abs(ck - (10 * 4.64 * kgPerM(16) + 2 * 6 * 4 * (2 * (0.12 + 0.52) + 0.16) * kgPerM(8))) < 1e-6, `column rebar ${ck}`);
  // 1.2×1.2×0.6 footing, 5Ø14/m both ways lower, 3Ø14 upper each way.
  const fk = footingRebarKg({ L: 1.2, W: 1.2, H: 0.6 }, { sl: { d: 14, perM: 5 }, su: { d: 14, n: 3 }, ll: { d: 14, perM: 5 }, lu: { d: 14, n: 3 } });
  const piece = 1.2 - 0.15 + 2 * 0.45;
  assert.ok(Math.abs(fk - 2 * (5 * 1.05 + 1 + 3) * piece * kgPerM(14)) < 1e-6, `footing rebar ${fk}`);
}
// A beam schedule with only bottom and top bars (tie beams) maps them to bottom and top.
const tbs = parseBeamSchedules([{ s: "TB1", x: 0, y: 0 }, { s: "0.20", x: 3, y: 0 }, { s: "0.60", x: 5, y: 0 }, { s: "4Ø16", x: 8, y: 0 }, { s: "4Ø16", x: 16, y: 0 }, { s: "6Ø8/m'", x: 24, y: 0 },
  { s: "TB2", x: 0, y: -1.5 }, { s: "0.20", x: 3, y: -1.5 }, { s: "0.60", x: 5, y: -1.5 }, { s: "6Ø16", x: 8, y: -1.5 }, { s: "6Ø16", x: 16, y: -1.5 }]);
assert.deepEqual(tbs.sections.TB1.bars, { bot: { n: 4, d: 16 }, botAdd: undefined, top: { n: 4, d: 16 }, topAdd: undefined, stirrup: { d: 8, perM: 6 } });
// The footing schedule above gives F1 a lower short mesh (5Ø14/m) only: one rebar line for the six F1.
const fr = ft.filter((c) => c.unit === "طن");
assert.equal(fr.length, 1);
const f1kg = 6 * footingRebarKg({ L: 1.2, W: 1.2, H: 0.6 }, { sl: { d: 14, perM: 5 } });
assert.equal(fr[0].quantity, Math.round(f1kg) / 1000);
assert.match(fr[0].checks.join(" "), /بلا تسليح مقروء في الجدول: F2، CF1/);

// No schedule → nothing guessed.
assert.equal(readCadMembers({ unitInfo: { toMeters: 1 }, parsedData: { entities: plan, blocks: {} } }).length, 0);
console.log("cad_members ok");
