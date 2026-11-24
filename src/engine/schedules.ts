import { BlueprintSheet } from "../types";
import { Candidate } from "./candidate";

/**
 * Structural design sheets give member SIZES in schedules and member COUNTS as marks on the plans.
 * The quantity a QS needs (m³ of concrete) is the product of the two: this module reads the schedules
 * and joins them with the counted marks.
 *
 * Text positions come from the PDF text layer (normalised 0..1, y from the top), so a schedule drawn
 * as a grid of text can be read back as a table without OCR.
 */

export interface Tok { text: string; x: number; y: number; w?: number }
export interface Box { L: number; W: number; H: number }
export interface FootingRow { rc?: Partial<Box>; pc?: Partial<Box> }

const RC_CAT = "أعمال خرسانية مسلحة وعادية";
/** Clear storey height assumed for columns when the drawings carry no levels (shown on the line, editable). */
export const DEFAULT_COLUMN_HEIGHT = 3.4;

const tokensOf = (sheet: Pick<BlueprintSheet, "visualTokens">): Tok[] =>
  (sheet.visualTokens || []).filter((t) => t.source === "pdf_text").map((t) => ({ text: t.text.trim(), x: t.x, y: t.y, w: t.w }));
const centre = (t: Tok) => t.x + (t.w ?? 0) / 2;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** "C1 (20x50)", "C8 (20 X 100)", "C3(30*60)" → C1: 0.20 × 0.50 m. Values in cm (≥ 10) or m (< 3). */
export function parseColumnSchedule(texts: string[]): Record<string, { b: number; h: number }> {
  const out: Record<string, { b: number; h: number }> = {};
  const joined = texts.join("  ");
  for (const m of joined.matchAll(/\b(C\d{1,2})\s*\(\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*\)/g)) {
    const a = Number(m[2]), b = Number(m[3]);
    const k = a >= 10 || b >= 10 ? 0.01 : 1;
    if (a * k > 0.1 && b * k > 0.1 && a * k < 3 && b * k < 3) out[m[1]] = { b: r3(a * k), h: r3(b * k) };
  }
  return out;
}

/**
 * Footing schedule drawn as a grid: one column per mark (F1 … F20) and rows labelled L / W / H under
 * "P.C DIMENSIONS" (plain concrete / blinding) and "R.C DIMENSIONS" (reinforced). Also reads the transposed
 * layout (one row per mark, L/W/H as column headings). Cells reading "as PLAN" stay empty.
 */
