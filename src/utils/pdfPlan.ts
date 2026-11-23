import { PdfPath } from "./pdfVector";
import { PdfVectorGroupSummary, PdfVectorSummary, TakeoffItem } from "../types";

/**
 * Turns raw PDF vector paths into reviewable groups, finds/validates the drawing scale,
 * and builds takeoff items. Pure functions, unit-tested with real PDF.js output.
 */

export const PT_TO_MM = 25.4 / 72;

/** Points on the PDF -> metres in the real world, for a drawing at 1:denominator. */
export const ptToMetres = (pt: number, denominator: number, userUnit = 1) =>
  (pt * userUnit * PT_TO_MM * denominator) / 1000;

export const COMMON_SCALES = [1, 2, 5, 10, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 1000];

/* ------------------------------------------------------------------ */
/* Grouping                                                            */
/* ------------------------------------------------------------------ */

export interface SizeCluster {
  wPt: number;
  hPt: number;
  count: number;
}

export type PdfGroup = PdfVectorGroupSummary & { paths: PdfPath[] };

export interface PdfAnalysis {
  groups: PdfGroup[];
  excluded: { frame: number; duplicates: number; background: number; hairline: number };
  warnings: string[];
}

const keyPt = (v: number) => Math.round(v * 20) / 20; // 0.05 pt

function dupKey(p: PdfPath): string {
  const pts = p.points.map(([x, y]) => `${keyPt(x)},${keyPt(y)}`);
  const fwd = pts.join(";");
  const rev = [...pts].reverse().join(";");
  const ring = p.closed ? "c" : "o";
  // Orientation-insensitive for open paths; ring start is ignored for rectangles via sorted points.
  if (p.closed) return `${ring}|${[...pts].sort().join(";")}`;
  return `${ring}|${fwd < rev ? fwd : rev}`;
}

