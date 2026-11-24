import React from "react";
import { ScanLine } from "lucide-react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { ScreenHeader } from "../components/Nav";

interface Props {
  sheets: BlueprintSheet[];
  items: TakeoffItem[];
  activeSheetId: string;
  onSelectSheet: (id: string) => void;
  onAnalyze: () => void;
  onAuto: () => string;
  onGoSheets: () => void;
  children: React.ReactNode; // the table for the active sheet
}

/** Quantities: pick a drawing, review its lines. */
export const ItemsScreen: React.FC<Props> = ({ sheets, items, activeSheetId, onSelectSheet, onAnalyze, onAuto, onGoSheets, children }) => {
  const [msg, setMsg] = React.useState("");
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
            <button onClick={() => setMsg(onAuto())} className="qto-cta flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm">
              <ScanLine className="w-[18px] h-[18px]" /> اقرأ واحصر
            </button>
            <button onClick={onAnalyze} className="flex h-10 items-center rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-800">
              راجع
            </button>
          </div>
        }
      />
      {msg && <p className="rounded-lg bg-teal-50 px-3 py-2 text-[13px] font-bold leading-6 text-teal-900">{msg}</p>}
      {sheets.length > 1 && (
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto no-scrollbar">
          {sheets.map((s) => {
            const on = s.id === activeSheetId;
            const n = items.filter((i) => i.sheetId === s.id).length;
            return (
              <button
                key={s.id}
                onClick={() => onSelectSheet(s.id)}
                className={`shrink-0 flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold border ${
                  on ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                <span className="font-mono text-[11px] opacity-80">{s.code}</span>
                <span className="max-w-[120px] truncate">{s.title}</span>
                <span className={`font-mono text-[11px] ${on ? "text-teal-300" : "text-slate-400"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {children}
    </div>
  );
};
