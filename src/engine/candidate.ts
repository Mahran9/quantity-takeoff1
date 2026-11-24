import { DimensionType, TakeoffItem } from "../types";

/**
 * One piece of evidence about a quantity, from any reader (CAD geometry, printed numbers read by OCR, AI).
 * Every reader produces the same shape so the results can be cross-checked and reviewed together.
 */
export type Source = "cad" | "pdf" | "ocr" | "ai";
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
  /** Extra data kept for the BOQ line. */
  layer?: string;
  formula?: string;
  count?: number;
  length?: number;
  width?: number;
  height?: number;
}

export const SOURCE_LABEL: Record<Source, string> = { cad: "هندسة الملف", pdf: "خطوط PDF المتجهة", ocr: "نص مدوّن على اللوحة", ai: "قراءة Claude" };
export const SOURCE_PREFIX: Record<Source, string> = { cad: "CAD", pdf: "PDF", ocr: "TXT", ai: "AI" };

const CODE: Record<string, string> = { volume: "VOL", area: "ARA", linear: "LIN", count: "CNT" };
const EXTRACTION: Record<Source, TakeoffItem["extractionSource"]> = { cad: "cad_geometry", pdf: "pdf_vector", ocr: "visual_search", ai: "ai_vision" };

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
