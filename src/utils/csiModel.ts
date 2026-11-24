/**
 * Reads structural analysis models exported as text — ETABS (.e2k) and SAFE (.$sf / .f2k) — and turns their
 * exact geometry into concrete quantities: columns, beams, slabs, walls (ETABS) and footings / rafts / slabs (SAFE).
 *
 * The model is what the engineer designed with, so its sections and spans are exact; this is far more reliable than
 * guessing from drawing layers. Units: the file's own length unit (ETABS "UNITS", SAFE "CurrUnits"); converted to m.
 */
import type { TakeoffItem } from "../types";

export type ModelGroup = "columns" | "beams" | "slabs" | "walls" | "footings" | "other";

export interface ModelQuantity {
  group: ModelGroup;
  story: string;
  section: string;
  /** Number of members (columns/beams) or panels (slabs/walls/footings). */
  count: number;
  /** Total member length (m): columns = clear height, beams = span. */
  length?: number;
  /** Plan area (m²) for slabs/footings, face area for walls. */
  area?: number;
  /** Net concrete volume (m³). 0 when the section is not concrete. */
  volume: number;
  /** Human-readable size, e.g. "0.20×0.60" or "سماكة 0.25". */
  dims: string;
  /** How the volume was computed, for the audit trail. */
  formula: string;
  material?: string;
  /** Item needs a person's decision (e.g. modelling-only "stiff" areas). */
  review?: string;
}

export interface ModelReadResult {
  program: "ETABS" | "SAFE";
  version?: string;
  unitToM: number;
  stories: { name: string; height: number; elevation: number }[];
  items: ModelQuantity[];
  warnings: string[];
  /** Plan geometry (metres) of one representative level, for a preview picture. */
  plan: { columns: { x: number; y: number; b: number; d: number }[]; beams: [number, number, number, number][]; areas: { x: number; y: number }[][] };
}

const LEN_UNIT: Record<string, number> = { M: 1, MM: 0.001, CM: 0.01, IN: 0.0254, FT: 0.3048, INCH: 0.0254, FEET: 0.3048 };

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Shoelace area of a polygon. */
function polyArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Splits an ETABS line into tokens, keeping "quoted strings" whole (quotes removed). */
function tokens(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

/** Reads KEY value pairs that follow the first tokens, e.g. `D 0.6 B 0.2 MATERIAL "FC"` → {D:"0.6",B:"0.2",MATERIAL:"FC"}. */
function kv(t: string[], from: number): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = from; i < t.length - 1; i++) {
    if (/^[A-Z][A-Z0-9_]*$/.test(t[i])) { o[t[i]] = t[i + 1]; i++; }
  }
  return o;
}

type Agg = { count: number; length: number; area: number; volume: number; dims: string; formula: string; material?: string; review?: string };

function addAgg(map: Map<string, Agg & { group: ModelGroup; story: string; section: string }>, group: ModelGroup, story: string, section: string, inc: Partial<Agg> & { dims: string; formula: string }) {
  const k = `${group}|${story}|${section}`;
  const cur = map.get(k) || { group, story, section, count: 0, length: 0, area: 0, volume: 0, dims: inc.dims, formula: inc.formula, material: inc.material, review: inc.review };
  cur.count += inc.count ?? 1;
  cur.length += inc.length ?? 0;
  cur.area += inc.area ?? 0;
  cur.volume += inc.volume ?? 0;
  map.set(k, cur);
}

function finish(map: Map<string, any>): ModelQuantity[] {
  const order: ModelGroup[] = ["footings", "columns", "walls", "beams", "slabs", "other"];
  return [...map.values()]
    .map((a) => ({
      group: a.group, story: a.story, section: a.section, count: a.count,
      length: a.length ? round(a.length, 2) : undefined,
      area: a.area ? round(a.area, 2) : undefined,
      volume: round(a.volume, 3), dims: a.dims, formula: a.formula, material: a.material, review: a.review,
    }))
    .sort((x, y) => order.indexOf(x.group) - order.indexOf(y.group) || x.story.localeCompare(y.story) || x.section.localeCompare(y.section));
}

/* ───────────────────────── ETABS .e2k ───────────────────────── */

