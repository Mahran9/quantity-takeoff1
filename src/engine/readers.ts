import { BlueprintSheet } from "../types";
import { extractEngineeringQuantitiesFromDxf, isIgnoredLayer } from "../utils/dxfParser";
import { LabelledQty } from "../utils/ocrLabels";
import { AiItem } from "../utils/aiTakeoff";
import { Candidate } from "./candidate";
import { readCadMembers } from "./cadMembers";
import { measureGroup, ptToMetres, suggestRole } from "../utils/pdfPlan";

/** CAD geometry reader: layers, closed shapes, blocks (already parsed when the file was uploaded). */
export interface CadAssumptions { wallHeight?: number; footingDepth?: number; slabThickness?: number; floorSlabThickness?: number }

export function readCad(sheet: BlueprintSheet, a: CadAssumptions = {}): Candidate[] {
  const dxf = sheet.dxfData;
  if (!dxf) return [];
  const members = readCadMembers(dxf);
  const memberLayers = new Set(members.flatMap((m) => (m.layer || "").split("، ")));
  const generic: Candidate[] = extractEngineeringQuantitiesFromDxf(dxf, {
    defaultWallHeight: a.wallHeight || 0,
    defaultFootingDepth: a.footingDepth || 0,
    defaultSlabThickness: a.slabThickness || 0,
    defaultFloorSlabThickness: a.floorSlabThickness || 0,
    includeClosedPerimeter: true,
  }).map((q: any) => {
    // The caveat after "؛" ("thickness not given", "size comes from the schedule"…) belongs in the evidence line,
    // not in the BOQ description that ends up in the quotation.
    const m = /^(.*?)\s*؛\s*(.*(?:غير محدد|يؤخذ|يحتاج|غير مستنتج).*)$/.exec(String(q.description || ""));
    const description = m ? m[1] : q.description;
    const caveat = m ? m[2] : "";
    return {
    id: `cad-${q.id}`,
    description,
    category: q.suggestedCategory,
    dim: q.type,
    unit: q.unit,
    quantity: q.value,
    sources: ["cad"],
    confidence: q.selected === false ? "low" : "medium",
    evidence: `هندسة الملف — الطبقة ${q.layer}${q.formula ? `: ${q.formula}` : ""}${caveat ? ` — ${caveat}` : ""}`,
    checks: [],
    selected: q.selected !== false,
    layer: q.layer,
    formula: q.formula,
    count: q.count,
    length: q.length,
    width: q.width,
    height: q.height,
  };
  });
  // The beam outlines are now measured as beams (m³); the same layer's raw line length would be a second count.
  for (const c of generic)
    if (c.layer && memberLayers.has(c.layer) && c.selected) {
      c.selected = false;
      c.checks = [...c.checks, "خطوط هذه الطبقة حُسبت كمرات بالمتر المكعب في بند الكمرات"];
    }
  return [...members, ...generic];
}

/** Printed numbers (area labels, summary tables) read by OCR. */
export function fromOcr(found: LabelledQty[]): Candidate[] {
  let seq = 0;
  return found.map((q, i) => ({
    id: `ocr-${i}`,
    description: q.kind === "area-label" ? `${q.label} — مساحة مدوّنة رقم ${++seq}` : `${q.label} (من جدول اللوحة)`,
    category: "أعمال متنوعة أخرى",
    dim: q.unit === "م³" ? "volume" : q.unit === "م²" ? "area" : q.unit === "م.ط" ? "linear" : "count",
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
  // Keep every group found in the page summary. The old top-eight limit silently dropped
  // most takeoff candidates on busy drawings and made the result look like a successful read.
  const groups = [...v.groups].sort((a, b) => b.lengthPt - a.lengthPt);
  groups.forEach((g, i) => {
    const role = suggestRole(g, den);
    // A colour, line weight, or closed outline does not identify a construction item, so anonymous length/area
    // buckets stay review-only. Two things are safe to preselect: a layer the drawing itself named, and repeated
    // identical shapes (e.g. 8 squares of 1.50×1.50) measured at a scale verified from the dimension numbers.
    // Axes, dimensions, text, hatching, title blocks: the same helper layers DXF ignores never carry quantities.
    if (g.layer && isIgnoredLayer(g.layer)) return;
    // "0", "11", "ev" are not names that say what the lines are; a real name has a word in it.
    const named = Boolean(g.layer && /[A-Za-z؀-ۿ]{3,}/.test(g.layer) && !/^(0|default|layer\s*\d*)$/i.test(g.layer.trim()));
    // A named layer tells what the lines are, but adding up its lines is still not a BOQ length or area (both faces of
    // a wall, hatch borders, details drawn at another scale): lengths and areas wait for the person even when named.
    // Only counts of repeated identical shapes are preselected. "trusted" keeps the readable description.
    const trusted = named || (sure && role.mode === "count");
    const preselect = sure && role.mode === "count";
    const push = (q: number, mode: string, hint: string, idSuffix: string, count?: number) => {
      if (!(q > 0)) return;
      out.push({
        id: `pdf-${g.id}-${i}${idSuffix}`,
        // What the item is comes first; a colour/thickness label means nothing to the reader, so it goes last.
        description: !trusted
          ? `خطوط غير مسمّاة (${g.label}) — مجموع كل الخطوط بهذا اللون والسمك`
          : named ? `${g.label} — ${hint}` : `${hint} — ${g.label}`,
        category: "أعمال متنوعة أخرى",
        dim: mode === "count" ? "count" : mode === "area" ? "area" : "linear",
        unit: mode === "count" ? "عدد" : mode === "area" ? "م²" : "م.ط",
        quantity: Number(q.toFixed(2)),
        sources: ["pdf"],
        // A group named by the drawing's own layer is an element; a bare colour/thickness bucket is every line of that
        // look added together (hatching, text outlines, furniture) and must never reach the BOQ unless the person picks it.
        confidence: sure && trusted ? "medium" : "low",
        evidence: `رسم PDF متجه بمقياس 1:${den} (${sure ? "مؤكَّد من أرقام الأبعاد" : "تقدير يحتاج تأكيد"}) — ${g.pathCount} عنصر`,
        checks: [],
        selected: preselect,
        layer: g.layer || g.label,
        named: !!g.layer,
        count,
      } as Candidate);
    };
    if (role.mode === "count") {
      // One line per size (F1, F2 …): footings/columns of different sizes are different items.
      const k = ptToMetres(1, den, v.userUnit || 1);
      g.sizeClusters.slice(0, 5).forEach((c, ci) => {
        if (c.count < 1) return;
        push(c.count, "count", `أعمدة/قواعد بمقاس ${(c.wPt * k).toFixed(2)}×${(c.hPt * k).toFixed(2)} م (${c.count} عنصراً)`, `-c${ci}`, c.count);
      });
      return;
    }
    const m = measureGroup(g, den, v.userUnit || 1);
    push(role.mode === "area" ? m.areaM2 : m.lengthM, role.mode, role.hint, "");
  });
  return out;
}