export function parseFootingSchedule(toks: Tok[]): { marks: Record<string, FootingRow>; unit: "cm" | "m" } | null {
  const marks = toks.filter((t) => /^F\d{1,2}$/.test(t.text));
  if (marks.length < 4) return null;
  const num = (t: Tok) => /^\d{1,4}(?:\.\d{1,3})?$/.test(t.text);
  const nums = toks.filter(num);
  const labelOf = (t: Tok): "L" | "W" | "H" | null =>
    /^(L|LENGTH|LONG)$/i.test(t.text) ? "L" : /^(W|B|WIDTH|SHORT)$/i.test(t.text) ? "W" : /^(H|D|T|DEPTH|THK|THICKNESS|HEIGHT)$/i.test(t.text) ? "H" : null;
  const labels = toks.filter((t) => labelOf(t));
  const heads = toks
    .map((t) => ({ t, kind: /\bR\.?\s?C\b|REINFORCED/i.test(t.text) ? "rc" : /\bP\.?\s?C\b|PLAIN|LEAN|BLINDING/i.test(t.text) ? "pc" : null }))
    .filter((h) => h.kind) as { t: Tok; kind: "rc" | "pc" }[];
  const cmHint = toks.some((t) => /\(\s*CM\s*\)|\bCM\b/i.test(t.text));

  // Try both orientations: marks across (header row) or marks down (header column).
  for (const across of [true, false]) {
    const along = (t: Tok) => (across ? centre(t) : t.y); // position along the mark axis
    const cross = (t: Tok) => (across ? t.y : centre(t)); // position across it (rows)
    // The mark headers: the largest set of F-marks lying on one line (staggered labels allowed).
    const lines = new Map<number, Tok[]>();
    for (const m of marks) {
      const key = [...lines.keys()].find((k) => Math.abs(k - cross(m)) < 0.012) ?? cross(m);
      (lines.get(key) || lines.set(key, []).get(key)!).push(m);
    }
    const header = [...lines.values()].sort((a, b) => b.length - a.length)[0];
    if (!header || new Set(header.map((m) => m.text)).size < 4) continue;
    const cols = [...header].sort((a, b) => along(a) - along(b));
    const gaps = cols.slice(1).map((c, i) => along(c) - along(cols[i])).filter((g) => g > 0.002);
    const tol = gaps.length ? Math.min(...gaps) * 0.48 : 0.01;
    const at = (t: Tok) => {
      let best: Tok | null = null, d = Infinity;
      for (const c of cols) { const e = Math.abs(along(c) - along(t)); if (e < d) { d = e; best = c; } }
      return d <= tol ? best : null;
    };
    // Rows of numbers aligned with the mark columns.
    const rows = new Map<number, Tok[]>();
    for (const n of nums) {
      if (!at(n)) continue;
      const key = [...rows.keys()].find((k) => Math.abs(k - cross(n)) < 0.004) ?? cross(n);
      (rows.get(key) || rows.set(key, []).get(key)!).push(n);
    }
    const out: Record<string, FootingRow> = {};
    let used = 0;
    const values: number[] = [];
    for (const [pos, cells] of rows) {
      if (cells.length < Math.max(3, cols.length * 0.35)) continue;
      // Row label (L / W / H) on the same line, and the nearest section heading before it.
      // Labels and numbers use different font sizes, so their tops differ by a few points: take the nearest label.
      const lab = labels
        .filter((l) => Math.abs(cross(l) - pos) < 0.012 && !at(l))
        .sort((a, b) => Math.abs(cross(a) - pos) - Math.abs(cross(b) - pos))
        .map(labelOf)[0];
      if (!lab) continue;
      // Section heading: one whose width spans this line (a heading centred over its L/W/H columns), else the
      // nearest one before it (a heading written on its own line above its rows).
      const spanLo = (t: Tok) => (across ? t.y : t.x), spanHi = (t: Tok) => (across ? t.y : t.x + (t.w ?? 0));
      const head =
        heads.find((h) => !across && spanLo(h.t) - 0.006 <= pos && pos <= spanHi(h.t) + 0.006) ||
        heads.filter((h) => cross(h.t) <= pos + 0.006).sort((a, b) => cross(b.t) - cross(a.t))[0];
      if (!head) continue;
      for (const c of cells) {
        const m = at(c)!.text;
        const v = Number(c.text);
        const row = (out[m] ||= {});
        const box = (row[head.kind] ||= {});
        if (box[lab] === undefined) { box[lab] = v; values.push(v); }
      }
      used++;
    }
    if (used < 2) continue;
    const unit: "cm" | "m" = cmHint || values.some((v) => v >= 20) ? "cm" : "m";
    const k = unit === "cm" ? 0.01 : 1;
    for (const row of Object.values(out)) for (const kind of ["rc", "pc"] as const) {
      const b = row[kind];
      if (b) for (const d of ["L", "W", "H"] as const) if (b[d] !== undefined) b[d] = r3(b[d]! * k);
    }
    return { marks: out, unit };
  }
  return null;
}

const full = (b?: Partial<Box>): b is Box => !!b && b.L! > 0 && b.W! > 0 && b.H! > 0;

/**
 * Joins schedules with counted marks across a set of sheets and returns concrete volume lines:
 * reinforced footings, blinding under them, and columns per floor sheet. Also returns the ids of the
 * count-only candidates the volume lines replace (they stay available for review).
 */
