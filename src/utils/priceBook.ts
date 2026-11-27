import { TakeoffItem } from "../types";

/** A saved unit price for one kind of item, with the earlier prices kept so any of them can be brought back. */
export interface PriceEntry {
  id: string;
  name: string;
  unit: string;
  price: number;
  updatedAt: string;
  history: { price: number; at: string }[];
}
export type RateGroup = "concrete" | "rebar" | "frame" | "purlin" | "cladding";
export type LaborBasis = "m3" | "ton" | "m2" | "lump";
export interface LaborRate { price: number; basis: LaborBasis; }
/** One price for a whole group of lines: every concrete line, every rebar line, the three steel-frame groups, and the two labour lines. */
export interface Rates { concrete?: number; rebar?: number; frame?: number; purlin?: number; cladding?: number; laborBone?: LaborRate; laborSteel?: LaborRate; }
export interface PriceBook { entries: PriceEntry[]; autoFill: boolean; rates?: Rates; }
export const LABOR_CATEGORY = "أعمال الأجور (شغل اليد)";

const KEY = "qto_pricebook_v1";
const r2 = (n: number) => Math.round(n * 100) / 100;

/** What makes two descriptions the same kind of item: no dimensions in brackets, no member codes (C1, B2, PD3). */
export function coreName(desc: string): string {
  return (desc || "")
    .replace(/[\(\[（][^\)\]）]*[\)\]）]/g, " ")
    .replace(/\b[A-Za-z]{1,2}\d{1,3}\b/g, " ")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[×xX*]/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(?:[×xX*]\s*\d+(?:[.,]\d+)?\s*)+/g, " ")
    .replace(/[\-–—_/\\,:;،؛.+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export const keyOf = (name: string, unit: string) => `${coreName(name).toLowerCase()}|${(unit || "").trim()}`;

export function emptyBook(): PriceBook { return { entries: [], autoFill: true }; }

export function loadBook(): PriceBook {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyBook();
    const b = JSON.parse(raw);
    return { entries: Array.isArray(b.entries) ? b.entries : [], autoFill: b.autoFill !== false, rates: b.rates && typeof b.rates === "object" ? b.rates : {} };
  } catch { return emptyBook(); }
}
export function saveBook(b: PriceBook) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* storage full or blocked */ } }

export function upsertPrice(book: PriceBook, name: string, unit: string, price: number, at = new Date().toISOString()): PriceBook {
  const k = keyOf(name, unit);
  const i = book.entries.findIndex((e) => keyOf(e.name, e.unit) === k);
  if (i < 0) {
    const e: PriceEntry = { id: `pb-${Date.now()}-${book.entries.length}`, name: coreName(name) || name.trim(), unit: unit.trim(), price: r2(price), updatedAt: at, history: [] };
    return { ...book, entries: [...book.entries, e] };
  }
  const old = book.entries[i];
  if (r2(price) === r2(old.price)) return book;
  const next = { ...old, price: r2(price), updatedAt: at, history: [{ price: old.price, at: old.updatedAt }, ...old.history].slice(0, 20) };
  return { ...book, entries: book.entries.map((e, j) => (j === i ? next : e)) };
}

/** Save the priced items of a project as entries; where two items share a kind, the last price wins. */
export function entriesFromItems(book: PriceBook, items: TakeoffItem[]): { book: PriceBook; added: number; updated: number } {
  let b = book, added = 0, updated = 0;
  for (const it of items) {
    if (it.reviewStatus === "rejected" || !(it.unitPrice > 0) || !it.unit) continue;
    const had = b.entries.find((e) => keyOf(e.name, e.unit) === keyOf(it.description, it.unit));
    const nb = upsertPrice(b, it.description, it.unit, it.unitPrice);
    if (nb !== b) { had ? updated++ : added++; b = nb; }
  }
  return { book: b, added, updated };
}

/** Put saved prices on matching items: 'empty' fills only unpriced items, 'all' also replaces existing prices. */
export function applyBook(items: TakeoffItem[], book: PriceBook, mode: "empty" | "all"): { items: TakeoffItem[]; changed: number } {
  const map = new Map(book.entries.map((e) => [keyOf(e.name, e.unit), e.price]));
  let changed = 0;
  const out = items.map((it) => {
    if (it.reviewStatus === "rejected") return it;
    const g = groupOf(it);
    const rate = g ? book.rates?.[g] : undefined;
    const p = rate && rate > 0 ? rate : map.get(keyOf(it.description, it.unit));
    if (!(p && p > 0)) return it;
    if (mode === "empty" && it.unitPrice > 0) return it;
    if (it.unitPrice === p) return it;
    changed++;
    return { ...it, unitPrice: p, totalPrice: r2((Number(it.quantity) || 0) * p) };
  });
  return { items: out, changed };
}


