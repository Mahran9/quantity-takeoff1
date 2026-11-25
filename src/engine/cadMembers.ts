import { Candidate } from "./candidate";
import { DEFAULT_COLUMN_HEIGHT } from "./schedules";

/**
 * Concrete beams measured from CAD geometry (DWG/DXF in model space).
 *
 * A structural framing plan draws every beam as two parallel edge lines, its width apart, labelled with a mark
 * (GB1, TB2, DB4…). The beam schedule on the same file gives each mark's width × depth. So:
 *   1. read the schedule rows (mark followed by two numbers on the same text row),
 *   2. group the plan marks into drawings by position (one framing plan per floor),
 *   3. on each drawing, pair parallel edges 0.14–0.62 m apart into beam spans (length = their overlap),
 *   4. give each span the nearest mark, and keep the layers whose measured widths agree with the schedule
 *      (that is what tells beam outlines from dimension or hatch lines, whatever the layer is called),
 *   5. concrete = Σ span length × schedule width × schedule depth.
 * Spans stop at column faces, so the length is the clear length between columns (columns are counted apart).
 */

const RC_CAT = "أعمال خرسانية مسلحة وعادية";
const BEAM_MARK = /^(GB|TB|DB|SB|RB|LB|B)(\d{1,2})$/;
const FAMILY_DESC: Record<string, string> = {
  GB: "توريد وصب خرسانة مسلحة للميدات (الكمرات الأرضية)",
  TB: "توريد وصب خرسانة مسلحة للشدادات (ميدات الربط بين القواعد)",
  DB: "توريد وصب خرسانة مسلحة للكمرات الساقطة",
  B: "توريد وصب خرسانة مسلحة للكمرات",
  SB: "توريد وصب خرسانة مسلحة للكمرات الثانوية",
  RB: "توريد وصب خرسانة مسلحة لكمرات السطح",
  LB: "توريد وصب خرسانة مسلحة للأعتاب (Lintel)",
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

interface Txt { s: string; x: number; y: number }
interface Seg { ax: number; ay: number; bx: number; by: number; layer: string }
interface Span { layer: string; width: number; length: number; x0: number; y0: number; x1: number; y1: number }
export interface Section { b: number; h: number }

export function cleanCadText(s: unknown): string {
  return String(s ?? "")
    .replace(/\\P/g, " ")
    .replace(/\\[A-Za-z][^;\\]*;/g, "")
    .replace(/[{}]/g, "")
    .replace(/%%[UuOo]/g, "")
    .replace(/%%[Cc]/g, "Ø")
    .trim();
}

const familyOf = (mark: string) => BEAM_MARK.exec(mark)?.[1] ?? "";
const markNo = (mark: string) => Number(BEAM_MARK.exec(mark)?.[2] ?? 0);

/** Beam schedule rows: a mark with two size numbers to its right on the same row (m ≤ 3, or cm 10–300). */
export function parseBeamSchedules(texts: Txt[]): { sections: Record<string, Section>; rows: Txt[] } {
  const nums = texts.filter((t) => /^\d+(\.\d+)?$/.test(t.s));
  const entries: (Txt & Section)[] = [];
  for (const m of texts) {
    if (!BEAM_MARK.test(m.s)) continue;
    const row = nums.filter((n) => n.x > m.x && n.x - m.x < 12 && Math.abs(n.y - m.y) < 0.35).sort((a, b) => a.x - b.x);
    if (row.length < 2) continue;
    const [v1, v2] = [Number(row[0].s), Number(row[1].s)];
    const k = v1 <= 3 && v2 <= 3 ? 1 : v1 >= 10 && v2 >= 10 && v1 <= 300 && v2 <= 300 ? 0.01 : 0;
    if (!k || v1 <= 0 || v2 <= 0) continue;
    entries.push({ ...m, b: v1 * k, h: v2 * k });
  }
  // A schedule lists several marks of a family in one column; a lone mark beside two numbers is not a table.
  const kept = entries.filter((e) => entries.some((o) => o !== e && familyOf(o.s) === familyOf(e.s) && Math.abs(o.x - e.x) < 0.6));
  const sections: Record<string, Section> = {};
  for (const e of kept) sections[e.s] ||= { b: e.b, h: e.h };
  return { sections, rows: kept };
}

/** Pair parallel edges of one layer into beam spans. */
function pairSpans(segs: Seg[]): Span[] {
  const S = segs.map((s) => {
    const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
    return { ...s, L, ux: (s.bx - s.ax) / L, uy: (s.by - s.ay) / L };
  });
  // Bucket by direction so the pairing stays fast on big plans.
  const key = (s: (typeof S)[number]) => Math.round(((Math.atan2(s.uy, s.ux) + Math.PI) % Math.PI) / (Math.PI / 90));
  const buckets = new Map<number, typeof S>();
  for (const s of S) { const k = key(s); (buckets.get(k) || buckets.set(k, []).get(k)!).push(s); }
  const near = (k: number) => [k - 1, k, k + 1, (k + 89) % 90, (k + 1) % 90].flatMap((q) => buckets.get(q) || []);
  const spans: Span[] = [];
  const seen = new Set<string>();
  S.forEach((a, i) => {
    let best: { j: number; d: number; lo: number; hi: number; side: number } | null = null;
    for (const b of near(key(a))) {
      if (b === a) continue;
      if (Math.abs(a.ux * b.uy - a.uy * b.ux) > 0.02) continue;
      const off = (b.ax - a.ax) * -a.uy + (b.ay - a.ay) * a.ux;
      const d = Math.abs(off);
      if (d < 0.14 || d > 0.62) continue;
      const t0 = (b.ax - a.ax) * a.ux + (b.ay - a.ay) * a.uy;
      const t1 = (b.bx - a.ax) * a.ux + (b.by - a.ay) * a.uy;
      const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(a.L, Math.max(t0, t1));
      if (hi - lo < 0.3) continue;
      if (!best || d < best.d - 1e-6 || (Math.abs(d - best.d) < 1e-6 && hi - lo > best.hi - best.lo))
        best = { j: S.indexOf(b), d, lo, hi, side: Math.sign(off) };
    }
    if (!best) return;
    const k = i < best.j ? `${i}-${best.j}` : `${best.j}-${i}`;
    if (seen.has(k)) return;
    seen.add(k);
    const nx = -a.uy * (best.d / 2) * best.side, ny = a.ux * (best.d / 2) * best.side;
    spans.push({
      layer: a.layer, width: best.d, length: best.hi - best.lo,
      x0: a.ax + a.ux * best.lo + nx, y0: a.ay + a.uy * best.lo + ny, x1: a.ax + a.ux * best.hi + nx, y1: a.ay + a.uy * best.hi + ny,
    });
  });
  return spans;
}

const distToSpan = (p: Txt, s: Span) => {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - s.x0) * dx + (p.y - s.y0) * dy) / L2));
  return Math.hypot(p.x - s.x0 - t * dx, p.y - s.y0 - t * dy);
};

