/**
 * Minimal, dependency-free .xlsx writer (OOXML in a "stored" ZIP).
 *
 * Why not SheetJS for export? The community build cannot write cell styles (colours, bold, borders),
 * and a quotation sent to a client should look like one. This writer supports styles, number formats,
 * merged cells, column widths, frozen rows, right-to-left sheets, print setup and live formulas
 * (so editing a price in Excel recalculates totals). SheetJS is still used to *read* imports.
 */

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  /** Font colour, hex RRGGBB */
  color?: string;
  /** Fill colour, hex RRGGBB */
  fill?: string;
  fontSize?: number;
  align?: "left" | "center" | "right";
  valign?: "top" | "center" | "bottom";
  wrap?: boolean;
  /** Thin border on all sides */
  border?: boolean;
  /** Excel number format, e.g. "#,##0.00" */
  numFmt?: string;
}

export interface Cell {
  v: string | number | null;
  /** Formula without the leading "="; v is stored as its cached result. */
  f?: string;
  s?: CellStyle;
}

export type CellInput = Cell | string | number | null | undefined;

export interface SheetSpec {
  name: string;
  rows: CellInput[][];
  merges?: { r1: number; c1: number; r2: number; c2: number }[]; // 0-based, inclusive
  colWidths?: number[];
  rowHeights?: Record<number, number>;
  rtl?: boolean;
  freezeRows?: number;
  landscape?: boolean;
}

/* ------------------------------------------------------------------ */
/* XML helpers                                                         */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = (s: string) =>
  s
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export const cellRef = (r: number, c: number) => `${colLetter(c)}${r + 1}`;

/* ------------------------------------------------------------------ */
/* Style registry                                                      */
/* ------------------------------------------------------------------ */

class StyleRegistry {
  private fonts: string[] = [`<font><sz val="11"/><name val="Arial"/><family val="2"/></font>`];
  private fills: string[] = [`<fill><patternFill patternType="none"/></fill>`, `<fill><patternFill patternType="gray125"/></fill>`];
  private borders: string[] = [`<border><left/><right/><top/><bottom/><diagonal/></border>`];
  private numFmts = new Map<string, number>();
  private xfs: string[] = [`<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`];
  private cache = new Map<string, number>();

  private index(list: string[], xml: string): number {
    const i = list.indexOf(xml);
    if (i >= 0) return i;
    list.push(xml);
    return list.length - 1;
  }

  get(style?: CellStyle): number {
    if (!style) return 0;
    const key = JSON.stringify(style);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const font =
      `<font>${style.bold ? "<b/>" : ""}${style.italic ? "<i/>" : ""}<sz val="${style.fontSize || 11}"/>` +
      `${style.color ? `<color rgb="FF${style.color.replace("#", "").toUpperCase()}"/>` : ""}` +
      `<name val="Arial"/><family val="2"/></font>`;
    const fontId = this.index(this.fonts, font);

    const fillId = style.fill
      ? this.index(
          this.fills,
          `<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fill.replace("#", "").toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`
        )
      : 0;

    const side = (n: string) => `<${n} style="thin"><color rgb="FFB4BCC8"/></${n}>`;
    const borderId = style.border
      ? this.index(this.borders, `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`)
      : 0;

    let numFmtId = 0;
    if (style.numFmt) {
      if (style.numFmt === "0") numFmtId = 1;
      else if (style.numFmt === "0.00") numFmtId = 2;
      else if (style.numFmt === "#,##0") numFmtId = 3;
      else if (style.numFmt === "#,##0.00") numFmtId = 4;
      else {
        if (!this.numFmts.has(style.numFmt)) this.numFmts.set(style.numFmt, 164 + this.numFmts.size);
        numFmtId = this.numFmts.get(style.numFmt)!;
      }
    }

    const align =
      style.align || style.valign || style.wrap
        ? `<alignment${style.align ? ` horizontal="${style.align}"` : ""} vertical="${style.valign || "center"}"${
            style.wrap ? ' wrapText="1"' : ""
          }/>`
        : "";
    const xf =
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      `${numFmtId ? ' applyNumberFormat="1"' : ""} applyFont="1"${fillId ? ' applyFill="1"' : ""}` +
      `${borderId ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1">' + align + "</xf>" : "/>"}`;
    this.xfs.push(xf);
    const id = this.xfs.length - 1;
    this.cache.set(key, id);
    return id;
  }