export function isE2k(text: string): boolean {
  return /\$\s*PROGRAM INFORMATION/i.test(text.slice(0, 4000)) && /PROGRAM\s+"ETABS"/i.test(text.slice(0, 4000));
}

export function readE2k(text: string): ModelReadResult {
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  let unitToM = 1;
  let version: string | undefined;
  const storyOrder: { name: string; height?: number; elev?: number }[] = [];
  const points = new Map<string, { x: number; y: number }>();
  const frameSec = new Map<string, { shape: string; d: number; b: number; material: string }>();
  const shellProp = new Map<string, { type: string; slabType: string; t: number; material: string; depth?: number; ribW?: number; ribS1?: number; ribS2?: number }>();
  const materials = new Map<string, string>(); // name → TYPE
  const lineObj = new Map<string, { kind: string; p1: string; p2: string }>();
  const areaObj = new Map<string, { kind: string; pts: string[]; offs: number[] }>();
  const lineAssign: { name: string; story: string; section: string }[] = [];
  const areaAssign: { name: string; story: string; section: string; opening: boolean }[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("$")) continue;
    const t = tokens(line);
    const head = t[0];
    switch (head) {
      case "PROGRAM": { const k = kv(t, 0); version = k.VERSION; break; }
      case "UNITS": { const u = (t[2] || "M").toUpperCase(); unitToM = LEN_UNIT[u] ?? 1; if (!(u in LEN_UNIT)) warnings.push(`وحدة طول غير معروفة «${t[2]}» — افترضت المتر.`); break; }
      case "STORY": { const k = kv(t, 2); storyOrder.push({ name: t[1], height: k.HEIGHT !== undefined ? Number(k.HEIGHT) : undefined, elev: k.ELEV !== undefined ? Number(k.ELEV) : undefined }); break; }
      case "MATERIAL": { const k = kv(t, 2); if (k.TYPE) materials.set(t[1], k.TYPE); break; }
      case "FRAMESECTION": {
        const k = kv(t, 2);
        if (k.SHAPE !== undefined) frameSec.set(t[1], { shape: k.SHAPE, d: Number(k.D || 0), b: Number(k.B || k.D || 0), material: k.MATERIAL || "" });
        break;
      }
      case "SHELLPROP": {
        const k = kv(t, 2);
        if (k.PROPTYPE !== undefined) {
          shellProp.set(t[1], {
            type: k.PROPTYPE, slabType: k.SLABTYPE || "", material: k.MATERIAL || "",
            t: Number(k.SLABTHICKNESS ?? k.WALLTHICKNESS ?? 0),
            depth: k.OVERALLDEPTH !== undefined ? Number(k.OVERALLDEPTH) : undefined,
            ribW: k.SLABRIBWIDTHBOTTOM !== undefined ? Number(k.SLABRIBWIDTHBOTTOM) : undefined,
            ribS1: k.SLABRIBSPACING1 !== undefined ? Number(k.SLABRIBSPACING1) : k.SLABRIBSPACING !== undefined ? Number(k.SLABRIBSPACING) : undefined,
            ribS2: k.SLABRIBSPACING2 !== undefined ? Number(k.SLABRIBSPACING2) : undefined,
          });
        }
        break;
      }
      case "POINT": { const x = Number(t[2]), y = Number(t[3]); if (Number.isFinite(x) && Number.isFinite(y)) points.set(t[1], { x, y }); break; }
      case "LINE": { lineObj.set(t[1], { kind: t[2], p1: t[3], p2: t[4] }); break; }
      case "AREA": {
        const n = Number(t[3]);
        if (Number.isFinite(n) && n > 0) areaObj.set(t[1], { kind: t[2], pts: t.slice(4, 4 + n), offs: t.slice(4 + n, 4 + 2 * n).map(Number) });
        break;
      }
      case "LINEASSIGN": { const k = kv(t, 3); if (k.SECTION) lineAssign.push({ name: t[1], story: t[2], section: k.SECTION }); break; }
      case "AREAASSIGN": { const k = kv(t, 3); areaAssign.push({ name: t[1], story: t[2], section: k.SECTION || "", opening: (k.OPENING || "").toUpperCase() === "YES" }); break; }
    }
  }

  // Story elevations: listed top → bottom, the last one carries ELEV.
  const stories: ModelReadResult["stories"] = [];
  {
    let elev = storyOrder.length ? storyOrder[storyOrder.length - 1].elev ?? 0 : 0;
    for (let i = storyOrder.length - 1; i >= 0; i--) {
      const s = storyOrder[i];
      if (i === storyOrder.length - 1 && s.height === undefined) { stories.unshift({ name: s.name, height: 0, elevation: elev * unitToM }); continue; }
      elev += s.height ?? 0;
      stories.unshift({ name: s.name, height: (s.height ?? 0) * unitToM, elevation: elev * unitToM });
    }
  }
  const storyH = new Map(stories.map((s) => [s.name, s.height]));
  const P = (id: string) => { const p = points.get(id); return p ? { x: p.x * unitToM, y: p.y * unitToM } : undefined; };
  const isConcrete = (mat: string) => (materials.get(mat) || "").toLowerCase() === "concrete";

  // Typical slab thickness per story (largest floor area) — beams are measured below it and columns up to it.
  const slabT = new Map<string, number>();
  {
    const best = new Map<string, { a: number; t: number }>();
    for (const as of areaAssign) {
      const o = areaObj.get(as.name); const sp = shellProp.get(as.section);
      if (!o || o.kind !== "FLOOR" || !sp || sp.type !== "Slab" || /stiff/i.test(sp.slabType) || as.opening) continue;
      const pts = o.pts.map(P).filter(Boolean) as { x: number; y: number }[];
      const a = polyArea(pts);
      const cur = best.get(as.story);
      const tt = (sp.depth ?? sp.t) * unitToM;
      if (!cur || a > cur.a) best.set(as.story, { a, t: tt });
    }
    for (const [s, v] of best) slabT.set(s, v.t);
  }

  const agg = new Map<string, any>();
  const missingSec = new Set<string>();
  const plan: ModelReadResult["plan"] = { columns: [], beams: [], areas: [] };
  const planStory = stories.find((s) => s.height > 0)?.name; // top framed story

  for (const as of lineAssign) {
    const o = lineObj.get(as.name);
    if (!o) continue;
    const sec = frameSec.get(as.section);
    if (!sec) { if (as.section.toLowerCase() !== "none") missingSec.add(as.section); continue; }
    const conc = isConcrete(sec.material) && /concrete/i.test(sec.shape);
    const circle = /circle/i.test(sec.shape);
    const d = sec.d * unitToM, b = sec.b * unitToM;
    const csArea = circle ? (Math.PI * d * d) / 4 : b * d;
    const dims = circle ? `قطر ${round(d, 2)}` : `${round(b, 2)}×${round(d, 2)}`;
    const ts = slabT.get(as.story) ?? 0;
    if (o.kind === "COLUMN") {
      const h = storyH.get(as.story) ?? 0;
      const clear = Math.max(0, h - ts);
      addAgg(agg, "columns", as.story, as.section, {
        length: clear, volume: conc ? csArea * clear : 0, dims, material: sec.material,
        formula: `المقطع ${dims} × الارتفاع الصافي (ارتفاع الدور ${round(h, 2)} − البلاطة ${round(ts, 2)})`,
      });
      if (as.story === planStory) { const p = P(o.p1); if (p) plan.columns.push({ x: p.x, y: p.y, b, d }); }
    } else {
      const p1 = P(o.p1), p2 = P(o.p2);
      if (!p1 || !p2) continue;
      const L = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const netD = Math.max(0, d - ts);
      addAgg(agg, o.kind === "BEAM" ? "beams" : "other", as.story, as.section, {
        length: L, volume: conc ? (circle ? csArea : b * netD) * L : 0, dims, material: sec.material,
        formula: circle ? `مساحة المقطع × الطول` : `العرض ${round(b, 2)} × العمق تحت البلاطة (${round(d, 2)} − ${round(ts, 2)}) × الطول`,
      });
      if (as.story === planStory) plan.beams.push([p1.x, p1.y, p2.x, p2.y]);
    }
    // Name says 20X70 but the section is drawn 0.20×0.60? Tell the person — the drawings may differ from the model.
    const nm = as.section.match(/(\d{2,3})\s*[xX*×]\s*(\d{2,3})/);
    if (nm && !circle) {
      const a = Number(nm[1]) / 100, c = Number(nm[2]) / 100;
      const same = (Math.abs(a - b) < 0.006 && Math.abs(c - d) < 0.006) || (Math.abs(a - d) < 0.006 && Math.abs(c - b) < 0.006);
      if (!same) {
        const msg = `المقطع «${as.section}» اسمه يوحي بـ ${a}×${c} لكنه معرَّف في النموذج ${round(b, 2)}×${round(d, 2)} — حُسب بالمعرَّف؛ طابِقه مع اللوحات.`;
        if (!warnings.includes(msg)) warnings.push(msg);
      }
    }
  }

  // Slab openings: deducted from the largest slab group of their story.
  const openingArea = new Map<string, number>();
  for (const as of areaAssign) {
    const o = areaObj.get(as.name);
    if (!o || !as.opening || o.kind !== "FLOOR") continue;
    const pts = o.pts.map(P).filter(Boolean) as { x: number; y: number }[];
    if (pts.length >= 3) openingArea.set(as.story, (openingArea.get(as.story) ?? 0) + polyArea(pts));
  }

  for (const as of areaAssign) {
    const o = areaObj.get(as.name);
    if (!o || as.opening || !as.section || as.section.toLowerCase() === "none") continue;
    const sp = shellProp.get(as.section);
    if (!sp) { missingSec.add(as.section); continue; }
    const conc = isConcrete(sp.material);
    const ids = o.pts;
    if (o.kind === "PANEL" || sp.type === "Wall") {
      // Wall panel: distinct plan points give its length; height = story height (minus slab).
      const uniq = [...new Set(ids)].map(P).filter(Boolean) as { x: number; y: number }[];
      let L = 0;
      for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) L = Math.max(L, Math.hypot(uniq[j].x - uniq[i].x, uniq[j].y - uniq[i].y));
      const h = Math.max(0, (storyH.get(as.story) ?? 0) - (slabT.get(as.story) ?? 0));
      const tt = sp.t * unitToM;
      addAgg(agg, "walls", as.story, as.section, {
        length: L, area: L * h, volume: conc ? L * h * tt : 0, dims: `سماكة ${round(tt, 2)}`, material: sp.material,
        formula: `الطول × الارتفاع الصافي ${round(h, 2)} × السماكة ${round(tt, 2)}`,
      });
      continue;
    }
    const pts = ids.map(P).filter(Boolean) as { x: number; y: number }[];
    if (pts.length < 3) continue;
    const A = polyArea(pts);
    if (as.story === planStory) plan.areas.push(pts);
    const tt = sp.t * unitToM;
    if (/stiff/i.test(sp.slabType)) {
      addAgg(agg, "other", as.story, as.section, {
        area: A, volume: conc ? A * tt : 0, dims: `سماكة ${round(tt, 2)}`, material: sp.material,
        formula: `المساحة × ${round(tt, 2)}`,
        review: "عنصر «Stiff» في ETABS غالباً عنصر نمذجة (منطقة جاسئة) وليس خرسانة فعلية — لا يُعتمد إلا إذا قابله عنصر في اللوحات.",
      });
      continue;
    }
    let vol = A * tt, formula = `المساحة × السماكة ${round(tt, 2)}`, dims = `سماكة ${round(tt, 2)}`;
    if (/waffle|ribbed/i.test(sp.slabType) && sp.depth && sp.ribW && sp.ribS1) {
      // Topping + ribs: rib volume per m² = ribW × (depth − topping) / spacing (each direction for waffle).
      const top = sp.t * unitToM, depth = sp.depth * unitToM, rw = sp.ribW * unitToM;
      const ribH = Math.max(0, depth - top);
      const perM2 = top + (rw * ribH) / (sp.ribS1 * unitToM) + (/waffle/i.test(sp.slabType) && sp.ribS2 ? (rw * ribH) / (sp.ribS2 * unitToM) : 0);
      vol = A * perM2;
      formula = `المساحة × ${round(perM2, 3)} م³/م² (بلاطة ${round(top, 2)} + أعصاب ${round(rw, 2)}×${round(ribH, 2)})`;
      dims = `هوردي/أعصاب عمق ${round(depth, 2)}`;
    }
    addAgg(agg, "slabs", as.story, as.section, { area: A, volume: conc ? vol : 0, dims, formula, material: sp.material });
  }

  for (const [story, oa] of openingArea) {
    const slabs = [...agg.values()].filter((a) => a.group === "slabs" && a.story === story).sort((a, b) => b.area - a.area);
    const target = slabs[0];
    if (!target || !(oa > 0)) continue;
    const perM2 = target.area > 0 ? target.volume / target.area : 0;
    target.area -= oa;
    target.volume -= oa * perM2;
    target.formula += ` − فتحات ${round(oa, 2)} م²`;
  }

  if (missingSec.size) warnings.push(`مقاطع مستخدمة غير معرَّفة في الملف (تُركت): ${[...missingSec].join("، ")}.`);
  if (!lineAssign.length && !areaAssign.length) warnings.push("لم أجد عناصر مُسنَدة لأدوار في الملف (LINEASSIGN/AREAASSIGN).");
  warnings.push("الكمرات محسوبة أسفل البلاطة والأعمدة حتى أسفل البلاطة، حتى لا تُحسب الخرسانة مرتين.");

  return { program: "ETABS", version, unitToM, stories, items: finish(agg), warnings, plan };
}