/** Single-link clusters of points (gap in metres). */
function cluster<T extends { x: number; y: number }>(pts: T[], gap: number): T[][] {
  const groups: T[][] = [];
  for (const p of pts) {
    const hits = groups.filter((g) => g.some((q) => Math.abs(q.x - p.x) < gap && Math.abs(q.y - p.y) < gap));
    if (!hits.length) { groups.push([p]); continue; }
    hits[0].push(p);
    for (const h of hits.slice(1)) { hits[0].push(...h); groups.splice(groups.indexOf(h), 1); }
  }
  return groups;
}

/** Column schedule rows: a column mark with its "20 x 60 cm" / "60*20" size near it (cm). */
export function parseColumnSizes(texts: Txt[]): Record<string, Section> {
  const marks = texts.filter((t) => /^C\d{1,2}$/.test(t.s));
  const sizes = texts
    .map((t) => ({ t, m: /^(\d{2,3})\s*[xX×*]\s*(\d{2,3})(?:\s*(?:cm|CM|سم|sL))?$/.exec(t.s) }))
    .filter((z) => z.m) as { t: Txt; m: RegExpExecArray }[];
  const found: (Txt & Section)[] = [];
  for (const c of marks) {
    const near = sizes
      .map((z) => ({ z, dx: z.t.x - c.x, dy: z.t.y - c.y }))
      .filter((p) => p.dx > -1.5 && p.dx < 8 && p.dy > -3.2 && p.dy < 0.8)
      .sort((p, q) => Math.hypot(p.dx, p.dy * 2) - Math.hypot(q.dx, q.dy * 2))[0];
    if (!near) continue;
    // The size belongs to this mark only if no other mark is nearer to it.
    const owner = marks.map((m) => ({ m, d: Math.hypot(near.z.t.x - m.x, (near.z.t.y - m.y) * 2) })).sort((p, q) => p.d - q.d)[0].m;
    if (owner !== c) continue;
    found.push({ ...c, b: Number(near.z.m[1]) / 100, h: Number(near.z.m[2]) / 100 });
  }
  const kept = found.filter((e) => found.some((o) => o !== e && Math.abs(o.x - e.x) < 0.6));
  const out: Record<string, Section> = {};
  for (const e of kept) out[e.s] ||= { b: e.b, h: e.h };
  return out;
}

