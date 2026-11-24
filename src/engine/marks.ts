import { BlueprintSheet } from "../types";
import { Candidate } from "./candidate";

/**
 * Reads what is WRITTEN on a drawing (not what is drawn): piece marks (C12, B3, PU5 …) and printed
 * bolt notes ("14 XM 20 X 70"). Steel erection / shop drawings carry their quantities this way and
 * have no scale at all, so line measuring can never work on them.
 */
const FAMILY: Record<string, string> = {
  C: "أعمدة", B: "كمرات", PU: "مدادات سقف (Purlins)", RF: "رافترات / كمرات سقف", SR: "شدادات (Sag rods)",
  BR: "تكتيف (Bracing)", GT: "كمرات جانبية", EG: "كمرات حافة", ST: "ستيفنرات", P: "بلاطات / صفائح", PL: "صفائح",
};

export interface LabelCount { label: string; n: number }
export interface MarkStats {
  /** Section designations written on design drawings: "SHS 100x4", "Z200x50x16.5x1.8", "W200-300*5 / F150*6". */
  sections: LabelCount[];
  /** Beam marks written with a dot or space: "S.B 2", "M.B3". */
  beams: { prefix: string; total: number; marks: LabelCount[] }[];
  /** Bracing rods: "ROD 24 mm". */
  rods: LabelCount[];
  families: { prefix: string; total: number; marks: { mark: string; n: number }[] }[];
  bolts: { dia: number; len: number; n: number; notes: number }[];
  tokens: number;
}

export function readMarkStats(texts: string[]): MarkStats {
  const byMark = new Map<string, number>();
  const bolts = new Map<string, { dia: number; len: number; n: number; notes: number }>();
  // Bolt notes arrive split into separate text items ("14","XM","20","X","70"), so match on the joined stream.
  const joined = texts.join(" ").replace(/\s+/g, " ");
  for (const b of joined.matchAll(/(?<![\d.])(\d{1,3}) XM (\d{1,3}) X (\d{1,4})(?![\d.])/gi)) {
    const key = `${b[2]}x${b[3]}`;
    const cur = bolts.get(key) || { dia: +b[2], len: +b[3], n: 0, notes: 0 };
    cur.n += +b[1]; cur.notes += 1; bolts.set(key, cur);
  }
  for (const raw of texts) {
    const t = raw.trim();
    if (/^([A-Z]{1,2})(\d{1,3})$/.test(t)) byMark.set(t, (byMark.get(t) || 0) + 1);
  }
  const fam = new Map<string, { mark: string; n: number }[]>();
  for (const [mark, n] of byMark) {
    const p = /^[A-Z]+/.exec(mark)![0];
    (fam.get(p) || fam.set(p, []).get(p)!).push({ mark, n });
  }
  const num = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 0;
  const families = [...fam].map(([prefix, marks]) => ({
    prefix,
    total: marks.reduce((s, x) => s + x.n, 0),
    marks: marks.sort((a, b) => num(a.mark) - num(b.mark)),
  }))
    // a prefix with one or two stray hits is a grid label / note, not a piece family
    .filter((f) => f.total >= 3)
    .sort((a, b) => b.total - a.total);
  const tally = (re: RegExp, norm: (m: RegExpMatchArray) => string) => {
    const m = new Map<string, number>();
    for (const x of joined.matchAll(re)) { const k = norm(x); m.set(k, (m.get(k) || 0) + 1); }
    return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
  };
  const sections = [
    ...tally(/\b(SHS|RHS|CHS)\s?(\d{2,3})\s?[xX*]\s?(\d{1,3}(?:\.\d+)?)\b/g, (m) => `${m[1]} ${m[2]}x${m[3]}`),
    ...tally(/\bZ\s?(\d{2,3})\s?x\s?(\d{2,3})\s?x\s?([\d.]+)\s?x\s?([\d.]+)\b/gi, (m) => `Z${m[1]}x${m[2]}x${m[3]}x${m[4]}`),
    ...tally(/\bW\s?(\d{2,3}-?\d{0,3})\s?[x*]\s?(\d{1,2})\s?\/\s?F\s?(\d{2,3})\s?[x*]\s?(\d{1,2})\b/gi, (m) => `W${m[1]}*${m[2]} / F${m[3]}*${m[4]}`),
  ];
  const beamMap = new Map<string, Map<string, number>>();
  for (const x of joined.matchAll(/\b(S\.B|M\.B|ST\.B)\s?(\d{1,2})\b/g)) {
    const mk = `${x[1]} ${x[2]}`;
    const g = beamMap.get(x[1]) || beamMap.set(x[1], new Map()).get(x[1])!;
    g.set(mk, (g.get(mk) || 0) + 1);
  }
  const beams = [...beamMap].map(([prefix, g]) => ({ prefix, total: [...g.values()].reduce((a, b) => a + b, 0), marks: [...g].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n) }));
  const rods = tally(/\bROD\s?(\d{2})\s?mm/gi, (m) => `قضيب ${m[1]} مم`);
  return { families, bolts: [...bolts.values()].sort((a, b) => b.n - a.n), tokens: texts.length, sections, beams, rods };
}