/* ───────────────────────── SAFE .$sf / .f2k ───────────────────────── */

export function isSafeText(text: string): boolean {
  const head = text.slice(0, 6000);
  return /TABLE:\s+"/.test(head) && (/ProgramName=SAFE/i.test(text) || /\.\$sf|\.f2k/i.test(head) || /TABLE:\s+"SLAB PROPERTY DEFINITIONS"/.test(text));
}

/** Parses SAFE/CSI database-table text into {tableName: rows[]}; handles " _" line continuations. */
export function readCsiTables(text: string): Map<string, Record<string, string>[]> {
  const tables = new Map<string, Record<string, string>[]>();
  let cur: Record<string, string>[] | null = null;
  const lines = text.split(/\r?\n/);
  let buf = "";
  const flush = () => {
    if (!buf || !cur) { buf = ""; return; }
    const row: Record<string, string> = {};
    const re = /("([^"]+)"|[^\s=]+)=("([^"]*)"|\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(buf))) row[m[2] ?? m[1]] = m[4] ?? m[3];
    if (Object.keys(row).length) cur.push(row);
    buf = "";
  };
  for (const raw of lines) {
    const tm = raw.match(/^TABLE:\s+"([^"]+)"/);
    if (tm) { flush(); cur = []; tables.set(tm[1], cur); continue; }
    if (!cur) continue;
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { flush(); continue; }
    const cont = /\s_$/.test(line);
    buf += " " + line.replace(/\s_$/, "");
    if (!cont) flush();
  }
  flush();
  return tables;
}

