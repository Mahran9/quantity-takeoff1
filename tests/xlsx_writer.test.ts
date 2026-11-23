import { strict as assert } from "node:assert";
import { writeFileSync, mkdirSync } from "node:fs";
import { buildQuotationWorkbookBytes, buildBoqWorkbookBytes } from "../src/utils/boqExporter";
import { buildXlsx, crc32, colLetter } from "../src/utils/xlsxWriter";
import { EMPTY_COMPANY_PROFILE, TakeoffItem, BlueprintSheet, ProjectMetadata } from "../src/types";

assert.equal(colLetter(0), "A"); assert.equal(colLetter(25), "Z"); assert.equal(colLetter(26), "AA"); assert.equal(colLetter(701), "ZZ");
assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926, "CRC32 check value");

const mk = (o: Partial<TakeoffItem>): TakeoffItem => ({ id: Math.random().toString(36).slice(2), sheetId: "s1", itemCode: "X", description: "بند & <خاص>", category: "أعمال خرسانية مسلحة وعادية", location: "", count: 1, quantity: 1, unit: "م³", unitPrice: 0, totalPrice: 0, ...o });
const items = [
  mk({ description: "حفر وردم", category: "أعمال الحفر والردم والأساسات", quantity: 100, unitPrice: 10 }),
  mk({ description: "قواعد خرسانية", quantity: 10.005, unitPrice: 100.1 }),
  mk({ description: "مرفوض", quantity: 5, unitPrice: 1000, reviewStatus: "rejected" }),
  mk({ description: "دهان", category: "أعمال الدهانات والديكورات", quantity: 3, unitPrice: 25.5, unit: "م²" }),
];
const md: ProjectMetadata = { projectName: "مشروع", projectCode: "C1", clientName: "العميل", contractorName: "", consultantName: "", currency: "SAR", currencySymbol: "ر.س", date: "2026-01-01", taxRate: 15 };
const sheets: BlueprintSheet[] = [{ id: "s1", code: "A-01", title: "مخطط", discipline: "معماري", scale: "1:100", fileName: "a.pdf" } as any];
const dir = process.env.XLSX_OUT || "/tmp/xlsx_out";
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/quotation.xlsx`, buildQuotationWorkbookBytes(md, { ...EMPTY_COMPANY_PROFILE, name: "شركة تجريبية" }, items));
writeFileSync(`${dir}/boq.xlsx`, buildBoqWorkbookBytes(md, sheets, items, { ...EMPTY_COMPANY_PROFILE, name: "شركة تجريبية" }));
writeFileSync(`${dir}/empty.xlsx`, buildQuotationWorkbookBytes(md, EMPTY_COMPANY_PROFILE, []));
assert.throws(() => buildXlsx([]));
console.log("xlsx_writer ok");
