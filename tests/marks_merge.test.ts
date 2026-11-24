import { strict as assert } from "node:assert";
import { readMarks } from "../src/engine/marks";
import { mergeRepeatedMarks } from "../src/engine/candidate";
import { readPdf } from "../src/engine/readers";

const sheet = (code: string, words: string[]): any => ({
  id: `id-${code}`, code, title: code,
  visualTokens: words.map((text, i) => ({ id: `t${i}`, text, x: 0, y: 0, w: 0, h: 0, source: "pdf_text" })),
});
const rep = (w: string, n: number) => Array.from({ length: n }, () => w);

// 1) A concrete villa sheet: column/footing marks are concrete members, not steel.
const rc = readMarks(sheet("S-02", [...rep("C1", 10), ...rep("C2", 4), ...rep("F1", 6), "Ø12/150", "FOOTING SCHEDULE", "BLINDING 10cm"]));
const col = rc.find((c) => c.id === "mrk-C")!;
assert.equal(col.category, "أعمال خرسانية مسلحة وعادية", "RC columns are concrete");
assert.ok(/أعمدة خرسانية/.test(col.description), col.description);
assert.equal(rc.find((c) => c.id === "mrk-F")!.category, "أعمال خرسانية مسلحة وعادية");
assert.ok(/قواعد/.test(rc.find((c) => c.id === "mrk-F")!.description));

// 2) A steel erection sheet keeps the steel trade.
const st = readMarks(sheet("E-01", [...rep("C1", 6), ...rep("PU1", 12), "IPE 300", "ANCHOR BOLTS", "14 XM 20 X 70"]));
assert.equal(st.find((c) => c.id === "mrk-C")!.category, "أعمال الهياكل المعدنية والهناجر", "steel stays steel");

// 3) The same marks on plan + section sheets: largest per mark, never the sum.
const a = readMarks(sheet("S-02", [...rep("C1", 10), ...rep("C2", 4), "Ø12", "FOOTING", "SLAB"]));
const b = readMarks(sheet("S-03", [...rep("C1", 10), ...rep("C3", 2), "Ø12", "FOOTING", "SLAB"]));
const merged = mergeRepeatedMarks([{ sheetId: "s2", code: "S-02", cands: a }, { sheetId: "s3", code: "S-03", cands: b }]);
const cols = merged.flatMap((m) => m.cands).filter((c) => c.id === "mrk-C");
assert.equal(cols.length, 1, "one line for the family");
assert.equal(cols[0].quantity, 16, "C1 10 + C2 4 + C3 2 (not 30)");
assert.ok(/2 لوحات/.test(cols[0].evidence));

// 4) PDF annotation layers (axes, dimensions, text, hatch) never become quantities; "ev"/"11" are not names.
const pdfSheet: any = {
  pdfVector: {
    pageWidthPt: 1000, pageHeightPt: 700, userUnit: 1, detectedDenominator: 100, scaleConfidence: "high", scaleMessage: "", dimensionNumbers: [],
    excluded: { frame: 0, duplicates: 0, background: 0, hairline: 0 }, warnings: [], truncated: false,
    groups: ["A-AXES", "A-DIM-OUT", "TXT", "HATCH", "ev", "11", "S-WALL"].map((layer, i) => ({
      id: `g${i}`, label: `طبقة ${layer}`, layer, color: "000000", lineWidthMm: 0.25, pathCount: 20, lengthPt: 3000 - i,
      closedCount: 0, areaPt2: 0, rectCount: 0, filledCount: 0, sizeClusters: [], maxPathPt: 400,
    })),
  },
};
const pc = readPdf(pdfSheet);
const layers = new Set(pc.map((c) => c.layer));
for (const l of ["A-AXES", "A-DIM-OUT", "TXT", "HATCH"]) assert.ok(!layers.has(l), `${l} skipped`);
assert.ok(pc.filter((c) => c.layer === "ev" || c.layer === "11").every((c) => !c.selected), "meaningless names not preselected");
assert.ok(pc.some((c) => c.layer === "S-WALL" && c.selected), "a real named layer still counts");
console.log("marks_merge ok");
