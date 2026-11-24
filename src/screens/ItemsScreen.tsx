import React from "react";
import { Loader2, ScanLine } from "lucide-react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { ScreenHeader } from "../components/Nav";

interface Props {
  sheets: BlueprintSheet[];
  items: TakeoffItem[];
  /** "" = all sheets in one table. */
  activeSheetId: string;
  /** "" selects all sheets. */
  onSelectSheet: (id: string) => void;
  onAnalyze: () => void;
  onAuto: () => Promise<string>;
  onGoSheets: () => void;
  /** Result of the automatic read right after an upload. */
  readMsg?: string;
  children: React.ReactNode; // the table for the active sheet
}

/** Quantities: pick a drawing, review its lines. */
export const ItemsScreen: React.FC<Props> = ({ sheets, items, activeSheetId, onSelectSheet, onAnalyze, onAuto, onGoSheets, readMsg, children }) => {
  const [msg, setMsg] = React.useState(readMsg || "");
  React.useEffect(() => { if (readMsg) setMsg(readMsg); }, [readMsg]);
  const [reading, setReading] = React.useState(false);
  const runAuto = async () => {
    setReading(true);
    setMsg("جارٍ قراءة المخطط…");
    try { setMsg(await onAuto()); }
    catch { setMsg("تعذرت قراءة المخطط. افتح تحليل اللوحة لمراجعتها."); }
    finally { setReading(false); }
  };
  if (sheets.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <ScreenHeader title="الكميات" />
        <section className="card px-6 py-10 text-center">
          <p className="text-sm text-slate-500 leading-7">لا توجد لوحات بعد. أضف مخططاً أولاً ثم تظهر كمياته هنا.</p>
          <button onClick={onGoSheets} className="qto-cta mt-5 rounded-xl px-7 py-3 text-sm">إلى اللوحات</button>
        </section>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader
        title="الكميات"
        sub={`${items.filter((i) => i.reviewStatus !== "rejected").length} بند في المشروع`}
        action={
          <div className="flex gap-2">
            <button onClick={runAuto} disabled={reading} className="qto-cta flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm disabled:opacity-65">
              {reading ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <ScanLine className="w-[18px] h-[18px]" />}
              {reading ? "جارٍ القراءة…" : "اقرأ واحصر"}
            </button>
            <button onClick={onAnalyze} className="flex h-10 items-center rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-800">
              راجع
            </button>
          </div>
        }
      />
      {msg && <p className="rounded-lg bg-teal-50 px-3 py-2 text-[13px] font-bold leading-6 text-teal-900">{msg}</p>}
      {sheets.length > 1 && (() => {
        // One table for the whole project by default. A many-page PDF used to show a strip of 16 page buttons here;
        // picking a single sheet is now one dropdown, sheets with lines first.
        const count = (id: string) => items.filter((i) => i.sheetId === id).length;
        const ordered = [...sheets].sort((a, b) => Number(count(b.id) > 0) - Number(count(a.id) > 0));
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectSheet("")}
              className={`shrink-0 flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold border ${
                !activeSheetId ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              كل اللوحات
              <span className={`font-mono text-[11px] ${!activeSheetId ? "text-teal-300" : "text-slate-400"}`}>{items.length}</span>
            </button>
            <select
              value={activeSheetId}
              onChange={(e) => onSelectSheet(e.target.value)}
              aria-label="عرض لوحة واحدة"
              className={`min-w-0 flex-1 sm:flex-none sm:w-64 rounded-full border px-3.5 py-2 text-[13px] font-bold ${
                activeSheetId ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              <option value="">عرض لوحة واحدة… ({sheets.length})</option>
              {ordered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.title} — {count(s.id)} بند
                </option>
              ))}
            </select>
          </div>
        );
      })()}
      {children}
    </div>
  );
};