export function analyzePdfPaths(
  paths: PdfPath[],
  page: { width: number; height: number },
  opts: { removeDuplicates?: boolean } = {}
): PdfAnalysis {
  const removeDup = opts.removeDuplicates !== false;
  const excluded = { frame: 0, duplicates: 0, background: 0, hairline: 0 };
  const warnings: string[] = [];
  const seen = new Set<string>();
  const map = new Map<string, PdfGroup>();

  for (const p of paths) {
    // white fills are masks/backgrounds, never quantities
    if (p.filled && !p.stroked && p.color === "FFFFFF") {
      excluded.background++;
      continue;
    }
    if (p.length < 0.2) {
      excluded.hairline++;
      continue;
    }
    // sheet border / title-block frame
    const bw = p.bbox[2] - p.bbox[0];
    const bh = p.bbox[3] - p.bbox[1];
    // compare long/short sides so a /Rotate-d page (view may be swapped) still matches its border
    const longP = Math.max(page.width, page.height), shortP = Math.min(page.width, page.height);
    if (p.closed && Math.max(bw, bh) >= longP * 0.8 && Math.min(bw, bh) >= shortP * 0.8) {
      excluded.frame++;
      continue;
    }
    if (removeDup) {
      const k = dupKey(p) + (p.stroked ? "s" : "f");
      if (seen.has(k)) {
        excluded.duplicates++;
        continue;
      }
      seen.add(k);
    }

    const lwBucket = Math.round(p.lineWidth * PT_TO_MM * 20) / 20; // 0.05 mm
    const key = p.layer ? `L:${p.layer}` : `C:${p.color}|${lwBucket}|${p.stroked ? "s" : "f"}`;
    let g = map.get(key);
    if (!g) {
      g = {
        id: `pdfg-${map.size + 1}`,
        label: p.layer ? `طبقة ${p.layer}` : `لون #${p.color} · سُمك ${lwBucket.toFixed(2)} مم${p.stroked ? "" : " · تعبئة"}`,
        layer: p.layer,
        color: p.color,
        lineWidthMm: lwBucket,
        pathCount: 0,
        lengthPt: 0,
        closedCount: 0,
        areaPt2: 0,
        rectCount: 0,
        filledCount: 0,
        sizeClusters: [],
        maxPathPt: 0,
        paths: [],
      };
      map.set(key, g);
    }
    g.pathCount++;
    g.lengthPt += p.length;
    g.maxPathPt = Math.max(g.maxPathPt, p.length);
    if (p.closed) {
      g.closedCount++;
      g.areaPt2 += p.area;
    }
    if (p.isRect) {
      g.rectCount++;
      const w = Math.min(bw, bh);
      const h = Math.max(bw, bh);
      const c = g.sizeClusters.find((s) => Math.abs(s.wPt - w) <= Math.max(0.3, w * 0.02) && Math.abs(s.hPt - h) <= Math.max(0.3, h * 0.02));
      if (c) c.count++;
      else g.sizeClusters.push({ wPt: w, hPt: h, count: 1 });
    }
    if (p.filled) g.filledCount++;
    g.paths.push(p);
  }

  const groups = [...map.values()].sort((a, b) => b.lengthPt - a.lengthPt);
  groups.forEach((g) => g.sizeClusters.sort((a, b) => b.count - a.count));

  if (excluded.duplicates > 0) warnings.push(`تم تجاهل ${excluded.duplicates} عنصراً مكرراً (خطوط مرسومة فوق بعضها) حتى لا تُحسب الكمية مرتين.`);
  if (excluded.frame > 0) warnings.push(`تم استبعاد ${excluded.frame} إطار/حدود لوحة من الحصر.`);
  if (groups.length === 0) warnings.push("لم يُعثر على رسم متجهي في هذه الصفحة. غالباً الملف صورة ممسوحة ضوئياً؛ استخدم المعايرة اليدوية والقياس بالنقر.");
  if (paths.length > 0 && groups.length > 40) warnings.push("عدد المجموعات كبير؛ الملف غالباً مُصدَّر بدون طبقات. ركّز على أكبر المجموعات طولاً.");

  return { groups, excluded, warnings };
}

/* ------------------------------------------------------------------ */
/* Scale detection / calibration                                       */
/* ------------------------------------------------------------------ */

export interface ScaleCandidate {
  denominator: number;
  /** unit the dimension numbers are written in */
  unit: "m" | "cm" | "mm";
  matches: number;
  total: number;
}

export interface ScaleResult {
  textScale?: number;
  best?: ScaleCandidate;
  candidates: ScaleCandidate[];
  /** high: text scale and dimensions agree; medium: one source; low: nothing reliable */
  confidence: "high" | "medium" | "low";
  message: string;
}

const UNIT_TO_M = { m: 1, cm: 0.01, mm: 0.001 } as const;

