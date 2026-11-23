import { TakeoffItem } from "../types";

/**
 * Rank used to order BOQ lines in real site-execution sequence:
 * excavation → blinding → footings → necks/ground beams → slab on grade → RC frame → rebar
 * → steel structure (columns → rafters → purlins → plates) → cladding → masonry → insulation
 * → doors → finishes → MEP.
 *
 * The item's trade category decides first; description keywords only refine the order inside
 * categories where the sequence is ambiguous (concrete, steel, miscellaneous). This prevents e.g.
 * a roof-cladding line ("شينكو سقف") from being ranked as roof concrete.
 */
export function getSiteExecutionRank(item: TakeoffItem): number {
  const cat = item.category || "";
  const txt = `${item.itemCode || ""} ${item.description || ""} ${item.location || ""}`.toLowerCase();

  // Categories with a single position in the sequence.
  if (cat.includes("حفر")) return 10;
  if (cat.includes("بانل") || cat.includes("كلادينج")) return 90;
  if (cat.includes("مباني") || cat.includes("بلوك")) return 100;
  if (cat.includes("عزل")) return 110;
  if (cat.includes("أبواب") || cat.includes("شبابيك")) return 120;
  if (cat.includes("بياض")) return 130;
  if (cat.includes("أرضيات") || cat.includes("رخام")) return 140;
  if (cat.includes("دهانات")) return 150;
  if (cat.includes("صحي")) return 160;
  if (cat.includes("كهرباء")) return 170;
  if (cat.includes("تكييف")) return 180;
  if (cat.includes("تسليح")) return 70;

  if (cat.includes("هياكل") || cat.includes("معدن")) {
    if (/عمود|عمدان|أعمدة|sc\d|st_col|steel_col|h_col/.test(txt)) return 80;
    if (/رافتر|جملون|rafter|truss|ipe|heb|hea|أبيام|ابيام|أيبيم|ايبيم/.test(txt)) return 82;
    if (/تيوب|مدادات|tube|shs|rhs|purlin|girt/.test(txt)) return 85;
    if (/بيس|بليت|جاويط|plate|anchor|bolt/.test(txt)) return 88;
    return 89;
  }

  // Concrete / miscellaneous: refine by description.
  if (/حفر|ردم|excav|backfill/.test(txt)) return 10;
  if (/نظافة|نظافه|خرسانة عادية|blinding|lean/.test(txt)) return 20;
  if (/قاعدة|قواعد|footing|fnd|found/.test(txt)) return 30;
  if (/رقاب|رقبة|neck|pedestal/.test(txt)) return 35;
  if (/ميدة|ميده|ميدات|mida|ground_beam|grade_beam|tie_beam|gb\d|tb\d/.test(txt)) return 40;
  if (/أرضية|ارضية|sog|slab_on_grade|ground_slab|floor_slab|floor_conc/.test(txt)) return 45;
  if (cat.includes("خرسان")) {
    if (/عمود|أعمدة|عمدان|col/.test(txt)) return 50;
    if (/كمرة|كمرات|beam/.test(txt)) return 55;
    return 60;
  }
  if (/سقف|بلاطة|slab|roof/.test(txt)) return 60;
  if (/تسليح|rebar|ø|سيخ/.test(txt)) return 70;
  return 200;
}

export function sortItemsBySiteExecutionOrder(items: TakeoffItem[]): TakeoffItem[] {
  return items
    .map((item, order) => ({ item, order, rank: getSiteExecutionRank(item) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((x) => x.item);
}
