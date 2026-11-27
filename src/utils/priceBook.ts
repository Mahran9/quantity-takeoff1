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
export interface PriceBook { entries: PriceEntry[]; autoFill: boolean; }

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
    return { entries: Array.isArray(b.entries) ? b.entries : [], autoFill: b.autoFill !== false };
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
    const p = map.get(keyOf(it.description, it.unit));
    if (!(p && p > 0)) return it;
    if (mode === "empty" && it.unitPrice > 0) return it;
    if (it.unitPrice === p) return it;
    changed++;
    return { ...it, unitPrice: p, totalPrice: r2((Number(it.quantity) || 0) * p) };
  });
  return { items: out, changed };
}