/** Which one-price group a line belongs to (null: priced on its own). */
export function groupOf(it: TakeoffItem): RateGroup | null {
  const cat = it.category || "", d = it.description || "", u = (it.unit || "").trim();
  if (cat === LABOR_CATEGORY) return null;
  const steelCat = /هياكل|معدن/.test(cat);
  if (u === "طن" && /تسليح|rebar/i.test(`${cat} ${d}`) && !steelCat) return "rebar";
  if (u === "طن" && steelCat) return /مداد|purlin|ZZ\d/i.test(d) ? "purlin" : "frame";
  if (u === "م²" && /تكسية|شنكو|clad|sheeting/i.test(`${cat} ${d}`)) return "cladding";
  if (u === "م³" && !steelCat && (/خرسان/.test(cat) || /خرسانة|قواعد|أعناق|رقاب|ميدة|ميدات|كمرات|بلاطة/.test(d))) return "concrete";
  return null;
}

const sumBy = (items: TakeoffItem[], g: RateGroup[]) =>
  r2(items.filter((i) => i.reviewStatus !== "rejected" && g.includes(groupOf(i) as RateGroup)).reduce((a, i) => a + (Number(i.quantity) || 0), 0));

export const LABOR_BASES: Record<"bone" | "steel", { id: LaborBasis; label: string; unit: string }[]> = {
  bone: [{ id: "m3", label: "لكل م³ خرسانة", unit: "م³" }, { id: "ton", label: "لكل طن حديد تسليح", unit: "طن" }, { id: "lump", label: "مقطوعية", unit: "مقطوعية" }],
  steel: [{ id: "ton", label: "لكل طن حديد الهيكل", unit: "طن" }, { id: "m2", label: "لكل م² شنكو", unit: "م²" }, { id: "lump", label: "مقطوعية", unit: "مقطوعية" }],
};

/** Keep the two workmanship lines (عظم, هيكل معدني) in step with the project's quantities and the saved labour rates. */
export function syncLabor(items: TakeoffItem[], book: PriceBook, sheetId: string): { items: TakeoffItem[]; changed: boolean } {
  const rates = book.rates || {};
  const defs: { id: string; desc: string; rate?: LaborRate; kind: "bone" | "steel" }[] = [
    { id: "auto-labor-bone", desc: "أجور شغل اليد - أعمال العظم (خرسانة وتسليح)", rate: rates.laborBone, kind: "bone" },
    { id: "auto-labor-steel", desc: "أجور شغل اليد - الهيكل المعدني", rate: rates.laborSteel, kind: "steel" },
  ];
  let out = items.slice(), changed = false;
  for (const d of defs) {
    const idx = out.findIndex((i) => i.id === d.id);
    const base = out.filter((i) => i.category !== LABOR_CATEGORY);
    const b = d.rate ? LABOR_BASES[d.kind].find((x) => x.id === d.rate!.basis) : undefined;
    let qty = 0;
    if (b) qty = b.id === "lump" ? 1 : d.kind === "bone" ? sumBy(base, [b.id === "m3" ? "concrete" : "rebar"]) : sumBy(base, b.id === "ton" ? ["frame", "purlin"] : ["cladding"]);
    const price = d.rate?.price || 0;
    if (!b || !(price > 0) || !(qty > 0)) { if (idx >= 0) { out.splice(idx, 1); changed = true; } continue; }
    const line = { quantity: qty, unit: b.unit, unitPrice: price, totalPrice: r2(qty * price) };
    if (idx >= 0) {
      const o = out[idx];
      if (o.quantity !== qty || o.unit !== b.unit || o.unitPrice !== price) { out[idx] = { ...o, ...line, description: d.desc }; changed = true; }
    } else {
      out.push({ id: d.id, sheetId, itemCode: "L", description: d.desc, category: LABOR_CATEGORY, dimensionType: b.id === "m2" ? "area" : "count", location: "", count: 1, ...line,
        isVerified: true, reviewStatus: "approved", extractionSource: "manual_input", notes: b.id === "lump" ? "مبلغ مقطوع" : b.label } as TakeoffItem);
      changed = true;
    }
  }
  return { items: out, changed };
}
