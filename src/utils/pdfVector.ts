/**
 * Vector geometry reader for PDF drawings (plans exported from AutoCAD/Revit/etc).
 *
 * Pure functions (no PDF.js import): the caller passes `page.getOperatorList()` output and `pdfjsLib.OPS`.
 * Supports both the PDF.js >= 5 `constructPath(op, [data], minMax)` encoding and the legacy encoding
 * (`constructPath(ops[], args[])`, or separate moveTo/lineTo/rectangle operators).
 *
 * Everything returned is in PDF user space points, y-up, after the full CTM. Converting to metres needs a
 * drawing scale (1:N): see `ptToMetres`. Nothing here classifies a stroke as "wall" or "beam" by itself;
 * the output is geometry grouped by layer / colour / line weight and the engineer confirms what each group is.
 */

export type Pt = [number, number];

export interface PdfPath {
  points: Pt[];
  closed: boolean;
  stroked: boolean;
  filled: boolean;
  /** Stroke colour when stroked, else fill colour (hex RRGGBB). */
  color: string;
  /** Line width in points after CTM scale. */
  lineWidth: number;
  /** Optional-content layer name when the PDF has layers. */
  layer?: string;
  isRect: boolean;
  /** Perimeter (closed) or length (open), points. */
  length: number;
  /** Shoelace area for closed paths, points². */
  area: number;
  bbox: [number, number, number, number];
}

export interface OpsMap {
  [name: string]: number;
}

export interface ExtractOptions {
  /** Resolve a marked-content property key to a layer name (optional content). */
  resolveLayer?: (key: unknown) => string | undefined;
  /** Hard stop to protect low-memory phones. */
  maxPaths?: number;
}

type Matrix = [number, number, number, number, number, number];
const IDENT: Matrix = [1, 0, 0, 1, 0, 0];

