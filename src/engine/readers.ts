import { BlueprintSheet } from "../types";
import { extractEngineeringQuantitiesFromDxf } from "../utils/dxfParser";
import { LabelledQty } from "../utils/ocrLabels";
import { AiItem } from "../utils/aiTakeoff";
import { Candidate } from "./candidate";
import { measureGroup, suggestRole } from "../utils/pdfPlan";

/** CAD geometry reader: layers, closed shapes, blocks (already parsed when the file was uploaded). */
export interface CadAssumptions { wallHeight?: number; footingDepth?: number; slabThickness?: number; floorSlabThickness?: number }

export function readCad(sheet: BlueprintSheet, a: CadAssumptions = {}): Candidate[] {
  const dxf = sheet.dxfData;
  if (!dxf) return [];
  return extractEngineeringQuantitiesFromDxf(dxf, {
    defaultWallHeight: a.wallHeight || 0,
    defaultFootingDepth: a.footingDepth || 0,
    defaultSlabThickness: a.slabThickness || 0,
    defaultFloorSlabThickness: a.floorSlabThickness || 0,
  }).map((q: any) => ({
    id: `cad-${q.id}`,
    description: q.description,
    category: q.suggestedCategory,
    dim: q.type,
    unit: q.unit,
    quantity: q.value,
    sources: ["cad"],
    confidence: q.selected === false ? "low" : "medium",
    evidence: `هندسة الملف — الطبقة ${q.layer}${q.formula ? `: ${q.formula}` : ""}`,
    checks: [],
    selected: q.selected !== false,
    layer: q.layer,
    formula: q.formula,
    count: q.count,
    length: q.length,
    width: q.width,
    height: q.height,
  }));
}

/** Printed numbers (area labels, summary tables) read by OCR. */
export function fromOcr(found: LabelledQty[]): Candidate[] {
  let seq = 0;
  return found.map((q, i) => ({
    id: `ocr-${i}`,
    description: q.kind === "area-label" ? `${q.label} — مساحة مدوّنة رقم ${++seq}` : `${q.label} (من جدول اللوحة)`,
    category: "أعمال متنوعة أخرى",
    dim: q.unit === "م²" ? "area" : q.unit === "م.ط" ? "linear" : "count",
    unit: q.unit,
    quantity: q.value,
    sources: ["ocr"],
    confidence: "medium",
    evidence: `السطر المقروء: «${q.raw}»`,
    checks: [],
    selected: true,
  }));
}

export function fromAi(items: AiItem[]): Candidate[] {
  const dim = (u: string) => (/م³|م3/.test(u) ? "volume" : /م²|م2/.test(u) ? "area" : /م\.?ط/.test(u) ? "linear" : "count");
  return items.map((i, k) => ({
    id: `ai-${k}`,
    description: i.description,
    category: i.category,
    dim: dim(i.unit) as any,
    unit: i.unit,
    quantity: i.quantity,
    sources: ["ai"],
    confidence: i.confidence,
    evidence: `الأساس: ${i.basis}`,
    checks: [],
    selected: i.confidence !== "low" && i.quantity > 0,
  }));
}

/**
 * Vector PDF reader: line groups measured at the scale found by matching the drawing's own dimension
 * numbers. Only used when a scale was actually detected; a low-confidence scale yields nothing, because
 * a wrong scale would silently scale every quantity.
 */
export function readPdf(sheet: BlueprintSheet): Candidate[] {
  const v = sheet.pdfVector;
  const den = v?.detectedDenominator;
  if (!v || !den || v.scaleConfidence === "low") return [];
  const sure = v.scaleConfidence === "high";
  const out: Candidate[] = [];
  const groups = [...v.groups].sort((a, b) => b.lengthPt - a.lengthPt).slice(0, 8);
  groups.forEach((g, i) => {
    const role = suggestRole(g, den);
    const m = measureGroup(g, den, v.userUnit || 1, role.mode === "count" ? 0 : undefined);
    const q = role.mode === "count" ? m.count : role.mode === "area" ? m.areaM2 : m.lengthM;
    if (!(q > 0)) return;
    const unit = role.mode === "count" ? "عدد" : role.mode === "area" ? "م²" : "م.ط";
    const dim = role.mode === "count" ? "count" : role.mode === "area" ? "area" : "linear";
    out.push({
      id: `pdf-${g.id}-${i}`,
      description: `${g.label} — ${role.hint}`,
      category: "أعمال متنوعة أخرى",
      dim,
      unit,
      quantity: Number(q.toFixed(2)),
      sources: ["pdf"],
      confidence: sure ? "medium" : "low",
      evidence: `رسم PDF متجه بمقياس 1:${den} (${sure ? "مؤكَّد من أرقام الأبعاد" : "تقدير يحتاج تأكيد"}) — ${g.pathCount} عنصر`,
      checks: [],
      selected: sure,
      layer: g.layer || g.label,
      count: role.mode === "count" ? m.count : undefined,
    } as Candidate);
  });
  return out;
}
