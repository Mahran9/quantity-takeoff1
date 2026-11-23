import { strict as assert } from "node:assert";
import { decodeDxfBuffer, sniffDxfKind, explainUnreadableDxf } from "../src/utils/dxfDecode";

const enc = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// Legacy Arabic file: ANSI_1256, layer name "عب" = bytes DA C8.
const legacy = concat(
  enc("  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1018\n  9\n$DWGCODEPAGE\n  3\nANSI_1256\n  0\nENDSEC\n  8\n"),
  new Uint8Array([0xda, 0xc8]),
  enc("\n")
);
const d = decodeDxfBuffer(legacy);
assert.equal(d.encoding, "windows-1256");
assert.ok(d.text.includes("عب"), "Arabic layer name decoded from code page 1256");
assert.equal(d.codepage, "ANSI_1256");

// Modern UTF-8 file stays UTF-8.
const modern = enc("  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1032\n  0\nENDSEC\n  8\nأعمدة\n");
assert.equal(decodeDxfBuffer(modern).encoding, "utf-8");
assert.ok(decodeDxfBuffer(modern).text.includes("أعمدة"));

// Kinds.
assert.equal(sniffDxfKind(enc("  0\nSECTION\n  2\nHEADER\n")), "ascii");
assert.equal(sniffDxfKind(enc("AutoCAD Binary DXF\r\n\x1a\0")), "binary");
assert.equal(sniffDxfKind(concat(enc("AC1032"), new Uint8Array([0, 0, 0, 0, 0, 1, 2, 3]))), "dwg");
assert.ok(explainUnreadableDxf(concat(enc("AC1032"), new Uint8Array([0, 0, 0, 0, 0, 1])))?.includes("DWG"));
assert.equal(explainUnreadableDxf(enc("  0\nSECTION\n  2\nHEADER\n")), null);

console.log("PASS [dxf_decode]: code page 1256 Arabic, UTF-8, DWG/binary detection.");
