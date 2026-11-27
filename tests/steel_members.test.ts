import { strict as assert } from "node:assert";
import { readMarks } from "../src/engine/marks";

let k = 0;
const T = (text: string, x: number, y: number): any => ({ id: `t${k++}`, text, x, y, w: 0.01, h: 0.01, source: "pdf_text" });
const sheet = (code: string, toks: any[]): any => ({ id: code, code, title: code, visualTokens: toks });

// 1) Anchor-bolt plan of a portal-frame building: 12 frame lines, two columns each.
const anchor: any[] = [T("ANCHOR BOLTS PLAN", 0.5, 0.6), T("SECTION A-A", 0.2, 0.8)];
for (let i = 1; i <= 12; i++) { anchor.push(T(String(i), i * 0.07, 0.05)); anchor.push(T("IPE600", i * 0.07, 0.1), T("IPE600", i * 0.07, 0.5)); }
const a = readMarks(sheet("S-04", anchor));
const cols = a.find((c) => c.id === "mrk-col-IPE600")!;
assert.equal(cols.quantity, 24); assert.ok(cols.selected); assert.ok(/أعمدة IPE600/.test(cols.description));
const frames = a.find((c) => c.id === "mrk-frames")!;
assert.equal(frames.quantity, 12, "24 columns / 2 = 12 frames matches grid 1..12");

// 2) Roof plan of the same set: sections are named but not pre-selected; D12 tags are sag rods, never doors.
const roof: any[] = [T("ROOF PLAN", 0.5, 0.9), T("TYPICAL SAGROD CONNECTION DETAIL", 0.3, 0.9), T("ROD12", 0.4, 0.4)];
for (let i = 0; i < 6; i++) roof.push(T("D12", 0.1 + i * 0.05, 0.3), T("ZZ200-2-20-60", 0.1 + i * 0.05, 0.2), T("SHS120*3", 0.1 + i * 0.05, 0.6));
const r = readMarks(sheet("S-05", roof));
assert.ok(!r.some((c) => /أبواب/.test(c.description)), "D12 is not a door");
const sag = r.find((c) => /شنكو/.test(c.description))!;
assert.equal(sag.quantity, 6); assert.ok(!sag.selected);
assert.ok(r.find((c) => /مدادات/.test(c.description) && /ZZ200/.test(c.description)));
assert.ok(r.find((c) => /تكتيف/.test(c.description) && /SHS 120x3/.test(c.description)));

// 3) Foundation plan: marks counted above the schedule only, and an overprinted label counts once.
const fnd: any[] = [T("FOUNDATION PLAN", 0.5, 0.6), T("SCHEDULE OF COLUMNS", 0.8, 0.72), T("Ø16", 0.3, 0.9), T("T16@150", 0.4, 0.9)];
for (let i = 0; i < 12; i++) { fnd.push(T("F2", 0.06 + i * 0.08, 0.086), T("F2", 0.06 + i * 0.08, 0.523)); }
fnd.push(T("F2", 0.06, 0.086)); // overprint of the first label
fnd.push(T("F2", 0.045, 0.876), T("F1", 0.045, 0.856)); // legend rows of the schedule
const f = readMarks(sheet("S-02", fnd)).find((c) => c.id === "mrk-F")!;
assert.equal(f.quantity, 24, "24 footings: legend rows and the overprint are not footings");
console.log("OK [steel_members]");
