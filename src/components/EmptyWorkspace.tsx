import React from "react";
import { Plus, FolderKanban, ShieldCheck } from "lucide-react";

interface Props {
  onOpenUpload: () => void;
  onOpenProjects: () => void;
}

/** Shown when the project has no drawings yet. Nothing is pre-filled. */
export const EmptyWorkspace: React.FC<Props> = ({ onOpenUpload, onOpenProjects }) => (
  <section className="qto-hero mx-auto w-full max-w-2xl px-5 py-9 sm:px-10 sm:py-12 text-center">
    <svg className="qto-hero-art mx-auto mb-5 w-40 sm:w-48 overflow-visible" viewBox="0 0 200 110" fill="none" aria-hidden="true">
      <path className="qto-beam-glow" d="M10 85 L70 30 L130 70 L190 20" stroke="#2dd4bf" strokeWidth="7" opacity=".3" style={{ filter: "blur(6px)" }} />
      <path className="qto-beam-line" d="M10 85 L70 30 L130 70 L190 20" stroke="#ffffffdd" strokeWidth="1.8" strokeLinejoin="round" />
      <g stroke="#6ee7d0" strokeWidth="1.2" opacity=".7">
        <path d="M10 95h60M70 24v-8M130 76v8M190 14v-8" />
      </g>
      <circle className="qto-spark" cx="70" cy="30" r="5" fill="#6ee7d0" />
      <circle className="qto-spark s2" cx="130" cy="70" r="5" fill="#2dd4bf" />
      <circle cx="10" cy="85" r="3.5" fill="#fff" />
      <circle cx="190" cy="20" r="3.5" fill="#fff" />
    </svg>
    <h2 className="text-xl sm:text-2xl font-bold">ابدأ بإضافة أول مخطط</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-300 max-w-md mx-auto">
      ارفع ملف PDF أو أوتوكاد DXF/DWG أو صورة. يقرأ التطبيق الخطوط والمقياس ويستخرج الكميات، وبعدها تراجعها وتصدّر جدول Excel احترافياً.
    </p>
    <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5">
      <button onClick={onOpenUpload} className="qto-cta flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-bold">
        <Plus className="w-5 h-5" />
        إضافة مخطط
      </button>
      <button
        onClick={onOpenProjects}
        className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-semibold text-white hover:bg-white/15"
      >
        <FolderKanban className="w-4 h-4 text-amber-300" />
        فتح مشروع محفوظ
      </button>
    </div>
    <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
      <ShieldCheck className="w-4 h-4 text-emerald-400" />
      ملفاتك تبقى على جهازك ولا تُرفع لأي خادم
    </p>
  </section>
);
