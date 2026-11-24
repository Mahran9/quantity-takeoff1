import { pairedLineFraction, Seg } from "./parallelLines";
import DxfParser from "dxf-parser";
import { DxfLayerInfo, ExtractedCadQuantity, TradeCategory } from "../types";



/**
 * Decode AutoCAD escape sequences that survive in ASCII DXF text:
 *   \U+XXXX (unicode), %%c -> Ø, %%d -> °, %%p -> ±, %%u / %%o (underline / overline toggles) are dropped,
 *   %%nnn (decimal char code).
 */
export function decodeCadCodes(raw: string): string {
  if (!raw) return "";
  return String(raw)
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, "Ø")
    .replace(/%%[dD]/g, "°")
    .replace(/%%[pP]/g, "±")
    .replace(/%%[uUoO]/g, "")
    .replace(/%%([0-9]{3})/g, (_m, d) => String.fromCharCode(Number(d)));
}

/**
 * Strip AutoCAD MTEXT formatting codes (e.g. {\fArial|b1;...}, \P, \H0.5x;) and decode
 * \U+XXXX / %%c / %%d / %%p so schedule & thickness parsers read clean text reliably.
 */
export function cleanDxfText(raw: string): string {
  if (!raw) return "";
  return decodeCadCodes(raw)
    .replace(/\\P/gi, " ")
    .replace(/\\[A-Za-z][^;]*;/g, "")
    .replace(/\\[LlOoKk]/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


export interface PolylineVertex {
  x: number;
  y: number;
  bulge?: number;
}

/**
 * Compute exact length and area of a 2D polyline including DXF arc segments (bulge).
 * Bulge = tan(included_angle / 4). Positive bulge = CCW arc, negative = CW arc.
 */
export function computePolylineGeometry(
  vertices: PolylineVertex[],
  isClosed: boolean
): { length: number; area: number } {
  if (!vertices || vertices.length < 2) return { length: 0, area: 0 };

  const segCount = isClosed ? vertices.length : vertices.length - 1;
  let totalLength = 0;
  let shoelaceSigned = 0;
  let bulgeAreaSigned = 0;

  for (let i = 0; i < segCount; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];
    if (!v1 || !v2) continue;

    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const chord = Math.hypot(dx, dy);
    const bulge = Number(v1.bulge || 0);

    if (isClosed) {
      shoelaceSigned += v1.x * v2.y - v2.x * v1.y;
    }

    if (Math.abs(bulge) > 1e-6 && chord > 1e-9) {
      const theta = 4 * Math.atan(Math.abs(bulge));
      const sinHalf = Math.sin(theta / 2);
      if (sinHalf > 1e-9) {
        const radius = chord / (2 * sinHalf);
        totalLength += radius * theta;
        if (isClosed) {
          const segArea = 0.5 * radius * radius * (theta - Math.sin(theta));
          bulgeAreaSigned += bulge > 0 ? segArea : -segArea;
        }
      } else {
        totalLength += chord;
      }
    } else {
      totalLength += chord;
    }
  }

  const area = isClosed ? Math.abs(0.5 * shoelaceSigned + bulgeAreaSigned) : 0;
  return {
    length: isFinite(totalLength) ? totalLength : 0,
    area: isFinite(area) ? area : 0,
  };
}


function isPointInPolygon(pt: { x: number; y: number }, poly: PolylineVertex[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Compute net area of a DXF HATCH entity by subtracting internal hole loops (islands/openings)
 * from their containing outer boundary loops.
 */
export interface BBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PolylineFootprint {
  area: number;
  bbox: BBox2D;
}

export function computeVerticesBBox(vertices: PolylineVertex[]): BBox2D {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (!v) continue;
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    // Expand bbox slightly if segment has a bulge arc (e.g. 2-vertex circle)
    const bulge = Number(v.bulge || 0);
    if (Math.abs(bulge) > 1e-6 && vertices.length >= 2) {
      const next = vertices[(i + 1) % vertices.length];
      if (next) {
        const chord = Math.hypot(next.x - v.x, next.y - v.y);
        const sagitta = (chord / 2) * Math.abs(bulge);
        const midX = (v.x + next.x) / 2;
        const midY = (v.y + next.y) / 2;
        if (midX - sagitta < minX) minX = midX - sagitta;
        if (midX + sagitta > maxX) maxX = midX + sagitta;
        if (midY - sagitta < minY) minY = midY - sagitta;
        if (midY + sagitta > maxY) maxY = midY + sagitta;
      }
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function computeBBoxIoU(a: BBox2D, b: BBox2D): number {
  const interMinX = Math.max(a.minX, b.minX);
  const interMinY = Math.max(a.minY, b.minY);
  const interMaxX = Math.min(a.maxX, b.maxX);
  const interMaxY = Math.min(a.maxY, b.maxY);

  const interW = Math.max(0, interMaxX - interMinX);
  const interH = Math.max(0, interMaxY - interMinY);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;

  const areaA = Math.max(0, (a.maxX - a.minX) * (a.maxY - a.minY));
  const areaB = Math.max(0, (b.maxX - b.minX) * (b.maxY - b.minY));
  const unionArea = areaA + areaB - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Compute net area of a DXF HATCH entity by subtracting internal hole loops (including
 * nested islands and circular openings) from their containing outer boundary loops.
 */
export function computeHatchNetArea(
  boundaryPaths: any[]
): { netArea: number; outerPerimeter: number; holeCount: number; outerBBox: BBox2D | null } {
  if (!Array.isArray(boundaryPaths) || boundaryPaths.length === 0) {
    return { netArea: 0, outerPerimeter: 0, holeCount: 0, outerBBox: null };
  }

  const loops: {
    pts: PolylineVertex[];
    area: number;
    perimeter: number;
    samplePt: { x: number; y: number };
    bbox: BBox2D;
    circle?: { cx: number; cy: number; r: number };
  }[] = [];

  for (const p of boundaryPaths) {
    // Support explicit circle boundary inside HATCH (center + radius)
    if (p?.center && typeof p?.radius === "number" && p.radius > 0) {
      const cx = Number(p.center.x || 0);
      const cy = Number(p.center.y || 0);
      const r = Number(p.radius);
      const area = Math.PI * r * r;
      const perimeter = 2 * Math.PI * r;
      // Approximate 12-gon for point-in-polygon nesting checks
      const approxPts: PolylineVertex[] = [];
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        approxPts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
      }
      loops.push({
        pts: approxPts,
        area,
        perimeter,
        samplePt: { x: cx, y: cy },
        bbox: { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r },
        circle: { cx, cy, r },
      });
      continue;
    }

    const pts: PolylineVertex[] = p?.polylineVertices || p?.vertices || [];
    if (Array.isArray(pts) && pts.length >= 2) {
      const { length, area } = computePolylineGeometry(pts, true);
      if (area > 0.01) {
        const bbox = computeVerticesBBox(pts);
        const samplePt = {
          x: pts.reduce((s, v) => s + v.x, 0) / pts.length,
          y: pts.reduce((s, v) => s + v.y, 0) / pts.length,
        };
        loops.push({ pts, area, perimeter: length, samplePt, bbox });
      }
    }
  }
  if (loops.length === 0) {
    return { netArea: 0, outerPerimeter: 0, holeCount: 0, outerBBox: null };
  }

  // Sort descending by area so outer boundaries come before holes and nested islands
  loops.sort((a, b) => b.area - a.area);

  let netArea = 0;
  let outerPerimeter = 0;
  let holeCount = 0;
  let outerBBox: BBox2D | null = null;

  const isInsideLoop = (pt: { x: number; y: number }, container: (typeof loops)[number]): boolean => {
    if (container.circle) {
      return Math.hypot(pt.x - container.circle.cx, pt.y - container.circle.cy) < container.circle.r;
    }
    return isPointInPolygon(pt, container.pts);
  };

  for (let i = 0; i < loops.length; i++) {
    const current = loops[i];
    let depth = 0;
    for (let j = 0; j < i; j++) {
      if (isInsideLoop(current.samplePt, loops[j])) {
        depth++;
      }
    }
    if (depth % 2 === 1) {
      // Odd nesting depth = internal hole/opening -> subtract
      netArea -= current.area;
      holeCount++;
    } else {
      // Even nesting depth = outer boundary or island inside a hole -> add
      netArea += current.area;
      outerPerimeter += current.perimeter;
      if (!outerBBox) {
        outerBBox = { ...current.bbox };
      } else {
        outerBBox = {
          minX: Math.min(outerBBox.minX, current.bbox.minX),
          minY: Math.min(outerBBox.minY, current.bbox.minY),
          maxX: Math.max(outerBBox.maxX, current.bbox.maxX),
          maxY: Math.max(outerBBox.maxY, current.bbox.maxY),
        };
      }
    }
  }

  return {
    netArea: Math.max(0, netArea),
    outerPerimeter,
    holeCount,
    outerBBox,
  };
}

/**
 * Spatial + Area deduplication guard:
 * Prevents double-counting ONLY when a HATCH and a closed LWPOLYLINE on the SAME layer
 * match in BOTH area (within tolerance) AND spatial location (BBox IoU >= minBBoxIoU).
 * Two identical slabs in different locations on the same layer will NOT be deduplicated.
 */
export interface DeduplicatedHatchRecord {
  id: string;
  layer: string;
  netAreaRaw: number;
  outerPerimeterRaw: number;
  holeCount: number;
  matchedPolylineAreaRaw: number;
  areaDiffPercent: number;
  bboxIoU: number;
  reason: string;
}

export interface SpatialDuplicateMatch {
  isDuplicate: boolean;
  matchedPolylineArea?: number;
  areaDiffRatio?: number;
  iou?: number;
}

export function findHatchSpatialDuplicateMatch(
  hatchArea: number,
  hatchBBox: BBox2D | null,
  existingPolylines: PolylineFootprint[],
  options: { areaToleranceRatio?: number; minBBoxIoU?: number } = {}
): SpatialDuplicateMatch {
  const { areaToleranceRatio = 0.02, minBBoxIoU = 0.85 } = options;
  if (!existingPolylines || existingPolylines.length === 0 || hatchArea <= 0 || !hatchBBox) {
    return { isDuplicate: false };
  }
  for (const poly of existingPolylines) {
    if (poly.area <= 0) continue;
    const areaDiffRatio = Math.abs(hatchArea - poly.area) / Math.max(hatchArea, poly.area);
    if (areaDiffRatio > areaToleranceRatio) continue;
    const iou = computeBBoxIoU(hatchBBox, poly.bbox);
    if (iou >= minBBoxIoU) {
      return {
        isDuplicate: true,
        matchedPolylineArea: poly.area,
        areaDiffRatio,
        iou,
      };
    }
  }
  return { isDuplicate: false };
}

export function isHatchSpatialDuplicateOfPolyline(
  hatchArea: number,
  hatchBBox: BBox2D | null,
  existingPolylines: PolylineFootprint[],
  options: { areaToleranceRatio?: number; minBBoxIoU?: number } = {}
): boolean {
  return findHatchSpatialDuplicateMatch(hatchArea, hatchBBox, existingPolylines, options).isDuplicate;
}

/**
 * Legacy area-only check retained for backward compatibility.
 */
export function isAreaDuplicateOfPolyline(
  hatchArea: number,
  existingPolylineAreas: number[],
  toleranceRatio = 0.02
): boolean {
  if (!existingPolylineAreas || existingPolylineAreas.length === 0 || hatchArea <= 0) return false;
  return existingPolylineAreas.some((polyArea) => {
    if (polyArea <= 0) return false;
    return Math.abs(hatchArea - polyArea) / Math.max(hatchArea, polyArea) <= toleranceRatio;
  });
}

// ---------------------------------------------------------------------------
// Layer-name classification helpers (token based — no blind substring matching)
// ---------------------------------------------------------------------------

export type LayerRuleKind = "area" | "linear" | "count" | "ignore";

export interface LayerRule {
  /** Case-insensitive token / substring matched against the layer (or block) name. */
  match: string;
  /** Trade category assigned to the matched layer. */
  category: string;
  /** Force how the layer is measured; "ignore" drops it from the results. */
  kind?: LayerRuleKind;
}

const LAYER_RULES_STORAGE_KEY = "qto_layer_rules_v1";

export function loadLayerRules(): LayerRule[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LAYER_RULES_STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is LayerRule => !!r && typeof r.match === "string" && r.match.trim() !== "")
      .map((r) => ({
        match: String(r.match).trim(),
        category: typeof r.category === "string" ? r.category : "",
        kind: r.kind === "area" || r.kind === "linear" || r.kind === "count" || r.kind === "ignore" ? r.kind : undefined,
      }));
  } catch {
    return [];
  }
}

export function saveLayerRules(rules: LayerRule[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LAYER_RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* storage may be unavailable (private mode / quota) — rules just stay in memory */
  }
}

/** Upper-cases a layer name and joins its tokens with "_" (separators: _ - space . $ | : /). */
export function normalizeLayerName(name: string): string {
  return String(name || "")
    .toUpperCase()
    .split(/[_\-\s.$|:/\\]+/)
    .filter(Boolean)
    .join("_");
}

export function tokenizeLayerName(name: string): string[] {
  return normalizeLayerName(name).split("_").filter(Boolean);
}

const ARABIC_RE = /[؀-ۿ]/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRegexCache = new Map<string, RegExp>();

/**
 * Word forms (applied on a normalized "A_B_C" name):
 *   "WALL"  -> whole token WALL (optionally plural: WALLS)
 *   "FOOT*" -> any token starting with FOOT (FOOTING, FOOTINGS)
 *   "IPE#"  -> token IPE followed by optional digits (IPE, IPE300)
 *   Arabic words are matched as substrings.
 *   Multi-token words contain "_" (e.g. "SLAB_ON_GRADE").
 */
export function layerHasWord(norm: string, word: string): boolean {
  if (ARABIC_RE.test(word)) return norm.includes(word);
  let re = wordRegexCache.get(word);
  if (!re) {
    let body: string;
    if (word.endsWith("*")) body = `${escapeRe(word.slice(0, -1))}[A-Z0-9]*`;
    else if (word.endsWith("#")) body = `${escapeRe(word.slice(0, -1))}[0-9]*`;
    else body = `${escapeRe(word)}S?`;
    re = new RegExp(`(?:^|_)${body}(?:_|$)`);
    wordRegexCache.set(word, re);
  }
  return re.test(norm);
}

const layerHasAny = (norm: string, words: string[]) => words.some((w) => layerHasWord(norm, w));

const IGNORE_WORDS = [
  "TITLE", "TITLEBLOCK", "BORDER", "GRID", "AXIS", "AXES", "DIM", "DIMS", "DIM*", "DIMENSION*",
  "CEN", "CENTER*", "CENTRE*", "CENTERLINE*", "FURN*", "FURNITURE", "FIRNTUR", "TEMP*", "CONSTRUCTION*",
  "DEFPOINTS", "TEXT", "TXT", "ANNO", "ANNOTATION*", "VIEWPORT*", "VPORT*", "VP", "NOTE", "NOTES",
  "SHEET_FRAME", "DRAWING_FRAME", "PAPER_FRAME", "VIEW_FRAME", "LEGEND", "SYMBOL", "SYMBOLS",
  "عنوان", "ملاحظات", "أبعاد", "ابعاد", "محاور",
];
const HATCH_HELPER_WORDS = ["HATCH", "HATCHES", "PATTERN", "FILL", "SOLID", "POCHE", "تهشير"];

/** True for annotation / drawing-sheet helper layers that never carry quantities. */
export function isIgnoredLayer(name: string): boolean {
  const norm = normalizeLayerName(name);
  if (!norm) return false;
  if (layerHasAny(norm, IGNORE_WORDS)) return true;
  const core = norm.split("_").filter((t) => t.length > 2 || ARABIC_RE.test(t));
  if (core.length > 0 && core.every((t) => HATCH_HELPER_WORDS.some((h) => t === h))) return true;
  return false;
}

/** First user rule whose pattern matches the name (case-insensitive token/substring). */
export function matchLayerRule(name: string, rules?: LayerRule[]): LayerRule | undefined {
  if (!rules || rules.length === 0) return undefined;
  const norm = normalizeLayerName(name);
  const lower = String(name || "").toUpperCase();
  return rules.find((r) => {
    const m = normalizeLayerName(r.match);
    if (!m) return false;
    return norm === m || norm.includes(m) || lower.includes(String(r.match).toUpperCase().trim());
  });
}

// ---------------------------------------------------------------------------
// Extra geometry helpers (ELLIPSE / SPLINE)
// ---------------------------------------------------------------------------

export function ellipsePerimeterRamanujan(a: number, b: number): number {
  if (!(a > 0) || !(b > 0)) return 0;
  const h = ((a - b) * (a - b)) / ((a + b) * (a + b));
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/** Arc length of ellipse between parameters t0..t1 (Simpson integration). */
function ellipseArcLength(a: number, b: number, t0: number, t1: number): number {
  const n = 400;
  const h = (t1 - t0) / n;
  const f = (t: number) => Math.sqrt(a * a * Math.sin(t) ** 2 + b * b * Math.cos(t) ** 2);
  let sum = f(t0) + f(t1);
  for (let i = 1; i < n; i++) sum += f(t0 + i * h) * (i % 2 === 0 ? 2 : 4);
  return (sum * h) / 3;
}

export function computeEllipseGeometry(entity: any): { length: number; area: number; isFull: boolean } {
  const mx = Number(entity?.majorAxisEndPoint?.x ?? 0);
  const my = Number(entity?.majorAxisEndPoint?.y ?? 0);
  const ratio = Number(entity?.axisRatio ?? 1);
  const a = Math.hypot(mx, my);
  const b = a * ratio;
  if (!(a > 0) || !(b > 0) || !isFinite(a) || !isFinite(b)) return { length: 0, area: 0, isFull: false };
  const start = Number(entity?.startAngle ?? 0);
  let end = Number(entity?.endAngle ?? Math.PI * 2);
  const twoPi = Math.PI * 2;
  const isFull = Math.abs(end - start) < 1e-6 || Math.abs(Math.abs(end - start) - twoPi) < 1e-3;
  if (isFull) return { length: ellipsePerimeterRamanujan(a, b), area: Math.PI * a * b, isFull: true };
  if (end <= start) end += twoPi;
  return { length: ellipseArcLength(a, b, start, end), area: 0, isFull: false };
}

/** Length of a B-spline sampled with de Boor; falls back to the fit/control polygon length. */
export function approximateSplineLength(entity: any): number {
  const polyLen = (pts: { x: number; y: number }[]) => {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return s;
  };
  const fit: { x: number; y: number }[] = Array.isArray(entity?.fitPoints) ? entity.fitPoints : [];
  const ctrl: { x: number; y: number }[] = Array.isArray(entity?.controlPoints) ? entity.controlPoints : [];
  if (fit.length >= 2) return polyLen(fit);
  if (ctrl.length < 2) return 0;
  const p = Number(entity?.degreeOfSplineCurve ?? 3);
  const knots: number[] = Array.isArray(entity?.knotValues) ? entity.knotValues : [];
  const n = ctrl.length;
  if (!(p >= 1) || knots.length !== n + p + 1) return polyLen(ctrl);

  const lo = knots[p];
  const hi = knots[n];
  if (!(hi > lo)) return polyLen(ctrl);
  const evalAt = (u: number) => {
    let k = p;
    while (k < n - 1 && u >= knots[k + 1]) k++;
    const d = ctrl.slice(k - p, k + 1).map((c) => ({ x: c.x, y: c.y }));
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = k - p + j;
        const denom = knots[i + p - r + 1] - knots[i];
        const alpha = denom === 0 ? 0 : (u - knots[i]) / denom;
        d[j] = { x: (1 - alpha) * d[j - 1].x + alpha * d[j].x, y: (1 - alpha) * d[j - 1].y + alpha * d[j].y };
      }
    }
    return d[p];
  };
  const samples = Math.max(64, n * 24);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = lo + ((hi - lo) * i) / samples - (i === samples ? 1e-9 * (hi - lo) : 0);
    pts.push(evalAt(u));
  }
  const len = polyLen(pts);
  return isFinite(len) && len > 0 ? len : polyLen(ctrl);
}

// ---------------------------------------------------------------------------
// Block instance expansion (nested INSERT + MINSERT arrays)
// ---------------------------------------------------------------------------

const MAX_BLOCK_DEPTH = 6;

function insertMultiplier(entity: any): number {
  const rows = Math.max(1, Math.floor(Number(entity?.rowCount) || 1));
  const cols = Math.max(1, Math.floor(Number(entity?.columnCount) || 1));
  return rows * cols;
}

/**
 * Counts every INSERT instance reachable from model space, expanding nested block
 * definitions (depth limit 6, cycle-safe) and MINSERT rows × columns.
 */
export function expandBlockInstanceCounts(
  topLevelInserts: any[],
  blocks: Record<string, any> | undefined
): { counts: Record<string, number>; nestedExpanded: number; truncated: boolean } {
  const counts: Record<string, number> = {};
  let nestedExpanded = 0;
  let truncated = false;
  const memo = new Map<string, Record<string, number>>();

  const descendants = (blockName: string, stack: string[]): Record<string, number> => {
    if (memo.has(blockName)) return memo.get(blockName)!;
    const out: Record<string, number> = {};
    const def = blocks?.[blockName];
    if (!def || !Array.isArray(def.entities)) return out;
    if (stack.includes(blockName) || stack.length >= MAX_BLOCK_DEPTH) {
      truncated = true;
      return out;
    }
    const nextStack = [...stack, blockName];
    for (const e of def.entities) {
      if (e?.type !== "INSERT" || !e.name) continue;
      const m = insertMultiplier(e);
      out[e.name] = (out[e.name] || 0) + m;
      const sub = descendants(e.name, nextStack);
      for (const [k, v] of Object.entries(sub)) out[k] = (out[k] || 0) + v * m;
    }
    if (nextStack.length === 1) memo.set(blockName, out);
    return out;
  };

  for (const ins of topLevelInserts) {
    if (!ins?.name) continue;
    const m = insertMultiplier(ins);
    counts[ins.name] = (counts[ins.name] || 0) + m;
    const sub = descendants(ins.name, []);
    for (const [k, v] of Object.entries(sub)) {
      counts[k] = (counts[k] || 0) + v * m;
      nestedExpanded += v * m;
    }
  }
  return { counts, nestedExpanded, truncated };
}

export interface DxfUnitInfo {
  code: number;
  name: string;
  toMeters: number; // Multiply raw DXF length by this to get meters
  /** True when $INSUNITS was missing and the unit was guessed from the drawing span. */
  guessed?: boolean;
}

export function detectDxfUnits(parsed: any): DxfUnitInfo {
  const code = Number(parsed?.header?.$INSUNITS ?? 0);
  switch (code) {
    case 1: return { code: 1, name: "بوصة (Inches)", toMeters: 0.0254 };
    case 2: return { code: 2, name: "قدم (Feet)", toMeters: 0.3048 };
    case 4: return { code: 4, name: "مليمتر (mm)", toMeters: 0.001 };
    case 5: return { code: 5, name: "سنتيمتر (cm)", toMeters: 0.01 };
    case 6: return { code: 6, name: "متر (m)", toMeters: 1.0 };
    default: return { code: 0, name: "غير محدد (يفترض متر)", toMeters: 1.0 };
  }
}

export interface ParsedDxfResult {
  unitInfo?: DxfUnitInfo;
  skippedPaperSpaceCount?: number;
  deduplicatedHatchCount?: number;
  deduplicatedHatches?: DeduplicatedHatchRecord[];
  layers: DxfLayerInfo[];
  entityCounts: Record<string, number>;
  totalEntities: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  parsedData: any;
  summaryText: string;
  detectedBlocks: { name: string; count: number }[];
  textNotes: string[];
  detectedDimensions?: { text?: string; measurement?: number; layer?: string }[];
  closedAreas?: { layer: string; area: number; perimeter: number }[];
  /** Arabic notices about approximations / skipped content (shown to the user before import). */
  warnings?: string[];
  /** Largest drawing extent in raw DXF units (used to help the user confirm the unit). */
  drawingSpan?: number;
  /** Layers that are frozen / switched off in the file (their entities are excluded unless includeHiddenLayers). */
  hiddenLayers?: HiddenLayerRecord[];
  hiddenLayersIncluded?: boolean;
  /** Exact duplicate geometry (same layer, identical coordinates) that was counted once. */
  duplicates?: DuplicateRecord[];
  /** Closed shapes nested inside / overlapping other shapes on the same layer. */
  overlaps?: { layer: string; nested: number; duplicates: number }[];
  /** True when the file header had no $INSUNITS (unit missing). */
  insunitsMissing?: boolean;
  /** Samples of text/layer names that look like a wrong-encoding read (U+FFFD or Latin-1 mojibake). */
  encodingSuspects?: string[];
}

export interface HiddenLayerRecord {
  name: string;
  entityCount: number;
  reason: string;
}

export interface DuplicateRecord {
  layer: string;
  kind: string;
  /** Number of redundant copies that were dropped. */
  count: number;
}

export interface AnalyzeOptions {
  /** Keep entities of frozen / off layers (default false: they are excluded). */
  includeHiddenLayers?: boolean;
}

const q6 = (n: number) => Math.round((Number(n) || 0) * 1e6);
const ptKey = (v: any) => `${q6(v?.x)},${q6(v?.y)}`;

/** Canonical key for exact-duplicate detection (null = entity type not de-duplicated). */
function exactGeometryKey(entity: any, type: string): string | null {
  switch (type) {
    case "LINE": {
      const a = ptKey(entity.vertices?.[0] ?? { x: entity.x1, y: entity.y1 });
      const b = ptKey(entity.vertices?.[1] ?? { x: entity.x2, y: entity.y2 });
      return a < b ? `${a}>${b}` : `${b}>${a}`;
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      const vs: any[] = entity.vertices || [];
      if (vs.length < 2) return null;
      const hasBulge = vs.some((v) => Math.abs(Number(v?.bulge) || 0) > 1e-9);
      const fwd = vs.map((v) => ptKey(v) + (hasBulge ? `b${q6(v?.bulge)}` : "")).join(";");
      const rev = hasBulge ? fwd : vs.map(ptKey).reverse().join(";");
      return `${fwd < rev ? fwd : rev}|${entity.shape || ((entity.flags || 0) & 1) ? "C" : "O"}`;
    }
    case "CIRCLE":
      return `${ptKey(entity.center)}r${q6(entity.radius)}`;
    case "ARC":
      return `${ptKey(entity.center)}r${q6(entity.radius)}a${q6(entity.startAngle)}-${q6(entity.endAngle)}`;
    case "INSERT":
      return `${entity.name}@${ptKey(entity.position ?? { x: entity.x, y: entity.y })}#${entity.rowCount || 1}x${entity.columnCount || 1}s${q6(entity.xScale ?? 1)},${q6(entity.yScale ?? 1)}r${q6(entity.rotation)}`;
    default:
      return null;
  }
}

const MOJIBAKE_RE = /\uFFFD|[ØÙ][\u0080-\u00BF]|Ã[\u0080-\u00BF]/;

export function parseDxfContent(dxfString: string): ParsedDxfResult {
  const parser = new DxfParser();
  let parsed: any;
  try {
    parsed = parser.parseSync(dxfString);
  } catch (err: any) {
    console.error("Failed to parse DXF:", err);
    throw new Error("تعذر قراءة ملف DXF: " + (err?.message || "تنسيق غير صالح"));
  }
  return analyzeParsedDxfObject(parsed);
}

/**
 * Core DXF entity analyzer operating on a parsed DXF object (separated for direct integration testing).
 */
export function analyzeParsedDxfObject(parsed: any, options: AnalyzeOptions = {}): ParsedDxfResult {
  const includeHiddenLayers = options.includeHiddenLayers === true;
  const cleanLayer = (n: any) => decodeCadCodes(String(n ?? "0")).trim() || "0";
  const hiddenInfo = new Map<string, HiddenLayerRecord>();
  const duplicateMap = new Map<string, DuplicateRecord>();
  const seenGeometry = new Set<string>();

  const unitInfo = detectDxfUnits(parsed);
  const layersMap: Record<string, DxfLayerInfo> = {};
  const entityCounts: Record<string, number> = {};
  const topLevelInserts: any[] = [];
  const textNotes: string[] = [];
  const detectedDimensions: { text?: string; measurement?: number; layer?: string }[] = [];
  const closedAreas: { layer: string; area: number; perimeter: number }[] = [];
  const segsByLayer: Record<string, Seg[]> = {};
  const pushSeg = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    const arr = (segsByLayer[layer] ||= []);
    if (arr.length < 2500 && [x1, y1, x2, y2].every(Number.isFinite)) arr.push([x1, y1, x2, y2]);
  };

  // Register layers from tables
  if (parsed.tables && parsed.tables.layer && parsed.tables.layer.layers) {
    for (const [rawName, layerData] of Object.entries(parsed.tables.layer.layers) as any) {
      const name = cleanLayer(rawName);
      const colorNum = Number(layerData?.colorIndex ?? layerData?.color);
      const frozen = layerData?.frozen === true;
      const off = layerData?.visible === false || (Number.isFinite(colorNum) && colorNum < 0 && layerData?.visible !== true);
      if (frozen || off) {
        hiddenInfo.set(name, { name, entityCount: 0, reason: frozen ? "مجمّدة (Frozen)" : "مطفأة (Off)" });
      }
      layersMap[name] = {
        name,
        color: typeof layerData.color === "number" ? getCadColorHex(Math.abs(layerData.color)) : "#38bdf8",
        entityCount: 0,
        visible: !(frozen || off),
        lineLength: 0,
        areaSum: 0,
        closedPolylinesCount: 0,
      };
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const updateBounds = (x?: number, y?: number) => {
    if (typeof x === "number" && !isNaN(x) && isFinite(x)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (typeof y === "number" && !isNaN(y) && isFinite(y)) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };

  const entities = parsed.entities || [];
  let skippedPaperSpaceCount = 0;
  let deduplicatedHatchCount = 0;
  let splineCount = 0;
  const deduplicatedHatches: DeduplicatedHatchRecord[] = [];
  const polylineFootprintsByLayer: Record<string, PolylineFootprint[]> = {};
  const pendingHatches: { layer: string; paths: any[] }[] = [];
  for (const entity of entities) {
    // Exclude Paper Space / Layout entities so title blocks & viewports do not duplicate Model Space quantities
    if (entity.inPaperSpace === true) {
      skippedPaperSpaceCount++;
      continue;
    }
    const type = entity.type || "UNKNOWN";
    const layerName = cleanLayer(entity.layer);

    const hidden = hiddenInfo.get(layerName);
    if (hidden) {
      hidden.entityCount++;
      if (!includeHiddenLayers) continue;
    }

    // Exact duplicate geometry (same layer, identical coordinates): count once only.
    const geoKey = exactGeometryKey(entity, type);
    if (geoKey !== null) {
      const full = `${layerName}|${type}|${geoKey}`;
      if (seenGeometry.has(full)) {
        const dk = `${layerName}|${type}`;
        const rec = duplicateMap.get(dk) || { layer: layerName, kind: type, count: 0 };
        rec.count++;
        duplicateMap.set(dk, rec);
        continue;
      }
      seenGeometry.add(full);
    }

    entityCounts[type] = (entityCounts[type] || 0) + 1;
    if (!layersMap[layerName]) {
      layersMap[layerName] = {
        name: layerName,
        color: "#38bdf8",
        entityCount: 0,
        visible: true,
        lineLength: 0,
        areaSum: 0,
        closedPolylinesCount: 0,
      };
    }
    layersMap[layerName].entityCount++;

    // Calculate linear length for LINE
    if (type === "LINE") {
      const x1 = entity.vertices?.[0]?.x ?? entity.x1 ?? 0;
      const y1 = entity.vertices?.[0]?.y ?? entity.y1 ?? 0;
      const x2 = entity.vertices?.[1]?.x ?? entity.x2 ?? 0;
      const y2 = entity.vertices?.[1]?.y ?? entity.y2 ?? 0;
      const segLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      if (isFinite(segLength)) {
        layersMap[layerName].lineLength = (layersMap[layerName].lineLength || 0) + segLength;
        pushSeg(layerName, x1, y1, x2, y2);
      }
    }

    // Calculate length and area for POLYLINE and LWPOLYLINE (with Bulge arc support)
    if (type === "LWPOLYLINE" || type === "POLYLINE") {
      const rawVertices: PolylineVertex[] = entity.vertices || [];
      const firstVertex = rawVertices[0];
      const lastVertex = rawVertices[rawVertices.length - 1];
      const repeatsFirst = Boolean(
        rawVertices.length > 2 &&
          firstVertex &&
          lastVertex &&
          Math.abs(firstVertex.x - lastVertex.x) < 0.001 &&
          Math.abs(firstVertex.y - lastVertex.y) < 0.001
      );
      const isClosed = Boolean(
        entity.shape || entity.closed || ((entity.flags || 0) & 1) || repeatsFirst
      );
      const cleanVertices = repeatsFirst ? rawVertices.slice(0, -1) : rawVertices;
      const { length: polyLength, area: calcArea } = computePolylineGeometry(cleanVertices, isClosed);

      if (isClosed && cleanVertices.length >= 2 && calcArea > 0.01) {
        layersMap[layerName].areaSum = (layersMap[layerName].areaSum || 0) + calcArea;
        layersMap[layerName].closedPolylinesCount = (layersMap[layerName].closedPolylinesCount || 0) + 1;
        layersMap[layerName].closedPerimeterSum = (layersMap[layerName].closedPerimeterSum || 0) + polyLength;
        closedAreas.push({ layer: layerName, area: calcArea, perimeter: polyLength });
        if (!polylineFootprintsByLayer[layerName]) polylineFootprintsByLayer[layerName] = [];
        polylineFootprintsByLayer[layerName].push({
          area: calcArea,
          bbox: computeVerticesBBox(cleanVertices),
        });
      }

      // Closed outlines are area boundaries, not independent linear work items.
      if (isFinite(polyLength) && !isClosed) {
        layersMap[layerName].lineLength = (layersMap[layerName].lineLength || 0) + polyLength;
        for (let k = 0; k + 1 < cleanVertices.length; k++) pushSeg(layerName, cleanVertices[k].x, cleanVertices[k].y, cleanVertices[k + 1].x, cleanVertices[k + 1].y);
      }
    }

    // Defer HATCH area evaluation until after all LWPOLYLINEs are scanned (prevents double counting)
    if (type === "HATCH") {
      pendingHatches.push({ layer: layerName, paths: entity.boundaryPaths || entity.boundaries || [] });
      for (const path of entity.boundaryPaths || entity.boundaries || []) {
        for (const v of path?.vertices || []) updateBounds(v?.x, v?.y);
        for (const e of path?.edges || []) {
          updateBounds(e?.start?.x, e?.start?.y);
          updateBounds(e?.end?.x, e?.end?.y);
          if (e?.center && typeof e.radius === "number") {
            updateBounds(e.center.x - e.radius, e.center.y - e.radius);
            updateBounds(e.center.x + e.radius, e.center.y + e.radius);
          }
        }
      }
    }


    // Calculate area & circumference for CIRCLE (e.g. circular columns, manholes)
    if (type === "CIRCLE" && typeof entity.radius === "number" && entity.radius > 0) {
      const r = entity.radius;
      const cArea = Math.PI * r * r;
      const cPerim = 2 * Math.PI * r;
      if (isFinite(cArea) && cArea > 0.001) {
        layersMap[layerName].areaSum = (layersMap[layerName].areaSum || 0) + cArea;
        layersMap[layerName].closedPolylinesCount = (layersMap[layerName].closedPolylinesCount || 0) + 1;
        layersMap[layerName].closedPerimeterSum = (layersMap[layerName].closedPerimeterSum || 0) + cPerim;
        closedAreas.push({ layer: layerName, area: cArea, perimeter: cPerim });
      }
    }

    // ELLIPSE: full ellipse = closed area (Ramanujan perimeter); partial = arc length
    if (type === "ELLIPSE") {
      const geo = computeEllipseGeometry(entity);
      if (geo.isFull && geo.area > 0.001) {
        layersMap[layerName].areaSum = (layersMap[layerName].areaSum || 0) + geo.area;
        layersMap[layerName].closedPolylinesCount = (layersMap[layerName].closedPolylinesCount || 0) + 1;
        layersMap[layerName].closedPerimeterSum = (layersMap[layerName].closedPerimeterSum || 0) + geo.length;
        closedAreas.push({ layer: layerName, area: geo.area, perimeter: geo.length });
      } else if (geo.length > 0) {
        layersMap[layerName].lineLength = (layersMap[layerName].lineLength || 0) + geo.length;
      }
    }

    // SPLINE: approximate length (de Boor sampling / fit-point polygon)
    if (type === "SPLINE") {
      const splineLen = approximateSplineLength(entity);
      if (isFinite(splineLen) && splineLen > 0) {
        layersMap[layerName].lineLength = (layersMap[layerName].lineLength || 0) + splineLen;
        splineCount++;
      }
      for (const cp of entity.controlPoints || entity.fitPoints || []) updateBounds(cp?.x, cp?.y);
    }

    // Calculate arc length for ARC (e.g. curved walls, pipes)
    if (type === "ARC" && typeof entity.radius === "number" && entity.radius > 0) {
      const startA = Number(entity.startAngle || 0);
      const endA = Number(entity.endAngle || 0);
      let delta = endA - startA;
      if (delta <= 0) delta += Math.PI * 2;
      // Handle degrees vs radians (dxf-parser returns radians, safeguard if > 2*PI)
      const rad = delta > Math.PI * 2 + 0.01 ? (delta * Math.PI) / 180 : delta;
      const arcLen = entity.radius * rad;
      if (isFinite(arcLen) && arcLen > 0) {
        layersMap[layerName].lineLength = (layersMap[layerName].lineLength || 0) + arcLen;
      }
    }

    // Check Dimensions
    if (type === "DIMENSION") {
      const measurement = entity.actualMeasurement || entity.measurement;
      const text = entity.text || "";
      detectedDimensions.push({
        text,
        measurement: typeof measurement === "number" ? measurement : undefined,
        layer: layerName,
      });
    }

    // Check block insertions
    if (type === "INSERT" && entity.name) {
      topLevelInserts.push(entity);
    }

    // Check text (clean MTEXT formatting & support large drawings up to 2500 notes)
    if ((type === "TEXT" || type === "MTEXT") && (entity.text || entity.string)) {
      const cleaned = cleanDxfText(String(entity.text || entity.string || ""));
      if (textNotes.length < 2500 && cleaned) {
        textNotes.push(cleaned);
      }
    }

    // Compute bounding box
    if (entity.vertices && Array.isArray(entity.vertices)) {
      for (const v of entity.vertices) {
        updateBounds(v.x, v.y);
      }
    } else {
      updateBounds(entity.x, entity.y);
      updateBounds(entity.x1, entity.y1);
      updateBounds(entity.x2, entity.y2);
      if (entity.center) {
        const r = entity.radius || 0;
        updateBounds(entity.center.x - r, entity.center.y - r);
        updateBounds(entity.center.x + r, entity.center.y + r);
      }
    }
  }

  // Evaluate HATCH entities with hole subtraction and spatial+area deduplication against closed LWPOLYLINEs
  for (let hIdx = 0; hIdx < pendingHatches.length; hIdx++) {
    const h = pendingHatches[hIdx];
    const { netArea, outerPerimeter, holeCount, outerBBox } = computeHatchNetArea(h.paths);
    if (netArea <= 0.01) continue;
    const existingPolys = polylineFootprintsByLayer[h.layer] || [];
    const dupMatch = findHatchSpatialDuplicateMatch(netArea, outerBBox, existingPolys);
    if (dupMatch.isDuplicate) {
      deduplicatedHatchCount++;
      const diffPct = Number(((dupMatch.areaDiffRatio || 0) * 100).toFixed(2));
      const iouPct = Number(((dupMatch.iou || 0) * 100).toFixed(1));
      deduplicatedHatches.push({
        id: `dedup-hatch-${hIdx}-${h.layer}`,
        layer: h.layer,
        netAreaRaw: netArea,
        outerPerimeterRaw: outerPerimeter,
        holeCount,
        matchedPolylineAreaRaw: dupMatch.matchedPolylineArea || netArea,
        areaDiffPercent: diffPct,
        bboxIoU: iouPct,
        reason: `تطابق مع حدود LWPOLYLINE مغلقة على نفس الطبقة (فرق المساحة ${diffPct}%، تداخل مكاني ${iouPct}%)`,
      });
      continue;
    }
    if (!layersMap[h.layer]) {
      layersMap[h.layer] = {
        name: h.layer,
        color: "#38bdf8",
        entityCount: 1,
        visible: true,
        lineLength: 0,
        areaSum: 0,
        closedPolylinesCount: 0,
      };
    }
    layersMap[h.layer].areaSum = (layersMap[h.layer].areaSum || 0) + netArea;
    layersMap[h.layer].closedPolylinesCount = (layersMap[h.layer].closedPolylinesCount || 0) + 1;
    closedAreas.push({ layer: h.layer, area: netArea, perimeter: outerPerimeter });
  }

  // Fallback bounds if empty or single point
  if (!isFinite(minX) || !isFinite(maxX) || minX === maxX) {
    minX = 0;
    maxX = 1000;
  }
  if (!isFinite(minY) || !isFinite(maxY) || minY === maxY) {
    minY = 0;
    maxY = 1000;
  }

  // Smart unit inference when $INSUNITS is 0 (Unitless) based on drawing span
  let resolvedUnitInfo = unitInfo;
  if (unitInfo.code === 0) {
    const maxSpan = Math.max(Math.abs(maxX - minX), Math.abs(maxY - minY));
    if (maxSpan >= 5000) {
      resolvedUnitInfo = { code: 4, name: "مليمتر (مستنتج من أبعاد اللوحة)", toMeters: 0.001, guessed: true };
    } else if (maxSpan >= 500) {
      resolvedUnitInfo = { code: 5, name: "سنتيمتر (مستنتج من أبعاد اللوحة)", toMeters: 0.01, guessed: true };
    } else {
      resolvedUnitInfo = { code: 6, name: "متر (مستنتج من أبعاد اللوحة)", toMeters: 1.0, guessed: true };
    }
  }

  // Double-line walls: how much of each layer's line length has a parallel partner 6–60 cm away.
  const toM = resolvedUnitInfo.toMeters || 1;
  for (const [ln, segs] of Object.entries(segsByLayer)) {
    if (!layersMap[ln] || segs.length < 4) continue;
    const f = pairedLineFraction(segs, 0.06 / toM, 0.6 / toM);
    if (f > 0) layersMap[ln].pairedLineFraction = Number(f.toFixed(3));
  }

  const blockExpansion = expandBlockInstanceCounts(topLevelInserts, parsed.blocks);
  const detectedBlocks = Object.entries(blockExpansion.counts).map(([name, count]) => ({
    name,
    count,
  }));

  // ---- Warnings (Arabic) shown to the user before importing quantities ----
  const warnings: string[] = [];
  const overlaps: { layer: string; nested: number; duplicates: number }[] = [];
  const drawingSpan = Math.max(Math.abs(maxX - minX), Math.abs(maxY - minY));
  if (resolvedUnitInfo.guessed) {
    warnings.push(
      `وحدة الرسم غير محددة داخل الملف وتم تخمينها: ${resolvedUnitInfo.name} (أكبر بُعد في الرسم ≈ ${Math.round(drawingSpan).toLocaleString("en-US")} وحدة). تأكد من الوحدة الصحيحة قبل الاستخراج وإلا ستكون الكميات خاطئة بعشرة أضعاف أو أكثر.`
    );
  }
  for (const [layer, fps] of Object.entries(polylineFootprintsByLayer)) {
    if (fps.length < 2) continue;
    if (fps.length > 2000) {
      warnings.push(`الطبقة ${layer}: ${fps.length} شكل مغلق — لم يُفحص التداخل بسبب كثرة العناصر.`);
      continue;
    }
    let nested = 0;
    let duplicates = 0;
    const eps = 1e-6;
    for (let i = 0; i < fps.length; i++) {
      for (let j = 0; j < fps.length; j++) {
        if (i === j) continue;
        const A = fps[i];
        const B = fps[j];
        const contains =
          A.bbox.minX <= B.bbox.minX + eps && A.bbox.minY <= B.bbox.minY + eps &&
          A.bbox.maxX >= B.bbox.maxX - eps && A.bbox.maxY >= B.bbox.maxY - eps;
        if (!contains) continue;
        if (Math.abs(A.area - B.area) / Math.max(A.area, B.area) < 0.01) {
          if (i < j) duplicates++;
        } else if (B.area < A.area) {
          nested++;
        }
      }
    }
    if (nested > 0 || duplicates > 0) {
      overlaps.push({ layer, nested, duplicates });
      warnings.push(
        `الطبقة ${layer}: ${nested > 0 ? `${nested} شكل مغلق داخل شكل آخر` : ""}${nested > 0 && duplicates > 0 ? " و" : ""}${duplicates > 0 ? `${duplicates} شكل مكرر` : ""} — قد تتكرر المساحة في الإجمالي، راجع الطبقة.`
      );
    }
  }
  if (splineCount > 0) {
    warnings.push(`تم حساب أطوال ${splineCount} منحنى SPLINE بالتقريب العددي (قد يختلف الطول الفعلي قليلاً).`);
  }
  const UNSUPPORTED_GEOMETRY = ["3DFACE", "3DSOLID", "SOLID", "REGION", "IMAGE", "MLINE", "WIPEOUT", "LEADER", "MESH", "SURFACE", "BODY", "TRACE", "RAY", "XLINE"];
  for (const t of UNSUPPORTED_GEOMETRY) {
    if (entityCounts[t]) warnings.push(`تم تجاهل ${entityCounts[t]} كيان من نوع ${t} (غير مدعوم في الحساب).`);
  }
  if (blockExpansion.nestedExpanded > 0) {
    warnings.push(`تم احتساب ${blockExpansion.nestedExpanded} بلوك متداخل داخل تعريفات بلوكات أخرى (مع ضرب صفوف/أعمدة MINSERT).`);
  }
  if (blockExpansion.truncated) {
    warnings.push("تم إيقاف توسعة البلوكات المتداخلة عند 6 مستويات أو عند اكتشاف دورة (بلوك يحتوي نفسه).");
  }

  const hiddenLayers = [...hiddenInfo.values()].filter((h) => h.entityCount > 0);
  if (hiddenLayers.length > 0) {
    const names = hiddenLayers.map((h) => `${h.name} (${h.reason}، ${h.entityCount} عنصر)`).join("، ");
    warnings.push(
      includeHiddenLayers
        ? `تم تضمين طبقات مجمّدة/مطفأة حسب اختيارك: ${names}.`
        : `تم استبعاد طبقات مجمّدة/مطفأة في الملف: ${names}. فعّل «تضمين الطبقات المخفية» إن كانت مطلوبة.`
    );
  }
  const duplicates = [...duplicateMap.values()];
  if (duplicates.length > 0) {
    const total = duplicates.reduce((s, d) => s + d.count, 0);
    warnings.push(
      `تم حذف ${total} عنصر مكرر تماماً (نفس الإحداثيات على نفس الطبقة) حتى لا تُحسب الكمية مرتين: ` +
        duplicates.map((d) => `${d.layer} — ${d.kind} ×${d.count}`).join("، ") + "."
    );
  }
  const encodingSuspects: string[] = [];
  for (const cand of [...Object.keys(layersMap), ...textNotes, ...Object.keys(parsed.blocks || {})]) {
    if (MOJIBAKE_RE.test(cand)) {
      encodingSuspects.push(cand.slice(0, 40));
      if (encodingSuspects.length >= 5) break;
    }
  }
  if (encodingSuspects.length > 0) {
    warnings.push("نصوص أو أسماء طبقات تبدو مقروءة بترميز خاطئ (رموز غريبة). أعد حفظ الملف بصيغة DXF بترميز UTF-8 أو ASCII.");
  }

  const layersList = Object.values(layersMap);

  const summaryText = `ملف أوتوكاد DXF: إجمالي ${entities.length} عنصر هندسي عبر ${layersList.length} طبقة. تم رصد ${detectedBlocks.length} نوع بلوك تكرار و ${closedAreas.length} مسطح مغلق.`;

  return {
    unitInfo: resolvedUnitInfo,
    skippedPaperSpaceCount,
    deduplicatedHatchCount,
    deduplicatedHatches,
    layers: layersList,
    entityCounts,
    totalEntities: entities.length,
    bounds: { minX, minY, maxX, maxY },
    parsedData: parsed,
    summaryText,
    detectedBlocks,
    textNotes,
    detectedDimensions,
    closedAreas,
    warnings,
    drawingSpan,
    hiddenLayers,
    hiddenLayersIncluded: includeHiddenLayers,
    duplicates,
    overlaps,
    insunitsMissing: unitInfo.code === 0,
    encodingSuspects,
  };
}

/**
 * Automatically convert CAD entities into structured Engineering Takeoff Items:
 * - Linear Dimensions (Walls, Beams, Pipes, Boundaries in م.ط)
 * - Areas (Floors, Rooms, Slabs, Waterproofing in م²)
 * - Volumes (Concrete slabs/footings: Area × depth in م³)
 * - Counts (Columns, Doors, Windows, Plumbing/Electrical fixtures in عدد)
 */
export function extractEngineeringQuantitiesFromDxf(
  parsedDxf: ParsedDxfResult,
  options: {
    defaultWallHeight?: number; // e.g. 3.0 m
    defaultFootingDepth?: number; // e.g. 0.6 m
    defaultSlabThickness?: number; // e.g. 0.16 m (roof slab)
    defaultFloorSlabThickness?: number; // e.g. 0.15 m (SOG / خرسانة الأرضية)
    defaultBlindingThickness?: number; // e.g. 0.10 m (صبة النظافة)
    unitScaleFactor?: number; // 1 if drawing in meters, 0.001 if in mm
    /** User rules (layer/block pattern -> category / kind); they win over built-in token matching. */
    layerRules?: LayerRule[];
    /** 2 when walls are drawn as two parallel lines (halves masonry line lengths). */
    wallLineDivisor?: 1 | 2;
    /** Add the perimeter of closed polylines on wall / beam / mida layers to their linear length. */
    includeClosedPerimeter?: boolean;
  } = {}
): ExtractedCadQuantity[] {
  const {
    defaultWallHeight = 0,
    defaultFootingDepth = 0,
    defaultSlabThickness = 0,
    defaultFloorSlabThickness = 0,
    defaultBlindingThickness = 0,
    unitScaleFactor,
    layerRules,
    wallLineDivisor,
    includeClosedPerimeter = false,
  } = options;

  const effectiveScale = typeof unitScaleFactor === "number" && unitScaleFactor > 0 ? unitScaleFactor : (parsedDxf.unitInfo?.toMeters ?? 1);
  const results: ExtractedCadQuantity[] = [];

  // Read only explicit thickness annotations from CAD text. Do not infer missing
  // dimensions from drawing appearance or use generic construction defaults.
  const annotationText = (parsedDxf.textNotes || []).join(" ").toUpperCase();
  const findThicknessM = (pattern: RegExp): number => {
    const match = annotationText.match(pattern);
    if (!match) return 0;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0 || !match[2]) return 0;
    const unit = match[2].toUpperCase();
    if (unit === "MM") return value / 1000;
    if (unit === "CM") return value / 100;
    return value;
  };
  const annotatedSlabThickness = findThicknessM(/(?:ROOF\s+)?SLAB\s*(?:THK|THICKNESS)\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?)\s*(MM|CM|M)?/i);
  const annotatedFloorSlabThickness = findThicknessM(/(?:SOG|GROUND\s*SLAB|FLOOR\s*(?:SLAB|CONC(?:RETE)?))\s*(?:THK|THICKNESS)?\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?)\s*(MM|CM|M)/i);
  const annotatedBlindingThickness = findThicknessM(/(?:BLINDING|LEAN\s*CONC(?:RETE)?|PC)\s*(?:THK|THICKNESS)?\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?)\s*(MM|CM|M)/i);
  const annotatedFootingDepth = findThicknessM(/FOOTING\s*(?:THK|THICKNESS|DEPTH)\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?)\s*(MM|CM|M)?/i);
  const slabDepthM = defaultSlabThickness > 0 ? defaultSlabThickness : annotatedSlabThickness;
  const floorSlabDepthM = defaultFloorSlabThickness > 0 ? defaultFloorSlabThickness : annotatedFloorSlabThickness;
  const blindingDepthM = defaultBlindingThickness > 0 ? defaultBlindingThickness : annotatedBlindingThickness;
  const footingDepthM = defaultFootingDepth > 0 ? defaultFootingDepth : annotatedFootingDepth;

  // 1. Process Blocks (Counts / أعداد وبلوكات)
  // Drawings often hold hundreds of anonymous / annotation / symbol blocks. Only blocks we can
  // classify (or that the user ruled on) are listed and pre-selected; unknown ones are capped
  // and left unselected so an export never fills up with "بلوك أوتوكاد" lines.
  const NOISE_BLOCK = /^(\*|\$|A\$C|_)|(^|[_\-\s|])(DIM|ARROW|TICK|HATCH|XREF|NORTH|TITLE|FRAME|BORDER|LEGEND|REV|SECTION|ELEV|GRID|AXIS|BUBBLE|TAG|SYMBOL|LOGO|STAMP)([_\-\s|0-9]|$)|\|/i;
  let unknownListed = 0;
  const unknownCap = 12;
  [...parsedDxf.detectedBlocks].sort((a, b) => b.count - a.count).forEach((block, idx) => {
    const blockRule = matchLayerRule(block.name, layerRules);
    if (blockRule?.kind === "ignore") return;
    if (!blockRule && NOISE_BLOCK.test(block.name.trim())) return;
    const blockUpper = block.name.trim().toUpperCase();
    const token = blockUpper.replace(/[\s-]+/g, "_");
    let category: TradeCategory = "أعمال متنوعة أخرى";
    let desc = `بلوك أوتوكاد (${block.name})؛ التصنيف يحتاج مراجعة`;

    // Strictly separate Steel I-Beam columns from Reinforced Concrete columns
    if (
      /^(SC[0-9]{0,2}|ST_?COL|STEEL_?COL|H_?COL|H_?BEAM|HBEAM|IPE|HEB|HEA|UPN)(_|$|[0-9])/.test(token) ||
      /(عمود.*حديد|عمود.*ايبيم|عمود.*أيبيم|ايبيم|أيبيم|ستيل)/.test(blockUpper)
    ) {
      category = "أعمال الهياكل المعدنية والهناجر";
      desc = `عمود هيكل معدني (أيبيم) نموذج (${block.name}) — مفصول عن الأعمدة الخرسانية؛ الارتفاع ووزن المتر يؤخذ من الجدول`;
    } else if (
      /^(BP|BASE_?PLATE|ANCHOR|BOLT|AB)(_|$|[0-9])/.test(token) ||
      /(بيس.*بليت|جاويط|مسمار.*تثبيت)/.test(blockUpper)
    ) {
      category = "أعمال الهياكل المعدنية والهناجر";
      desc = `بيس بليت / جاويط تثبيت هيكل معدني نموذج (${block.name})`;
    } else if (
      /^(RS|ROLL|SHUTTER|HANGAR_?DOOR)(_|$|[0-9])/.test(token) ||
      /(رول.*شتر|باب.*هنجر|باب.*مستودع)/.test(blockUpper)
    ) {
      category = "أعمال الأبواب والشبابيك والألمنيوم";
      desc = `باب رول شتر / باب مستودع نموذج (${block.name})`;
    } else if (/^(RC_?COL|COL(UMN)?(_|$)|C[0-9]{1,2}$)|عمود/.test(token)) {
      category = "أعمال خرسانية مسلحة وعادية";
      desc = `عمود خرساني مسلح نموذج (${block.name}) — مفصول عن عمدان الأيبيم؛ القطاع والارتفاع يؤخذان من الجدول`;
    } else if (/^(DOOR(_|$)|D[0-9]{1,2}$)|باب/.test(token)) {
      category = "أعمال الأبواب والشبابيك والألمنيوم";
      desc = `باب معماري نموذج (${block.name})؛ المقاس يؤخذ من الجدول أو الأبعاد`;
    } else if (/^(WIN(DOW)?(_|$)|W[0-9]{1,2}$)|شباك/.test(token)) {
      category = "أعمال الأبواب والشبابيك والألمنيوم";
      desc = `شباك معماري نموذج (${block.name})؛ المقاس يؤخذ من الجدول أو الأبعاد`;
    } else if (/^(LIGHT|LAMP|SWITCH|SOCKET)(_|$)|إنارة/.test(token)) {
      category = "أعمال التمديدات الكهربائية والإنارة";
      desc = `عنصر كهربائي نموذج (${block.name})؛ النوع يحتاج مطابقة الرمز`;
    } else if (/^(MH|MANHOLE|VALVE)(_|$)|غرفة|صحي/.test(token)) {
      category = "أعمال التغذية والصرف الصحي";
      desc = `عنصر صحي/غرفة تفتيش نموذج (${block.name})؛ المقاسات غير مستنتجة من الاسم`;
    }

    if (blockRule?.category) {
      category = blockRule.category as TradeCategory;
      desc = `بلوك أوتوكاد (${block.name}) — تصنيف حسب قاعدتك (${blockRule.match})`;
    }

    const recognized = Boolean(blockRule) || category !== "أعمال متنوعة أخرى";
    if (!recognized) {
      if (unknownListed >= unknownCap) return;
      unknownListed++;
    }
    results.push({
      id: `cad-count-${idx}`,
      type: "count",
      layer: "BLOCK_INSERTS",
      name: block.name,
      value: block.count,
      unit: "عدد",
      formula: `تكرار البلوك في المخطط = ${block.count} عدد`,
      count: block.count,
      suggestedCategory: category,
      entityCount: block.count,
      description: desc,
      selected: recognized,
    });
  });

  // 2. Process Layer Areas (المساحات والمسطحات ومكعبات الخرسانة)
  const CONCRETE: TradeCategory = "أعمال خرسانية مسلحة وعادية";
  const STEEL_WORKS: TradeCategory = "أعمال الهياكل المعدنية والهناجر";
  parsedDxf.layers.forEach((layer, idx) => {
    const rule = matchLayerRule(layer.name, layerRules);
    if (rule?.kind === "ignore") return;
    if (!rule && isIgnoredLayer(layer.name)) return;
    if (rule?.kind === "linear" || rule?.kind === "count") return;
    const area = (layer.areaSum || 0) * (effectiveScale ** 2);
    if (area > 0.5) {
      const norm = normalizeLayerName(layer.name);
      const has = (...words: string[]) => layerHasAny(norm, words);
      let category: TradeCategory | string = "أعمال الأرضيات والرخام والبورسلين";
      let desc = `مسطح ومساحة طبقة (${layer.name})`;
      let isVolumeCandidate = false;
      let depth = 0;

      if (rule && rule.category) {
        category = rule.category;
        desc = `مسطح طبقة (${layer.name}) — تصنيف حسب قاعدتك (${rule.match})`;
      } else if (has("SHINKO", "PANEL", "SANDWICH", "CLAD*", "SHEETING", "SHEET", "شينكو", "شنكو", "بانل", "ساندوتش", "صاج")) {
        category = "أعمال الساندوتش بانل والكلادينج";
        desc = `توريد وتركيب شينكو / ساندوتش بانل مسطح طبقة (${layer.name})`;
      } else if (has("EXCAV*", "BACKFILL", "حفر", "ردم")) {
        category = "أعمال الحفر والردم والأساسات";
        desc = `مسطح حفر / ردم للأساسات (${layer.name})`;
      } else if (has("BLIND*", "LEAN", "PC", "نظافة", "نظافه", "خرسانة عادية")) {
        category = CONCRETE;
        desc = `خرسانة نظافة (صبة عادية) أسفل القواعد (${layer.name})؛ السمك غير محدد، لا يمكن حساب حجم الخرسانة`;
        isVolumeCandidate = true;
        depth = blindingDepthM;
      } else if (
        has("SOG", "SLAB_ON_GRADE", "GROUND_SLAB", "FLOOR_SLAB", "FLOOR_CONC*", "صبة أرضية", "صبة ارضية", "خرسانة أرضية", "خرسانة ارضية", "أرضية خرسانية")
      ) {
        category = CONCRETE;
        desc = `خرسانة الأرضية (Slab on Grade) بطبقة (${layer.name})؛ السمك غير محدد، لا يمكن حساب حجم الخرسانة`;
        isVolumeCandidate = true;
        depth = floorSlabDepthM;
      } else if (has("STEEL_COL*", "ST_COL*", "H_COL*", "IPE_COL*", "عمدان حديد", "أعمدة حديد")) {
        category = STEEL_WORKS;
        desc = `مواقع عمدان الهيكل المعدني (أيبيم) بطبقة (${layer.name})`;
      } else if (has("BASE_PLATE", "BASEPLATE", "BP#", "ANCHOR*", "بيس بليت")) {
        category = STEEL_WORKS;
        desc = `بيس بليت / جاويط تثبيت هيكل معدني بطبقة (${layer.name})`;
      } else if (has("NECK", "PEDESTAL", "رقاب")) {
        category = CONCRETE;
        desc = `رقاب أعمدة خرسانية (${layer.name})`;
      } else if (has("SLAB", "ROOF", "بلاطة", "سقف")) {
        category = CONCRETE;
        desc = `مسطح بلاطة سقف (${layer.name})؛ السمك غير محدد، لا يمكن حساب حجم الخرسانة`;
        isVolumeCandidate = true;
        depth = slabDepthM;
      } else if (has("FOOT*", "FOUND*", "FND", "BASE", "قاعدة", "قواعد")) {
        category = CONCRETE;
        desc = `مسطح قواعد/أساسات (${layer.name})؛ العمق غير محدد، لا يمكن حساب حجم الخرسانة`;
        isVolumeCandidate = true;
        depth = footingDepthM;
      } else if (has("INSUL*", "WATERPROOF*", "WATER_PROOF*", "DAMP*", "MEMBRANE", "عزل")) {
        category = "أعمال العزل المائي والحراري";
        desc = `عزل مائي وحراري مسطح طبقة (${layer.name})`;
      } else if (has("FINISH*", "TILE*", "ROOM", "FLOORING", "أرضيات", "بلاط")) {
        category = "أعمال الأرضيات والرخام والبورسلين";
        desc = `أرضيات وتشطيبات مسطحات الغرف (${layer.name})`;
      }

      // Nothing recognised this layer. Don't call it "floors" (that put wall/column outlines into the
      // marble section): skip plan areas of wall/column layers (they are counted by length / number
      // elsewhere) and leave any other unknown layer unticked under "other" for the user to decide.
      const DEFAULT_CAT = "أعمال الأرضيات والرخام والبورسلين";
      const unrecognised = !rule && category === DEFAULT_CAT && desc.startsWith("مسطح ومساحة طبقة");
      if (unrecognised) {
        if (has("WALL*", "COL*", "جدار", "جدران", "حائط", "عمود", "اعمدة", "أعمدة", "عمدان")) return;
        category = "أعمال متنوعة أخرى";
      }

      // If it's a structural element with thickness, generate both Volume and Area
      if (rule?.kind !== "area" && isVolumeCandidate && depth > 0) {
        const volume = area * depth;
        results.push({
          id: `cad-vol-${idx}`,
          type: "volume",
          layer: layer.name,
          name: `${layer.name} (حجم خرسانة)`,
          value: Number(volume.toFixed(2)),
          unit: "م³",
          formula: `المساحة (${area.toFixed(2)} م²) × السُمك (${depth.toFixed(2)} م) = ${volume.toFixed(2)} م³`,
          count: layer.closedPolylinesCount || 1,
          height: depth,
          length: Number(Math.sqrt(area).toFixed(2)),
          width: Number(Math.sqrt(area).toFixed(2)),
          suggestedCategory: category,
          entityCount: layer.entityCount,
          description: desc.replace(/؛ (السمك|العمق) غير محدد، لا يمكن حساب حجم الخرسانة/, (_m, w) => `؛ ${w} ${depth} م (من إدخالك أو من ملاحظة اللوحة)`),
          selected: true,
        });
      } else {
        results.push({
          id: `cad-area-${idx}`,
          type: "area",
          layer: layer.name,
          name: `${layer.name} (مسطح)`,
          value: Number(area.toFixed(2)),
          unit: "م²",
          formula: `مجموع مساحات الأشكال المغلقة في الطبقة = ${area.toFixed(2)} م²`,
          count: layer.closedPolylinesCount || 1,
          length: Number(Math.sqrt(area).toFixed(2)),
          width: Number(Math.sqrt(area).toFixed(2)),
          suggestedCategory: category,
          entityCount: layer.entityCount,
          description: desc,
          selected: !unrecognised,
        });
      }
    }
  });

  // 2a. Columns / footings drawn as closed shapes: also report their number (عدد)
  parsedDxf.layers.forEach((layer, idx) => {
    const rule = matchLayerRule(layer.name, layerRules);
    if (rule) return;
    if (isIgnoredLayer(layer.name)) return;
    const n = layer.closedPolylinesCount || 0;
    if (n < 2) return;
    const norm = normalizeLayerName(layer.name);
    const isCol = layerHasAny(norm, ["COL*", "عمود", "اعمدة", "أعمدة", "عمدان"]);
    const isFoot = layerHasAny(norm, ["FOOT*", "FOUND*", "FND", "قاعدة", "قواعد"]);
    if (!isCol && !isFoot) return;
    results.push({
      id: `cad-autocount-${idx}`,
      type: "count",
      layer: layer.name,
      name: `${layer.name} (عدد)`,
      value: n,
      unit: "عدد",
      formula: `عدد الأشكال المغلقة في الطبقة = ${n}`,
      count: n,
      suggestedCategory: "أعمال خرسانية مسلحة وعادية",
      entityCount: layer.entityCount,
      description: isCol ? `عدد الأعمدة (${layer.name})` : `عدد القواعد (${layer.name})`,
      selected: true,
    });
  });

  // 2b. Layers forced to "count" by a user rule: number of closed shapes (or entities)
  parsedDxf.layers.forEach((layer, idx) => {
    const rule = matchLayerRule(layer.name, layerRules);
    if (!rule || rule.kind !== "count") return;
    const n = layer.closedPolylinesCount || layer.entityCount || 0;
    if (n <= 0) return;
    results.push({
      id: `cad-layercount-${idx}`,
      type: "count",
      layer: layer.name,
      name: `${layer.name} (عدد)`,
      value: n,
      unit: "عدد",
      formula: `عدد العناصر المغلقة في الطبقة = ${n}`,
      count: n,
      suggestedCategory: rule.category || "أعمال متنوعة أخرى",
      entityCount: layer.entityCount,
      description: `عدد عناصر طبقة (${layer.name}) — حسب قاعدتك (${rule.match})`,
      selected: true,
    });
  });

  // 3. Process Linear Dimensions & Lengths (الأطوال والمسافات الخطية)
  parsedDxf.layers.forEach((layer, idx) => {
    const rule = matchLayerRule(layer.name, layerRules);
    if (rule?.kind === "ignore") return;
    if (!rule && isIgnoredLayer(layer.name)) return;
    if (rule?.kind === "area" || rule?.kind === "count") return;

    const norm = normalizeLayerName(layer.name);
    const has = (...words: string[]) => layerHasAny(norm, words);
    let category: TradeCategory | string = "أعمال متنوعة أخرى";
    let desc = `طول مسار عناصر طبقة (${layer.name})`;
    let isWall = false;
    let acceptsClosedPerimeter = false;

    if (rule && rule.category) {
      category = rule.category;
      desc = `طول مسار طبقة (${layer.name}) — تصنيف حسب قاعدتك (${rule.match})`;
      isWall = /مباني|بلوك/.test(rule.category);
    } else if (has("WALL", "BRICK*", "BLOCK", "CMU", "MASONRY", "مباني", "بلوك", "طابوق", "جدران", "جدار")) {
      isWall = true;
      acceptsClosedPerimeter = true;
      category = "أعمال المباني والبلوك";
    } else if (has("REBAR*", "REINF*", "تسليح")) {
      category = "أعمال حديد التسليح";
      desc = `أطوال أسياخ حديد التسليح (${layer.name})`;
    } else if (has("TUBE*", "SHS#", "RHS#", "PURLIN*", "GIRT*", "تيوب", "مدادات")) {
      category = STEEL_WORKS;
      desc = `أطوال التيوبات / المدادات المعدنية (${layer.name})`;
    } else if (
      has("STEEL", "IPE#", "HEB#", "HEA#", "UPN#", "RAFTER*", "TRUSS*", "HANGAR*", "هنجر", "هيكل", "أبيام", "ابيام")
    ) {
      category = STEEL_WORKS;
      desc = `أطوال الأبيام والهياكل المعدنية للمستودع (${layer.name})`;
    } else if (
      has("MIDA*", "GROUND_BEAM*", "GRADE_BEAM*", "TIE_BEAM*", "GB#", "TB#", "ميدة", "ميدات", "ميده")
    ) {
      acceptsClosedPerimeter = true;
      category = CONCRETE;
      desc = `أطوال الميدات الخرسانية الأرضية (${layer.name})`;
    } else if (has("BEAM*", "DROP_BEAM", "كمرات", "كمرة")) {
      acceptsClosedPerimeter = true;
      category = CONCRETE;
      desc = `أطوال الكمرات الساقطة والرابطة (${layer.name})`;
    } else if (has("PIPE*", "DRAIN*", "SEWER*", "SEWAGE", "WATER_SUPPLY", "PLUMB*", "SANITARY", "مواسير")) {
      category = "أعمال التغذية والصرف الصحي";
      desc = `أطوال خطوط ومسارات التمديدات والمواسير (${layer.name})`;
    } else if (has("CABLE*", "CONDUIT*", "كهرباء")) {
      category = "أعمال التمديدات الكهربائية والإنارة";
      desc = `أطوال مواسير ومسارات التمديدات الكهربائية (${layer.name})`;
    }

    // An explicit choice wins; otherwise detect walls drawn as two parallel lines from the geometry itself.
    const autoDouble = isWall && wallLineDivisor === undefined && (layer.pairedLineFraction || 0) >= 0.8;
    const divisor = isWall && (wallLineDivisor === 2 || autoDouble) ? 2 : 1;
    const openLen = (layer.lineLength || 0) * effectiveScale;
    const closedLen =
      (includeClosedPerimeter && (acceptsClosedPerimeter || rule)) ||
      (!rule && acceptsClosedPerimeter && (layer.lineLength || 0) <= 0)
        ? (layer.closedPerimeterSum || 0) * effectiveScale
        : 0;
    const rawLen = (openLen + closedLen) / divisor;
    if (rawLen <= 1.0) return;

    const divisorNote = divisor === 2 ? (autoDouble ? " ÷ 2 (اكتُشف أن الجدران مرسومة بخطين متوازيين)" : " ÷ 2 (جدران بخطين متوازيين)") : "";
    const closedNote = closedLen > 0 ? ` (شاملة محيط الأشكال المغلقة ${closedLen.toFixed(2)} م)` : "";

    if (isWall) {
      desc = defaultWallHeight > 0
        ? `أطوال الجدران والطابوق/البلوك بطبقة (${layer.name}) بارتفاع ${defaultWallHeight} م`
        : `أطوال الجدران والطابوق/البلوك بطبقة (${layer.name})؛ الارتفاع غير محدد`;
      if (defaultWallHeight > 0) {
        const wallArea = rawLen * defaultWallHeight;
        results.push({
          id: `cad-wall-area-${idx}`,
          type: "area",
          layer: layer.name,
          name: `${layer.name} (مسطح جدران وطابوق)`,
          value: Number(wallArea.toFixed(2)),
          unit: "م²",
          formula: `الطول الكلي (${rawLen.toFixed(2)} م.ط${divisorNote}) × الارتفاع (${defaultWallHeight} م) = ${wallArea.toFixed(2)} م²`,
          count: 1,
          length: Number(rawLen.toFixed(2)),
          height: defaultWallHeight,
          suggestedCategory: "أعمال المباني والبلوك",
          entityCount: layer.entityCount,
          description: desc,
          selected: true,
        });
      }
    }

    results.push({
      id: `cad-linear-${idx}`,
      type: "linear",
      layer: layer.name,
      name: `${layer.name} (طول خطي)`,
      value: Number(rawLen.toFixed(2)),
      unit: "م.ط",
      formula: `إجمالي الأطوال الخطية لخطوط وبولي لاين الطبقة${divisorNote}${closedNote} = ${rawLen.toFixed(2)} م.ط`,
      count: 1,
      length: Number(rawLen.toFixed(2)),
      suggestedCategory: category,
      entityCount: layer.entityCount,
      description: desc,
      // A layer nothing recognised (no rule, no known trade word) is offered but not ticked,
      // so one drawing with 300 layers cannot flood the table with 300 lines.
      selected: !(desc.startsWith("طول مسار عناصر طبقة") && !rule),
    });
  });

  return results;
}