type Box3 = { L: number; W: number; H: number };
const FOOT_MARK = /^C?F\d{1,2}$/;

/**
 * Footing schedule rows in a CAD drawing: a footing mark followed on its row by L W H of plain concrete and of
 * reinforced concrete (order from the headings above), in metres or centimetres.
 */
export function parseCadFootingSchedule(texts: Txt[]): { sizes: Record<string, { pc?: Box3; rc?: Box3 }>; rows: Set<Txt> } {
  const nums = texts.filter((t) => /^\d+(\.\d+)?$/.test(t.s));
  const pcHeads = texts.filter((t) => /PLAIN|\bP\.?\s?C\b|LEAN|BLINDING/i.test(t.s));
  const rcHeads = texts.filter((t) => /REINF(?!ORCEMENT)|\bR\.?\s?C\b/i.test(t.s));
  const above = (m: Txt) => (h: Txt) => h.y > m.y && h.y - m.y < 20 && h.x > m.x - 2 && h.x < m.x + 25;
  const entries: (Txt & { pc?: Box3; rc?: Box3 })[] = [];
  for (const m of texts) {
    if (!FOOT_MARK.test(m.s)) continue;
    const row = nums.filter((n) => n.x > m.x && n.x - m.x < 25 && Math.abs(n.y - m.y) < 0.35).sort((a, b) => a.x - b.x);
    if (row.length < 3) continue;
    const v = row.map((n) => Number(n.s));
    const k = v.slice(0, 6).some((x) => x >= 20) ? 0.01 : 1;
    const box = (i: number): Box3 | undefined => {
      const [L, W, H] = v.slice(i, i + 3).map((x) => x * k);
      return L > 0 && W > 0 && H > 0 && H <= 2 && L <= 30 && W <= 30 ? { L, W, H } : undefined;
    };
    const pcH = pcHeads.filter(above(m)).sort((a, b) => a.y - m.y - (b.y - m.y))[0];
    const rcH = rcHeads.filter(above(m)).sort((a, b) => a.y - m.y - (b.y - m.y))[0];
    if (row.length >= 6) {
      const pcFirst = pcH && rcH ? pcH.x < rcH.x : true;
      const a = box(0), b = box(3);
      if (a && b) entries.push({ ...m, pc: pcFirst ? a : b, rc: pcFirst ? b : a });
    } else if (rcH && !pcH) {
      const a = box(0);
      if (a) entries.push({ ...m, rc: a });
    }
  }
  const kept = entries.filter((e) => entries.some((o) => o !== e && Math.abs(o.x - e.x) < 0.6));
  const sizes: Record<string, { pc?: Box3; rc?: Box3 }> = {};
  for (const e of kept) sizes[e.s] ||= { pc: e.pc, rc: e.rc };
  return { sizes, rows: new Set(kept) };
}

