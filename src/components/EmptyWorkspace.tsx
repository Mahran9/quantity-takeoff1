import React from "react";
import { FileText, FileCode2, Image as ImageIcon, Plus, FolderKanban, ShieldCheck } from "lucide-react";

interface Props {
  onOpenUpload: () => void;
  onOpenProjects: () => void;
}

/** Shown when the project has no drawings yet. Nothing is pre-filled. */
export const EmptyWorkspace: React.FC<Props> = ({ onOpenUpload, onOpenProjects }) => (
  <section className="qto-rise-in mx-auto w-full max-w-xl text-center rounded-3xl border border-slate-200 bg-white px-5 py-9 sm:py-14 shadow-sm">
    <div className="mx-auto mb-5 flex items-center justify-center gap-3">
      <span className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center">
        <FileText className="w-6 h-6 text-rose-500" />
      </span>
      <span className="w-12 h-12 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
        <FileCode2 className="w-6 h-6 text-cyan-600" />
      </span>
      <span className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
        <ImageIcon className="w-6 h-6 text-emerald-600" />
      </span>
    </div>
    <h2 className="text-xl font-bold text-slate-900">ابدأ بإضافة أول مخطط</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-500">
      ارفع ملف PDF أو أوتوكاد DXF أو صورة. يقرأ التطبيق الخطوط والمقياس ويستخرج الكميات، وبعدها تراجعها وتسعّرها وتصدّر عرض السعر.
    </p>
    <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5">
      <button
        onClick={onOpenUpload}
        className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 active:scale-[0.98]"
      >
        <Plus className="w-5 h-5" />
        إضافة مخطط
      </button>
      <button
        onClick={onOpenProjects}
        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
      >
        <FolderKanban className="w-4 h-4 text-amber-600" />
        فتح مشروع محفوظ
      </button>
    </div>
    <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
      <ShieldCheck className="w-4 h-4 text-emerald-500" />
      ملفاتك تبقى على جهازك ولا تُرفع لأي خادم
    </p>
  </section>
);
