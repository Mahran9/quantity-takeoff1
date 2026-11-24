import React from "react";
import { AlertTriangle, DatabaseBackup, HardDrive, X } from "lucide-react";

export type StorageNotice =
  | { kind: "failed"; quotaExceeded: boolean }
  | { kind: "fallback" }
  | { kind: "quota"; percent: number }
  | { kind: "backup" };

interface Props {
  notice: StorageNotice | null;
  onBackup: () => void;
  onDismiss: () => void;
}

/** Surfaces storage problems and backup reminders instead of failing silently. */
export const SaveStatusBar: React.FC<Props> = ({ notice, onBackup, onDismiss }) => {
  if (!notice) return null;

  const critical = notice.kind === "failed";
  const text =
    notice.kind === "failed"
      ? notice.quotaExceeded
        ? "مساحة التخزين على الجهاز ممتلئة — لم تُحفظ آخر التعديلات. صدّر نسخة احتياطية الآن ثم احذف مشاريع أو مخططات قديمة."
        : "تعذّر حفظ آخر التعديلات على الجهاز. صدّر نسخة احتياطية فوراً حتى لا تفقد عملك."
      : notice.kind === "fallback"
      ? "التخزين الأساسي غير متاح، والحفظ يتم في مساحة احتياطية محدودة. صدّر نسخة احتياطية بشكل دوري."
      : notice.kind === "quota"
      ? `مساحة التخزين المستخدمة ${notice.percent}% من المتاح. خذ نسخة احتياطية وانقل المشاريع المنتهية خارج التطبيق.`
      : "لم تأخذ نسخة احتياطية منذ أكثر من أسبوع. بياناتك على جهازك فقط.";

  const Icon = critical ? AlertTriangle : notice.kind === "backup" ? DatabaseBackup : HardDrive;

  return (
    <div
      role={critical ? "alert" : "status"}
      style={{ background: "var(--surface)" }}
      className={`fixed bottom-[6.75rem] sm:bottom-4 right-3 left-3 sm:right-4 sm:left-auto sm:max-w-md z-40 qto-slide-up rounded-xl border px-3.5 py-3 flex items-start gap-3 text-xs keep-paper leading-relaxed print:hidden ${
        critical
          ? "border-rose-400 text-rose-900"
          : "border-slate-300 text-slate-800"
      }`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${critical ? "text-rose-600" : "text-amber-600"}`} />
      <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex-1 min-w-[10rem]">{text}</p>
        <button
          onClick={onBackup}
          className="px-3 py-1.5 rounded-lg qto-cta whitespace-nowrap"
        >
          نسخة احتياطية
        </button>
      </div>
      {!critical && (
        <button onClick={onDismiss} aria-label="إغلاق" className="p-1 rounded-md hover:bg-slate-200">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
