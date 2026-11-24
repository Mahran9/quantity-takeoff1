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
  /** Built on an assumption the person must confirm (e.g. storey height): the line arrives as «needs review». */
  review?: boolean;
}

/**
 * Steel shop/erection sets: the same piece marks on several sheets (plan, elevations) are the same members seen
 * again, so each family becomes one line with, per mark, the largest count on any one sheet (never the sum).
 * Concrete design sets: see below — floors stay separate, exact repeats are dropped.
 */
export function mergeRepeatedMarks(perSheet: { sheetId: string; code: string; cands: Candidate[] }[]): { sheetId: string; cands: Candidate[] }[] {
  const groups = new Map<string, { sheetId: string; code: string; c: Candidate }[]>();
  for (const s of perSheet) for (const c of s.cands) {
    if (!(c.sources.length === 1 && c.sources[0] === "mark" && c.selected)) continue;
    (groups.get(c.id) || groups.set(c.id, []).get(c.id)!).push({ sheetId: s.sheetId, code: s.code, c });
  }
  const drop = new Set<Candidate>();
  const replace = new Map<Candidate, Candidate>();
  const hasFootings = (sheetId: string) => perSheet.find((s) => s.sheetId === sheetId)?.cands.some((c) => c.id === "mrk-F");
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // Reinforced-concrete sets: each plan is a different floor (ground, first, annex …), so its marks are different
    // members and stay on their own line. Only a sheet that repeats another's marks exactly (the footing plan
    // re-drawing the ground-floor columns) is the same members again: drop that copy, keeping the floor plan.
    if (list[0].c.category === "أعمال خرسانية مسلحة وعادية") {
      const seen = new Map<string, (typeof list)[number]>();
      for (const x of [...list].sort((a, b) => Number(!!hasFootings(a.sheetId)) - Number(!!hasFootings(b.sheetId)))) {
        const key = JSON.stringify(Object.entries(x.c.perMark || { _: x.c.quantity }).sort());
        const first = seen.get(key);
        if (!first) { seen.set(key, x); continue; }
        drop.add(x.c);
        const prev = replace.get(first.c) || first.c;
        replace.set(first.c, { ...prev, checks: [...prev.checks, `نفس العلامات بنفس الأعداد مكررة في اللوحة ${x.code}: حُسبت مرة واحدة`] });
      }
      continue;
    }
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
    ...(c.review ? { reviewStatus: "needs_review" as const } : {}),
    sourceDetails: c.layer ? { layer: c.layer } : undefined,
  }));
}
