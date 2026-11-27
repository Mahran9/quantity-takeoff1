import { BlueprintSheet } from "../types";
import { Candidate } from "./candidate";
import { kgPerMetre } from "../utils/steelWeights";

const STEEL_CAT = "أعمال الهياكل المعدنية والهناجر";
const r2 = (n: number) => Math.round(n * 100) / 100;

const textsOf = (s: BlueprintSheet) => (s.visualTokens || []).filter((t) => t.source === "pdf_text").map((t) => t.text.trim());

/** Levels written on elevations as «+8000», «+9000» (mm above the base). Eave = the lower roof level, ridge = the top. */
export function readLevels(sheets: BlueprintSheet[]): { eave: number; ridge: number } | null {
  const count = new Map<number, number>();
  for (const s of sheets) for (const t of textsOf(s)) {
    const m = /^\+\s?(\d{3,5})$/.exec(t);
    if (m && +m[1] > 0) count.set(+m[1], (count.get(+m[1]) || 0) + 1);
  }
  const lv = [...count.entries()].filter(([, n]) => n >= 2).map(([v]) => v).sort((a, b) => b - a);
  if (lv.length < 2) return null;
  return { eave: lv[1] / 1000, ridge: lv[0] / 1000 };
}

/** Overall plan size: the two biggest dimension numbers on the sheet (e.g. 69780 and 29800). */
function overall(s: BlueprintSheet): { L: number; W: number } | null {
  const n = textsOf(s).filter((t) => /^\d{5,6}$/.test(t)).map(Number).sort((a, b) => b - a);
  const uniq = [...new Set(n)];
  return uniq.length >= 2 ? { L: uniq[0] / 1000, W: uniq[1] / 1000 } : null;
}

/**
 * Steel weight from what the drawing says: section names (IPE600 …) × the standard kg/m × lengths taken from the
 * drawing (eave level from the elevation, frame span from the plan). Column and frame count lines become tonnage
 * lines; the weights are lines the person reviews, never silent totals.
 */
