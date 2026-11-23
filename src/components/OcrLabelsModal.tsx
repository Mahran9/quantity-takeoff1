import React, { useEffect, useRef, useState } from "react";
import { X, ScanText, Loader2 } from "lucide-react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { LabelledQty, labelledToTakeoff, readPrintedLabels } from "../utils/ocrLabels";
import { importWithRecovery } from "../utils/lazyImport";

interface Props { isOpen: boolean; onClose: () => void; sheet: BlueprintSheet; existingItemsCount: number; onAddItems: (items: TakeoffItem[]) => void }

export const OcrLabelsModal: React.FC<Props> = ({ isOpen, onClose, sheet, existingItemsCount, onAddItems }) => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const [found, setFound] = useState<LabelledQty[] | null>(null);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const started = useRef(false);

  useEffect(() => {
    if (!isOpen) { started.current = false; setFound(null); setError(""); return; }
    if (started.current) return;
    started.current = true;
    (async () => {
      if (!sheet.imageUrl) { setError("لا توجد صورة لهذه اللوحة."); return; }
      setBusy(true);
      try {
        const r = await readPrintedLabels(sheet.imageUrl, () => importWithRecovery(() => import("tesseract.js")), (m, p) => { setMsg(m); setPct(p); });
        setFound(r.quantities);
        setPicked(Object.fromEntries(r.quantities.map((_, i) => [i, true])));
        if (!r.quantities.length) setError("لم أجد أرقام مدوّنة بصيغة واضحة (مثل AREA = 330.38 SQ.M أو جدول مساحات). جرّب لوحة أخرى أو استخدم الحصر الهندسي.");
      } catch (e: any) {
        setError(e?.message || "تعذرت القراءة.");
      } finally { setBusy(false); }
    })();
  }, [isOpen, sheet.imageUrl]);

  if (!isOpen) return null;
  const n = Object.values(picked).filter(Boolean).length;
  const insert = () => {
    if (!found) return;
    onAddItems(labelledToTakeoff(found.filter((_, i) => picked[i]), sheet, existingItemsCount));
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 print:hidden" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] sm:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2 font-bold"><ScanText className="w-5 h-5 text-amber-300" /> الأرقام المدوّنة على اللوحة</div>
          <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {busy && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
              <div className="flex items-center gap-2 font-bold"><Loader2 className="w-4 h-4 animate-spin" /> {msg || "جارٍ التحضير…"}</div>
              <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="mt-2 text-[11px] text-slate-500">تتم القراءة على جهازك. قد تستغرق نحو دقيقة للوحات الكبيرة.</p>
            </div>
          )}
          {error && <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">{error}</p>}
          {found && found.length > 0 && (
            <>
              <p className="text-[11px] text-slate-500">الأرقام تُقرأ بالتعرف الضوئي وقد تخطئ في خانة (مثلاً 53 قد تُقرأ 03). قارن كل رقم بالسطر المقروء.</p>
              {found.map((q, i) => (
                <label key={i} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${picked[i] ? "border-teal-400 bg-teal-50/40" : "border-slate-200"}`}>
                  <input type="checkbox" className="mt-1" checked={Boolean(picked[i])} onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900">{q.label}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 font-mono truncate" dir="ltr">{q.raw}</div>
                  </div>
                  <div className="text-left shrink-0"><div className="font-mono font-bold">{q.value.toLocaleString("en-US")}</div><div className="text-[11px] text-slate-600">{q.unit}</div></div>
                </label>
              ))}
            </>
          )}
        </div>
        {found && found.length > 0 && (
          <div className="p-3 border-t border-slate-200 flex gap-2">
            <button onClick={onClose} className="px-4 py-3 rounded-xl bg-slate-100 text-sm font-bold text-slate-700">إلغاء</button>
            <button onClick={insert} disabled={n === 0} className="qto-cta flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50">إدراج ({n}) بنود</button>
          </div>
        )}
      </div>
    </div>
  );
};
