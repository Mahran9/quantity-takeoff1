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

// 3a) Steel set: the same marks on plan + elevation are the same members — largest per mark, never the sum.
const sa = readMarks(sheet("E-02", [...rep("C1", 10), ...rep("C2", 4), "IPE 300", "PURLINS", "ANCHOR BOLTS"]));
const sb = readMarks(sheet("E-03", [...rep("C1", 10), ...rep("C3", 2), "IPE 300", "PURLINS", "ANCHOR BOLTS"]));
const sm = mergeRepeatedMarks([{ sheetId: "s2", code: "E-02", cands: sa }, { sheetId: "s3", code: "E-03", cands: sb }]).flatMap((m) => m.cands).filter((c) => c.id === "mrk-C");
assert.equal(sm.length, 1, "one line for the steel family");
assert.equal(sm[0].quantity, 16, "C1 10 + C2 4 + C3 2 (not 30)");

// 3b) Concrete set: each column plan is another floor — keep them; only an exact repeat (footing plan) is dropped.
const ground = readMarks(sheet("P2", [...rep("C1", 5), ...rep("C5", 8), "Ø12", "SLAB", "FOOTING"]));
const first = readMarks(sheet("P7", [...rep("C1", 3), ...rep("C5", 7), "Ø12", "SLAB", "FOOTING"]));
const fdn = readMarks(sheet("P3", [...rep("C1", 5), ...rep("C5", 8), ...rep("F1", 4), "Ø12", "FOOTING"]));
const rcm = mergeRepeatedMarks([
  { sheetId: "p3", code: "P3", cands: fdn }, { sheetId: "p2", code: "P2", cands: ground }, { sheetId: "p7", code: "P7", cands: first },
]);
const colLines = rcm.flatMap((m) => m.cands.filter((c) => c.id === "mrk-C").map((c) => [m.sheetId, c.quantity]));
assert.deepEqual(colLines.sort(), [["p2", 13], ["p7", 10]], "floors kept, footing-plan repeat dropped: " + JSON.stringify(colLines));

// 3c) Beam / tie-beam / slab-type labels in a concrete set are not quantities: review only.
const beams = readMarks(sheet("P5", [...rep("GB1", 9), ...rep("TB1", 6), "Ø16", "FOOTING", "SLAB"]));
assert.ok(beams.filter((c) => /^mrk-(GB|TB)$/.test(c.id)).every((c) => !c.selected), "GB/TB counts are review-only");

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
const wall = pc.find((c) => c.layer === "S-WALL")!;
assert.ok(wall && !wall.selected && /S-WALL/.test(wall.description), "a named layer's line total is offered for review, not added");
console.log("marks_merge ok");
