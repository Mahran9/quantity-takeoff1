import React, { useMemo } from "react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { Layers, AlertTriangle, FileSpreadsheet } from "lucide-react";

interface Props {
  sheet: BlueprintSheet;
  items: TakeoffItem[];
  currencySymbol: string;
  onAnalyze: () => void;
  onOpenBoq?: () => void;
  onExportExcel: () => void;
}

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });

/** Live numbers for the drawing on screen: how it was read and what has been counted so far. */
export const SheetSummary: React.FC<Props> = ({ sheet, items, currencySymbol, onAnalyze, onExportExcel }) => {
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

  const count = live.length;
  return (
    <section className="qto-rise-in rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
      <div className="min-w-0">
        <h2 className="truncate text-base font-bold text-slate-900">{sheet.code} <span className="text-slate-300">—</span> {sheet.title}</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {count > 0 ? `${count} بند · ${fmt(stats.value)} ${currencySymbol}` : "لم تُحصر كميات بعد"}
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={onAnalyze}
          className="flex-1 flex items-center justify-center gap-2 qto-cta rounded-xl px-4 py-3.5 text-base font-bold transition active:scale-[0.98]"
        >
          <Layers className="w-5 h-5" />
          <span>حلّل اللوحة</span>
        </button>
        {count > 0 && (
          <button
            onClick={onExportExcel}
            title="تصدير جدول الكميات Excel"
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-[0.98]"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>Excel</span>
          </button>
        )}
      </div>

      {reading.tone === "warn" && (
        <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed ${toneCls}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{reading.text}</span>
        </div>
      )}
    </section>
  );
};