export function readSafe(text: string): ModelReadResult {
  const t = readCsiTables(text);
  const warnings: string[] = [];
  const ctrl = t.get("PROGRAM CONTROL")?.[0] || {};
  const lenUnit = ((ctrl.CurrUnits || "").split(",")[1] || "m").trim().toUpperCase();
  const unitToM = LEN_UNIT[lenUnit] ?? 1;
  const pts = new Map<string, { x: number; y: number }>();
  for (const r of t.get("POINT OBJECT CONNECTIVITY") || []) pts.set(r.UniqueName ?? r["Unique Name"], { x: Number(r.X) * unitToM, y: Number(r.Y) * unitToM });
  const props = new Map<string, { type: string; t: number; material: string }>();
  for (const r of t.get("SLAB PROPERTY DEFINITIONS") || []) props.set(r.Name, { type: r["Property Type"] || "", t: Number(r["Slab Thickness"] || 0) * unitToM, material: r.Material || "" });
  const assign = new Map<string, string>();
  for (const r of t.get("AREA ASSIGNMENTS - SECTION PROPERTIES") || []) assign.set(r.UniqueName ?? r["Unique Name"], r["Section Property"]);

  const agg = new Map<string, any>();
  const plan: ModelReadResult["plan"] = { columns: [], beams: [], areas: [] };
  let unassigned = 0;
  for (const r of t.get("FLOOR OBJECT CONNECTIVITY") || []) {
    const name = r["Unique Name"] ?? r.UniqueName;
    const ids = Object.keys(r).filter((k) => /^UniquePt\d+$/.test(k)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8))).map((k) => r[k]);
    const poly = ids.map((id) => pts.get(id)).filter(Boolean) as { x: number; y: number }[];
    if (poly.length < 3) continue;
    const secName = assign.get(name);
    const sp = secName ? props.get(secName) : undefined;
    if (!sp) { unassigned++; continue; }
    if (sp.type.toLowerCase() === "none" || !(sp.t > 0)) continue;
    const A = polyArea(poly);
    plan.areas.push(poly);
    const group: ModelGroup = /footing|mat/i.test(sp.type) ? "footings" : "slabs";
    addAgg(agg, group, "الأساسات", secName!, {
      area: A, volume: A * sp.t, dims: `سماكة ${round(sp.t, 2)}`, material: sp.material,
      formula: `المساحة × السماكة ${round(sp.t, 2)}`,
    });
  }
  // Grade/tie beams in SAFE
  const bsec = new Map<string, { b: number; d: number; material: string }>();
  for (const r of t.get("FRAME SECTION PROPERTY DEFINITIONS - CONCRETE RECTANGULAR") || []) bsec.set(r.Name, { b: Number(r.Width || 0) * unitToM, d: Number(r.Depth || 0) * unitToM, material: r.Material || "" });
  const bAssign = new Map<string, string>();
  for (const r of t.get("FRAME ASSIGNMENTS - SECTION PROPERTIES") || []) bAssign.set(r.UniqueName ?? r["Unique Name"], r["Section Property"]);
  for (const r of t.get("BEAM OBJECT CONNECTIVITY") || []) {
    const name = r["Unique Name"] ?? r.UniqueName;
    const p1 = pts.get(r.UniquePtI), p2 = pts.get(r.UniquePtJ);
    const sec = bsec.get(bAssign.get(name) || "");
    if (!p1 || !p2 || !sec) continue;
    const L = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    plan.beams.push([p1.x, p1.y, p2.x, p2.y]);
    addAgg(agg, "beams", "الأساسات", bAssign.get(name)!, {
      length: L, volume: sec.b * sec.d * L, dims: `${round(sec.b, 2)}×${round(sec.d, 2)}`, material: sec.material,
      formula: `${round(sec.b, 2)} × ${round(sec.d, 2)} × الطول`,
    });
  }
  if (unassigned) warnings.push(`${unassigned} مسطح بلا خاصية مُسندة — تُرك.`);
  if (!agg.size) warnings.push("لم أجد قواعد أو لبشة أو بلاطات في ملف SAFE.");
  return { program: "SAFE", version: ctrl.Version, unitToM, stories: [], items: finish(agg), warnings, plan };
}

