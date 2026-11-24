/**
 * model-to-excel — build the app's BOQ workbook straight from ETABS / SAFE files, and print what it contains.
 * Usage: npx tsx scripts/model-to-excel.ts out.xlsx model.e2k [foundations.$sf ...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { readStructuralModel, modelToTakeoffItems } from "../src/utils/csiModel";
import { buildBoqWorkbookBytes } from "../src/utils/boqExporter";

const [out, ...files] = process.argv.slice(2);
if (!out || !files.length) { console.error("الاستخدام: npx tsx scripts/model-to-excel.ts out.xlsx model.e2k [found.$sf]"); process.exit(1); }
const meta: any = { projectName: "", projectCode: "", clientName: "", contractorName: "", consultantName: "", currency: "SAR", currencySymbol: "ر.س", date: new Date().toISOString().slice(0, 10), taxRate: 15 };
const sheets: any[] = [];
const items: any[] = [];
for (const f of files) {
  const m = readStructuralModel(readFileSync(f, "utf8"));
  const code = `${m.program}-${String(sheets.length + 1).padStart(2, "0")}`;
  const sh = { id: code, code, title: f.split(/[\\/]/).pop(), discipline: "إنشائي", fileType: "image", fileName: f, scale: "—", status: "completed", measurementPins: [], createdAt: "" };
  sheets.push(sh);
  items.push(...modelToTakeoffItems(m, sh, items.length).items.map((i) => ({ ...i, reviewStatus: i.reviewStatus || "extracted" })));
}
writeFileSync(out, buildBoqWorkbookBytes(meta, sheets, items));
const wb = XLSX.read(readFileSync(out));
for (const n of wb.SheetNames) {
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false });
  console.log(`\n=== ${n} (${rows.length} rows)`);
  for (const r of rows.slice(0, 8)) console.log("  " + r.map((c) => String(c ?? "").slice(0, 34)).join(" | "));
  if (rows.length > 8) { console.log("  ..."); for (const r of rows.slice(-4)) console.log("  " + r.map((c) => String(c ?? "").slice(0, 34)).join(" | ")); }
}
