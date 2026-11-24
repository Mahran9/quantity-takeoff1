import { DimensionType, TakeoffItem } from "../types";

/**
 * One piece of evidence about a quantity, from any reader (CAD geometry, printed numbers read by OCR, AI).
 * Every reader produces the same shape so the results can be cross-checked and reviewed together.
 */
export type Source = "cad" | "pdf" | "ocr" | "ai" | "mark";
export type Confidence = "high" | "medium" | "low";

export interface Candidate {
  id: string;
  description: string;
  category: string;
  dim: DimensionType;
  unit: string;
  quantity: number;
  sources: Source[];
  confidence: Confidence;
  /** Where the number came from, in words the engineer can verify on the drawing. */
  evidence: string;
  /** Results of cross-checks (agreement between sources, sanity limits). */
  checks: string[];
  selected: boolean;
  /** The drawing itself named this group (a PDF layer). Bare colour/thickness buckets are not named. */
  named?: boolean;
  /** Extra data kept for the BOQ line. */
  layer?: string;
  formula?: string;
  count?: number;
  length?: number;
  width?: number;
  height?: number;
  /** Mark families: times each mark (C1, C2 …) is written on this sheet. */
  perMark?: Record<string, number>;
}

/**
 * The same piece marks written on several sheets (plan, sections, schedules) are the same members seen again.
 * Merge each family into one line: per mark the largest count on any one sheet, never the sum across sheets.
 * Bolt groups / tags repeated on several sheets keep the largest single-sheet number. Returns which sheet keeps the line.
 */
export function mergeRepeatedMarks(perSheet: { sheetId: string; code: string; cands: Candidate[] }[]): { sheetId: string; cands: Candidate[] }[] {
  const groups = new Map<string, { sheetId: string; code: string; c: Candidate }[]>();
  for (const s of perSheet) for (const c of s.cands) {
    if (!(c.sources.length === 1 && c.sources[0] === "mark" && c.selected)) continue;
    (groups.get(c.id) || groups.set(c.id, []).get(c.id)!).push({ sheetId: s.sheetId, code: s.code, c });
  }
  const drop = new Set<Candidate>();
  const replace = new Map<Candidate, Candidate>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    let qty: number;
    let detail = "";
    if (list.every((x) => x.c.perMark)) {
      const best: Record<string, number> = {};
      for (const x of list) for (const [m, n] of Object.entries(x.c.perMark!)) best[m] = Math.max(best[m] || 0, n);
      qty = Object.values(best).reduce((a, b) => a + b, 0);
      detail = Object.entries(best).map(([m, n]) => `${m}×${n}`).join("، ");
    } else {
      qty = Math.max(...list.map((x) => x.c.quantity));
    }
    const keep = list.reduce((a, b) => (b.c.quantity > a.c.quantity ? b : a));
    const codes = list.map((x) => x.code).join("، ");
    replace.set(keep.c, {
      ...keep.c,
      quantity: qty,
      count: qty,
      description: keep.c.description.replace(/\s*\([^()]*\)\s*—/, " —"),
      evidence: `نفس العلامات مكتوبة في ${list.length} لوحات (${codes}): أُخذ لكل علامة أكبر عدد في لوحة واحدة، ولم تُجمع اللوحات${detail ? ` — ${detail}` : ""}`,
      checks: [...keep.c.checks, `لو جُمعت اللوحات لكان ${list.reduce((a, x) => a + x.c.quantity, 0)} — وهذا تكرار لنفس العناصر`],
    });
    for (const x of list) if (x !== keep) drop.add(x.c);
  }
  return perSheet.map((s) => ({ sheetId: s.sheetId, cands: s.cands.filter((c) => !drop.has(c)).map((c) => replace.get(c) || c) }));
}

export const SOURCE_LABEL: Record<Source, string> = { cad: "هندسة الملف", pdf: "خطوط PDF المتجهة", ocr: "نص مدوّن على اللوحة", ai: "قراءة Claude", mark: "علامات مكتوبة على اللوحة" };
export const SOURCE_PREFIX: Record<Source, string> = { cad: "CAD", pdf: "PDF", ocr: "TXT", ai: "AI", mark: "MRK" };

const CODE: Record<string, string> = { volume: "VOL", area: "ARA", linear: "LIN", count: "CNT" };
const EXTRACTION: Record<Source, TakeoffItem["extractionSource"]> = { cad: "cad_geometry", pdf: "pdf_vector", ocr: "visual_search", ai: "ai_vision", mark: "pdf_vector" };

export function candidatesToTakeoff(
  list: Candidate[],
  sheet: { id: string; code: string; title: string },
  startIndex: number
): TakeoffItem[] {
  return list.map((c, idx) => ({
    id: `item-${c.sources[0]}-${Date.now()}-${idx}`,
    sheetId: sheet.id,
    sheetCode: sheet.code,
    sheetTitle: sheet.title,
    itemCode: `${CODE[c.dim] || "CNT"}-${String(startIndex + idx + 1).padStart(2, "0")}`,
    description: c.description,
    category: c.category,
    dimensionType: c.dim,
    location: c.layer ? `طبقة: ${c.layer}` : c.sources.map((s) => SOURCE_LABEL[s]).join(" + "),
    count: c.count || 1,
    length: c.length,
    width: c.width,
    height: c.height,
    formula: c.formula,
    deduction: 0,
    quantity: c.quantity,
    unit: c.unit,
    unitPrice: 0,
    totalPrice: 0,
    notes: `المصدر: ${c.sources.map((s) => SOURCE_LABEL[s]).join(" + ")} — الثقة: ${c.confidence === "high" ? "عالية" : c.confidence === "medium" ? "متوسطة" : "منخفضة"}`,
    isVerified: false,
    sourceEvidence: [c.evidence, ...c.checks].filter(Boolean).join(" | "),
    reviewFlags: [
      ...(c.confidence === "low" ? ["ثقة منخفضة: راجع الرقم على اللوحة قبل الاعتماد"] : []),
      "لم يتم إدخال سعر وحدة",
    ],
    extractionSource: c.sources.length === 1 ? EXTRACTION[c.sources[0]] : "cad_geometry",
    sourceDetails: c.layer ? { layer: c.layer } : undefined,
  }));
}