/** Reads either model type from its text; throws an Arabic message when it is neither. */
export function readStructuralModel(text: string): ModelReadResult {
  if (isE2k(text)) return readE2k(text);
  if (isSafeText(text)) return readSafe(text);
  throw new Error("الملف ليس نموذج ETABS (.e2k) ولا SAFE (.$sf / .f2k) نصياً. من ETABS: File › Export › ETABS .e2k؛ ومن SAFE: File › Export › SAFE .f2k.");
}

export const GROUP_LABEL: Record<ModelGroup, string> = {
  footings: "قواعد ولبشة",
  columns: "أعمدة",
  walls: "جدران خرسانية",
  beams: "كمرات",
  slabs: "بلاطات",
  other: "عناصر أخرى",
};

/**
 * Turns model quantities into takeoff rows (m³ of concrete). Items that need a decision (modelling-only "stiff"
 * areas) and non-concrete members are left out and reported in the returned notes instead of inflating the total.
 */
export function modelToTakeoffItems(
  r: ModelReadResult,
  sheet: { id: string; code: string; title: string },
  startIndex: number
): { items: TakeoffItem[]; skipped: string[] } {
  const skipped: string[] = [];
  const items: TakeoffItem[] = [];
  const prefix: Record<ModelGroup, string> = { footings: "FDN", columns: "COL", walls: "WAL", beams: "BM", slabs: "SLB", other: "OTH" };
  for (const q of r.items) {
    if (q.review) { skipped.push(`${GROUP_LABEL[q.group]} ${q.section} (${q.story}): ${q.volume} م³ — ${q.review}`); continue; }
    if (!(q.volume > 0)) { skipped.push(`${GROUP_LABEL[q.group]} ${q.section} (${q.story}): ليس خرسانياً — طوله ${q.length ?? 0} م.`); continue; }
    const n = startIndex + items.length + 1;
    const where = q.story === "الأساسات" ? "الأساسات" : `الدور ${q.story}`;
    items.push({
      id: `item-model-${Date.now()}-${n}`,
      sheetId: sheet.id,
      sheetCode: sheet.code,
      sheetTitle: sheet.title,
      itemCode: `${prefix[q.group]}-${String(n).padStart(2, "0")}`,
      description: `خرسانة مسلحة ${GROUP_LABEL[q.group]} ${q.section} (${q.dims})`,
      category: "أعمال خرسانية مسلحة وعادية",
      dimensionType: "volume",
      location: where,
      count: q.count,
      length: q.length,
      formula: q.formula,
      deduction: 0,
      quantity: q.volume,
      unit: "م³",
      unitPrice: 0,
      totalPrice: 0,
      notes: `المصدر: نموذج ${r.program} — ${q.count} عنصر${q.length ? `، طول ${q.length} م` : ""}${q.area ? `، مساحة ${q.area} م²` : ""}${q.material ? ` — ${q.material}` : ""}`,
      isVerified: false,
      sourceEvidence: `${r.program} ${r.version ?? ""}: ${q.section} @ ${q.story} — ${q.formula}`,
      reviewFlags: ["لم يتم إدخال سعر وحدة"],
      extractionSource: "structural_model",
      sourceDetails: { layer: q.section },
    });
  }
  return { items, skipped };
}

