import React, { useMemo, useState } from "react";
import { History, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { ProjectRecord } from "../types";
import { PriceBook, PriceEntry, Rates, RateGroup, LaborBasis, LABOR_BASES, applyBook, entriesFromItems, upsertPrice } from "../utils/priceBook";

interface Props {
  book: PriceBook;
  onChange: (b: PriceBook) => void;
  projects: ProjectRecord[];
  activeProject: ProjectRecord;
  onApplyAll: () => void;
  onClose: () => void;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US");
const day = (iso: string) => { try { return new Date(iso).toLocaleDateString("en-GB"); } catch { return ""; } };
const RATE_ROWS: { key: RateGroup; label: string; unit: string; hint: string }[] = [
  { key: "concrete", label: "الخرسانة", unit: "ر.س / م³", hint: "كل بند خرسانة في عرض السعر" },
  { key: "rebar", label: "حديد التسليح", unit: "ر.س / طن", hint: "كل بند تسليح بالطن" },
  { key: "frame", label: "الهيكل المعدني: أعمدة وجملونات", unit: "ر.س / طن", hint: "الأعمدة والرفترات والبليتات والتكتيف" },
  { key: "purlin", label: "الهيكل المعدني: مدادات", unit: "ر.س / طن", hint: "حديد المدادات" },
  { key: "cladding", label: "الهيكل المعدني: شنكو", unit: "ر.س / م²", hint: "تكسية السقف والجدران" },
];
const UNITS = ["م³", "م²", "م.ط", "طن", "عدد", "نقطة", "مقطوعية", "كجم"];

/** The price list: one saved unit price per kind of item, kept apart from any project. Editing a price keeps the old one
 *  in the history; «تطبيق على كل العروض» writes the saved prices into every project's matching lines. */
export const PriceBookModal: React.FC<Props> = ({ book, onChange, projects, activeProject, onApplyAll, onClose }) => {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [nn, setNn] = useState(""); const [nu, setNu] = useState("م²"); const [np, setNp] = useState("");
  const field = "rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900";

  const rates: Rates = book.rates || {};
  const setRate = (k: RateGroup, v: string) => {
    const n = Number(v);
    if (v.trim() !== "" && !(n >= 0)) return;
    onChange({ ...book, rates: { ...rates, [k]: v.trim() === "" || n === 0 ? undefined : n } });
    setMsg(n > 0 ? "حُفظ السعر وطُبّق على كل العروض" : "أُلغي السعر الموحّد لهذه المجموعة");
  };
  const setLabor = (k: "laborBone" | "laborSteel", patch: { price?: number; basis?: LaborBasis }) => {
    const kind = k === "laborBone" ? "bone" : "steel";
    const cur = rates[k] || { price: 0, basis: LABOR_BASES[kind][0].id };
    onChange({ ...book, rates: { ...rates, [k]: { ...cur, ...patch } } });
    setMsg("حُفظ بند شغل اليد وطُبّق على كل العروض");
  };
  const pending = useMemo(() => projects.reduce((a, p) => a + applyBook(p.takeoffItems, book, "all").changed, 0), [projects, book]);
  const list = book.entries.filter((e) => !q.trim() || e.name.includes(q.trim()));

  const setPrice = (e: PriceEntry, v: string) => {
    const p = Number(v);
    if (!(p >= 0) || v.trim() === "") return;
    onChange(upsertPrice(book, e.name, e.unit, p));
  };
  const rename = (e: PriceEntry, name: string) => onChange({ ...book, entries: book.entries.map((x) => (x.id === e.id ? { ...x, name } : x)) });
  const remove = (e: PriceEntry) => { onChange({ ...book, entries: book.entries.filter((x) => x.id !== e.id) }); setOpen(null); };
  const restore = (e: PriceEntry, price: number) => onChange(upsertPrice(book, e.name, e.unit, price));
  const saveProject = () => {
    const r = entriesFromItems(book, activeProject.takeoffItems);
    onChange(r.book);
    setMsg(r.added + r.updated ? `تم حفظ ${r.added} صنف جديد وتحديث ${r.updated}` : "لا توجد أسعار جديدة في هذا المشروع");
  };
  const add = () => {
    const p = Number(np);
    if (!nn.trim() || !(p > 0)) return;
    onChange(upsertPrice(book, nn.trim(), nu, p));
    setNn(""); setNp(""); setMsg("أُضيف الصنف");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[94dvh] w-full flex-col overflow-y-auto rounded-t-3xl bg-white text-right sm:max-w-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">قائمة الأسعار</h2>
            <p className="text-[12.5px] font-semibold text-slate-500">{book.entries.length} صنف محفوظ، تُستعمل في كل عروض الأسعار</p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200"><X className="h-5 w-5" /></button>
        </div>

        <div className="mx-5 mb-3 rounded-2xl border border-slate-200 p-3">
          <div className="mb-1 text-[14px] font-extrabold text-slate-900">الأسعار الأساسية</div>
          <p className="mb-2 text-[12px] font-semibold text-slate-500">اكتب السعر مرة واحدة فيُطبَّق على كل بنود مجموعته في كل عروض الأسعار.</p>
          {RATE_ROWS.map((r) => (
            <label key={r.key} className="flex items-center gap-2 border-t border-slate-100 py-2">
              <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-bold text-slate-900">{r.label}</span><span className="block text-[11.5px] text-slate-500">{r.hint}</span></span>
              <input key={String(rates[r.key])} inputMode="decimal" defaultValue={rates[r.key] ?? ""} placeholder="0" onBlur={(e) => setRate(r.key, e.target.value)} className={`${field} w-24 font-mono`} aria-label={r.label} />
              <span className="w-14 text-[11px] font-bold text-slate-500">{r.unit}</span>
            </label>
          ))}
          {([["laborBone", "بند شغل اليد: العظم", "bone"], ["laborSteel", "بند شغل اليد: الهيكل المعدني", "steel"]] as const).map(([k, label, kind]) => (
            <div key={k} className="border-t border-slate-100 py-2">
              <div className="mb-1.5 text-[13.5px] font-bold text-slate-900">{label}</div>
              <div className="flex items-center gap-2">
                <select value={rates[k]?.basis || LABOR_BASES[kind][0].id} onChange={(e) => setLabor(k, { basis: e.target.value as LaborBasis })} className={`${field} min-w-0 flex-1`}>
                  {LABOR_BASES[kind].map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
                <input key={String(rates[k]?.price)} inputMode="decimal" defaultValue={rates[k]?.price ?? ""} placeholder="0" onBlur={(e) => setLabor(k, { price: Number(e.target.value) || 0 })} className={`${field} w-24 font-mono`} aria-label={label} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 px-5 pb-3">
          <button onClick={saveProject} className="qto-cta flex h-11 w-full items-center justify-center gap-2 text-sm"><Save className="h-4 w-4" /> حفظ أسعار المشروع الحالي في القائمة</button>
          <button onClick={onApplyAll} disabled={!pending} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> {pending ? `تطبيق الأسعار على كل العروض (${pending} بند سيتغير)` : "كل العروض مطابقة للقائمة"}
          </button>
          <label className="flex items-center gap-2 text-[13px] font-bold text-slate-700">
            <input type="checkbox" checked={book.autoFill} onChange={(e) => onChange({ ...book, autoFill: e.target.checked })} className="h-5 w-5" />
            تعبئة أسعار البنود الجديدة تلقائياً من القائمة
          </label>
          {msg && <p className="rounded-lg bg-slate-100 px-3 py-2 text-[12.5px] font-bold text-slate-700">{msg}</p>}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث في الأصناف" className={`${field} w-full`} />
        </div>

        <div className="flex flex-col gap-2 px-5 pb-3">
          {list.length === 0 && <p className="py-6 text-center text-sm text-slate-400">لا أسعار محفوظة بعد. أدخل أسعار مشروعك ثم اضغط «حفظ أسعار المشروع الحالي»، أو أضف صنفاً بالأسفل.</p>}
          {list.map((e) => (
            <div key={e.id} className="rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <input value={e.name} onChange={(ev) => rename(e, ev.target.value)} className={`${field} min-w-0 flex-1 font-bold`} />
                <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[12px] font-bold text-slate-600">{e.unit}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input key={e.price} inputMode="decimal" defaultValue={e.price} onBlur={(ev) => setPrice(e, ev.target.value)} className={`${field} w-32 font-mono`} aria-label="السعر" />
                <span className="text-[12px] font-semibold text-slate-500">آخر تعديل {day(e.updatedAt)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex h-10 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-slate-200 px-3 text-[12.5px] font-bold text-slate-700"><History className="h-4 w-4" /> السجل{e.history.length ? ` (${e.history.length})` : ""}</button>
                <button onClick={() => remove(e)} aria-label="حذف" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              {open === e.id && (
                <div className="mt-2 rounded-xl bg-slate-50 p-2">
                  {e.history.length === 0 && <p className="px-1 py-1 text-[12.5px] text-slate-500">لا أسعار سابقة، هذا أول سعر.</p>}
                  {e.history.map((h, i) => (
                    <div key={i} className="flex items-center justify-between px-1 py-1.5 text-[13px]">
                      <span className="font-mono font-bold text-slate-800">{fmt(h.price)}</span>
                      <span className="text-slate-500">{day(h.at)}</span>
                      <button onClick={() => restore(e, h.price)} className="rounded-lg border border-slate-300 px-3 py-1 text-[12.5px] font-bold text-slate-700">استرجاع</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 px-5 pb-5 pt-3">
          <div className="mb-2 text-[13px] font-extrabold text-slate-900">إضافة صنف</div>
          <div className="flex gap-2">
            <input value={nn} onChange={(e) => setNn(e.target.value)} placeholder="اسم الصنف" className={`${field} min-w-0 flex-1`} />
            <select value={nu} onChange={(e) => setNu(e.target.value)} className={`${field} w-24`}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          <div className="mt-2 flex gap-2">
            <input inputMode="decimal" value={np} onChange={(e) => setNp(e.target.value)} placeholder="السعر" className={`${field} min-w-0 flex-1 font-mono`} />
            <button onClick={add} disabled={!nn.trim() || !(Number(np) > 0)} className="qto-cta flex h-11 items-center gap-1 px-5 text-sm disabled:opacity-60"><Plus className="h-4 w-4" /> إضافة</button>
          </div>
        </div>
      </div>
    </div>
  );
};
