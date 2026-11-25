import { Candidate } from "./candidate";

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

export function readCadMembers(dxf: any): Candidate[] {
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
  if (!Object.keys(all).length) return [];
  /** The schedule section that best fits the widths actually drawn for a mark. */
  const sectionFor = (mark: string, widths: number[]): Section =>
    [...all[mark]].sort((a, b) => widths.filter((w) => Math.abs(w - b.b) <= 0.03).length - widths.filter((w) => Math.abs(w - a.b) <= 0.03).length)[0];
  const fits = (mark: string, w: number) => all[mark].some((s) => Math.abs(w - s.b) <= 0.03);
  const marks = texts.filter((t) => BEAM_MARK.test(t.s) && !rowSet.has(t) && all[t.s]);
  const out: Candidate[] = [];
  const titles = texts.filter((t) => /PLAN|مسقط|مخطط/i.test(t.s) && t.s.length < 60);

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
    for (const [fam, fm] of byFam) {
      const list = [...fm].sort((a, b) => markNo(a[0]) - markNo(b[0]));
      let vol = 0, len = 0;
      const parts: string[] = [], checks: string[] = [];
      for (const [mark, r] of list) {
        const sec = sectionFor(mark, r.widths);
        vol += r.L * sec.b * sec.h; len += r.L;
        parts.push(`${mark}: ${r1(r.L)} م × ${sec.b.toFixed(2)} × ${sec.h.toFixed(2)}`);
        const off = r.widths.filter((w) => Math.abs(w - sec.b) > 0.03);
        if (off.length > r.widths.length / 2) {
          const drawn = off.sort((a, b) => a - b)[Math.floor(off.length / 2)];
          checks.push(`${mark} مرسوم بعرض ${drawn.toFixed(2)} م والجدول يقول ${sec.b.toFixed(2)} — أُخذ عرض الجدول`);
        }
      }
      if (fam === "DB" || fam === "B") checks.push("العمق من جدول الكمرات كما هو؛ إن كان مقاساً من أعلى البلاطة فاطرح سماكة البلاطة حتى لا تُحسب مرتين");
      if (unlabelled > 1) checks.push(`${r1(unlabelled)} م من الخطوط المزدوجة بلا علامة قريبة لم تُحسب`);
      out.push({
        id: `cadm-${gi}-${fam}`,
        description: `${FAMILY_DESC[fam] || FAMILY_DESC.B} — ${where}`,
        category: RC_CAT,
        dim: "volume",
        unit: "م³",
        quantity: r3(vol),
        sources: ["cad"],
        confidence: checks.length > (fam === "DB" || fam === "B" ? 1 : 0) ? "medium" : "high",
        evidence: `أطوال الكمرات مقاسة من الخطوط المزدوجة في الرسم (${r1(len)} م بين وجوه الأعمدة) × مقاطعها من جدول الكمرات: ${parts.join("، ")}`,
        checks,
        selected: true,
        layer: used.map((l) => l.layer).join("، "),
        formula: "Σ الطول × العرض × العمق",
        length: r3(len),
        review: fam === "DB" || fam === "B",
      });
    }
  });
  return out;
}
