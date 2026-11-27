import React from "react";
import { Check, FileSpreadsheet, X } from "lucide-react";
import { TakeoffItem } from "../types";

interface Props {
  items: TakeoffItem[];
  onClose: () => void;
  onExport: (chosen: TakeoffItem[]) => void;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US");

/** Choose which lines go to Excel: all, none, a whole section, or one by one. Opens with the approved lines ticked
 *  (all lines when none is approved yet), so the common case is one tap. */
export const ExportPickerModal: React.FC<Props> = ({ items, onClose, onExport }) => {
  const rows = items.filter((i) => i.reviewStatus !== "rejected");
  const [sel, setSel] = React.useState<Set<string>>(() => {
    const ok = rows.filter((i) => i.reviewStatus === "approved" || i.isVerified);
    return new Set((ok.length ? ok : rows).map((i) => i.id));
  });
  const groups = React.useMemo(() => {
    const m = new Map<string, TakeoffItem[]>();
    for (const i of rows) (m.get(i.category || "بنود أخرى") || m.set(i.category || "بنود أخرى", []).get(i.category || "بنود أخرى")!).push(i);
    return [...m.entries()];
  }, [rows]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setMany = (list: TakeoffItem[], on: boolean) => setSel((s) => { const n = new Set(s); list.forEach((i) => (on ? n.add(i.id) : n.delete(i.id))); return n; });
  const chosen = rows.filter((i) => sel.has(i.id));
  const box = (on: boolean) => (
    <span
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 ${on ? "text-white" : "border-slate-300 bg-white"}`}
      style={on ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
    >
      {on && <Check className="h-4 w-4" />}
    </span>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white text-right sm:max-w-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="text-lg font-extrabold text-slate-900">اختر البنود للتصدير</h2>
          <button onClick={onClose} aria-label="إغلاق" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex gap-2 px-5 pb-3">
          <button onClick={() => setMany(rows, true)} className="h-10 flex-1 rounded-xl border border-slate-200 text-[13.5px] font-bold text-slate-700">تحديد الكل</button>
          <button onClick={() => setMany(rows, false)} className="h-10 flex-1 rounded-xl border border-slate-200 text-[13.5px] font-bold text-slate-700">إلغاء التحديد</button>
        </div>
        <div className="flex flex-col overflow-y-auto px-5 pb-3">
          {groups.map(([cat, list]) => {
            const all = list.every((i) => sel.has(i.id));
            return (
              <div key={cat} className="mb-3">
                <button onClick={() => setMany(list, !all)} className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-right">
                  {box(all)}
                  <span className="flex-1 text-[14px] font-extrabold text-slate-900">{cat}</span>
                  <span className="text-[12.5px] font-bold text-slate-500">{list.filter((i) => sel.has(i.id)).length}/{list.length}</span>
                </button>
                {list.map((i) => (
                  <button key={i.id} onClick={() => toggle(i.id)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-right">
                    {box(sel.has(i.id))}
                    <span className="min-w-0 flex-1 text-[14px] font-semibold leading-6 text-slate-800">{i.description}</span>
                    <span className="shrink-0 font-mono text-[13.5px] font-bold text-slate-900">{fmt(i.quantity)} <span className="font-sans text-slate-500">{i.unit}</span></span>
                  </button>
                ))}
              </div>
            );
          })}
          {!rows.length && <p className="py-6 text-center text-[14px] font-semibold text-slate-500">لا توجد بنود بعد.</p>}
        </div>
        <div className="border-t border-slate-200 px-5 pb-5 pt-3">
          <button
            disabled={!chosen.length}
            onClick={() => { onExport(chosen); onClose(); }}
            className="qto-cta flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] disabled:opacity-50"
          >
            <FileSpreadsheet className="h-5 w-5" />
            {chosen.length ? `تصدير ${chosen.length} من ${rows.length} بند إلى Excel` : "اختر بنداً واحداً على الأقل"}
          </button>
        </div>
      </div>
    </div>
  );
};
