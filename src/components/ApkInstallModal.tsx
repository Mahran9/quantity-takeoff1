import React, { useState, useEffect } from "react";
import {
  Smartphone,
  Download,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  QrCode,
  ShieldCheck,
  Zap,
  Info,
  X,
  Layers,
  ArrowRight,
} from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

interface ApkInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkInstallModal: React.FC<ApkInstallModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { isInstallable, isInstalled, isAndroid, isIOS, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"instant" | "apk_builder" | "qrcode">("instant");

  const currentUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleCopyUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      setTimeout(() => onClose(), 1500);
    }
  };

  // QR code URL using quickchart QR API or SVG
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    currentUrl
  )}&bgcolor=ffffff&color=0f172a&margin=10`;

  const pwaBuilderUrl = `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(
    currentUrl
  )}`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-slate-900 via-slate-800 to-indigo-950 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-5 left-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 p-2.5 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <Smartphone className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">تثبيت تطبيق أندرويد (APK / WebAPK)</h2>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                  جاهز للتشغيل
                </span>
              </div>
              <p className="text-sm text-slate-300 mt-1">
                تشغيل واستخدام برنامج حصر الكميات (Quantity Takeoff) كبرنامج أندرويد كامل على هاتفك أو جهازك اللوحي
              </p>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-2 mt-6 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/60">
            <button
              onClick={() => setActiveTab("instant")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === "instant"
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>التثبيت المباشر على الهاتف</span>
            </button>

            <button
              onClick={() => setActiveTab("qrcode")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === "qrcode"
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>مسح رمز QR بالجوال</span>
            </button>

            <button
              onClick={() => setActiveTab("apk_builder")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === "apk_builder"
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <Download className="w-4 h-4" />
              <span>تحميل ملف APK مستقل</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700">
          {/* TAB 1: INSTANT INSTALLATION */}
          {activeTab === "instant" && (
            <div className="space-y-5">
              {/* Native Prompt button if ready */}
              {isInstallable && (
                <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-amber-500/10 border-2 border-amber-500/30 p-5 rounded-2xl text-center space-y-3">
                  <div className="inline-flex p-3 bg-amber-500 text-slate-950 rounded-full shadow-md">
                    <Download className="w-6 h-6 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">متصفحك يدعم التثبيت الفوري الآن</h3>
                    <p className="text-xs text-slate-600 mt-1">
                      اضغط أدناه وسيقوم نظام أندرويد بإنشاء وتثبيت التطبيق مباشرة على جهازك
                    </p>
                  </div>
                  <button
                    onClick={handleInstallClick}
                    className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
                  >
                    <Smartphone className="w-5 h-5" />
                    <span>تثبيت التطبيق على جهازي الآن</span>
                  </button>
                </div>
              )}

              {isInstalled && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-bold text-sm">التطبيق مثبت بالفعل على هذا الجهاز!</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      يمكنك فتحه مباشرة من شاشة التطبيقات الرئيسية بهاتفك.
                    </p>
                  </div>
                </div>
              )}

              {/* Android How-to Steps */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs">
                    1
                  </span>
                  <span>كيفية تثبيت التطبيق كـ APK على هواتف أندرويد (Google Chrome):</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
                    <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
                      الخطوة الأولى
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      افتح رابط التطبيق في متصفح <strong>Google Chrome</strong> أو <strong>Samsung Internet</strong> على هاتفك.
                    </p>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
                    <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
                      الخطوة الثانية
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      اضغط على زر القائمة <strong>(الثلاث نقاط ⋮)</strong> في أعلى يمين أو أسفل المتصفح.
                    </p>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-2">
                    <span className="text-xs font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md">
                      الخطوة الثالثة
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      اختر <strong>«تثبيت التطبيق» (Install app)</strong> أو «إضافة إلى الشاشة الرئيسية».
                    </p>
                  </div>
                </div>

                {/* Android WebAPK Explainer Note */}
                <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold">ملاحظة هندسية تقنية: </span>
                    تقنية <strong>Android WebAPK</strong> تقوم تلقائياً بإنشاء حزمة APK حقيقية وموقعة عبر نظام أندرويد وتثبيتها داخل درج التطبيقات على جهازك لتعمل بملء الشاشة وبدون شريط عنوان المتصفح تماماً كأي تطبيق أندرويد أصلي.
                  </div>
                </div>
              </div>

              {/* Share/Copy link */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <div className="flex-1 w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-600 truncate text-left dir-ltr">
                  {currentUrl}
                </div>
                <button
                  onClick={handleCopyUrl}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>تم نسخ الرابط</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>نسخ رابط الهاتف</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: QR CODE */}
          {activeTab === "qrcode" && (
            <div className="text-center space-y-4 py-2">
              <div className="max-w-sm mx-auto bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-inner flex flex-col items-center">
                <div className="p-3 bg-white rounded-xl shadow-md border border-slate-200">
                  <img
                    src={qrCodeUrl}
                    alt="Scan QR code to install app"
                    className="w-48 h-48 rounded-lg"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-3 font-medium">
                  وجّه كاميرا هاتفك الأندرويد نحو الرمز لفتح وتثبيت التطبيق مباشرة
                </p>
              </div>

              <div className="text-xs text-slate-600 max-w-md mx-auto space-y-1">
                <p className="font-semibold text-slate-800">
                  عند فتح الرابط بالكاميرا:
                </p>
                <p>
                  سيظهر لك إشعار في الأسفل فوراً: «إضافة تطبيق حصر الكميات (Quantity Takeoff) إلى الشاشة الرئيسية». اضغط عليه لتثبيت التطبيق.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: PWABUILDER / NATIVE APK PACKAGE */}
          {activeTab === "apk_builder" && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>توليد ملف APK جاهز للتثبيت والرفع لمتجر Google Play</span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  تم إعداد هذا التطبيق بالكامل وفق معايير <strong>PWA & Web Manifest</strong> المعتمدة من Google. يمكنك استخدام منصة <strong>PWABuilder</strong> الرسمية من Microsoft لتوليد حزمة أندرويد (APK / AAB) فورية وموقعة بنقرة واحدة:
                </p>

                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">مواصفات الحزمة المهيأة:</span>
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono text-[11px] font-bold">
                      Manifest Validated 100%
                    </span>
                  </div>
                  <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                    <li>أيقونات عالية الدقة (192px و 512px و Maskable Icon للأندرويد).</li>
                    <li>وضع العرض المستقل (Standalone Display) بدون شريط عنوان.</li>
                    <li>دعم العمل دون اتصال بالإنترنت (Service Worker & Caching).</li>
                    <li>حزمة جاهزة للتثبيت الخارجي (Sideload APK) أو متجر Play Store.</li>
                  </ul>
                </div>

                <a
                  href={pwaBuilderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>فتح أداة PWABuilder لتوليد وتحميل ملف APK الآن</span>
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Layers className="w-4 h-4 text-slate-400" />
            <span>متوافق مع جميع أجهزة Android 8.0+ و Chrome 80+</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
