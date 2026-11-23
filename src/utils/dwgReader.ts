import { Dwg_File_Type, LibreDwg } from "@mlightcad/libredwg-web";
import { dwgDatabaseToDxfObject, DwgConversionStats } from "./dwgConvert";
import { analyzeParsedDxfObject, ParsedDxfResult } from "./dxfParser";

let libPromise: Promise<any> | null = null;

/** Reads a binary AutoCAD DWG in the browser (WebAssembly) and analyses it like a DXF. */
export async function readDwgFile(
  buffer: ArrayBuffer
): Promise<{ result: ParsedDxfResult; stats: DwgConversionStats }> {
  if (!libPromise) libPromise = LibreDwg.create();
  const lib = await libPromise.catch((e: any) => {
    libPromise = null;
    throw new Error("تعذر تحميل قارئ DWG: " + (e?.message || e));
  });

  const copy = buffer.slice(0);
  const dwg = lib.dwg_read_data(copy, Dwg_File_Type.DWG);
  if (!dwg) {
    throw new Error("تعذر قراءة ملف DWG. قد يكون الإصدار غير مدعوم أو الملف تالفاً. احفظه DXF أو صدّره PDF.");
  }
  let db: any;
  try {
    db = lib.convert(dwg);
  } finally {
    try {
      lib.dwg_free(dwg);
    } catch {
      /* ignore */
    }
  }
  const { parsed, stats } = dwgDatabaseToDxfObject(db);
  if (!parsed.entities.length && !Object.keys(parsed.blocks).length) {
    throw new Error("قُرئ ملف DWG لكن لم يُعثر على عناصر رسم. احفظه DXF أو صدّره PDF.");
  }
  return { result: analyzeParsedDxfObject(parsed), stats };
}
