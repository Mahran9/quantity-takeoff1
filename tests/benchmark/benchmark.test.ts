/**
 * Accuracy benchmark: villa drawings generated with known quantities (tests/benchmark/gen.py).
 * Each case runs the real pipeline (parse → analyse → read → reconcile) and every number the user would
 * see is compared with the truth. Re-generate the drawings with:  python3 tests/benchmark/gen.py
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { parseMiniDxf } from "../helpers/miniDxf";
import { analyzeParsedDxfObject } from "../../src/utils/dxfParser";
import { readCad } from "../../src/engine/readers";
import { reconcile } from "../../src/engine/reconcile";
import type { Candidate } from "../../src/engine/candidate";

const T = JSON.parse(readFileSync(new URL("./truth.json", import.meta.url), "utf8"));
const ASSUME = { wallHeight: 3, footingDepth: 0.6, slabThickness: 0.2 };
const TRUE_FOOT_VOL = Number((T.footing_area * 0.6).toFixed(2)); // 14.26
const TRUE_SLAB_VOL = Number((T.slab_area * 0.2).toFixed(2)); // 25.79
const TRUE_WALL_AREA = T.wall_len * 3;

function run(name: string): Candidate[] {
  const parsed: any = analyzeParsedDxfObject(parseMiniDxf(readFileSync(new URL(`./${name}.dxf`, import.meta.url), "utf8")));
  const sheet: any = { id: "s", code: "S", title: "t", discipline: "x", fileType: "dxf", dxfData: parsed, dxfLayers: parsed.layers, scale: "1:100" };
  return reconcile(readCad(sheet, ASSUME));
}
const find = (c: Candidate[], unit: string, re: RegExp) => c.find((x) => x.unit === unit && re.test(x.description) && x.selected);
const findAny = (c: Candidate[], unit: string, re: RegExp) => c.find((x) => x.unit === unit && re.test(x.description));

const rows: string[] = [];
let wrong = 0;
const check = (cas: string, what: string, got: number | undefined, want: number, tol = 0.011) => {
  const ok = got !== undefined && Math.abs(got - want) <= Math.max(tol, want * 0.001);
  if (!ok) wrong++;
  rows.push(`${ok ? "✔" : "✘"} ${cas.padEnd(20)} ${what.padEnd(14)} متوقع ${String(want).padStart(8)}  مستخرج ${String(got ?? "—").padStart(8)}`);
};

// Clean layer names, every drawing style: all quantities must be exact.
for (const cas of ["clean_m", "clean_mm", "clean_closed_walls", "clean_dup", "clean_double_walls", "arabic_names"]) {
  const c = run(cas);
  check(cas, "قواعد (عدد)", find(c, "عدد", /القواعد/)?.quantity, T.footings);
  check(cas, "أعمدة (عدد)", find(c, "عدد", /الأعمدة/)?.quantity, T.columns);
  check(cas, "حجم القواعد", find(c, "م³", /قواعد/)?.quantity, TRUE_FOOT_VOL);
  check(cas, "حجم البلاطة", find(c, "م³", /بلاطة/)?.quantity, TRUE_SLAB_VOL);
  check(cas, "طول الجدران", find(c, "م.ط", /الجدران/)?.quantity, T.wall_len);
  check(cas, "مساحة الجدران", find(c, "م²", /الجدران/)?.quantity, TRUE_WALL_AREA);
  check(cas, "طول الكمرات", find(c, "م.ط", /الكمرات/)?.quantity, T.beam_len);
  check(cas, "أبواب", find(c, "عدد", /باب/)?.quantity, T.doors);
  check(cas, "شبابيك", find(c, "عدد", /شباك/)?.quantity, T.windows);
}

// Meaningless names ("Layer1", "FLOOR_SLAB"): what the names say is still read exactly, and the
// footings on an unnamed layer are offered (unticked) with the right area instead of being lost or mislabelled.
{
  const cas = "messy_names";
  const c = run(cas);
  check(cas, "أعمدة (عدد)", find(c, "عدد", /الأعمدة/)?.quantity, T.columns);
  check(cas, "طول الجدران", find(c, "م.ط", /الجدران/)?.quantity, T.wall_len);
  check(cas, "طول الكمرات", find(c, "م.ط", /الكمرات/)?.quantity, T.beam_len);
  check(cas, "أبواب", find(c, "عدد", /باب/)?.quantity, T.doors);
  check(cas, "مساحة البلاطة", findAny(c, "م²", /Slab on Grade|بلاطة/)?.quantity, T.slab_area);
  check(cas, "قواعد (مجهولة)", findAny(c, "م²", /Layer1/)?.quantity, T.footing_area);
  assert.equal(findAny(c, "م²", /Layer1/)?.selected, false, "unknown layer must not be ticked");
}

console.log(rows.join("\n"));
assert.equal(wrong, 0, `${wrong} benchmark value(s) wrong`);
console.log(`benchmark ok: ${rows.length} values exact`);
