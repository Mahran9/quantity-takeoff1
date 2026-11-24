import React, { useState } from "react";
import { ArrowRight, ChevronDown, ListChecks, ScanLine, Check } from "lucide-react";
import { BlueprintSheet } from "../types";

interface Props {
  sheet: BlueprintSheet;
  sheets: BlueprintSheet[];
  itemCount: number;
  onBack: () => void;
  onSelectSheet: (id: string) => void;
  onAnalyze: () => void;
  onAuto: () => string;
  onOpenItems: () => void;
  children: React.ReactNode;
}

/** Full-screen drawing workspace: a slim bar on top, the drawing taking everything else. */
export const DrawingScreen: React.FC<Props> = ({ sheet, sheets, itemCount, onBack, onSelectSheet, onAnalyze, onAuto, onOpenItems, children }) => {
  const [pick, setPick] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white qto-fade-in" dir="rtl">
      <div className="h-14 shrink-0 flex items-center gap-2 px-2.5 border-b border-slate-200 bg-white relative">
        <button onClick={onBack} aria-label="رجوع" className="grid h-10 w-10 place-items-center rounded-xl text-slate-700 hover:bg-slate-100">
          <ArrowRight className="w-5 h-5" />
        </button>
        <button onClick={() => sheets.length > 1 && setPick((v) => !v)} className="min-w-0 flex-1 flex items-center gap-1.5 text-right">
          <span className="font-mono text-[12px] font-bold text-teal-800 bg-teal-50 rounded-md px-1.5 py-0.5 shrink-0">{sheet.code}</span>
          <span className="truncate text-[15px] font-extrabold text-slate-900">{sheet.title}</span>
          {sheets.length > 1 && <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
        </button>
        <button onClick={onOpenItems} className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-[13px] font-bold text-slate-800" title="بنود هذه اللوحة">
          <ListChecks className="w-[18px] h-[18px]" />
          <span className="font-mono">{itemCount}</span>
        </button>
        <button onClick={() => setMsg(onAuto())} className="qto-cta flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px]">
          <ScanLine className="w-[18px] h-[18px]" />
          اقرأ واحصر
        </button>
        <button onClick={onAnalyze} className="flex h-10 items-center rounded-xl border border-slate-300 px-3 text-[13px] font-bold text-slate-800">
          راجع
        </button>

        {pick && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPick(false)} />
            <div className="absolute top-14 right-2 left-2 sm:left-auto sm:w-80 z-50 rounded-2xl border border-slate-200 bg-white shadow-xl p-1.5 max-h-[60vh] overflow-y-auto">
              {sheets.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onSelectSheet(s.id);
                    setPick(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-3 text-right hover:bg-slate-100"
                >
                  <span className="font-mono text-[12px] font-bold text-teal-800 shrink-0">{s.code}</span>
                  <span className="flex-1 truncate text-sm font-bold text-slate-800">{s.title}</span>
                  {s.id === sheet.id && <Check className="w-4 h-4 text-teal-700" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex-1 min-h-0">{msg && (
        <div className="shrink-0 flex items-start gap-2 bg-teal-50 px-3 py-2 text-[13px] font-bold leading-6 text-teal-900">
          <span className="flex-1">{msg}</span>
          <button onClick={() => setMsg("")} aria-label="إغلاق" className="px-2 text-teal-800">×</button>
        </div>
      )}
      {children}</div>
    </div>
  );
};