export function scheduleVolumes(
  sheets: BlueprintSheet[],
  counted: { sheetId: string; cands: Candidate[] }[]
): { lines: { sheetId: string; cand: Candidate }[]; replaced: { sheetId: string; id: string }[]; notes: string[] } {
  const lines: { sheetId: string; cand: Candidate }[] = [];
  const replaced: { sheetId: string; id: string }[] = [];
  const notes: string[] = [];
  const code = (id: string) => sheets.find((s) => s.id === id)?.code || id;

  // Schedules can sit on any sheet of the set.
  let cols: Record<string, { b: number; h: number }> = {};
  let colSheet = "";
  let foot: ReturnType<typeof parseFootingSchedule> = null;
  let footSheet = "";
  let footSheetId = "";
  for (const sh of sheets) {
    const t = tokensOf(sh);
    const c = parseColumnSchedule(t.map((x) => x.text));
    if (Object.keys(c).length > Object.keys(cols).length) { cols = c; colSheet = sh.code; }
    const f = parseFootingSchedule(t);
    if (f && Object.keys(f.marks).length > Object.keys(foot?.marks || {}).length) { foot = f; footSheet = sh.code; footSheetId = sh.id; }
  }

  // Footings: counts from the plan(s) × schedule sizes.
  if (foot) {
    // The schedule's own header row (F1 … F20, each written once) is not a footing plan.
    if (counted.some((s) => s.sheetId === footSheetId && s.cands.some((c) => c.id === "mrk-F"))) replaced.push({ sheetId: footSheetId, id: "mrk-F" });
    for (const { sheetId, cands } of counted) {
      if (sheetId === footSheetId) continue;
      const fam = cands.find((c) => c.id === "mrk-F" && c.perMark);
      if (!fam) continue;
      let rc = 0, pc = 0;
      const rcParts: string[] = [], pcParts: string[] = [], missing: string[] = [];
      for (const [mark, n] of Object.entries(fam.perMark!).sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)))) {
        const row = foot.marks[mark];
        if (full(row?.rc)) { const v = n * row!.rc!.L * row!.rc!.W * row!.rc!.H; rc += v; rcParts.push(`${mark}×${n} (${row!.rc!.L}×${row!.rc!.W}×${row!.rc!.H})`); }
        else missing.push(mark);
        if (full(row?.pc)) { const v = n * row!.pc!.L * row!.pc!.W * row!.pc!.H; pc += v; pcParts.push(`${mark}×${n} (${row!.pc!.L}×${row!.pc!.W}×${row!.pc!.H})`); }
      }
      if (rc > 0) {
        lines.push({ sheetId, cand: {
          id: "sch-footing-rc", description: "توريد وصب خرسانة مسلحة للقواعد", category: RC_CAT, dim: "volume", unit: "م³",
          quantity: r3(rc), sources: ["mark"], confidence: missing.length ? "medium" : "high", selected: true,
          evidence: `عدد كل قاعدة من مخطط القواعد (${code(sheetId)}) × أبعادها الخرسانية من جدول القواعد (${footSheet}): ${rcParts.join("، ")}`,
          checks: missing.length ? [`قواعد بلا أبعاد في الجدول (مكتوب «as PLAN» أو غير مقروء): ${missing.join("، ")} — أضفها يدوياً`] : ["كل القواعد المعلّمة على المخطط لها أبعاد في الجدول"],
          formula: "Σ عدد × الطول × العرض × العمق", layer: "جدول القواعد",
        } });
        replaced.push({ sheetId, id: "mrk-F" });
      }
      if (pc > 0) lines.push({ sheetId, cand: {
        id: "sch-footing-pc", description: "توريد وصب خرسانة عادية (نظافة) تحت القواعد", category: RC_CAT, dim: "volume", unit: "م³",
        quantity: r3(pc), sources: ["mark"], confidence: "high", selected: true,
        evidence: `أبعاد الخرسانة العادية من جدول القواعد (${footSheet}) × عدد القواعد: ${pcParts.join("، ")}`,
        checks: [], formula: "Σ عدد × الطول × العرض × السماكة", layer: "جدول القواعد",
      } });
      if (missing.length) notes.push(`قواعد بلا أبعاد مقروءة: ${missing.join("، ")}`);
    }
  }

  // Columns: each floor sheet's marks × schedule section × assumed clear height.
  if (Object.keys(cols).length) {
    for (const { sheetId, cands } of counted) {
      const fam = cands.find((c) => c.id === "mrk-C" && c.perMark);
      if (!fam) continue;
      // The footing plan repeats the ground-floor columns as necks: those are not a floor of columns.
      if (cands.some((c) => c.id === "mrk-F")) continue;
      let area = 0, n = 0;
      const parts: string[] = [], missing: string[] = [];
      for (const [mark, k] of Object.entries(fam.perMark!).sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)))) {
        const s = cols[mark];
        if (!s) { missing.push(mark); continue; }
        area += k * s.b * s.h; n += k;
        parts.push(`${mark}×${k} (${s.b}×${s.h})`);
      }
      if (!(area > 0)) continue;
      const H = DEFAULT_COLUMN_HEIGHT;
      lines.push({ sheetId, cand: {
        id: "sch-columns", description: `توريد وصب خرسانة مسلحة للأعمدة — ${code(sheetId)} (${n} عمود)`, category: RC_CAT, dim: "volume", unit: "م³",
        quantity: r3(area * H), sources: ["mark"], confidence: "medium", selected: true,
        evidence: `أعمدة اللوحة ${code(sheetId)} × مقاطعها من جدول الأعمدة (${colSheet}) × ارتفاع ${H} م: ${parts.join("، ")}`,
        checks: [`الارتفاع ${H} م افتراضي لعدم وجود مناسيب مكتوبة؛ عدّل الكمية = ${r3(area)} م² × الارتفاع الفعلي`, ...(missing.length ? [`أعمدة بلا مقطع في الجدول: ${missing.join("، ")}`] : [])],
        formula: `Σ عدد × مساحة المقطع (${r3(area)} م²) × ${H} م`, layer: "جدول الأعمدة", count: n, height: H, review: true,
      } });
      replaced.push({ sheetId, id: "mrk-C" });
    }
  }
  return { lines, replaced, notes };
}
