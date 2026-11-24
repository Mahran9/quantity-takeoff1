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

  const count = live.length;
  return (
    <section className="qto-rise-in flex items-center justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h2 className="truncate text-[17px] font-extrabold text-slate-900">
          <span className="font-mono text-[13px] text-slate-500 ml-2">{sheet.code}</span>
          {sheet.title}
        </h2>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {count > 0 ? (
            <>
              {count} بند · <b className="font-mono text-slate-800">{fmt(stats.value)}</b> {currencySymbol}
            </>
          ) : (
            "لم تُحصر كميات بعد"
          )}
        </p>
        {reading.tone === "warn" && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{reading.text}</span>
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        {count > 0 && (
          <button
            onClick={onExportExcel}
            title="تصدير جدول الكميات Excel"
            aria-label="تصدير Excel"
            className="grid h-10 w-10 place-items-center rounded-lg border border-slate-300 text-slate-800"
          >
            <FileSpreadsheet className="w-5 h-5" />
          </button>
        )}
        <button onClick={onAnalyze} className="qto-cta flex h-10 items-center gap-2 rounded-lg px-4 text-sm">
          <Layers className="w-[18px] h-[18px]" />
          حلّل اللوحة
        </button>
      </div>
    </section>
  );
};
