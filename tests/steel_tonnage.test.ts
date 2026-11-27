import { steelTonnage, readLevels } from "../src/engine/steelTonnage";
const tok = (text: string) => ({ text, source: "pdf_text", x: 0, y: 0 } as any);
const sheet = (id: string, texts: string[]) => ({ id, code: id, visualTokens: texts.map(tok) } as any);
const eq = (a: any, b: any, m: string) => { if (a !== b) { console.error("FAIL", m, a, b); process.exit(1); } };
const elev = sheet("e", ["+0", "+0", "+8000", "+8000", "+9000", "+9000"]);
const plan = sheet("p", ["69780", "29800", "6350"]);
const roof = sheet("r", [...Array(5).fill("ZZ200-2-20-60"), ...Array(10).fill("IPE500")]);
eq(JSON.stringify(readLevels([elev])), JSON.stringify({ eave: 8, ridge: 9 }), "levels");
const c = (id: string, q: number): any => ({ id, quantity: q, selected: true, sources: ["mark"] });
const r = steelTonnage([elev, plan, roof], [{ sheetId: "p", cands: [c("mrk-col-IPE600", 24), c("mrk-frames", 12)] }]);
const col = r.lines.find((l) => l.cand.id === "stl-col-IPE600")!.cand;
eq(col.quantity, 23.42, "column tons"); eq(col.unit, "طن", "unit");
eq(r.lines.find((l) => l.cand.id === "stl-rafters")!.cand.quantity, 32.51, "rafter tons");
eq(r.lines.find((l) => l.cand.id === "stl-roofclad")!.cand.quantity, 2084.12, "roof area");
eq(r.lines.find((l) => l.cand.id === "stl-blockwalls")!.cand.quantity, 1623.08, "block walls");
eq(r.lines.find((l) => l.cand.id === "stl-blockwalls")!.cand.selected, false, "block walls unselected");
const none = steelTonnage([plan], [{ sheetId: "p", cands: [c("mrk-col-IPE600", 24)] }]);
eq(none.lines.length, 0, "no levels, no tonnage");
console.log("PASS steel_tonnage");
// Two buildings: the second anchor plan gets its own levels, size, cladding and walls, named «المبنى الثاني».
{
  const e2 = sheet("e2", ["+8000", "+8000", "+9000", "+9000"]);
  const p2 = sheet("p2", ["61200", "22300", "20150"]);
  const two = steelTonnage([elev, plan, roof, p2, e2], [
    { sheetId: "p", cands: [c("mrk-col-IPE600", 24), c("mrk-frames", 12)] },
    { sheetId: "p2", cands: [c("mrk-col-IPE450", 16)] },
  ]);
  const col2 = two.lines.find((l) => l.cand.id === "stl-col-IPE450-b2")!.cand;
  eq(col2.quantity, 9.93, "second building column tons");
  eq(col2.description.includes("المبنى الثاني"), true, "second building name");
  eq(two.lines.find((l) => l.cand.id === "stl-roofclad-b2")!.cand.quantity, 1370.24, "second roof area");
  eq(two.lines.find((l) => l.cand.id === "stl-col-IPE600")!.cand.description.includes("المبنى"), false, "main building unnamed");
}
console.log("PASS steel_tonnage two buildings");
// A building with a mezzanine plan: columns run to the highest level, no roof or walls are guessed.
{
  const el = sheet("el", ["+4050", "+4050", "+8000", "+8000"]);
  const pm = sheet("pm", ["ANCHOR BOLTS PLAN", "MEZZANINE PLAN", "ROOF PLAN"]);
  const r3 = steelTonnage([pm, el], [{ sheetId: "pm", cands: [c("mrk-col-HEA240", 23)] }]);
  eq(r3.lines.find((l) => l.cand.id === "stl-col-HEA240")!.cand.quantity, 11.1, "mezzanine building column tons");
  eq(r3.lines.some((l) => /roofclad|blockwalls/.test(l.cand.id)), false, "no envelope for mezzanine building");
}
console.log("PASS steel_tonnage mezzanine");
