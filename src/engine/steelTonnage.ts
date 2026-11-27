import { BlueprintSheet } from "../types";
import { Candidate } from "./candidate";
import { kgPerMetre } from "../utils/steelWeights";
import { purlinKgPerMetre } from "../utils/purlinLines";
import { RULES, r2 as rr2, basePlateKg, anchorBoltKg, pedestalM3, bracingMetres } from "./steelRules";

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
 * Steel weight and envelope from what the drawing says: section names (IPE600 …) × the standard kg/m × lengths taken
 * from the drawing (eave and ridge levels from the elevation next to the anchor plan, overall size from the plan).
 * Each anchor-bolt plan is one building: its column counts become tonnage, and where portal frames are confirmed the
 * rafters follow; roof sheeting and block-wall areas are added for the same building. Everything is a line the person
 * reviews, never a silent total.
 */
export function steelTonnage(
  sheets: BlueprintSheet[],
  counted: { sheetId: string; cands: Candidate[] }[]
): { lines: { sheetId: string; cand: Candidate }[]; replaced: { sheetId: string; id: string }[]; notes: string[] } {
  const lines: { sheetId: string; cand: Candidate }[] = [];
  const replaced: { sheetId: string; id: string }[] = [];
  const notes: string[] = [];
  const code = (id: string) => sheets.find((s) => s.id === id)?.code || id;
  const line = (sheetId: string, c: Candidate) => lines.push({ sheetId, cand: c });
  const pedestals = counted.flatMap((q) => q.cands).filter((c) => /^mrk-PD/.test(c.id)).map((c) => c.quantity);
  const anchors = counted.filter((x) => x.cands.some((c) => /^mrk-col-/.test(c.id) && c.selected));
  const NAMES = ["", "المبنى الثاني", "المبنى الثالث", "المبنى الرابع"];

  // Purlin spacing measured on the first building that has a drawn family; later buildings reuse it as an estimate.
  let measuredSpacing: number | null = null;
  anchors.forEach((x, bi) => {
    const idx = sheets.findIndex((q) => q.id === x.sheetId);
    const sheet0 = sheets[idx];
    const window = sheets.slice(Math.max(idx, 0), idx + 5);
    // The elevation that follows the anchor plan gives this building's levels; else any elevation in the set.
    let levels: { eave: number; ridge: number } | null = null;
    for (const w of window) { levels = readLevels([w]); if (levels) break; }
    levels = levels || readLevels(sheets);
    if (!levels) { notes.push(`لا مناسيب ارتفاع مكتوبة (+8000 …) قرب لوحة ${code(x.sheetId)}: بقيت أعمدتها بالعدد.`); return; }
    const { eave, ridge } = levels;
    // A sheet with a mezzanine plan: the lowest level is the mezzanine slab, so columns run to the top level and the
    // envelope shape is unknown.
    const mezz = !!sheet0 && textsOf(sheet0).some((q) => /MEZZANINE/i.test(q));
    const colH = mezz ? ridge : eave;
    const bname = bi === 0 ? "" : NAMES[bi] || `المبنى ${bi + 1}`;
    const tag = bi === 0 ? "" : `-b${bi + 1}`;
    const sheet = sheets.find((q) => q.id === x.sheetId);
    const size = sheet ? overall(sheet) : null;
    const frames = x.cands.find((c) => c.id === "mrk-frames" && c.selected);
    const cols = x.cands.filter((c) => /^mrk-col-/.test(c.id) && c.selected);
    const total = cols.reduce((a, c) => a + c.quantity, 0);

    for (const c of cols) {
      const sec = c.id.replace(/^mrk-col-/, "");
      const kg = kgPerMetre(sec);
      if (!kg) continue;
      const tons = r2((c.quantity * colH * kg) / 1000);
      replaced.push({ sheetId: x.sheetId, id: c.id });
      line(x.sheetId, {
        id: `stl-col-${sec}${tag}`, description: `حديد أعمدة ${sec} (${c.quantity} عمود${bname ? "، " + bname : ""})`,
        category: STEEL_CAT, dim: "count", unit: "طن", quantity: tons, count: 1, sources: ["mark"], confidence: "medium", selected: true, review: true,
        evidence: `عدد الأعمدة ${c.quantity} من مخطط براغي التثبيت ${code(x.sheetId)}، ${mezz ? "أعلى منسوب" : "ارتفاع الحافة"} +${colH * 1000} من الواجهة، ووزن ${sec} القياسي ${kg} كجم/م`,
        checks: [bi === 0 ? "طول العمود = منسوب الحافة؛ تُنقص الصفائح والوصلات"
          : `أعمدة اللوحة ${total}${pedestals.length ? ` وأعناق القواعد المقروءة في الملف ${pedestals.join(" و")}` : ""}: إن اختلفت فقد تكون قواعد هذا المبنى في لوحة غير مرفوعة. ${mezz ? "فيه ميزانين: الطول أعلى منسوب مكتوب والأعمدة قد تُقسَم عند الميزانين" : "طول العمود = منسوب الحافة"}`],
        formula: `${c.quantity} × ${colH} × ${kg} ÷ 1000`, layer: "أعمدة",
      });
    }

    const slope = size && !mezz ? Math.hypot(size.W / 2, ridge - eave) : 0;
    if (frames && size && !mezz) {
      const tally = new Map<string, number>();
      for (const w of window) {
        const t = textsOf(w);
        if (t.some((q) => /ANCHOR\s?BOLTS?\s?PLAN|MEZZANINE/i.test(q))) continue;
        if (t.filter((q) => /^ZZ\d/.test(q)).length < 3) continue;
        for (const q of t) if (/^IPE\d{3}$/.test(q)) tally.set(q, (tally.get(q) || 0) + 1);
      }
      const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      const kg = best ? kgPerMetre(best[0]) : null;
      if (best && kg) {
        replaced.push({ sheetId: x.sheetId, id: "mrk-frames" });
        line(x.sheetId, {
          id: `stl-rafters${tag}`, description: `حديد رفترات الجملونات ${best[0]} (${frames.quantity} إطار)`,
          category: STEEL_CAT, dim: "count", unit: "طن", quantity: r2((frames.quantity * 2 * slope * kg) / 1000), count: 1, sources: ["mark"], confidence: "medium", selected: true, review: true,
          evidence: `${frames.quantity} إطاراً، العرض ${size.W} م والقمة +${ridge * 1000} والحافة +${eave * 1000} من الواجهة، والمقطع الأكثر كتابة على لوحات السقف ${best[0]} (${best[1]} مرة)`,
          checks: ["قد يختلف مقطع الرفتر عند الركبة (Haunch) أو القمة؛ راجع مقاطع الإطار في لوحة التفاصيل"],
          formula: `${frames.quantity} × 2 × ${r2(slope)} × ${kg} ÷ 1000`, layer: "جملونات",
        });
      }
    }
    let nPurlins = 0;
    if (size && !mezz) {
      // Purlins: the evenly spaced long lines drawn on the roof/main-system plan × the building length × the profile's kg/m.
      const ZZ = (w: BlueprintSheet) => { const m = new Map<string, number>(); for (const q of textsOf(w)) if (/^ZZ?\d{3}-\d/i.test(q)) m.set(q, (m.get(q) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; };
      const planSheet = window.find((w) => !!w.pdfVector?.purlinLines && textsOf(w).some((q) => /(MAIN SYSTEM|ROOF) PLAN/i.test(q)) && !textsOf(w).some((q) => /ELEVATION/i.test(q)) && !!ZZ(w));
      const tagSheet = planSheet || window.find((w) => !!ZZ(w));
      const tag = tagSheet ? ZZ(tagSheet) : undefined;
      const kgz = tag ? purlinKgPerMetre(tag) : null;
      if (tag && kgz) {
        const pl = planSheet?.pdfVector?.purlinLines;
        let n = 0, measured = false;
        if (pl) { n = pl.count; measured = true; if (!measuredSpacing && n > 1) measuredSpacing = size.W / (n - 1); }
        else if (measuredSpacing) n = Math.round(size.W / measuredSpacing) + 1;
        nPurlins = n;
        if (n > 0) line(x.sheetId, {
          id: `stl-purlins${bi === 0 ? "" : "-b" + (bi + 1)}`, description: `حديد مدادات ${tag} (${n} خط${bname ? "، " + bname : ""})`,
          category: STEEL_CAT, dim: "count", unit: "طن", quantity: r2((n * size.L * kgz) / 1000), count: 1, sources: ["mark"], confidence: measured ? "medium" : "low", selected: measured, review: true,
          evidence: measured
            ? `خطوط المدادات المرسومة على مخطط السقف ${code(planSheet!.id)}: ${n} خطاً متوازياً بتباعد منتظم، تمتد بطول المبنى ${size.L} م، ووزن ${tag} حسب أبعاد القطاع ${kgz} كجم/م`
            : `لا خطوط مدادات مرسومة على لوحات هذا المبنى: العدد تقدير ${n} خطاً بنفس تباعد المبنى الأول (≈${r2(measuredSpacing || 0)} م) على عرض ${size.W} م`,
          checks: [measured ? "لا يشمل التراكب عند الإطارات ولا مدادات الحواف إن كانت خارج العائلة المنتظمة" : "تقدير غير مقروء من المخطط، فراجع عدد الخطوط ثم حدّد البند"],
          formula: `${n} × ${size.L} × ${kgz} ÷ 1000`, layer: "مدادات",
        });
      }
    }
    if (size && !mezz) {
      const roofArea = r2(2 * size.L * slope);
      line(x.sheetId, {
        id: `stl-roofclad${tag}`, description: bname ? `تكسية سقف ${bname} (الشنكو)` : "تكسية السقف (الشنكو)",
        category: STEEL_CAT, dim: "area", unit: "م²", quantity: roofArea, sources: ["mark"], confidence: "medium", selected: true, review: true,
        evidence: `الطول ${size.L} م والعرض ${size.W} م من أبعاد المخطط، والحافة +${eave * 1000} والقمة +${ridge * 1000} من الواجهة؛ سقف بمنحدرين متماثلين بلا خصم فتحات أو بروز`,
        checks: ["الجدران بلوك فلا تكسية جدران؛ أضف الجدران المكسوة من حاسبة التكسية إن وجدت"],
        formula: `2 × ${size.L} × ${r2(slope)}`, layer: "تكسية",
      });
      // Gross wall area of the envelope (two long sides to the eave, two gables up to the ridge); openings unknown.
      const rise = ridge - eave;
      const walls = r2(2 * size.L * eave + 2 * (size.W * eave + 0.5 * size.W * rise));
      line(x.sheetId, {
        id: `stl-blockwalls${tag}`, description: bname ? `جدران بلوك ${bname} (إجمالي قبل خصم الفتحات)` : "جدران بلوك (إجمالي قبل خصم الفتحات)",
        category: "أعمال البناء", dim: "area", unit: "م²", quantity: walls, sources: ["mark"], confidence: "low", selected: false, review: true,
        evidence: `محيط المبنى × ارتفاع الحافة +${eave * 1000} مع جملونات الجبهتين حتى القمة +${ridge * 1000}، من الطول ${size.L} م والعرض ${size.W} م`,
        checks: ["الفتحات (أبواب ونوافذ وبوابات) غير محسومة فلا تُخصم، والجدران قد تكون جزئية الارتفاع؛ حدّد البند بعد المراجعة"],
        formula: `2 × ${size.L} × ${eave} + 2 × (${size.W} × ${eave} + ½ × ${size.W} × ${r2(rise)})`, layer: "جدران",
      });
      line(x.sheetId, {
        id: `stl-blockwalls-net${tag}`, description: bname ? `جدران بلوك ${bname} (صافي بعد خصم الفتحات ${RULES.openingsPct}٪)` : `جدران بلوك (صافي بعد خصم الفتحات ${RULES.openingsPct}٪)`,
        category: "أعمال البناء", dim: "area", unit: "م²", quantity: r2(walls * (1 - RULES.openingsPct / 100)), sources: ["mark"], confidence: "low", selected: false, review: true,
        evidence: `الإجمالي ${walls} م² ناقص نسبة فتحات تقديرية ${RULES.openingsPct}٪ (أبواب وبوابات ونوافذ)`, checks: ["النسبة تقديرية؛ عدّلها حسب الفتحات الفعلية"],
        formula: `${walls} × (1 − ${RULES.openingsPct}٪)`, layer: "جدران",
      });
    }

    // ---- Rule-based items (not printed on the drawing): computed by the estimator's method, never pre-selected ----
    const R = RULES;
    const est = (id: string, description: string, category: string, unit: string, quantity: number, formula: string, evidence: string, layer: string, dim: "count" | "area" | "volume" | "length" = "count") =>
      line(x.sheetId, { id: id + tag, description: bname ? `${description} (${bname})` : description, category, dim, unit, quantity: rr2(quantity), count: 1, sources: ["mark"], confidence: "low", selected: false, review: true, evidence, checks: ["تقدير بطريقة حساب المقاول وليس قراءة من المخطط؛ عدّل المعاملات أو تجاهله إن عندك قائمة مواد"], formula, layer } as Candidate);
    // Columns by section (the heaviest section is taken as the portal-frame column).
    const secs = cols.map((c) => ({ sec: c.id.replace(/^mrk-col-/, ""), n: c.quantity })).filter((c) => kgPerMetre(c.sec));
    const main = secs.sort((a, b) => (kgPerMetre(b.sec) || 0) - (kgPerMetre(a.sec) || 0))[0];
    // Rafters when no frame count was read: frames = heavy-section columns ÷ 2, rafter section = that column section.
    if (main && size && !mezz && !frames && main.n >= 4) {
      const kg = kgPerMetre(main.sec)!;
      const fr = Math.floor(main.n / 2);
      est(`stl-rafters-est`, `حديد رفترات ${main.sec} (${fr} إطار، تقدير)`, STEEL_CAT, "طن", (fr * 2 * slope * kg) / 1000,
        `${fr} × 2 × ${rr2(slope)} × ${kg} ÷ 1000`, `عدد الأعمدة ${main.sec} = ${main.n} فكل عمودين إطار، وطول الرفتر من عرض المبنى ${size.W} م والمناسيب +${eave * 1000}/+${ridge * 1000}؛ مقطع الرفتر = مقطع العمود`, "جملونات", "count");
    }
    const bays = frames ? frames.quantity - 1 : main && main.n >= 4 ? Math.floor(main.n / 2) - 1 : 0;
    if (size && !mezz && bays >= 2) {
      const bm = bracingMetres({ L: size.L, W: size.W, eave, slope, bays, purlinLines: nPurlins || 0 });
      const shsTag = sheets.slice(Math.max(idx, 0), idx + 5).flatMap(textsOf).find((q) => /^SHS\d+x\d+/i.test(q));
      const shsKg = shsTag ? kgPerMetre(shsTag.replace(/\s/g, "")) : null;
      const bkg = shsKg || R.braceKgPerM;
      const bname2 = shsKg ? shsTag!.toUpperCase() : "Ø20";
      est("stl-bracing", `حديد تكتيف سقف وجدران ${bname2} (${bm.nb} باي مكتّف)`, STEEL_CAT, "طن", ((bm.roofDiag + bm.wallDiag) * bkg) / 1000,
        `(${rr2(bm.roofDiag)} + ${rr2(bm.wallDiag)}) × ${bkg} ÷ 1000`, `X في كل باي طرفي وكل ${R.braceEveryBays} بايات: ${bm.nb} باي، طول الباي ${rr2(bm.bay)} م`, "تكتيف");
      est("stl-sagrods", `حديد قضبان تعليق المدادات Ø12 (${bm.rows} صف/باي)`, STEEL_CAT, "طن", (bm.sag * R.sagRodKgPerM) / 1000,
        `${bays} باي × ${bm.rows} × 2 × ${rr2(slope)} × 1.05 × ${R.sagRodKgPerM} ÷ 1000`, `صف إلى صفين في كل باي على المنحدرين`, "قضبان");
    }
    // Base plates + anchor bolts + pedestal concrete and rebar, per column section.
    let bp = 0, ab = 0, pdM3 = 0, nc = 0;
    for (const c of cols) {
      const sec = c.id.replace(/^mrk-col-/, "");
      const w = basePlateKg(sec), v = pedestalM3(sec);
      if (!w || !v) continue;
      bp += w * c.quantity; ab += anchorBoltKg() * c.quantity; pdM3 += v * c.quantity; nc += c.quantity;
    }
    if (nc) {
      est("stl-baseplates", `بليتات قواعد الأعمدة (${nc} بليتة، ${R.basePlateThkMm} مم)`, STEEL_CAT, "طن", bp / 1000, `Σ (عمق+${2 * R.basePlateMarginMm}) × (عرض+${2 * R.basePlateMarginMm}) × ${R.basePlateThkMm} مم × 7850`, `بليتة لكل عمود، الأبعاد من مقطع العمود زائد هامش ${R.basePlateMarginMm} مم لكل جهة`, "بليتات");
      est("stl-anchorbolts", `براغي تثبيت M${R.anchorBoltDiaMm} (${nc * R.anchorBoltsPerCol} برغي)`, STEEL_CAT, "طن", ab / 1000, `${nc} × ${R.anchorBoltsPerCol} × ${R.anchorBoltLenM} م × ${rr2(0.00617 * R.anchorBoltDiaMm ** 2)} كجم/م`, `${R.anchorBoltsPerCol} براغي لكل عمود`, "براغي");
      est("stl-pedestals", `خرسانة أعناق القواعد (${nc} عنق، تقدير)`, "أعمال الخرسانة", "م³", pdM3, `Σ (عمق+${2 * R.pedestalMarginM}) × (عرض+${2 * R.pedestalMarginM}) × ${R.pedestalHeightM} م`, `عنق لكل عمود بأبعاد مقطع العمود زائد ${R.pedestalMarginM} م لكل جهة وبارتفاع ${R.pedestalHeightM} م`, "أعناق", "volume");
      est("stl-pedestalrebar", `حديد تسليح أعناق القواعد`, "أعمال الخرسانة", "طن", (pdM3 * R.rebarKgPerM3) / 1000, `${rr2(pdM3)} م³ × ${R.rebarKgPerM3} كجم/م³ ÷ 1000`, `نسبة تسليح تقديرية ${R.rebarKgPerM3} كجم/م³`, "تسليح");
    }
  });
  if (lines.length) notes.push("التكتيف وقضبان التعليق والبليتات والبراغي وأعناق القواعد بقواعد حساب المقاول (تقدير غير محدد مسبقاً).");
  return { lines, replaced, notes };
}