/** Footings on a CAD foundation plan × footing schedule = reinforced and plain (blinding) concrete. */
export function readCadFootings(world: Txt[], titles: Txt[]): Candidate[] {
  const { sizes, rows } = parseCadFootingSchedule(world);
  if (!Object.keys(sizes).length) return [];
  const plan = world.filter((t) => FOOT_MARK.test(t.s) && !rows.has(t) && sizes[t.s]);
  const out: Candidate[] = [];
  const order = (m: string) => (m.startsWith("CF") ? 1000 : 0) + Number(m.replace(/\D/g, ""));
  // A foundation plan carries many footing marks; a detail or section repeats each mark once or twice.
  cluster(plan, 12).filter((g) => g.length >= 8).forEach((g, gi) => {
    const seen = new Set<string>();
    const n: Record<string, number> = {};
    for (const m of g) {
      const key = `${m.s}@${Math.round(m.x * 20)},${Math.round(m.y * 20)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      n[m.s] = (n[m.s] || 0) + 1;
    }
    // Every mark once = a legend, a schedule copy or a sheet of details, not a plan.
    if (Math.max(...Object.values(n)) < 2) return;
    const xs = g.map((m) => m.x), ys = g.map((m) => m.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, y0 = Math.min(...ys);
    const title = titles
      .filter((t) => t.x > Math.min(...xs) - 8 && t.x < Math.max(...xs) + 8 && t.y > y0 - 19 && t.y < Math.max(...ys) + 9)
      .sort((a, b) => Math.hypot(a.x - cx, a.y - y0) - Math.hypot(b.x - cx, b.y - y0))[0]?.s;
    const where = title || `مخطط القواعد ${gi + 1}`;
    let rc = 0, pc = 0;
    const rcParts: string[] = [], pcParts: string[] = [], missing: string[] = [];
    let count = 0;
    for (const [mark, k] of Object.entries(n).sort((a, b) => order(a[0]) - order(b[0]))) {
      const s = sizes[mark];
      count += k;
      if (s.rc) { rc += k * s.rc.L * s.rc.W * s.rc.H; rcParts.push(`${mark}×${k} (${s.rc.L}×${s.rc.W}×${s.rc.H})`); } else missing.push(mark);
      if (s.pc) { pc += k * s.pc.L * s.pc.W * s.pc.H; pcParts.push(`${mark}×${k} (${s.pc.L}×${s.pc.W}×${s.pc.H})`); }
    }
    if (rc > 0) out.push({
      id: `cadf-${gi}-rc`,
      description: `توريد وصب خرسانة مسلحة للقواعد — ${where} (${count} قاعدة)`,
      category: RC_CAT, dim: "volume", unit: "م³", quantity: r3(rc), sources: ["cad"],
      confidence: missing.length ? "medium" : "high",
      evidence: `عدد كل قاعدة من علاماتها على المخطط × أبعادها من جدول القواعد: ${rcParts.join("، ")}`,
      checks: missing.length ? [`قواعد بلا أبعاد خرسانة مسلحة في الجدول: ${missing.join("، ")}`] : [],
      selected: true, formula: "Σ عدد × الطول × العرض × العمق", count,
    });
    if (pc > 0) out.push({
      id: `cadf-${gi}-pc`,
      description: `توريد وصب خرسانة عادية (نظافة) تحت القواعد — ${where}`,
      category: RC_CAT, dim: "volume", unit: "م³", quantity: r3(pc), sources: ["cad"], confidence: "high",
      evidence: `أبعاد الخرسانة العادية من جدول القواعد × عدد القواعد: ${pcParts.join("، ")}`,
      checks: [], selected: true, formula: "Σ عدد × الطول × العرض × السماكة",
    });
  });
  return out;
}

export interface MemberAssumptions { storeyHeight?: number; slabThickness?: number }

export function readCadMembers(dxf: any, a: MemberAssumptions = {}): Candidate[] {
  const ents: any[] = dxf?.parsedData?.entities || [];
  const k: number = dxf?.unitInfo?.toMeters || 1;
  if (!ents.length) return [];
  const P = (p: any) => (p && Number.isFinite(p.x) ? { x: p.x * k, y: p.y * k } : null);

  const textsOf = (list: any[]): Txt[] => {
    const out: Txt[] = [];
    for (const e of list || []) if (e.type === "TEXT" || e.type === "MTEXT") {
      const p = P(e.startPoint ?? e.position);
      const s = cleanCadText(e.text);
      if (p && s) out.push({ s, ...p });
    }
    return out;
  };
  const texts = textsOf(ents);
  const segs: Seg[] = [];
  for (const e of ents) {
    if ((e.type === "LINE" || e.type === "LWPOLYLINE" || e.type === "POLYLINE") && Array.isArray(e.vertices)) {
      const v = e.vertices.map(P).filter(Boolean) as { x: number; y: number }[];
      const n = v.length + (e.shape && v.length > 2 ? 1 : 0);
      for (let i = 1; i < n; i++) {
        const a = v[i - 1], b = v[i % v.length];
        if (Math.hypot(b.x - a.x, b.y - a.y) > 0.25) segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, layer: String(e.layer ?? "0") });
      }
    }
  }
  // Schedules are often blocks (a table pasted from another sheet), nested inside other blocks. Each block is read in
  // its own coordinates; only blocks actually placed in the drawing count (a DWG also carries unused blocks copied
  // from other projects, with other sections for the same marks).
  const blocks: Record<string, { entities?: any[] }> = dxf?.parsedData?.blocks || {};
  const reach = new Set<string>();
  const stack = ents.filter((e) => e.type === "INSERT").map((e) => String(e.name));
  while (stack.length) {
    const n = stack.pop()!;
    if (reach.has(n) || !blocks[n]) continue;
    reach.add(n);
    for (const e of blocks[n].entities || []) if (e.type === "INSERT") stack.push(String(e.name));
  }
  const all: Record<string, Section[]> = {};
  const model = parseBeamSchedules(texts);
  const rowSet = new Set(model.rows);
  for (const src of [model.sections, ...[...reach].map((n) => parseBeamSchedules(textsOf(blocks[n].entities || [])).sections)])
    for (const [mark, s] of Object.entries(src))
      if (!(all[mark] ||= []).some((o) => Math.abs(o.b - s.b) < 1e-6 && Math.abs(o.h - s.h) < 1e-6)) all[mark].push(s);
  // Every text placed in the drawing, blocks included, in world coordinates: column marks are often a block laid
  // over the plan, and the column schedule a block whose missing sizes were typed over it in model space.
  const world: Txt[] = [...texts];
  const place = (list: any[], tf: (p: { x: number; y: number }) => { x: number; y: number }, depth: number) => {
    for (const e of list || []) {
      if (e.type === "TEXT" || e.type === "MTEXT") {
        const p = e.startPoint ?? e.position, s = cleanCadText(e.text);
        if (p && s && Number.isFinite(p.x)) { const w = tf(p); world.push({ s, x: w.x * k, y: w.y * k }); }
      } else if (e.type === "INSERT" && depth < 5 && blocks[e.name] && e.position) {
        const base = (blocks[e.name] as any).position || { x: 0, y: 0 };
        const rad = ((e.rotation || 0) * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
        const sx = e.xScale || 1, sy = e.yScale || 1, P0 = e.position;
        place(blocks[e.name].entities || [], (p) => {
          const x = (p.x - (base.x || 0)) * sx, y = (p.y - (base.y || 0)) * sy;
          return tf({ x: P0.x + x * c - y * s, y: P0.y + x * s + y * c });
        }, depth + 1);
      }
    }
  };
  place(ents.filter((e) => e.type === "INSERT"), (p) => p, 0);
  const colSizes = parseColumnSizes(world);
  const titles = texts.filter((t) => /PLAN|مسقط|مخطط/i.test(t.s) && t.s.length < 60);
  const out: Candidate[] = readCadFootings(world, titles);

  if (!Object.keys(all).length) return out;
  /** The schedule section that best fits the widths actually drawn for a mark. */
  const sectionFor = (mark: string, widths: number[]): Section =>
    [...all[mark]].sort((a, b) => widths.filter((w) => Math.abs(w - b.b) <= 0.03).length - widths.filter((w) => Math.abs(w - a.b) <= 0.03).length)[0];
  const fits = (mark: string, w: number) => all[mark].some((s) => Math.abs(w - s.b) <= 0.03);
  const marks = texts.filter((t) => BEAM_MARK.test(t.s) && !rowSet.has(t) && all[t.s]);

  cluster(marks, 12).filter((g) => g.length >= 4).forEach((g, gi) => {
    const xs = g.map((m) => m.x), ys = g.map((m) => m.y);
    const bb = [Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3];
    const inside = (s: Seg) => { const x = (s.ax + s.bx) / 2, y = (s.ay + s.by) / 2; return x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]; };
    const byLayer = new Map<string, Seg[]>();
    for (const s of segs) if (inside(s)) (byLayer.get(s.layer) || byLayer.set(s.layer, []).get(s.layer)!).push(s);
    // Label every span, then keep the layers whose spans agree with the schedule widths.
    type L = Span & { mark?: string; d: number };
    const perLayer: { layer: string; spans: L[]; score: number }[] = [];
    for (const [layer, ls] of byLayer) {
      if (ls.length > 6000) continue;
      const spans: L[] = pairSpans(ls).map((s) => {
        const m = g.map((m) => ({ m, d: distToSpan(m, s) })).sort((a, b) => a.d - b.d)[0];
        return { ...s, mark: m && m.d < 2 ? m.m.s : undefined, d: m?.d ?? Infinity };
      });
      const score = spans.filter((s) => s.mark && fits(s.mark, s.width)).length;
      perLayer.push({ layer, spans, score });
    }
    const best = Math.max(0, ...perLayer.map((l) => l.score));
    if (best < 3) return;
    const used = perLayer.filter((l) => l.score >= Math.max(3, best * 0.25));
    const spans = used.flatMap((l) => l.spans);
    // An unlabelled span (labels are written once per run of spans) takes the nearest mark of the same width.
    for (const s of spans) if (!s.mark) {
      const m = g.filter((m) => fits(m.s, s.width)).map((m) => ({ m, d: distToSpan(m, s) })).sort((a, b) => a.d - b.d)[0];
      if (m && m.d < 8) s.mark = m.m.s;
    }
    const byFam = new Map<string, Map<string, { L: number; widths: number[] }>>();
    let unlabelled = 0;
    for (const s of spans) {
      if (!s.mark) { unlabelled += s.length; continue; }
      const fam = familyOf(s.mark);
      const fm = byFam.get(fam) || byFam.set(fam, new Map()).get(fam)!;
      const r = fm.get(s.mark) || fm.set(s.mark, { L: 0, widths: [] }).get(s.mark)!;
      r.L += s.length; r.widths.push(s.width);
    }
    const cx = (bb[0] + bb[2]) / 2;
    const title = titles
      .filter((t) => t.x > bb[0] - 5 && t.x < bb[2] + 5 && t.y > bb[1] - 16 && t.y < bb[3] + 6)
      .sort((a, b) => Math.hypot(a.x - cx, a.y - bb[1]) - Math.hypot(b.x - cx, b.y - bb[1]))[0]?.s;
    const where = title || `مخطط ${gi + 1}`;
    const t = a.slabThickness && a.slabThickness > 0 ? a.slabThickness : 0;
    for (const [fam, fm] of byFam) {
      const list = [...fm].sort((a, b) => markNo(a[0]) - markNo(b[0]));
      const dropped = fam === "DB" || fam === "B" || fam === "SB" || fam === "RB";
      let vol = 0, len = 0;
      const parts: string[] = [], checks: string[] = [];
      for (const [mark, r] of list) {
        const sec = sectionFor(mark, r.widths);
        // A dropped beam's depth is given from the top of the slab: with the slab measured over the whole floor, only
        // the part below it is beam concrete.
        const h = dropped && t && sec.h > t ? sec.h - t : sec.h;
        vol += r.L * sec.b * h; len += r.L;
        parts.push(`${mark}: ${r1(r.L)} م × ${sec.b.toFixed(2)} × ${h.toFixed(2)}${h !== sec.h ? ` (${sec.h.toFixed(2)} − بلاطة ${t.toFixed(2)})` : ""}`);
        const off = r.widths.filter((w) => Math.abs(w - sec.b) > 0.03);
        if (off.length > r.widths.length / 2) {
          const drawn = off.sort((a, b) => a - b)[Math.floor(off.length / 2)];
          checks.push(`${mark} مرسوم بعرض ${drawn.toFixed(2)} م والجدول يقول ${sec.b.toFixed(2)} — أُخذ عرض الجدول`);
        }
      }
      if (dropped && !t) checks.push("العمق من جدول الكمرات كاملاً (يشمل البلاطة). أدخل سمك البلاطة ليُحسب الجزء الساقط تحتها فقط");
      if (unlabelled > 1) checks.push(`${r1(unlabelled)} م من الخطوط المزدوجة بلا علامة قريبة لم تُحسب`);
      out.push({
        id: `cadm-${gi}-${fam}`,
        description: `${FAMILY_DESC[fam] || FAMILY_DESC.B} — ${where}`,
        category: RC_CAT,
        dim: "volume",
        unit: "م³",
        quantity: r3(vol),
        sources: ["cad"],
        confidence: checks.length > (dropped && !t ? 1 : 0) ? "medium" : "high",
        evidence: `أطوال الكمرات مقاسة من الخطوط المزدوجة في الرسم (${r1(len)} م بين وجوه الأعمدة) × مقاطعها من جدول الكمرات: ${parts.join("، ")}`,
        checks,
        selected: true,
        layer: used.map((l) => l.layer).join("، "),
        formula: dropped && t ? "Σ الطول × العرض × (العمق − سمك البلاطة)" : "Σ الطول × العرض × العمق",
        length: r3(len),
        review: dropped && !t,
      });
    }

    const fams = new Set(g.map((m) => familyOf(m.s)));
    const suspended = [...fams].some((f) => f === "DB" || f === "B" || f === "SB" || f === "RB");
    const groundBeams = fams.has("GB");
    // The foundation plan redraws the ground-floor columns: count columns on framing plans only.
    if ((suspended || groundBeams) && Object.keys(colSizes).length) {
      const seen = new Set<string>();
      const n: Record<string, number> = {};
      // Edge columns sit at the ends of the outer beams, which can lie beyond the outermost labels.
      const sx = spans.flatMap((s) => [s.x0, s.x1]), sy = spans.flatMap((s) => [s.y0, s.y1]);
      const cb = [Math.min(bb[0], ...sx) - 1, Math.min(bb[1], ...sy) - 1, Math.max(bb[2], ...sx) + 1, Math.max(bb[3], ...sy) + 1];
      for (const c of world) {
        if (!/^C\d{1,2}$/.test(c.s) || c.x < cb[0] || c.x > cb[2] || c.y < cb[1] || c.y > cb[3]) continue;
        const key = `${c.s}@${Math.round(c.x * 20)},${Math.round(c.y * 20)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        n[c.s] = (n[c.s] || 0) + 1;
      }
      const H = a.storeyHeight && a.storeyHeight > 0 ? a.storeyHeight : DEFAULT_COLUMN_HEIGHT;
      let area = 0, count = 0;
      const parts: string[] = [], missing: string[] = [];
      for (const [mark, k] of Object.entries(n).sort((p, q) => Number(p[0].slice(1)) - Number(q[0].slice(1)))) {
        const s = colSizes[mark];
        if (!s) { missing.push(`${mark}×${k}`); continue; }
        area += k * s.b * s.h; count += k;
        parts.push(`${mark}×${k} (${Math.round(s.b * 100)}×${Math.round(s.h * 100)})`);
      }
      if (count) out.push({
        id: `cadm-${gi}-C`,
        description: `توريد وصب خرسانة مسلحة للأعمدة — ${where} (${count} عمود)`,
        category: RC_CAT, dim: "volume", unit: "م³",
        quantity: r3(area * H),
        sources: ["cad"],
        confidence: a.storeyHeight && !missing.length ? "high" : "medium",
        evidence: `عدد كل عمود من علاماته على المخطط × مقطعه من جدول الأعمدة × ارتفاع ${H.toFixed(2)} م: ${parts.join("، ")}`,
        checks: [
          ...(a.storeyHeight ? [] : [`الارتفاع ${H.toFixed(2)} م مفترض — أدخل ارتفاع الدور`]),
          ...(missing.length ? [`أعمدة بلا مقاس في الجدول لم تُحسب: ${missing.join("، ")}`] : []),
        ],
        selected: true, formula: "Σ عدد × العرض × العمق × الارتفاع", count, height: H,
        review: !a.storeyHeight,
      });
    }

    // Slab: the floor area enclosed by the beams of this plan.
    if (suspended || groundBeams) {
      const area = enclosedArea(spans);
      if (area > 20) {
        if (suspended) out.push({
          id: `cadm-${gi}-S`,
          description: t ? `توريد وصب خرسانة مسلحة للبلاطة سمك ${Math.round(t * 100)} سم — ${where}` : `مساحة البلاطة — ${where}`,
          category: RC_CAT, dim: t ? "volume" : "area", unit: t ? "م³" : "م²",
          quantity: r3(t ? area * t : area),
          sources: ["cad"], confidence: "medium",
          evidence: `مساحة الدور داخل محيط الكمرات الخارجية = ${r1(area)} م²${t ? ` × سمك ${t.toFixed(2)} م` : ""}`,
          checks: [
            "الفتحات (سلالم، مناور) لا تُطرح تلقائياً — اطرحها إن وُجدت",
            ...(t ? [] : ["أدخل سمك البلاطة ليصبح البند بالمتر المكعب"]),
          ],
          selected: true, formula: t ? "المساحة × السمك" : "المساحة", review: true,
        });
        else out.push({
          id: `cadm-${gi}-SOG`,
          description: `مساحة الأرضيات (بلاطة على التربة) داخل الميدات — ${where}`,
          category: RC_CAT, dim: "area", unit: "م²", quantity: r3(area),
          sources: ["cad"], confidence: "medium",
          evidence: `المساحة داخل محيط الميدات الخارجية = ${r1(area)} م² — اضربها في سمك الأرضية`,
          checks: ["سمك الأرضية غير مأخوذ من الرسم"], selected: true, formula: "المساحة", review: true,
        });
      }
    }
  });
  return out;
}

