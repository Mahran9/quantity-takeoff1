import { strict as assert } from "node:assert";
import { readCadMembers, parseBeamSchedules } from "../src/engine/cadMembers";

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
assert.deepEqual(s.sections.GB1, { b: 0.2, h: 0.6 });
assert.deepEqual(s.sections.GB9, { b: 0.5, h: 0.6 });

const out = readCadMembers(dxf);
assert.equal(out.length, 1, "one ground-beam line for the one plan");
const gb = out[0];
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

// No schedule → nothing guessed.
assert.equal(readCadMembers({ unitInfo: { toMeters: 1 }, parsedData: { entities: plan, blocks: {} } }).length, 0);
console.log("cad_members ok");