function mul(m: Matrix, n: Matrix): Matrix {
  // result = n applied first, then m  (PDF: new CTM = M × CTM)
  return [
    n[0] * m[0] + n[1] * m[2],
    n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2],
    n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4],
    n[4] * m[1] + n[5] * m[3] + m[5],
  ];
}
const apply = (m: Matrix, x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
const rgbHex = (r: number, g: number, b: number) => `${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();

function colorFromArgs(name: string, args: any[]): string | null {
  try {
    if (/RGB/.test(name)) {
      if (typeof args[0] === "string") return args[0].replace("#", "").toUpperCase();
      const [r, g, b] = args;
      return rgbHex(r <= 1 && g <= 1 && b <= 1 ? r * 255 : r, g <= 1 ? g * 255 : g, b <= 1 ? b * 255 : b);
    }
    if (/Gray/.test(name)) {
      const g = typeof args[0] === "number" ? (args[0] <= 1 ? args[0] * 255 : args[0]) : 0;
      return rgbHex(g, g, g);
    }
    if (/CMYK/.test(name)) {
      const [c, m, y, k] = args.map(Number);
      return rgbHex(255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k));
    }
  } catch {
    /* ignore */
  }
  return null;
}

const pathArea = (pts: Pt[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

function pathLength(pts: Pt[], closed: boolean) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 2) l += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return l;
}

function isAxisRect(pts: Pt[]): boolean {
  let p = pts;
  if (p.length === 5 && Math.hypot(p[0][0] - p[4][0], p[0][1] - p[4][1]) < 1e-6) p = p.slice(0, 4);
  if (p.length !== 4) return false;
  const tol = 1e-3;
  // consecutive edges must alternate horizontal/vertical (or any orientation with right angles)
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (n < tol || Math.abs(dot) / n > 1e-3) return false;
  }
  return true;
}

function flattenCurve(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

interface SubPath {
  pts: Pt[];
  closed: boolean;
}

/** Decode one constructPath operator into sub-paths in *local* (pre-CTM) coordinates. */
function decodeConstructPath(args: any[], OPS: OpsMap): { paint: number; subs: SubPath[] } | null {
  const subs: SubPath[] = [];
  let cur: SubPath | null = null;
  let last: Pt = [0, 0];
  const move = (x: number, y: number) => {
    cur = { pts: [[x, y]], closed: false };
    subs.push(cur);
    last = [x, y];
  };
  const line = (x: number, y: number) => {
    if (!cur) move(last[0], last[1]);
    cur!.pts.push([x, y]);
    last = [x, y];
  };
  const curve = (c1: Pt, c2: Pt, e: Pt) => {
    if (!cur) move(last[0], last[1]);
    flattenCurve(last, c1, c2, e).forEach((p) => cur!.pts.push(p));
    last = e;
  };
  const close = () => {
    if (cur) {
      cur.closed = true;
      last = cur.pts[0];
      cur = null;
    }
  };
  const rect = (x: number, y: number, w: number, h: number) => {
    subs.push({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true });
    cur = null;
    last = [x, y];
  };

  // PDF.js >= 5: [paintOp, [Float32Array | number[]], minMax]; DrawOPS: 0 move,1 line,2 curve,3 quad,4 close
  if (typeof args[0] === "number" && Array.isArray(args[1])) {
    const raw = args[1];
    const data: ArrayLike<number> | null = raw.length === 1 && raw[0] && typeof raw[0] === "object" ? raw[0] : raw;
    if (!data || typeof (data as any).length !== "number") return { paint: args[0], subs };
    let i = 0;
    const n = (data as any).length;
    while (i < n) {
      const op = data[i++];
      if (op === 0) { move(data[i], data[i + 1]); i += 2; }
      else if (op === 1) { line(data[i], data[i + 1]); i += 2; }
      else if (op === 2) { curve([data[i], data[i + 1]], [data[i + 2], data[i + 3]], [data[i + 4], data[i + 5]]); i += 6; }
      else if (op === 3) {
        const q1: Pt = [data[i], data[i + 1]], e: Pt = [data[i + 2], data[i + 3]];
        const c1: Pt = [last[0] + (2 / 3) * (q1[0] - last[0]), last[1] + (2 / 3) * (q1[1] - last[1])];
        const c2: Pt = [e[0] + (2 / 3) * (q1[0] - e[0]), e[1] + (2 / 3) * (q1[1] - e[1])];
        curve(c1, c2, e);
        i += 4;
      } else if (op === 4) close();
      else break; // unknown opcode: stop rather than misread
    }
    return { paint: args[0], subs };
  }

  // Legacy: [ops[], args[]] (no paint op inside)
  if (Array.isArray(args[0]) && Array.isArray(args[1])) {
    const ops: number[] = args[0];
    const a: number[] = args[1];
    let j = 0;
    for (const op of ops) {
      if (op === OPS.moveTo) { move(a[j], a[j + 1]); j += 2; }
      else if (op === OPS.lineTo) { line(a[j], a[j + 1]); j += 2; }
      else if (op === OPS.curveTo) { curve([a[j], a[j + 1]], [a[j + 2], a[j + 3]], [a[j + 4], a[j + 5]]); j += 6; }
      else if (op === OPS.curveTo2) { curve(last, [a[j], a[j + 1]], [a[j + 2], a[j + 3]]); j += 4; }
      else if (op === OPS.curveTo3) { curve([a[j], a[j + 1]], [a[j + 2], a[j + 3]], [a[j + 2], a[j + 3]]); j += 4; }
      else if (op === OPS.closePath) close();
      else if (op === OPS.rectangle) { rect(a[j], a[j + 1], a[j + 2], a[j + 3]); j += 4; }
    }
    return { paint: -1, subs };
  }
  return null;
}

export function extractVectorPaths(
  opList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<any> },
  OPS: OpsMap,
  options: ExtractOptions = {}
): { paths: PdfPath[]; truncated: boolean; stats: { total: number; unsupportedOps: number } } {
  const maxPaths = options.maxPaths ?? 250_000;
  const paths: PdfPath[] = [];
  const stack: { ctm: Matrix; stroke: string; fill: string; lw: number }[] = [];
  let ctm: Matrix = IDENT;
  let stroke = "000000";
  let fill = "000000";
  let lw = 1;
  let truncated = false;
  let unsupportedOps = 0;
  const layerStack: (string | undefined)[] = [];
  const formStack: Matrix[] = [];

  // Legacy path building state (separate moveTo/lineTo ops)
  let legacyOps: number[] = [];
  let legacyArgs: number[] = [];
  let pending: SubPath[] | null = null;

  const colorOps: Record<number, { which: "s" | "f"; name: string }> = {};
  for (const n of ["setStrokeRGBColor", "setStrokeGray", "setStrokeCMYKColor"]) if (OPS[n] != null) colorOps[OPS[n]] = { which: "s", name: n };
  for (const n of ["setFillRGBColor", "setFillGray", "setFillCMYKColor"]) if (OPS[n] != null) colorOps[OPS[n]] = { which: "f", name: n };

  const paintKinds = new Map<number, { stroke: boolean; fill: boolean; close: boolean; none?: boolean }>();
  const setPaint = (n: string, stroke_: boolean, fill_: boolean, close_ = false, none = false) => {
    if (OPS[n] != null) paintKinds.set(OPS[n], { stroke: stroke_, fill: fill_, close: close_, none });
  };
  setPaint("stroke", true, false);
  setPaint("closeStroke", true, false, true);
  setPaint("fill", false, true);
  setPaint("eoFill", false, true);
  setPaint("fillStroke", true, true);
  setPaint("eoFillStroke", true, true);
  setPaint("closeFillStroke", true, true, true);
  setPaint("closeEOFillStroke", true, true, true);
  setPaint("endPath", false, false, false, true);

  const emit = (subs: SubPath[], paintOp: number) => {
    const kind = paintKinds.get(paintOp);
    if (!kind || kind.none) return;
    const scaleLw = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
    for (const sp of subs) {
      if (sp.pts.length < 2) continue;
      if (paths.length >= maxPaths) {
        truncated = true;
        return;
      }
      const pts = sp.pts.map(([x, y]) => apply(ctm, x, y));
      const closed = sp.closed || kind.close;
      const layer = [...layerStack].reverse().find((l) => l);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const rectLike = closed && isAxisRect(pts);
      paths.push({
        points: pts,
        closed,
        stroked: kind.stroke,
        filled: kind.fill,
        color: kind.stroke ? stroke : fill,
        lineWidth: lw * scaleLw,
        layer,
        isRect: rectLike,
        length: pathLength(pts, closed),
        area: closed ? pathArea(pts) : 0,
        bbox: [minX, minY, maxX, maxY],
      });
    }
  };

  const n = opList.fnArray.length;
  for (let i = 0; i < n; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];
    if (truncated) break;

    if (fn === OPS.save) stack.push({ ctm, stroke, fill, lw });
    else if (fn === OPS.restore) {
      const s = stack.pop();
      if (s) ({ ctm, stroke, fill, lw } = s);
    } else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix);
    else if (fn === OPS.setLineWidth) lw = Number(args?.[0]) || 0;
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ctm, stroke, fill, lw });
      formStack.push(ctm);
      if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = mul(ctm, args[0] as Matrix);
    } else if (fn === OPS.paintFormXObjectEnd) {
      formStack.pop();
      const s = stack.pop();
      if (s) ({ ctm, stroke, fill, lw } = s);
    } else if (colorOps[fn]) {
      const c = colorFromArgs(colorOps[fn].name, Array.from(args || []));
      if (c) {
        if (colorOps[fn].which === "s") stroke = c;
        else fill = c;
      }
    } else if (fn === OPS.beginMarkedContentProps || fn === OPS.beginMarkedContent) {
      let layer: string | undefined;
      if (fn === OPS.beginMarkedContentProps && args?.[0] === "OC" && options.resolveLayer) {
        try {
          // PDF.js passes {type:"OCG", id:"5R"} (older builds: a plain string id)
          const key = args[1] && typeof args[1] === "object" ? (args[1] as any).id ?? args[1] : args[1];
          layer = options.resolveLayer(key);
        } catch {
          layer = undefined;
        }
      }
      layerStack.push(layer);
    } else if (fn === OPS.endMarkedContent) layerStack.pop();
    else if (fn === OPS.constructPath) {
      const d = decodeConstructPath(args, OPS);
      if (!d) unsupportedOps++;
      else if (d.paint >= 0) emit(d.subs, d.paint);
      else {
        // Legacy constructPath carries no paint operator; the next paint op will find it pending.
        legacyOps = [];
        legacyArgs = [];
        pending = d.subs;
      }
    } else if (paintKinds.has(fn)) {
      if (pending) {
        emit(pending, fn);
        pending = null;
      }
      legacyOps = [];
      legacyArgs = [];
    } else if (fn === OPS.moveTo || fn === OPS.lineTo || fn === OPS.curveTo || fn === OPS.curveTo2 || fn === OPS.curveTo3 || fn === OPS.closePath || fn === OPS.rectangle) {
      legacyOps.push(fn);
      legacyArgs.push(...(Array.from(args || []) as number[]));
      const d = decodeConstructPath([legacyOps, legacyArgs], OPS);
      pending = d ? d.subs : null;
    }
  }
  return { paths, truncated, stats: { total: paths.length, unsupportedOps } };
}
