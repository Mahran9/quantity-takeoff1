/** verify-model — print the concrete quantities the app reads from an ETABS .e2k or SAFE .$sf/.f2k file.
 * Usage: npx tsx scripts/verify-model.ts model.e2k */
import { readFileSync } from "node:fs";
import { readStructuralModel, GROUP_LABEL } from "../src/utils/csiModel";

const r = readStructuralModel(readFileSync(process.argv[2], "utf8"));
console.log(`${r.program} ${r.version ?? ""} — unit→m ${r.unitToM}`);
if (r.stories.length) console.log("stories: " + r.stories.map((s) => `${s.name} h=${s.height} @${s.elevation}`).join(" | "));
let total = 0;
for (const q of r.items) {
  total += q.review ? 0 : q.volume;
  console.log(`${GROUP_LABEL[q.group].padEnd(14)} ${q.story.padEnd(10)} ${q.section.padEnd(18)} ${q.dims.padEnd(16)} n=${String(q.count).padStart(3)} L=${String(q.length ?? "").padStart(7)} A=${String(q.area ?? "").padStart(8)} V=${q.volume.toFixed(2).padStart(8)} م³${q.review ? "  ⚠ مراجعة" : ""}`);
}
console.log(`\nإجمالي الخرسانة المعتمدة: ${total.toFixed(2)} م³`);
for (const w of r.warnings) console.log("• " + w);
