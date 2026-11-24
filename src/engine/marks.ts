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

export interface MarkStats {
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
  return { families, bolts: [...bolts.values()].sort((a, b) => b.n - a.n), tokens: texts.length };
}

export function readMarks(sheet: BlueprintSheet): Candidate[] {
  const texts = (sheet.visualTokens || []).filter((t) => t.source === "pdf_text").map((t) => t.text);
  if (texts.length < 5) return [];
  const s = readMarkStats(texts);
  const out: Candidate[] = [];
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
  return out;
}