/**
 * Floor area enclosed by beam centrelines: draw the beams on a 0.2 m grid, thickened enough to bridge the gaps
 * where spans stop at columns, flood the outside, and shrink the inside back by the same amount.
 */
export function enclosedArea(spans: { x0: number; y0: number; x1: number; y1: number }[], cell = 0.2, r = 0.7): number {
  if (!spans.length) return 0;
  const xs = spans.flatMap((s) => [s.x0, s.x1]), ys = spans.flatMap((s) => [s.y0, s.y1]);
  const X0 = Math.min(...xs) - 2, Y0 = Math.min(...ys) - 2;
  const W = Math.ceil((Math.max(...xs) + 2 - X0) / cell), Hh = Math.ceil((Math.max(...ys) + 2 - Y0) / cell);
  if (W * Hh > 4e6) return 0;
  const wall = new Uint8Array(W * Hh);
  for (const s of spans) {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0, L2 = dx * dx + dy * dy || 1;
    const i0 = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - r - X0) / cell)), i1 = Math.min(W - 1, Math.ceil((Math.max(s.x0, s.x1) + r - X0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(s.y0, s.y1) - r - Y0) / cell)), j1 = Math.min(Hh - 1, Math.ceil((Math.max(s.y0, s.y1) + r - Y0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = X0 + (i + 0.5) * cell, py = Y0 + (j + 0.5) * cell;
      const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / L2));
      if (Math.hypot(px - s.x0 - t * dx, py - s.y0 - t * dy) <= r) wall[j * W + i] = 1;
    }
  }
  // Distance (in cells, 4-neighbour steps) from the outside, flooding around the thickened beams.
  const dist = new Int32Array(W * Hh).fill(-1);
  const q: number[] = [];
  for (let i = 0; i < W; i++) for (const j of [0, Hh - 1]) if (!wall[j * W + i] && dist[j * W + i] < 0) { dist[j * W + i] = 0; q.push(j * W + i); }
  for (let j = 0; j < Hh; j++) for (const i of [0, W - 1]) if (!wall[j * W + i] && dist[j * W + i] < 0) { dist[j * W + i] = 0; q.push(j * W + i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], i = c % W, j = (c - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= Hh) continue;
      const k = nj * W + ni;
      if (dist[k] >= 0 || wall[k]) continue;
      dist[k] = 0; q.push(k);
    }
  }
  // Shrink: inside cells within r of the outside belong to the thickening, not the floor.
  const grow = new Int32Array(W * Hh).fill(-1);
  const q2: number[] = [];
  for (let k = 0; k < W * Hh; k++) if (dist[k] === 0) { grow[k] = 0; q2.push(k); }
  const steps = Math.round(r / cell);
  for (let h = 0; h < q2.length; h++) {
    const c = q2[h];
    if (grow[c] >= steps) continue;
    const i = c % W, j = (c - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= Hh) continue;
      const k = nj * W + ni;
      if (grow[k] >= 0) continue;
      grow[k] = grow[c] + 1; q2.push(k);
    }
  }
  let inside = 0;
  for (let k = 0; k < W * Hh; k++) if (grow[k] < 0) inside++;
  return inside * cell * cell;
}