// ---------------------------------------------------------------------------
// Extraction audit — makes wrong / doubtful results LOUD instead of silent
// ---------------------------------------------------------------------------

export type ExtractOptions = NonNullable<Parameters<typeof extractEngineeringQuantitiesFromDxf>[1]>;

export interface AuditOptions extends ExtractOptions {
  /** The user explicitly confirmed the drawing unit. When omitted, passing unitScaleFactor counts as confirmation. */
  unitConfirmed?: boolean;
  includeHiddenLayers?: boolean;
}

export interface AuditCheck {
  /** Stable machine id, e.g. "unit_guessed", "area_exceeds_bbox". */
  id: string;
  /** info = FYI only, warn = review needed, error = result is probably wrong. */
  level: "info" | "warn" | "error";
  message: string;
  detail?: string;
}

export interface UnclassifiedLayer {
  layer: string;
  entityCount: number;
  areaM2: number;
  lengthM: number;
}

export interface ExtractionAudit {
  level: "ok" | "warn" | "error";
  confidence: "high" | "medium" | "low";
  /** Share (0-100) of measured area/length that sits on layers the app could classify. */
  coveragePct: number;
  unclassified: UnclassifiedLayer[];
  checks: AuditCheck[];
}

/** One-line Arabic summary, e.g. "ثقة متوسطة — 2 تحذير". */
export function summarizeAudit(a: ExtractionAudit): string {
  const conf = a.confidence === "high" ? "عالية" : a.confidence === "medium" ? "متوسطة" : "منخفضة";
  const warns = a.checks.filter((c) => c.level === "warn").length;
  const errs = a.checks.filter((c) => c.level === "error").length;
  const parts: string[] = [];
  if (errs) parts.push(`${errs} خطأ`);
  if (warns) parts.push(`${warns} تحذير`);
  return `ثقة ${conf}${parts.length ? " — " + parts.join("، ") : ""} — تغطية ${Math.round(a.coveragePct)}%`;
}