export function parseDimensionNumbers(texts: string[]): number[] {
  const out: number[] = [];
  for (const raw of texts) {
    const t = raw
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/٫/g, ".")
      .replace(/٬/g, "")
      .trim();
    if (!/^\d{1,6}([.,]\d{1,3})?$/.test(t)) continue;
    const v = parseFloat(t.replace(",", "."));
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

export function extractTextScale(text: string): number | undefined {
  const m = text.match(/(?:scale|مقياس(?:\s*الرسم)?|م\.?ر)?\s*[:：]?\s*1\s*[:/]\s*(\d{1,4})\b/i);
  if (!m) return undefined;
  const d = parseInt(m[1], 10);
  return d >= 1 && d <= 5000 ? d : undefined;
}

export function calibrateScale(
  paths: PdfPath[],
  numbers: number[],
  page: { width: number; height: number },
  textScale?: number
): ScaleResult {
  // edge lengths (points) bucketed to 0.1 pt
  const edges = new Map<number, number>();
  for (const p of paths) {
    const n = p.closed ? p.points.length : p.points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = p.points[i];
      const b = p.points[(i + 1) % p.points.length];
      const l = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (l < 4) continue;
      const k = Math.round(l * 10);
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  const edgeKeys = [...edges.keys()].sort((a, b) => a - b);
  const has = (lenPt: number): boolean => {
    const tol = Math.max(0.6, lenPt * 0.012);
    const lo = Math.round((lenPt - tol) * 10);
    const hi = Math.round((lenPt + tol) * 10);
    // binary search first key >= lo
    let l = 0, r = edgeKeys.length;
    while (l < r) {
      const m = (l + r) >> 1;
      if (edgeKeys[m] < lo) l = m + 1;
      else r = m;
    }
    return l < edgeKeys.length && edgeKeys[l] <= hi;
  };

  const usable = [...new Set(numbers)].filter((v) => v >= 0.2).slice(0, 400);
  const maxSide = Math.max(page.width, page.height);
  const cands: ScaleCandidate[] = [];
  for (const d of COMMON_SCALES) {
    for (const unit of ["m", "cm", "mm"] as const) {
      let matches = 0;
      let total = 0;
      for (const v of usable) {
        const metres = v * UNIT_TO_M[unit];
        const lenPt = (metres * 1000) / (PT_TO_MM * d);
        if (lenPt < 8 || lenPt > maxSide) continue;
        total++;
        if (has(lenPt)) matches++;
      }
      if (total >= 3 && matches > 0) cands.push({ denominator: d, unit, matches, total });
    }
  }
  cands.sort((a, b) => b.matches / b.total - a.matches / a.total || b.matches - a.matches);

  // (1:100, metres) and (1:1, centimetres) predict identical lengths; physically only a plausible plan
  // scale is kept (largest denominator <= 500) so a building is not read as 20 cm wide.
  const ratioKey = (c: ScaleCandidate) => (UNIT_TO_M[c.unit] / c.denominator).toExponential(6);
  const byRatio = new Map<string, ScaleCandidate>();
  for (const c of cands) {
    const k = ratioKey(c);
    const cur = byRatio.get(k);
    const score = (x: ScaleCandidate) => (x.denominator <= 500 ? x.denominator : -x.denominator);
    if (!cur || score(c) > score(cur)) byRatio.set(k, c);
  }
  const allCands = cands;
  cands.splice(0, cands.length, ...[...byRatio.values()].sort((a, b) => b.matches / b.total - a.matches / a.total || b.matches - a.matches));

  const best = cands[0];
  const second = cands.find((c) => c.denominator !== best?.denominator);
  const dimsAgree = !!best && best.matches >= 3 && (best.matches / best.total >= 0.3) && (!second || best.matches >= second.matches * 1.5);
  const textMatches = textScale ? allCands.find((c) => c.denominator === textScale) : undefined;

  if (textScale && textMatches && textMatches.matches >= 3) {
    return { textScale, best: textMatches, candidates: cands.slice(0, 5), confidence: "high", message: `المقياس 1:${textScale} مكتوب في اللوحة ومطابق للأبعاد المقروءة (${textMatches.matches} بُعداً).` };
  }
  if (textScale && best && dimsAgree && best.denominator !== textScale) {
    return { textScale, best, candidates: cands.slice(0, 5), confidence: "low", message: `تحذير: مكتوب 1:${textScale} لكن الأبعاد المرسومة تطابق 1:${best.denominator}. تحقق من المقياس قبل الاعتماد.` };
  }
  if (dimsAgree) {
    return { textScale, best, candidates: cands.slice(0, 5), confidence: "medium", message: `المقياس المحتمل 1:${best!.denominator} من مطابقة ${best!.matches} بُعداً مع الرسم${textScale ? "" : " (لم يُكتب مقياس في اللوحة)"}.` };
  }
  if (textScale) {
    return { textScale, candidates: cands.slice(0, 5), confidence: "medium", message: `المقياس 1:${textScale} مكتوب في اللوحة ولم يمكن التحقق منه بالأبعاد. عاير بقياس بُعد معروف.` };
  }
  return { candidates: cands.slice(0, 5), confidence: "low", message: "تعذر تحديد المقياس تلقائياً. أدخله يدوياً أو عاير بقياس بُعد معروف." };
}

/** Manual calibration: user says "this measured length is really X metres". */
export function denominatorFromKnownLength(lengthPt: number, realMetres: number): number {
  if (!(lengthPt > 0) || !(realMetres > 0)) return NaN;
  return (realMetres * 1000) / (lengthPt * PT_TO_MM);
}

/* ------------------------------------------------------------------ */
/* Quantities                                                          */
/* ------------------------------------------------------------------ */

export type GroupMode = "skip" | "length" | "area" | "count";

export interface GroupAssignment {
  groupId: string;
  mode: GroupMode;
  category: string;
  description: string;
  /** for length mode: multiply by height (m) to get a wall/formwork area instead of metres */
  height?: number;
  /** for count mode: only closed rectangles of this size cluster index; undefined = all closed shapes */
  clusterIndex?: number;
  /** for area mode: only closed shapes (default true) */
  unitPrice?: number;
}

export interface MeasuredGroup {
  lengthM: number;
  areaM2: number;
  count: number;
}

export function measureGroup(g: PdfVectorGroupSummary, denominator: number, userUnit = 1, clusterIndex?: number): MeasuredGroup {
  const k = ptToMetres(1, denominator, userUnit);
  if (clusterIndex != null && g.sizeClusters[clusterIndex]) {
    const c = g.sizeClusters[clusterIndex];
    return { lengthM: 2 * (c.wPt + c.hPt) * c.count * k, areaM2: c.wPt * c.hPt * c.count * k * k, count: c.count };
  }
  return { lengthM: g.lengthPt * k, areaM2: g.areaPt2 * k * k, count: g.closedCount };
}

const r2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

export function buildPdfItems(args: {
  groups: PdfVectorGroupSummary[];
  assignments: GroupAssignment[];
  denominator: number;
  userUnit?: number;
  sheetId: string;
  sheetCode?: string;
  pageNumber: number;
  idFactory?: () => string;
}): TakeoffItem[] {
  const { groups, assignments, denominator, sheetId, pageNumber } = args;
  const mkId = args.idFactory || (() => `pdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const items: TakeoffItem[] = [];
  for (const a of assignments) {
    if (a.mode === "skip") continue;
    const g = groups.find((x) => x.id === a.groupId);
    if (!g) continue;
    const m = measureGroup(g, denominator, args.userUnit || 1, a.clusterIndex);
    let quantity = 0;
    let unit = "";
    let dimensionType: TakeoffItem["dimensionType"] = "linear";
    let formula = "";
    if (a.mode === "length") {
      if (a.height && a.height > 0) {
        quantity = r2(m.lengthM * a.height);
        unit = "م²";
        dimensionType = "area";
        formula = `${r2(m.lengthM)} م × ${a.height} م`;
      } else {
        quantity = r2(m.lengthM);
        unit = "م.ط";
        formula = `${r2(m.lengthM)} م`;
      }
    } else if (a.mode === "area") {
      quantity = r2(m.areaM2);
      unit = "م²";
      dimensionType = "area";
      formula = `${r2(m.areaM2)} م²`;
    } else {
      quantity = m.count;
      unit = "عدد";
      dimensionType = "count";
      formula = `${m.count} عدد`;
    }
    if (!(quantity > 0)) continue;
    items.push({
      id: mkId(),
      sheetId,
      sheetCode: args.sheetCode,
      itemCode: `PDF-${items.length + 1}`,
      description: a.description || g.label,
      category: a.category,
      dimensionType,
      location: `صفحة ${pageNumber}`,
      count: a.mode === "count" ? m.count : 1,
      quantity,
      unit,
      unitPrice: a.unitPrice || 0,
      totalPrice: r2(quantity * (a.unitPrice || 0)),
      formula,
      notes: `مستخرج من رسم PDF المتجه بمقياس 1:${denominator} — يتطلب مراجعة هندسية`,
      isVerified: false,
      reviewStatus: "needs_review",
      extractionSource: "pdf_vector",
      sourceEvidence: `${g.label} — ${g.pathCount} عنصر`,
      sourceDetails: { layer: g.layer || g.label, entityType: "pdf_path", pageNumber },
    } as TakeoffItem);
  }
  return items;
}

/** Heuristic suggestion only; the user always confirms. */
export function suggestRole(g: PdfVectorGroupSummary, denominator: number): { mode: GroupMode; hint: string } {
  const k = ptToMetres(1, denominator);
  const top = g.sizeClusters[0];
  if (top && top.count >= 2 && top.wPt * k >= 0.15 && top.hPt * k <= 1.5 && g.rectCount >= g.pathCount * 0.6) {
    return { mode: "count", hint: `يبدو أعمدة/قواعد: ${top.count} عنصراً بمقاس ${(top.wPt * k).toFixed(2)}×${(top.hPt * k).toFixed(2)} م` };
  }
  if (g.closedCount >= g.pathCount * 0.6 && g.areaPt2 > 0) {
    return { mode: "area", hint: "أشكال مغلقة كبيرة — غالباً غرف/بلاطات (مساحة)" };
  }
  return { mode: "length", hint: "خطوط ممتدة — غالباً جدران/جسور/تمديدات (طول)" };
}

/** Compact, persistable summary of one page (no raw paths). */
export function summarizePdfPage(args: {
  analysis: PdfAnalysis;
  page: { width: number; height: number };
  userUnit: number;
  truncated: boolean;
  scale: ScaleResult;
  numbers: number[];
}): PdfVectorSummary {
  const { analysis, scale } = args;
  return {
    pageWidthPt: args.page.width,
    pageHeightPt: args.page.height,
    userUnit: args.userUnit,
    groups: analysis.groups.slice(0, 60).map(({ paths, ...g }) => ({
      ...g,
      sizeClusters: g.sizeClusters.slice(0, 12),
      preview: buildPreview(paths, args.page),
    })),
    excluded: analysis.excluded,
    warnings: [...analysis.warnings, ...(args.truncated ? ["الرسم كبير جداً؛ قُرئ جزء منه فقط. قسّم المخطط أو صدّر طبقات أقل."] : [])],
    truncated: args.truncated,
    textScale: scale.textScale,
    detectedDenominator: scale.best?.denominator,
    scaleConfidence: scale.confidence,
    scaleMessage: scale.message,
    dimensionNumbers: args.numbers.slice(0, 400),
  };
}

/** Evenly sampled segments (max ~300) normalised to page width, y from the top. */
export function buildPreview(paths: PdfPath[], page: { width: number; height: number }, maxSegs = 300): number[] {
  const segs: number[] = [];
  let total = 0;
  for (const p of paths) total += Math.max(0, p.closed ? p.points.length : p.points.length - 1);
  const stride = Math.max(1, Math.ceil(total / maxSegs));
  const r = (v: number) => Math.round(v * 1000) / 1000;
  let k = 0;
  for (const p of paths) {
    const n = p.closed ? p.points.length : p.points.length - 1;
    for (let i = 0; i < n; i++, k++) {
      if (k % stride) continue;
      const a = p.points[i];
      const b = p.points[(i + 1) % p.points.length];
      segs.push(r(a[0] / page.width), r(1 - a[1] / page.height) * (page.height / page.width), r(b[0] / page.width), r(1 - b[1] / page.height) * (page.height / page.width));
    }
  }
  return segs.map((v) => Math.round(v * 1000) / 1000);
}
