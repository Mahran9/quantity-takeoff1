import { readMarks } from "../src/engine/marks";
const tk = (text: string, x: number, y: number) => ({ text, x, y, source: "pdf_text" } as any);
const eq = (a: any, b: any, m: string) => { if (a !== b) { console.error("FAIL", m, a, b); process.exit(1); } };
// One sheet, three plans side by side: only the labels inside the anchor-bolt plan's own part of the page are columns.
const sh: any = { id: "s", code: "S1", visualTokens: [
  tk("ANCHOR BOLTS PLAN", 0.21, 0.45), tk("MEZZANINE PLAN", 0.49, 0.45), tk("ROOF PLAN", 0.76, 0.45),
  ...Array.from({ length: 23 }, (_, i) => tk("HEA240", 0.1 + (i % 6) * 0.04, 0.1 + Math.floor(i / 6) * 0.07)),
  ...Array.from({ length: 9 }, (_, i) => tk("HEA240", 0.45 + (i % 3) * 0.05, 0.1 + Math.floor(i / 3) * 0.1)),
  ...Array.from({ length: 5 }, (_, i) => tk("IPE300", 0.8, 0.1 + i * 0.05)),
] };
const c = readMarks(sh);
eq(c.find((x) => x.id === "mrk-col-HEA240")?.quantity, 23, "columns inside the anchor plan only");
eq(c.some((x) => x.id === "mrk-col-IPE300"), false, "roof-plan labels are not columns");
console.log("PASS marks_band");