export function auditExtraction(
  parsed: ParsedDxfResult,
  extracted: ExtractedCadQuantity[],
  options: AuditOptions = {}
): ExtractionAudit {
  const checks: AuditCheck[] = [];
  const add = (id: string, level: AuditCheck["level"], message: string, detail?: string) =>
    checks.push({ id, level, message, detail });

  const scale =
    typeof options.unitScaleFactor === "number" && options.unitScaleFactor > 0
      ? options.unitScaleFactor
      : parsed.unitInfo?.toMeters ?? 1;
  const unitConfirmed =
    typeof options.unitConfirmed === "boolean"
      ? options.unitConfirmed
      : typeof options.unitScaleFactor === "number" && options.unitScaleFactor > 0;
  const rules = options.layerRules;
  const b = parsed.bounds;
  const span = parsed.drawingSpan ?? Math.max(Math.abs(b.maxX - b.minX), Math.abs(b.maxY - b.minY));

  // --- units ---
  if (parsed.unitInfo?.guessed && !unitConfirmed) {
    add("unit_guessed", "warn", `وحدة الرسم مُخمَّنة (${parsed.unitInfo.name}) ولم تُؤكَّد. خطأ الوحدة يضرب الكميات بعشرة أو ألف.`);
  }
  if (parsed.insunitsMissing) {
    add("insunits_missing", "info", "الملف لا يحدد وحدة الرسم ($INSUNITS غير موجود).");
  }
  const spanM = span * scale;
  if (!(spanM >= 1) || spanM > 2000) {
    add(
      "implausible_span",
      "error",
      `أكبر بُعد في الرسم ≈ ${spanM >= 1000 ? spanM.toFixed(0) : spanM.toFixed(2)} م بعد تحويل الوحدة — غير معقول لمشروع إنشائي؛ غالباً الوحدة خاطئة.`
    );
  }

  // --- geometry sanity ---
  const bboxArea = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
  const bigLayers = parsed.layers.filter((l) => (l.areaSum || 0) > 1.5 * bboxArea && bboxArea > 0);
  if (bigLayers.length > 0) {
    add(
      "area_exceeds_bbox",
      "error",
      "مساحة أشكال مغلقة على طبقة تتجاوز 1.5× مساحة حدود الرسم — يعني تكراراً أو أشكالاً متراكبة أو خطأ في الوحدة.",
      bigLayers.map((l) => l.name).join("، ")
    );
  }
  if (parsed.overlaps && parsed.overlaps.length > 0) {
    add(
      "nested_overlap",
      "warn",
      "أشكال مغلقة متداخلة أو متقاربة جداً على نفس الطبقة قد تُحسب مساحتها مرتين.",
      parsed.overlaps.map((o) => `${o.layer} (داخلي ${o.nested}، مكرر ${o.duplicates})`).join("، ")
    );
  }

  // --- excluded content ---
  if (parsed.hiddenLayers && parsed.hiddenLayers.length > 0) {
    add(
      "hidden_layers",
      "warn",
      parsed.hiddenLayersIncluded
        ? "تم تضمين طبقات مجمّدة/مطفأة بناءً على اختيارك."
        : "تم استبعاد طبقات مجمّدة/مطفأة — تأكد أنها فعلاً غير مطلوبة.",
      parsed.hiddenLayers.map((h) => `${h.name} (${h.entityCount})`).join("، ")
    );
  }
  if (parsed.duplicates && parsed.duplicates.length > 0) {
    const total = parsed.duplicates.reduce((s, d) => s + d.count, 0);
    add(
      "duplicates_removed",
      "warn",
      `حُذف ${total} عنصر مكرر تماماً (احتُسب مرة واحدة).`,
      parsed.duplicates.map((d) => `${d.layer}/${d.kind}×${d.count}`).join("، ")
    );
  }
  if ((parsed.skippedPaperSpaceCount || 0) > 0) {
    add("paper_space_skipped", "info", `تم تجاهل ${parsed.skippedPaperSpaceCount} عنصر من فراغ الورقة (Paper Space).`);
  }
  if (parsed.encodingSuspects && parsed.encodingSuspects.length > 0) {
    add(
      "text_encoding",
      "error",
      "نصوص/أسماء طبقات مقروءة بترميز خاطئ — التصنيف حسب الاسم لن يعمل. أعد حفظ الملف DXF بترميز UTF-8 أو ASCII.",
      parsed.encodingSuspects.join(" | ")
    );
  }

  // --- missing inputs ---
  const noThickness = extracted.filter((e) => e.type === "area" && /(السمك|العمق) غير محدد/.test(e.description || ""));
  if (noThickness.length > 0) {
    add(
      "missing_thickness",
      "warn",
      "طبقات خرسانية (بلاطة/قواعد/نظافة/أرضية) لها مساحة بلا سُمك — لن يظهر حجم الخرسانة (م³).",
      noThickness.map((e) => e.layer).join("، ")
    );
  }
  const noHeight = extracted.filter((e) => e.type === "linear" && /الارتفاع غير محدد/.test(e.description || ""));
  if (noHeight.length > 0) {
    add(
      "wall_no_height",
      "warn",
      "طبقات جدران بلا ارتفاع — لن تُحسب مساحة المباني/اللياسة (م²).",
      noHeight.map((e) => e.layer).join("، ")
    );
  }

  // --- classification coverage ---
  const FALLBACK = /^(مسطح ومساحة طبقة|طول مسار عناصر طبقة)/;
  const unclassSet = new Set<string>();
  for (const e of extracted) {
    if ((e.type === "area" || e.type === "linear") && FALLBACK.test(e.description || "")) unclassSet.add(e.layer);
  }
  let totalArea = 0, totalLen = 0, unArea = 0, unLen = 0;
  const unclassified: UnclassifiedLayer[] = [];
  for (const l of parsed.layers) {
    const rule = matchLayerRule(l.name, rules);
    if (rule?.kind === "ignore" || (!rule && isIgnoredLayer(l.name))) continue;
    const a = (l.areaSum || 0) * scale * scale;
    const len = (l.lineLength || 0) * scale;
    totalArea += a;
    totalLen += len;
    if (unclassSet.has(l.name) && !rule) {
      unArea += a;
      unLen += len;
      unclassified.push({ layer: l.name, entityCount: l.entityCount, areaM2: Number(a.toFixed(2)), lengthM: Number(len.toFixed(2)) });
    }
  }
  unclassified.sort((x, y) => y.areaM2 + y.lengthM - (x.areaM2 + x.lengthM));
  const shares: number[] = [];
  if (totalArea > 0) shares.push(1 - unArea / totalArea);
  if (totalLen > 0) shares.push(1 - unLen / totalLen);
  const coveragePct = shares.length ? (shares.reduce((s, v) => s + v, 0) / shares.length) * 100 : 100;
  const bigUnclassified = unclassified.filter(
    (u) => (totalArea > 0 && u.areaM2 / totalArea > 0.05) || (totalLen > 0 && u.lengthM / totalLen > 0.05)
  );
  if (bigUnclassified.length > 0) {
    add(
      "unclassified_large",
      "warn",
      "طبقات غير مصنّفة تحمل أكثر من 5% من إجمالي المساحة/الطول — صنّفها بقاعدة طبقة قبل الاعتماد.",
      bigUnclassified.map((u) => u.layer).join("، ")
    );
  }
  if (extracted.length === 0) {
    add("nothing_extracted", "error", "لم تُستخرج أي كمية من هذا الملف — تحقق من الوحدة والطبقات وقواعد التصنيف.");
  }

  const hasErr = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");
  return {
    level: hasErr ? "error" : hasWarn ? "warn" : "ok",
    confidence: hasErr ? "low" : hasWarn ? "medium" : "high",
    coveragePct: Number(coveragePct.toFixed(1)),
    unclassified,
    checks,
  };
}

