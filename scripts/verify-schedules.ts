/**
 * verify-schedules — run the app's mark and schedule readers on a real structural PDF set, the way the app builds
 * sheets from it, and print counts per sheet and the concrete volumes joined from the schedules.
 * Usage: npx tsx scripts/verify-schedules.ts drawings.pdf
 */
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { readMarks } from "../src/engine/marks";
import { mergeRepeatedMarks } from "../src/engine/candidate";
import { scheduleVolumes } from "../src/engine/schedules";

const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(process.argv[2])), useSystemFonts: true }).promise;
const sheets: any[] = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  // Same normalisation as pdfProcessor: viewport coordinates, top of the text, 0..1.
  const visualTokens = tc.items.filter((i: any) => i.str?.trim()).map((i: any, k: number) => {
    const tx = pdfjs.Util.transform(vp.transform, i.transform);
    const fh = Math.hypot(tx[2], tx[3]) || 10;
    return { id: `t${k}`, text: i.str.trim(), x: tx[4] / vp.width, y: (tx[5] - fh) / vp.height, w: Math.abs(i.width) / vp.width, h: fh / vp.height, source: "pdf_text" };
  });
  sheets.push({ id: `p${p}`, code: `P${p}`, title: `p${p}`, visualTokens });
}
const merged = mergeRepeatedMarks(sheets.map((s) => ({ sheetId: s.id, code: s.code, cands: readMarks(s).filter((c) => c.selected) })));
console.log("Counted marks (after dropping exact repeats):");
for (const m of merged) for (const c of m.cands) console.log(`  ${m.sheetId.padEnd(4)} ${c.description} = ${c.quantity}`);
const vol = scheduleVolumes(sheets, merged);
console.log("\nConcrete from schedules:");
let total = 0;
for (const l of vol.lines) {
  total += l.cand.quantity;
  console.log(`  ${l.sheetId.padEnd(4)} ${l.cand.description} = ${l.cand.quantity} م³`);
  console.log(`       ${l.cand.evidence}`);
  for (const c of l.cand.checks) console.log(`       ! ${c}`);
}
console.log(`\nTotal: ${Math.round(total * 1000) / 1000} م³`);
