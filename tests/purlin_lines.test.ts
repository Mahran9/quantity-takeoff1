import { findPurlinLines, purlinKgPerMetre } from "../src/utils/purlinLines";
import { steelTonnage } from "../src/engine/steelTonnage";
const eq = (a: any, b: any, m: string) => { if (a !== b) { console.error("FAIL", m, a, b); process.exit(1); } };
const path = (pts: [number, number][], w = 0.72): any => ({ points: pts, closed: false, stroked: true, filled: false, color: "000000", lineWidth: w, isRect: false, isDashed: false, length: 0, area: 0, bbox: [0, 0, 0, 0] });
// 24 purlins at a 15.5 pt pitch, each drawn as two edge lines of 74 pt per bay over 11 bays, plus a few short stray lines.
const paths: any[] = [];
for (let k = 0; k < 24; k++) for (const e of [0, 3.5]) for (let b = 0; b < 11; b++) paths.push(path([[370 + k * 15.5 + e, 250 + b * 74], [370 + k * 15.5 + e, 250 + (b + 1) * 74]]));
paths.push(path([[100, 100], [100, 130]]), path([[200, 300], [200, 340]]));
const pl = findPurlinLines(paths);
eq(pl?.count, 24, "24 purlin lines found");
eq(pl?.orientation, "v", "orientation");
eq(purlinKgPerMetre("ZZ200-2-20-60"), 5.65, "Z200 kg/m");
eq(findPurlinLines([path([[0, 0], [0, 50]])]), null, "no family, no purlins");
// Engine: measured family on the roof plan, then an estimate for the second building at the same spacing.
const tk = (text: string) => ({ text, source: "pdf_text", x: 0, y: 0 } as any);
const S = (id: string, texts: string[], extra: any = {}): any => ({ id, code: id, visualTokens: texts.map(tk), ...extra });
const el = S("el", ["+0", "+0", "+8000", "+8000", "+9000", "+9000"]);
const a1 = S("a1", ["69780", "29800", "ANCHOR BOLTS PLAN"]);
const roof1 = S("r1", ["MAIN SYSTEM PLAN", "ZZ200-2-20-60", "ZZ200-2-20-60", "ZZ200-2-20-60", ...Array(10).fill("IPE500")], { pdfVector: { purlinLines: { orientation: "v", count: 24, pitchPt: 15.5, coveragePt: 899 } } });
const a2 = S("a2", ["61200", "22300", "ANCHOR BOLTS PLAN"]);
const roof2 = S("r2", ["ROOF PLAN", "ZZ200-2-20-60", "ZZ200-2-20-60", "ZZ200-2-20-60"]);
const el2 = S("el2", ["+8000", "+8000", "+9000", "+9000"]);
const c = (id: string, q: number): any => ({ id, quantity: q, selected: true, sources: ["mark"] });
const r = steelTonnage([a1, roof1, el, a2, roof2, el2], [
  { sheetId: "a1", cands: [c("mrk-col-IPE600", 24), c("mrk-frames", 12)] },
  { sheetId: "a2", cands: [c("mrk-col-IPE450", 16)] },
]);
const p1 = r.lines.find((l) => l.cand.id === "stl-purlins")!.cand;
eq(p1.quantity, 9.46, "main building purlin tons (24 × 69.78 × 5.65)");
eq(p1.selected, true, "measured purlins are selected");
const p2 = r.lines.find((l) => l.cand.id === "stl-purlins-b2")!.cand;
eq(p2.selected, false, "estimated purlins stay unselected");
eq(p2.description.includes("18 خط"), true, "second building estimated 18 lines");
console.log("PASS purlin_lines");