export function renderDxfToCanvas(
  canvas: HTMLCanvasElement,
  parsedDxf: ParsedDxfResult,
  layerVisibility: Record<string, boolean> = {},
  highlightedLayer?: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas
  ctx.fillStyle = "#090d16";
  ctx.fillRect(0, 0, width, height);

  const { minX, minY, maxX, maxY } = parsedDxf.bounds;
  const dxfWidth = maxX - minX || 1;
  const dxfHeight = maxY - minY || 1;

  // Add padding
  const padding = 40;
  const drawWidth = width - padding * 2;
  const drawHeight = height - padding * 2;

  const scale = Math.min(drawWidth / dxfWidth, drawHeight / dxfHeight);
  const offsetX = padding + (drawWidth - dxfWidth * scale) / 2;
  const offsetY = padding + (drawHeight - dxfHeight * scale) / 2;

  // Transform coordinates (AutoCAD Y is upwards, Canvas Y is downwards)
  const tx = (x: number) => offsetX + (x - minX) * scale;
  const ty = (y: number) => height - (offsetY + (y - minY) * scale);

  const allEntities = (parsedDxf.parsedData?.entities || []).filter(
    (e: any) => e.inPaperSpace !== true
  );
  const hlTarget = highlightedLayer ? highlightedLayer.trim().toUpperCase() : "";

  const drawEntity = (entity: any, isHighlighted: boolean) => {
    const layer = entity.layer || "0";
    if (layerVisibility[layer] === false) return;

    ctx.save();
    if (hlTarget) {
      ctx.globalAlpha = isHighlighted ? 1.0 : 0.2;
      ctx.lineWidth = isHighlighted ? 3.2 : 1.0;
      ctx.strokeStyle = isHighlighted ? "#f59e0b" : getLayerColor(layer, parsedDxf.layers);
      ctx.fillStyle = isHighlighted ? "rgba(245, 158, 11, 0.24)" : ctx.strokeStyle;
    } else {
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = getLayerColor(layer, parsedDxf.layers);
      ctx.fillStyle = ctx.strokeStyle;
    }

    const type = entity.type;

    if (type === "LINE") {
      ctx.beginPath();
      ctx.moveTo(tx(entity.vertices?.[0]?.x ?? entity.x1 ?? 0), ty(entity.vertices?.[0]?.y ?? entity.y1 ?? 0));
      ctx.lineTo(tx(entity.vertices?.[1]?.x ?? entity.x2 ?? 0), ty(entity.vertices?.[1]?.y ?? entity.y2 ?? 0));
      ctx.stroke();
    } else if (type === "LWPOLYLINE" || type === "POLYLINE") {
      const vertices = entity.vertices || [];
      if (vertices.length > 1) {
        ctx.beginPath();
        ctx.moveTo(tx(vertices[0].x), ty(vertices[0].y));
        for (let i = 1; i < vertices.length; i++) {
          ctx.lineTo(tx(vertices[i].x), ty(vertices[i].y));
        }
        const closed = Boolean(entity.shape || entity.closed || ((entity.flags || 0) & 1));
        if (closed) {
          ctx.closePath();
          if (isHighlighted) ctx.fill();
        }
        ctx.stroke();
      }
    } else if (type === "HATCH") {
      const paths = entity.boundaryPaths || entity.boundaries || [];
      if (Array.isArray(paths)) {
        for (const p of paths) {
          const pts = p?.polylineVertices || p?.vertices || [];
          if (Array.isArray(pts) && pts.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(tx(pts[0].x), ty(pts[0].y));
            for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i].x), ty(pts[i].y));
            ctx.closePath();
            if (isHighlighted) ctx.fill();
            ctx.stroke();
          }
        }
      }
    } else if (type === "CIRCLE" && entity.center) {
      const cx = tx(entity.center.x);
      const cy = ty(entity.center.y);
      const r = (entity.radius || 1) * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      if (isHighlighted) ctx.fill();
      ctx.stroke();
    } else if (type === "ARC" && entity.center) {
      const cx = tx(entity.center.x);
      const cy = ty(entity.center.y);
      const r = (entity.radius || 1) * scale;
      const startAngle = -((entity.endAngle || 0) * Math.PI) / 180;
      const endAngle = -((entity.startAngle || 0) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r), startAngle, endAngle);
      ctx.stroke();
    } else if (type === "INSERT" && entity.position && isHighlighted) {
      const ix = tx(entity.position.x);
      const iy = ty(entity.position.y);
      ctx.beginPath();
      ctx.arc(ix, iy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (type === "TEXT" || type === "MTEXT") {
      const x = tx(entity.x || entity.position?.x || 0);
      const y = ty(entity.y || entity.position?.y || 0);
      const fontSize = Math.max(8, Math.min(24, (entity.textHeight || 12) * scale));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = isHighlighted ? "#fbbf24" : getLayerColor(layer, parsedDxf.layers);
      ctx.fillText(cleanDxfText(String(entity.text || entity.string || "")), x, y);
    }
    ctx.restore();
  };

  // Pass 1: draw non-highlighted entities
  for (const entity of allEntities) {
    const layer = (entity.layer || "0").trim().toUpperCase();
    const blockMatch = entity.type === "INSERT" && entity.name && hlTarget === "BLOCK_INSERTS";
    const isMatch = Boolean(hlTarget && (layer === hlTarget || blockMatch));
    if (!isMatch) drawEntity(entity, false);
  }
  // Pass 2: draw highlighted layer entities on top in glowing gold
  if (hlTarget) {
    for (const entity of allEntities) {
      const layer = (entity.layer || "0").trim().toUpperCase();
      const blockMatch = entity.type === "INSERT" && entity.name && hlTarget === "BLOCK_INSERTS";
      const isMatch = layer === hlTarget || blockMatch;
      if (isMatch) drawEntity(entity, true);
    }
  }
}

function getLayerColor(layerName: string, layers: DxfLayerInfo[]): string {
  const match = layers.find((l) => l.name === layerName);
  if (match?.color) return match.color;

  const defaultPalettes = ["#38bdf8", "#34d399", "#f59e0b", "#f43f5e", "#a855f7", "#ec4899", "#60a5fa"];
  let hash = 0;
  for (let i = 0; i < layerName.length; i++) {
    hash = layerName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return defaultPalettes[Math.abs(hash) % defaultPalettes.length];
}

// AutoCAD color index (ACI) to standard RGB hex approximation
function getCadColorHex(colorIndex: number): string {
  const aciColors: Record<number, string> = {
    1: "#ef4444", // Red
    2: "#eab308", // Yellow
    3: "#22c55e", // Green
    4: "#06b6d4", // Cyan
    5: "#3b82f6", // Blue
    6: "#d946ef", // Magenta
    7: "#f8fafc", // White/Black
    8: "#64748b", // Gray
    9: "#94a3b8", // Light gray
  };
  return aciColors[colorIndex] || "#38bdf8";
}