  xml(): string {
    const fmts = [...this.numFmts.entries()]
      .map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`)
      .join("");
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `${fmts ? `<numFmts count="${this.numFmts.size}">${fmts}</numFmts>` : ""}` +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`
    );
  }
}

/* ------------------------------------------------------------------ */
/* Worksheet XML                                                       */
/* ------------------------------------------------------------------ */

function sheetXml(spec: SheetSpec, styles: StyleRegistry): string {
  const maxCols = Math.max(1, ...spec.rows.map((r) => r.length));
  const rowsXml: string[] = [];

  spec.rows.forEach((row, r) => {
    const cells: string[] = [];
    row.forEach((raw, c) => {
      if (raw === null || raw === undefined) return;
      const cell: Cell = typeof raw === "object" ? raw : { v: raw };
      const ref = cellRef(r, c);
      const s = styles.get(cell.s);
      const sAttr = s ? ` s="${s}"` : "";
      const v = cell.v;
      if (cell.f) {
        const cached = typeof v === "number" && Number.isFinite(v) ? `<v>${v}</v>` : "";
        cells.push(`<c r="${ref}"${sAttr}><f>${esc(cell.f)}</f>${cached}</c>`);
      } else if (typeof v === "number") {
        if (Number.isFinite(v)) cells.push(`<c r="${ref}"${sAttr}><v>${v}</v></c>`);
        else cells.push(`<c r="${ref}"${sAttr}/>`);
      } else if (v === null || v === "") {
        if (s) cells.push(`<c r="${ref}"${sAttr}/>`); // styled blank (borders/fills on merged areas)
      } else {
        cells.push(`<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`);
      }
    });
    const h = spec.rowHeights?.[r];
    if (cells.length || h) {
      rowsXml.push(`<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ""}>${cells.join("")}</row>`);
    }
  });

  const cols = spec.colWidths?.length
    ? `<cols>${spec.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const freeze = spec.freezeRows
    ? `<pane ySplit="${spec.freezeRows}" topLeftCell="A${spec.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : "";
  const merges = spec.merges?.length
    ? `<mergeCells count="${spec.merges.length}">${spec.merges
        .map((m) => `<mergeCell ref="${cellRef(m.r1, m.c1)}:${cellRef(m.r2, m.c2)}"/>`)
        .join("")}</mergeCells>`
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="A1:${cellRef(Math.max(0, spec.rows.length - 1), maxCols - 1)}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${spec.rtl ? ' rightToLeft="1"' : ""}>${freeze}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/>` +
    cols +
    `<sheetData>${rowsXml.join("")}</sheetData>` +
    merges +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${spec.landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>` +
    `</worksheet>`
  );
}

/* ------------------------------------------------------------------ */
/* ZIP (stored)                                                        */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // Fixed DOS date/time (2026-01-01 00:00) keeps output deterministic.
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    chunks.push(local, f.data);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + f.data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of all) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Workbook                                                            */
/* ------------------------------------------------------------------ */

export function buildXlsx(sheets: SheetSpec[]): Uint8Array {
  if (sheets.length === 0) throw new Error("Workbook needs at least one sheet");
  const enc = new TextEncoder();
  const styles = new StyleRegistry();
  const sheetFiles = sheets.map((s, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    data: enc.encode(sheetXml(s, styles)),
  }));

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView activeTab="0"/></bookViews>` +
    `<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
    `<calcPr calcId="191029" fullCalcOnLoad="1"/>` +
    `</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  return zipStored([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "xl/workbook.xml", data: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRels) },
    { name: "xl/styles.xml", data: enc.encode(styles.xml()) },
    ...sheetFiles,
  ]);
}

/** Browser download helper. */
export function downloadXlsx(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