/** Simple plan picture (SVG data URL, 1000×700) of the model so the sheet has something to show. */
export function modelPlanSvg(r: ModelReadResult, title: string): string {
  const xs: number[] = [], ys: number[] = [];
  for (const c of r.plan.columns) { xs.push(c.x); ys.push(c.y); }
  for (const b of r.plan.beams) { xs.push(b[0], b[2]); ys.push(b[1], b[3]); }
  for (const a of r.plan.areas) for (const p of a) { xs.push(p.x); ys.push(p.y); }
  const W = 1000, H = 700, pad = 50;
  if (!xs.length) return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/></svg>`);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad - 30) / (maxY - minY || 1));
  const ox = pad + (W - 2 * pad - (maxX - minX) * s) / 2, oy = pad + 30;
  const X = (x: number) => (ox + (x - minX) * s).toFixed(1);
  const Y = (y: number) => (oy + (maxY - y) * s).toFixed(1);
  const parts: string[] = [];
  for (const a of r.plan.areas) parts.push(`<polygon points="${a.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}" fill="#14b8a61f" stroke="#0f766e" stroke-width="1"/>`);
  for (const b of r.plan.beams) parts.push(`<line x1="${X(b[0])}" y1="${Y(b[1])}" x2="${X(b[2])}" y2="${Y(b[3])}" stroke="#334155" stroke-width="3"/>`);
  for (const c of r.plan.columns) { const w = Math.max(6, c.b * s), h = Math.max(6, c.d * s); parts.push(`<rect x="${(Number(X(c.x)) - w / 2).toFixed(1)}" y="${(Number(Y(c.y)) - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#0f172a"/>`); }
  const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><text x="${W - 20}" y="34" text-anchor="end" font-family="sans-serif" font-size="20" fill="#0f172a">${esc(title)}</text>${parts.join("")}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
