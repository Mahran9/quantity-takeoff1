import React, { useMemo } from "react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { Layers, ScanLine, CheckCircle2, AlertTriangle, FileSpreadsheet, Table2 } from "lucide-react";

interface Props {
  sheet: BlueprintSheet;
  items: TakeoffItem[];
  currencySymbol: string;
  onAnalyze: () => void;
  onOpenBoq: () => void;
  onExportExcel: () => void;
}

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });

/** Live numbers for the drawing on screen: how it was read and what has been counted so far. */
export const SheetSummary: React.FC<Props> = ({ sheet, items, currencySymbol, onAnalyze, onOpenBoq, onExportExcel }) => {
  const live = useMemo(() => items.filter((i) => i.reviewStatus !== "rejected"), [items]);
  const stats = useMemo(() => {
    const byUnit = new Map<string, number>();
    let value = 0;
    let approved = 0;
    for (const i of live) {
      byUnit.set(i.unit || "—", (byUnit.get(i.unit || "—") || 0) + (i.quantity || 0));
      value += (i.quantity || 0) * (i.unitPrice || 0);
      if (i.reviewStatus === "approved" || i.isVerified) approved++;
    }
    return { byUnit: [...byUnit.entries()].sort((a, b) => b[1] - a[1]), value, approved };
  }, [live]);

  // How the file was read
  let reading: { text: string; tone: "ok" | "warn" | "info" } | null = null;
  if (sheet.fileType === "pdf") {
    const v = sheet.pdfVector;
    if (v && v.groups.length > 0) {
      const lowScale = v.scaleConfidence === "low";
      reading = {
        text: `قُرئ الرسم المتجه: ${v.groups.length} مجموعة خطوط · المقياس 1:${v.detectedDenominator ?? v.textScale ?? "؟"}${lowScale ? " (يحتاج تأكيد)" : ""}`,
        tone: lowScale ? "warn" : "ok",
      };
    } else {
      reading = { text: "PDF بلا خطوط متجهة (ممسوح ضوئياً): الحصر بالقياس اليدوي والقارئ البصري", tone: "warn" };
    }
  } else if (sheet.fileType === "dxf") {
    const n = sheet.dxfLayers?.length || 0;
    reading = { text: `ملف CAD: ${n} طبقة جاهزة للحصر`, tone: n ? "ok" : "warn" };
  } else {
    reading = { text: "صورة: القياس بالنقر بعد معايرة المقياس", tone: "info" };
  }

  const toneCls =
    reading.tone === "ok"
      ? "text-emerald-800 bg-emerald-50 border-emerald-200"
      : reading.tone === "warn"
        ? "text-amber-800 bg-amber-50 border-amber-200"
        : "text-sky-800 bg-sky-50 border-sky-200";

  return (
    <section className="qto-rise-in rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm sm:text-base font-bold text-slate-900">
            {sheet.code} <span className="text-slate-400">—</span> {sheet.title}
          </h2>
          <p className="text-[11px] text-slate-500">
            {sheet.discipline} · المقياس {sheet.scale}
            {sheet.pdfPageNumber ? ` · صفحة ${sheet.pdfPageNumber}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={onAnalyze}
          className="col-span-3 sm:col-span-1 flex items-center justify-center gap-2 qto-cta rounded-xl px-4 py-3 text-sm font-bold transition active:scale-[0.98]"
        >
          <Layers className="w-5 h-5" />
          <span>① حلّل اللوحة</span>
        </button>
        <button
          onClick={onOpenBoq}
          className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-100 active:scale-[0.98]"
        >
          <Table2 className="w-5 h-5 text-slate-600" />
          <span>② مراجعة الجدول</span>
        </button>
        <button
          onClick={onExportExcel}
          disabled={live.length === 0}
          title={live.length === 0 ? "احصر الكميات أولاً" : "تصدير جدول الكميات Excel"}
          className="col-span-1 flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-3 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FileSpreadsheet className="w-5 h-5" />
          <span><span className="hidden sm:inline">③ </span>Excel</span>
        </button>
      </div>
      {live.length === 0 && (
        <p className="mt-2 text-[11px] text-slate-500">زر Excel يعمل بعد إدراج بنود: ابدأ بـ «حلّل اللوحة» ثم أدرج ما تريده.</p>
      )}

      <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed ${toneCls}`}>
        {reading.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : reading.tone === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <ScanLine className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{reading.text}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <div className="text-[11px] text-slate-500">البنود</div>
          <div className="font-mono text-lg font-bold text-slate-900">{live.length}</div>
          <div className="text-[10px] text-slate-500">معتمد {stats.approved}</div>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
          <div className="text-[11px] text-amber-700">قيمة اللوحة</div>
          <div className="font-mono text-lg font-bold text-amber-700">{fmt(stats.value)}</div>
          <div className="text-[10px] text-slate-500">{currencySymbol} قبل الضريبة</div>
        </div>
        {stats.byUnit.slice(0, 2).map(([unit, qty]) => (
          <div key={unit} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
            <div className="text-[11px] text-slate-500">إجمالي {unit}</div>
            <div className="font-mono text-lg font-bold text-slate-900">{fmt(qty)}</div>
            <div className="text-[10px] text-slate-500">من {live.filter((i) => (i.unit || "—") === unit).length} بند</div>
          </div>
        ))}
        {stats.byUnit.length === 0 && (
          <div className="col-span-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
            لا توجد كميات بعد لهذه اللوحة. استخدم «حصر من الملف» أو أضف بنداً.
          </div>
        )}
      </div>
    </section>
  );
};
