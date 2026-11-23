/**
 * verify-dxf — check what the app would extract from a DXF file, using the REAL `dxf-parser`.
 *
 * Usage:
 *   npx tsx scripts/verify-dxf.ts drawing.dxf [--expected expected.json]
 *        [--wall-height 3] [--unit-scale 0.001] [--footing-depth 0.6] [--slab-thickness 0.2]
 *        [--wall-divisor 2] [--include-hidden]
 *
 * expected.json maps a layer or block name to the number you expect, e.g.
 *   { "S-SLAB": 40, "S-BEAMS": 18, "C1": 6 }
 * Use "LAYER:type" (type = volume | area | linear | count) when a layer yields several results.
 * Tolerance: 2% for area / length / volume, exact for counts.
 *
 * Exit code 1 when any expectation FAILS, the audit level is "error", or the file cannot be read.
 *
 * Self-test only: QTO_MINI_DXF=1 swaps the real parser for tests/helpers/miniDxf.ts (an approximation
 * written for tests). Never use that mode to approve a real drawing.
 */
import { readFileSync, existsSync } from "node:fs";
import { decodeDxfBuffer, explainUnreadableDxf } from "../src/utils/dxfDecode";
import {
  parseDxfContent,
  analyzeParsedDxfObject,
  extractEngineeringQuantitiesFromDxf,
  auditExtraction,
  summarizeAudit,
} from "../src/utils/dxfParser";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const numArg = (name: string): number | undefined => {
  const v = arg(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!(n > 0)) { console.error(`قيمة غير صالحة لـ --${name}`); process.exit(1); }
  return n;
};

async function main() {
  const file = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !(i > 0 && all[i - 1].startsWith("--") && all[i - 1] !== "--include-hidden"));
  if (!file || !existsSync(file)) {
    console.error("الاستخدام: npx tsx scripts/verify-dxf.ts file.dxf [--expected expected.json] [--wall-height 3] [--unit-scale 0.001]");
    process.exit(1);
  }
  const bytes = new Uint8Array(readFileSync(file));
  const unreadable = explainUnreadableDxf(bytes);
  if (unreadable) { console.error("✗ " + unreadable); process.exit(1); }
  const dec = decodeDxfBuffer(bytes);
  console.log(`الملف: ${file} — الترميز: ${dec.encoding}${dec.codepage ? ` (${dec.codepage})` : ""}${dec.autocadVersion ? ` — AutoCAD ${dec.autocadVersion}` : ""}`);

  const includeHiddenLayers = flag("include-hidden");
  let parsed;
  if (process.env.QTO_MINI_DXF === "1") {
    console.warn("⚠ QTO_MINI_DXF=1: القارئ التجريبي miniDxf (للاختبار الذاتي فقط — ليس القارئ الحقيقي).");
    const { parseMiniDxf } = await import("../tests/helpers/miniDxf");
    parsed = analyzeParsedDxfObject(parseMiniDxf(dec.text), { includeHiddenLayers });
  } else {
    // real dxf-parser; includeHiddenLayers needs the analyzer options so go through the parser object
    const base = parseDxfContent(dec.text);
    parsed = includeHiddenLayers ? analyzeParsedDxfObject(base.parsedData, { includeHiddenLayers }) : base;
  }

  const opts = {
    defaultWallHeight: numArg("wall-height") ?? 0,
    defaultFootingDepth: numArg("footing-depth") ?? 0,
    defaultSlabThickness: numArg("slab-thickness") ?? 0,
    unitScaleFactor: numArg("unit-scale"),
    wallLineDivisor: (numArg("wall-divisor") === 2 ? 2 : 1) as 1 | 2,
  };
  const extracted = extractEngineeringQuantitiesFromDxf(parsed, opts);
  const audit = auditExtraction(parsed, extracted, { ...opts, includeHiddenLayers });

  console.log(`\nالوحدة: ${parsed.unitInfo?.name}${parsed.unitInfo?.guessed ? " ⚠ مخمّنة" : ""} — عدد العناصر: ${parsed.totalEntities}`);
  console.log("\nالكميات المستخرجة:");
  console.log("النوع".padEnd(8) + "الطبقة / البلوك".padEnd(34) + "القيمة".padStart(14) + "  الوحدة");
  for (const e of extracted) {
    const label = e.type === "count" && e.layer === "BLOCK_INSERTS" ? e.name : e.layer;
    console.log(e.type.padEnd(8) + String(label).slice(0, 32).padEnd(34) + e.value.toFixed(2).padStart(14) + "  " + e.unit);
  }

  console.log(`\nالتدقيق: ${audit.level === "ok" ? "✔ سليم" : audit.level === "warn" ? "⚠ تحذيرات" : "✗ أخطاء"} — ${summarizeAudit(audit)}`);
  for (const c of audit.checks) console.log(`  [${c.level.toUpperCase()}] ${c.id}: ${c.message}${c.detail ? `\n         ${c.detail}` : ""}`);
  if (audit.unclassified.length) {
    console.log("طبقات غير مصنّفة:");
    for (const u of audit.unclassified) console.log(`  - ${u.layer}: ${u.entityCount} عنصر، ${u.areaM2} م²، ${u.lengthM} م`);
  }

  let failed = audit.level === "error";
  const expectedPath = arg("expected");
  if (expectedPath) {
    const expected: Record<string, number> = JSON.parse(readFileSync(expectedPath, "utf-8"));
    console.log("\nالمقارنة مع المتوقع:");
    for (const [rawKey, want] of Object.entries(expected)) {
      const [key, type] = rawKey.includes(":") ? rawKey.split(":") : [rawKey, undefined];
      const cands = extracted.filter(
        (e) => (e.layer === key || e.name === key || e.name.startsWith(key + " ")) && (!type || e.type === type)
      );
      const ok = cands.some((e) =>
        e.type === "count" ? e.value === want : Math.abs(e.value - want) <= Math.max(0.02 * Math.abs(want), want === 0 ? 0.01 : 0)
      );
      if (!ok) failed = true;
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${rawKey}: المتوقع ${want} — الفعلي ${cands.map((c) => `${c.type}=${c.value}`).join(", ") || "غير موجود"}`);
    }
  }
  console.log(failed ? "\nالنتيجة: FAIL" : "\nالنتيجة: PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("✗ " + (e?.message || e)); process.exit(1); });