export function readMarks(sheet: BlueprintSheet): Candidate[] {
  const texts = (sheet.visualTokens || []).filter((t) => t.source === "pdf_text").map((t) => t.text);
  if (texts.length < 5) return [];
  const s = readMarkStats(texts);
  const out: Candidate[] = [];
  // Architectural plans tag doors and windows with a bare "D" / "W".
  if (texts.some((t) => /FLOOR PLAN|ROOF PLAN/i.test(t))) {
    // Some CAD fonts export the tag number as a control character ("D\u0014"), so accept a letter followed by one.
    const tags = texts.map((t) => /^([DW])([\u0000-\u001f]|\d{1,2})?$/.exec(t.trim())).filter(Boolean) as RegExpExecArray[];
    for (const [ch, name] of [["D", "أبواب"], ["W", "نوافذ"]] as const) {
      const mine = tags.filter((m) => m[1] === ch);
      const n = mine.length;
      const kinds = new Set(mine.map((m) => m[2] || "")).size;
      if (n >= 1) out.push({
        id: `mrk-tag-${ch}`, description: `${name} (علامة ${ch}) — ${sheet.code}`, category: "أعمال الأبواب والشبابيك والألمنيوم",
        dim: "count", unit: "عدد", quantity: n, count: n, sources: ["mark"], confidence: "low", selected: false,
        evidence: `نص مكتوب على اللوحة ${sheet.code}: علامة «${ch}» مكتوبة ${n} مرة (${kinds} نوع/رقم مختلف)`,
        checks: ["رقم النوع غير مقروء من الملف: طابق العدد والمقاسات مع جدول الأبواب والشبابيك على اللوحة"],
        layer: `علامات ${ch}`,
      });
    }
  }
  const where = `نص مكتوب على اللوحة ${sheet.code}`;
  const sample = (marks: { mark: string; n: number }[]) =>
    marks.slice(0, 12).map((m) => (m.n > 1 ? `${m.mark}×${m.n}` : m.mark)).join("، ") + (marks.length > 12 ? " …" : "");
  for (const f of s.families) {
    const name = FAMILY[f.prefix] || `علامات ${f.prefix}`;
    out.push({
      id: `mrk-${f.prefix}`,
      description: `${name} (${sheet.code}) — ${f.marks.length} علامة مختلفة`,
      category: "أعمال الهياكل المعدنية والهناجر",
      dim: "count", unit: "عدد", quantity: f.total, count: f.total,
      sources: ["mark"], confidence: "medium", selected: true,
      evidence: `${where}: ظهرت علامات ${f.prefix} ${f.total} مرة (${sample(f.marks)})`,
      checks: ["العدد = عدد مرات ظهور العلامة في هذا المنظر؛ لا تجمعه مع لوحة تعرض نفس العناصر من زاوية أخرى"],
      layer: `علامات ${f.prefix}`,
    });
  }
  for (const b of s.bolts) {
    out.push({
      id: `mrk-bolt-${b.dia}x${b.len}`,
      description: `براغي/أنكر M${b.dia}×${b.len} مم (${sheet.code})`,
      category: "أعمال الهياكل المعدنية والهناجر",
      dim: "count", unit: "عدد", quantity: b.n, count: b.n,
      sources: ["mark"], confidence: "medium", selected: true,
      evidence: `${where}: ${b.notes} ملاحظة مكتوبة بصيغة «عدد XM قطر X طول» مجموعها ${b.n}`,
      checks: ["الرقم مكتوب صراحة على اللوحة، لكن تأكد أن كل مجموعة براغي لم تُذكر في منظرين"],
      layer: "براغي",
    });
  }
  const lab = (id: string, description: string, n: number, evidence: string) =>
    out.push({
      id, description: `${description} (${sheet.code})`, category: "أعمال الهياكل المعدنية والهناجر",
      dim: "count", unit: "عدد", quantity: n, count: n, sources: ["mark"], confidence: "low", selected: false,
      evidence: `${where}: ${evidence}`,
      checks: ["رسم تصميمي: العدد = مرات كتابة التسمية، وليس بالضرورة عدد القطع (قد تُكتب مرة لعدة قطع). القياس الفعلي يحتاج المقياس أو قائمة المواد"],
      layer: "تسميات المقاطع",
    });
  for (const x of s.sections) lab(`mrk-sec-${x.label}`, `مقطع ${x.label}`, x.n, `التسمية «${x.label}» مكتوبة ${x.n} مرة`);
  for (const g of s.beams) lab(`mrk-beam-${g.prefix}`, `كمرات ${g.prefix}`, g.total, `${g.marks.map((m) => `${m.label}×${m.n}`).join("، ")}`);
  for (const x of s.rods) lab(`mrk-rod-${x.label}`, `تكتيف ${x.label}`, x.n, `«${x.label}» مكتوب ${x.n} مرة`);
  const plates = readPlateList(texts);
  if (plates) {
    const ok = plates.printedTotal !== undefined;
    out.push({
      id: "mrk-plates", description: `ألواح فولاذية حسب قائمة الألواح (${plates.rows.length} سطر) — ${sheet.code}`,
      category: "أعمال الهياكل المعدنية والهناجر", dim: "count", unit: "طن", quantity: plates.tons,
      sources: ["mark"], confidence: ok ? "high" : "medium", selected: ok,
      evidence: `قائمة الألواح على اللوحة ${sheet.code}: ${plates.rows.length} سطراً، كل وزن = السماكة×العرض×الطول×7.85 ${ok ? `والمجموع ${plates.printedTotal} طن مطبوع ويطابق` : "(لا يوجد مجموع مطبوع للمقارنة)"}`,
      checks: [ok ? "المجموع المحسوب يطابق المجموع المطبوع في القائمة" : "راجع المجموع مع القائمة المطبوعة"],
      layer: "قائمة الألواح",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Unified table of marks across all sheets                            */
/* ------------------------------------------------------------------ */

export interface MarkRow {
  kind: "علامة" | "براغي" | "مقطع" | "كمرة" | "قضيب";
  label: string;
  /** sheet code -> times written on that sheet */
  perSheet: Record<string, number>;
  /** The same label on several sheets is usually the same member in another view: take the largest, never the sum. */
  best: number;
  total: number;
  warning: string;
}

export function buildMarksTable(sheets: BlueprintSheet[]): { rows: MarkRow[]; codes: string[] } {
  const map = new Map<string, MarkRow>();
  const codes: string[] = [];
  const add = (kind: MarkRow["kind"], label: string, code: string, n: number) => {
    const key = `${kind}|${label}`;
    const r = map.get(key) || { kind, label, perSheet: {}, best: 0, total: 0, warning: "" };
    r.perSheet[code] = (r.perSheet[code] || 0) + n;
    map.set(key, r);
  };
  for (const sh of sheets) {
    const texts = (sh.visualTokens || []).filter((t) => t.source === "pdf_text").map((t) => t.text);
    if (texts.length < 5) continue;
    const s = readMarkStats(texts);
    const code = sh.code || sh.id;
    let any = false;
    for (const f of s.families) for (const m of f.marks) { add("علامة", m.mark, code, m.n); any = true; }
    for (const b of s.bolts) { add("براغي", `M${b.dia}×${b.len}`, code, b.n); any = true; }
    for (const x of s.sections) { add("مقطع", x.label, code, x.n); any = true; }
    for (const g of s.beams) for (const m of g.marks) { add("كمرة", m.label, code, m.n); any = true; }
    for (const x of s.rods) { add("قضيب", x.label, code, x.n); any = true; }
    if (any) codes.push(code);
  }
  const rows = [...map.values()].map((r) => {
    const v = Object.values(r.perSheet);
    r.total = v.reduce((a, b) => a + b, 0);
    r.best = Math.max(...v);
    if (v.length > 1) r.warning = `مكتوبة في ${v.length} لوحات: غالباً نفس العناصر من منظر آخر، لا تجمعها (الأرجح ${r.best})`;
    return r;
  });
  rows.sort((a, b) => a.kind.localeCompare(b.kind, "ar") || a.label.localeCompare(b.label, undefined, { numeric: true }));
  return { rows, codes };
}

/* ------------------------------------------------------------------ */
/* Plate list (T, W, L, weight, qty, total) -> tonnage                 */
/* ------------------------------------------------------------------ */

export interface PlateRow { no: number; t: number; w: number; l: number; weight: number; qty: number; total: number }

/** Reads a printed plate list: rows of "No T W L Weight QTY Total(ton)". Rows that do not satisfy weight = T*W*L*7.85e-6 are dropped. */
export function readPlateList(texts: string[]): { rows: PlateRow[]; tons: number; printedTotal?: number; rejected: number } | null {
  const joined = texts.join(" ");
  if (!/\bT\b/.test(joined) || !/\bW\b/.test(joined) || !/\bL\b/.test(joined) || !/QTY/i.test(joined)) return null;
  const nums: number[] = [];
  for (const t of texts) for (const m of t.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) || []) nums.push(parseFloat(m));
  const rows: PlateRow[] = [];
  let rejected = 0;
  let i = 0;
  while (i + 7 <= nums.length) {
    const [no, t, w, l, weight, qty, total] = nums.slice(i, i + 7);
    const calc = t * w * l * 7.85e-6;
    const ok = Number.isInteger(no) && no === rows.length + 1 && t > 0 && w >= 50 && l >= 50 && Math.abs(weight - calc) <= Math.max(0.5, calc * 0.01) && qty > 0 && Math.abs(total - (weight * qty) / 1000) <= 0.02;
    if (ok) { rows.push({ no, t, w, l, weight, qty, total }); i += 7; }
    else if (rows.length === 0) i += 1; // still hunting for the first valid row
    else { rejected += 1; break; }
  }
  if (rows.length < 2) return null;
  const tons = Math.round(rows.reduce((a, r) => a + (r.weight * r.qty) / 1000, 0) * 100) / 100;
  const next = nums[i];
  const printedTotal = next !== undefined && Math.abs(next - tons) < 0.1 ? next : undefined;
  return { rows, tons, printedTotal, rejected };
}
