import React from "react";
import { Plus, FolderKanban, ShieldCheck } from "lucide-react";

interface Props {
  onOpenUpload: () => void;
  onOpenProjects: () => void;
}

/** Shown when the project has no drawings yet. Nothing is pre-filled. */
export const EmptyWorkspace: React.FC<Props> = ({ onOpenUpload, onOpenProjects }) => (
  <section className="qto-hero mx-auto w-full max-w-2xl px-5 pt-8 pb-7 sm:px-10 sm:pt-10 text-right">
    <svg className="w-full max-w-xs mb-6 overflow-visible" viewBox="0 0 320 150" fill="none" aria-hidden="true">
      {/* plan outline with a door opening, drawn once */}
      <path className="qto-draw" pathLength={1} d="M30 20H290V100H190M150 100H30V20" stroke="#0f2229" strokeWidth="3" strokeLinejoin="round" />
      <path className="qto-draw d2" pathLength={1} d="M70 20V100M230 20V100" stroke="#8da0a5" strokeWidth="1.5" />
      {/* dimension line */}
      <g className="qto-draw d2" stroke="#0b8a7e" strokeWidth="1.5">
        <path pathLength={1} d="M30 128H290" />
        <path d="M30 120V136M290 120V136" />
        <path d="M30 128l9-4v8zM290 128l-9-4v8z" fill="#0b8a7e" />
      </g>
    </svg>
    <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight text-slate-900">ارفع المخطط، وخذ الكميات</h2>
    <p className="mt-3 text-[15px] leading-8 text-slate-600 max-w-md">
      PDF أو DXF أو DWG أو صورة. تحصر الأطوال والمساحات والأعداد، وتراجع كل رقم، ثم تصدّر جدول Excel جاهزاً.
    </p>
    <div className="mt-6 flex flex-col sm:flex-row gap-3">
      <button onClick={onOpenUpload} className="qto-cta flex items-center justify-center gap-2 rounded-lg px-7 py-3.5 text-base">
        <Plus className="w-5 h-5" />
        ارفع مخططاً
      </button>
      <button
        onClick={onOpenProjects}
        className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold text-slate-800"
      >
        <FolderKanban className="w-4 h-4 text-slate-500" />
        افتح مشروعاً محفوظاً
      </button>
    </div>
    <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
      <ShieldCheck className="w-4 h-4 text-amber-600" />
      الملفات تبقى على جهازك ولا تُرفع إلى أي خادم.
    </p>
  </section>
);
