/**
 * verify-dwg — read a real DWG the same way the app does (libredwg-web → dwgConvert → dxfParser) and print what it extracts.
 * Usage: npx tsx scripts/verify-dwg.ts drawing.dwg
 */
import { readFileSync } from "node:fs";
import { Dwg_File_Type, LibreDwg } from "@mlightcad/libredwg-web";
import { dwgDatabaseToDxfObject } from "../src/utils/dwgConvert";
import { analyzeParsedDxfObject, extractEngineeringQuantitiesFromDxf, auditExtraction, summarizeAudit } from "../src/utils/dxfParser";

async function main() {
  const file = process.argv[2];
  const buf = readFileSync(file);
  const t0 = Date.now();
  const lib: any = await LibreDwg.create();
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const dwg = lib.dwg_read_data(ab, Dwg_File_Type.DWG);
  if (!dwg) throw new Error("dwg_read_data returned nothing");
  const db = lib.convert(dwg);
  lib.dwg_free(dwg);
  const t1 = Date.now();
  const { parsed, stats } = dwgDatabaseToDxfObject(db);
  const res = analyzeParsedDxfObject(parsed);
  const t2 = Date.now();
  console.log(`read ${t1 - t0} ms, analyse ${t2 - t1} ms, heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
  console.log("stats", JSON.stringify(stats));
  console.log(`unit: ${res.unitInfo?.name} guessed=${!!res.unitInfo?.guessed} entities=${res.totalEntities} bounds=${JSON.stringify(res.bounds)}`);
  console.log("entityCounts", JSON.stringify(res.entityCounts));
  {
    const pts: [number, number, string, string][] = [];
    for (const e of (res.parsedData?.entities || []) as any[]) {
      const v = e.vertices?.[0] || e.position || e.center || e.startPoint || (typeof e.x === "number" ? { x: e.x, y: e.y } : null);
      if (v && Number.isFinite(v.x)) pts.push([v.x, v.y, e.type, e.layer]);
    }
    const ys = pts.map((p) => p[1]).sort((a, b) => a - b), xs = pts.map((p) => p[0]).sort((a, b) => a - b);
    const q = (a: number[], f: number) => a[Math.floor(f * (a.length - 1))];
    console.log(`points ${pts.length}; x p0/p1/p50/p99/p100 = ${[0, 0.01, 0.5, 0.99, 1].map((f) => q(xs, f).toFixed(0)).join(" / ")}; y = ${[0, 0.01, 0.5, 0.99, 1].map((f) => q(ys, f).toFixed(0)).join(" / ")}`);
    console.log("lowest y:", pts.sort((a, b) => a[1] - b[1]).slice(0, 5).map((p) => `${p[2]}@${p[3]} (${p[0].toFixed(0)},${p[1].toFixed(0)})`).join(", "));
  }
  console.log("\nlayers (name | entities | lines m | closed | area):");
  for (const l of [...res.layers].sort((a: any, b: any) => (b.entityCount ?? 0) - (a.entityCount ?? 0)).slice(0, 60) as any[])
    console.log(`  ${l.name} | ${l.entityCount} | ${(l.lineLength ?? 0).toFixed(1)} | ${l.closedPolylinesCount ?? 0} | ${(l.areaSum ?? 0).toFixed(1)}`);
  console.log("\nblocks:", res.detectedBlocks.slice(0, 40).map((b) => `${b.name}×${b.count}`).join(", "));
  console.log("\ntext samples:", res.textNotes.slice(0, 80).join(" ¦ "));
  const q = extractEngineeringQuantitiesFromDxf(res, {} as any) as any[];
  console.log(`\nextracted ${q.length} items:`);
  for (const e of q) console.log(`  ${e.selected ? "✓" : " "} ${e.type.padEnd(7)} ${String(e.name).slice(0, 50).padEnd(52)} ${Number(e.value).toFixed(2).padStart(12)} ${e.unit}  [${e.layer}]`);
  const audit = auditExtraction(res, q as any, {} as any);
  console.log(`\naudit ${audit.level}: ${summarizeAudit(audit)}`);
  for (const c of audit.checks) console.log(`  [${c.level}] ${c.id}: ${c.message}`);
  if (res.warnings?.length) console.log("\nwarnings:\n  " + res.warnings.join("\n  "));
}
main().catch((e) => { console.error("FAIL", e?.stack || e); process.exit(1); });