export function steelTonnage(
  sheets: BlueprintSheet[],
  counted: { sheetId: string; cands: Candidate[] }[]
): { lines: { sheetId: string; cand: Candidate }[]; replaced: { sheetId: string; id: string }[]; notes: string[] } {
  const lines: { sheetId: string; cand: Candidate }[] = [];
  const replaced: { sheetId: string; id: string }[] = [];
  const notes: string[] = [];
  const levels = readLevels(sheets);
  const code = (id: string) => sheets.find((s) => s.id === id)?.code || id;
  const framesAt = counted.find((x) => x.cands.some((c) => c.id === "mrk-frames" && c.selected));
  const frames = framesAt?.cands.find((c) => c.id === "mrk-frames");
  if (!levels) {
    if (counted.some((x) => x.cands.some((c) => /^mrk-col-/.test(c.id))))
      notes.push("لا مناسيب ارتفاع مكتوبة (+8000 …) في اللوحات: بقيت الأعمدة بالعدد.");
    return { lines, replaced, notes };
  }
  const { eave, ridge } = levels;
  const line = (sheetId: string, c: Candidate) => lines.push({ sheetId, cand: c });

  const colsOn = (id: string) => (counted.find((q) => q.sheetId === id)?.cands || []).filter((c) => /^mrk-col-/.test(c.id) && c.selected).reduce((a, c) => a + c.quantity, 0);
  const pedestals = counted.flatMap((q) => q.cands).filter((c) => /^mrk-PD/.test(c.id)).map((c) => c.quantity);
  for (const x of counted) for (const c of x.cands) {
    const m = /^mrk-col-(.+)$/.exec(c.id);
    if (!m || !c.selected) continue;
    const kg = kgPerMetre(m[1]);
    if (!kg) continue;
    const main = x.sheetId === framesAt?.sheetId;
    const tons = r2((c.quantity * eave * kg) / 1000);
    replaced.push({ sheetId: x.sheetId, id: c.id });
    line(x.sheetId, {
      id: `stl-col-${m[1]}`, description: `حديد أعمدة ${m[1]} (${c.quantity} عمود${main ? "" : "، المبنى الثاني"})`,
      category: STEEL_CAT, dim: "count", unit: "طن", quantity: tons, count: 1, sources: ["mark"], confidence: "medium", selected: main, review: true,
      evidence: `عدد الأعمدة ${c.quantity} من مخطط براغي التثبيت، ارتفاع الحافة +${eave * 1000} من الواجهة، ووزن ${m[1]} القياسي ${kg} كجم/م`,
      checks: [main ? "طول العمود = منسوب الحافة؛ تُنقص الصفائح والوصلات" : `مبنى/منطقة غير الهنجر الرئيسي: الارتفاع مفترض بمنسوب الحافة، فتحقق منه ثم حدّد البند. أعمدة اللوحة ${colsOn(x.sheetId)}${pedestals.length ? ` بينما أعناق القواعد المقروءة في الملف ${pedestals.join(" و")}` : ""}: إن اختلفت فقد تكون قواعد هذا المبنى في لوحة غير مرفوعة`],
      formula: `${c.quantity} × ${eave} × ${kg} ÷ 1000`, layer: "أعمدة",
    });
  }

  if (frames && framesAt) {
    const sh = sheets.find((s) => s.id === framesAt.sheetId);
    const size = sh ? overall(sh) : null;
    // Rafter section = the most written rolled section on roof/framing sheets (not anchor or mezzanine plans).
    const tally = new Map<string, number>();
    for (const s of sheets) {
      const t = textsOf(s);
      if (t.some((q) => /ANCHOR\s?BOLTS?\s?PLAN|MEZZANINE/i.test(q))) continue;
      if (t.filter((q) => /^ZZ\d/.test(q)).length < 3) continue;
      for (const q of t) if (/^IPE\d{3}$/.test(q)) tally.set(q, (tally.get(q) || 0) + 1);
    }
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const kg = best ? kgPerMetre(best[0]) : null;
    if (size && best && kg) {
      const slope = Math.hypot(size.W / 2, ridge - eave);
      const tons = r2((frames.quantity * 2 * slope * kg) / 1000);
      replaced.push({ sheetId: framesAt.sheetId, id: "mrk-frames" });
      line(framesAt.sheetId, {
        id: "stl-rafters", description: `حديد رفترات الجملونات ${best[0]} (${frames.quantity} إطار)`,
        category: STEEL_CAT, dim: "count", unit: "طن", quantity: tons, count: 1, sources: ["mark"], confidence: "medium", selected: true, review: true,
        evidence: `${frames.quantity} إطاراً، العرض ${size.W} م والقمة +${ridge * 1000} والحافة +${eave * 1000} من الواجهة، والمقطع الأكثر كتابة على لوحات السقف ${best[0]} (${best[1]} مرة)`,
        checks: ["قد يختلف مقطع الرفتر عند الركبة (Haunch) أو القمة؛ راجع مقاطع الإطار في لوحة التفاصيل"],
        formula: `${frames.quantity} × 2 × ${r2(slope)} × ${kg} ÷ 1000`, layer: "جملونات",
      });
    }
  }
  if (frames && framesAt) {
    const sh = sheets.find((x) => x.id === framesAt.sheetId);
    const size = sh ? overall(sh) : null;
    if (size) {
      const slope = Math.hypot(size.W / 2, ridge - eave);
      const area = r2(2 * size.L * slope);
      line(framesAt.sheetId, {
        id: "stl-roofclad", description: "تكسية السقف (الشنكو)",
        category: STEEL_CAT, dim: "area", unit: "م²", quantity: area, sources: ["mark"], confidence: "medium", selected: true, review: true,
        evidence: `الطول ${size.L} م والعرض ${size.W} م من أبعاد المخطط، والحافة +${eave * 1000} والقمة +${ridge * 1000} من الواجهة؛ مساحة المنحدرين بلا خصم فتحات أو بروز`,
        checks: ["الجدران بلوك فلا تكسية جدران؛ أضف الجدران المكسوة من حاسبة التكسية إن وجدت"],
        formula: `2 × ${size.L} × ${r2(slope)}`, layer: "تكسية",
      });
    }
  }
  if (frames && framesAt) {
    const sh = sheets.find((x) => x.id === framesAt.sheetId);
    const size = sh ? overall(sh) : null;
    if (size) {
      // Gross wall area of the hangar envelope (two long sides to the eave, two gables up to the ridge); openings unknown.
      const rise = ridge - eave;
      const walls = r2(2 * size.L * eave + 2 * (size.W * eave + 0.5 * size.W * rise));
      line(framesAt.sheetId, {
        id: "stl-blockwalls", description: "جدران بلوك (إجمالي قبل خصم الفتحات)",
        category: "أعمال البناء", dim: "area", unit: "م²", quantity: walls, sources: ["mark"], confidence: "low", selected: false, review: true,
        evidence: `محيط المبنى × ارتفاع الحافة +${eave * 1000} مع جملونات الجبهتين حتى القمة +${ridge * 1000}، من الطول ${size.L} م والعرض ${size.W} م`,
        checks: ["الفتحات (أبواب ونوافذ وبوابات) غير محسومة فلا تُخصم، والجدران قد تكون جزئية الارتفاع؛ حدّد البند بعد المراجعة"],
        formula: `2 × ${size.L} × ${eave} + 2 × (${size.W} × ${eave} + ½ × ${size.W} × ${r2(rise)})`, layer: "جدران",
      });
    }
  }
  if (lines.length) notes.push("المدادات والتكتيف وقضبان التعليق بلا أطوال مكتوبة في اللوحات، فلم تدخل في الأطنان.");
  return { lines, replaced, notes };
}
