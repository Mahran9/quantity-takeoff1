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
      : "مرّ أكثر من أسبوع على آخر نسخة احتياطية لمشروعك. بياناتك على جهازك فقط — خذ نسخة الآن.";

  const Icon = critical ? AlertTriangle : notice.kind === "backup" ? DatabaseBackup : HardDrive;

  return (
    <div
      role={critical ? "alert" : "status"}
      className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-[60] qto-slide-up rounded-2xl border px-4 py-3 shadow-2xl flex items-start gap-3 text-xs leading-relaxed print:hidden ${
        critical
          ? "bg-rose-950/95 border-rose-500/50 text-rose-100"
          : "bg-slate-900/95 border-amber-500/40 text-amber-100"
      }`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${critical ? "text-rose-400" : "text-amber-400"}`} />
      <div className="flex-1 space-y-2">
        <p>{text}</p>
        <button
          onClick={onBackup}
          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
        >
          تصدير نسخة احتياطية
        </button>
      </div>
      {!critical && (
        <button onClick={onDismiss} aria-label="إغلاق" className="p-1 rounded-md hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
