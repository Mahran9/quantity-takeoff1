/**
 * DXF files are not always UTF-8. Drawings saved as AutoCAD R2004 or older (very common in Arabic
 * offices) store text in the Windows code page named by $DWGCODEPAGE (e.g. ANSI_1256 for Arabic).
 * Reading them with file.text() turns Arabic layer names/notes into garbage and silently breaks
 * layer classification, so the raw bytes are decoded here.
 */

export type DxfBytesKind = "ascii" | "binary" | "dwg" | "unknown";

const CODEPAGE_TO_ENCODING: Record<string, string> = {
  ANSI_1250: "windows-1250",
  ANSI_1251: "windows-1251",
  ANSI_1252: "windows-1252",
  ANSI_1253: "windows-1253",
  ANSI_1254: "windows-1254",
  ANSI_1255: "windows-1255",
  ANSI_1256: "windows-1256",
  ANSI_1257: "windows-1257",
  ANSI_1258: "windows-1258",
  ANSI_874: "windows-874",
  ANSI_932: "shift_jis",
  ANSI_936: "gbk",
  ANSI_949: "euc-kr",
  ANSI_950: "big5",
  DOS864: "ibm864",
  UTF8: "utf-8",
  UTF_8: "utf-8",
};

export function sniffDxfKind(bytes: Uint8Array): DxfBytesKind {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 32));
  if (head.startsWith("AutoCAD Binary DXF")) return "binary";
  // DWG starts with "AC10xx" followed by binary data (no newline within the first bytes).
  if (/^AC10\d\d/.test(head) && !/[\r\n]/.test(head.slice(0, 6))) return "dwg";
  if (/^\s*0\s*[\r\n]+\s*SECTION/.test(new TextDecoder("latin1").decode(bytes.subarray(0, 64)))) return "ascii";
  return "unknown";
}

export interface DecodedDxf {
  text: string;
  encoding: string;
  codepage: string | null;
  autocadVersion: string | null;
}

export function decodeDxfBuffer(buf: ArrayBuffer | Uint8Array): DecodedDxf {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const sniff = new TextDecoder("latin1").decode(bytes.subarray(0, 200_000));
  const cp = sniff.match(/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*([^\r\n]+)/)?.[1]?.trim().toUpperCase() ?? null;
  const ver = sniff.match(/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*([^\r\n]+)/)?.[1]?.trim() ?? null;

  // 1) Strict UTF-8 first: R2007+ files are UTF-8, and valid UTF-8 is never produced by accident.
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^﻿/, ""), encoding: "utf-8", codepage: cp, autocadVersion: ver };
  } catch {
    /* not UTF-8 */
  }
  // 2) Legacy code page declared by the file itself.
  let encoding = (cp && CODEPAGE_TO_ENCODING[cp]) || "windows-1252";
  try {
    const text = new TextDecoder(encoding).decode(bytes);
    return { text, encoding, codepage: cp, autocadVersion: ver };
  } catch {
    encoding = "windows-1252";
    return { text: new TextDecoder(encoding).decode(bytes), encoding, codepage: cp, autocadVersion: ver };
  }
}

/** Arabic messages for files this app cannot read, or null when the file looks readable. */
export function explainUnreadableDxf(bytes: Uint8Array): string | null {
  switch (sniffDxfKind(bytes)) {
    case "dwg":
      return "هذا ملف DWG وهو غير مدعوم. افتحه في AutoCAD أو برنامج مجاني (مثل ODA File Converter) واحفظه بصيغة DXF ASCII ثم ارفعه.";
    case "binary":
      return "هذا ملف DXF ثنائي (Binary) وهو غير مدعوم. احفظه من AutoCAD بصيغة DXF نصية (ASCII) ثم ارفعه.";
    case "unknown":
      return "تعذّر التعرف على الملف كـ DXF نصي. تأكد من أنه ملف DXF ASCII وليس DWG أو ملفاً تالفاً.";
    default:
      return null;
  }
}
