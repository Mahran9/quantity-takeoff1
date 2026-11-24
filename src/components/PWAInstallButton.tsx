import React, { useState } from "react";
import { Smartphone, Download, X, Share, MoreVertical, PlusSquare } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

/**
 * "Install app" button (PWA). Behaves like a store install:
 *  - Chrome/Edge/Android: one tap opens the native install prompt.
 *  - iPhone/iPad (Safari): shows the two-step Add to Home Screen instructions.
 *  - Any other browser: shows where the browser's own install item is.
 * Hidden once the app is already installed.
 */
export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [help, setHelp] = useState(false);

  if (isInstalled) return null;

  const onClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) setHelp(true);
    } else {
      setHelp(true);
    }
  };

  return (
    <>
      <button
        onClick={onClick}
        className={`flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300 active:scale-[0.98] whitespace-nowrap ${className}`}
        title="تثبيت التطبيق على جهازك ليعمل كتطبيق مستقل وبدون إنترنت"
      >
        <Download className="w-4 h-4" />
        تثبيت التطبيق
      </button>

      {help && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-3 qto-fade-in print:hidden"
          onClick={() => setHelp(false)}
        >
          <div
            className="qto-slide-up w-full max-w-sm rounded-2xl border border-slate-300 p-5 text-right text-slate-900 keep-paper" style={{ background: "var(--paper)" }} data-k=""
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <Smartphone className="w-5 h-5 text-amber-400" />
                تثبيت التطبيق
              </div>
              <button onClick={() => setHelp(false)} aria-label="إغلاق" className="rounded-lg p-1.5 hover:bg-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              يعمل بعد التثبيت كتطبيق مستقل بأيقونة على شاشتك، وبدون إنترنت، وبياناتك تبقى على جهازك.
            </p>
            {isIOS ? (
              <ol className="mt-4 space-y-3 text-sm">
                <li className="flex items-center gap-3 rounded-lg border border-slate-300 p-3">
                  <Share className="w-5 h-5 shrink-0 text-sky-400" />
                  <span>اضغط زر <b>المشاركة</b> في أسفل Safari</span>
                </li>
                <li className="flex items-center gap-3 rounded-lg border border-slate-300 p-3">
                  <PlusSquare className="w-5 h-5 shrink-0 text-amber-400" />
                  <span>اختر <b>إضافة إلى الشاشة الرئيسية</b> ثم <b>إضافة</b></span>
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-3 text-sm">
                <li className="flex items-center gap-3 rounded-lg border border-slate-300 p-3">
                  <MoreVertical className="w-5 h-5 shrink-0 text-sky-400" />
                  <span>افتح قائمة المتصفح <b>⋮</b> (أعلى الصفحة)</span>
                </li>
                <li className="flex items-center gap-3 rounded-lg border border-slate-300 p-3">
                  <PlusSquare className="w-5 h-5 shrink-0 text-amber-400" />
                  <span>اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b></span>
                </li>
              </ol>
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              إن لم يظهر الخيار فافتح الرابط من Chrome (أندرويد) أو Safari (آيفون) وليس من داخل تطبيق آخر.
            </p>
            <button onClick={() => setHelp(false)} className="mt-4 w-full rounded-lg qto-cta py-3 text-sm">
              حسناً
            </button>
          </div>
        </div>
      )}
    </>
  );
};
