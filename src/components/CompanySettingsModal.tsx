import React, { useEffect, useRef, useState } from "react";
import { X, Building2, ImagePlus, Trash2, ShieldCheck, Save } from "lucide-react";
import { CompanyProfile } from "../types";
import { fileToResizedDataUrl } from "../utils/imageUtils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: CompanyProfile;
  onSave: (profile: CompanyProfile) => void;
  appVersion: string;
}

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition-colors";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1";

type ImageField = "logoDataUrl" | "letterheadDataUrl" | "stampDataUrl";

export const CompanySettingsModal: React.FC<Props> = ({ isOpen, onClose, profile, onSave, appVersion }) => {
  const [draft, setDraft] = useState<CompanyProfile>(profile);
  const [error, setError] = useState<string | null>(null);
  const fileRefs = {
    logoDataUrl: useRef<HTMLInputElement>(null),
    letterheadDataUrl: useRef<HTMLInputElement>(null),
    stampDataUrl: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    if (isOpen) {
      setDraft(profile);
      setError(null);
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const set = <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const pickImage = async (field: ImageField, file?: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const url =
        field === "letterheadDataUrl"
          ? await fileToResizedDataUrl(file, 2339, { mime: "image/jpeg", quality: 0.9 })
          : await fileToResizedDataUrl(file, 700, { mime: "image/png" });
      set(field, url);
    } catch (e: any) {
      setError(e?.message || "تعذر تحميل الصورة.");
    } finally {
      const ref = fileRefs[field].current;
      if (ref) ref.value = "";
    }
  };

  const imageBox = (field: ImageField, title: string, hint: string, wide = false) => (
    <div className="rounded-2xl border border-slate-200 p-3 bg-white">
      <div className="text-xs font-bold text-slate-700 mb-0.5">{title}</div>
      <div className="text-[11px] text-slate-400 mb-2">{hint}</div>
      <div
        className={`rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden ${
          wide ? "h-28" : "h-20"
        }`}
      >
        {draft[field] ? (
          <img src={draft[field]} alt={title} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImagePlus className="w-6 h-6 text-slate-300" />
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => fileRefs[field].current?.click()}
          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
        >
          {draft[field] ? "استبدال" : "رفع صورة"}
        </button>
        {draft[field] && (
          <button
            type="button"
            onClick={() => set(field, undefined)}
            aria-label="حذف الصورة"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <input
        ref={fileRefs[field]}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => pickImage(field, e.target.files?.[0])}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 qto-fade-in print:hidden">
      <div className="qto-pop-in bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-right">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold">بيانات الشركة وعروض الأسعار</h2>
              <p className="text-xs text-slate-400">تظهر على عروض الأسعار المطبوعة وملفات Excel فقط</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>اسم الشركة (عربي)</label>
              <input className={inputCls} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Company name (English)</label>
              <input className={inputCls} dir="ltr" value={draft.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>الهاتف</label>
              <input className={inputCls} dir="ltr" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>البريد الإلكتروني</label>
              <input className={inputCls} dir="ltr" value={draft.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>العنوان</label>
              <input className={inputCls} value={draft.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>الرقم الضريبي</label>
              <input className={inputCls} dir="ltr" value={draft.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>السجل التجاري</label>
              <input className={inputCls} dir="ltr" value={draft.crNumber} onChange={(e) => set("crNumber", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>اسم الموقّع</label>
              <input className={inputCls} value={draft.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>المسمى الوظيفي</label>
              <input className={inputCls} value={draft.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} />
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {imageBox("logoDataUrl", "الشعار", "يظهر أعلى العرض إن لم يوجد ورق رسمي")}
            {imageBox("letterheadDataUrl", "الورق الرسمي (A4)", "صورة كاملة الصفحة تُطبع خلف العرض", true)}
            {imageBox("stampDataUrl", "الختم", "PNG بخلفية شفافة بجانب التوقيع")}
          </section>
          <p className="text-[11px] text-slate-500 -mt-3">
            إن كان ورقك الرسمي ملف PDF فصدّره كصورة (PNG/JPG) بمقاس A4 ثم ارفعه هنا. الصور تُحفظ على جهازك فقط.
          </p>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>بادئة رقم العرض</label>
              <input className={inputCls} dir="ltr" value={draft.quotationPrefix} onChange={(e) => set("quotationPrefix", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>هامش علوي للورق الرسمي (سم)</label>
              <input
                type="number" step="0.5" min={0} max={10}
                className={inputCls}
                value={draft.letterheadTopCm}
                onChange={(e) => set("letterheadTopCm", Math.min(10, Math.max(0, Number(e.target.value))))}
              />
            </div>
            <div>
              <label className={labelCls}>هامش سفلي (سم)</label>
              <input
                type="number" step="0.5" min={0} max={10}
                className={inputCls}
                value={draft.letterheadBottomCm}
                onChange={(e) => set("letterheadBottomCm", Math.min(10, Math.max(0, Number(e.target.value))))}
              />
            </div>
            <div>
              <label className={labelCls}>لغة العرض الافتراضية</label>
              <select
                className={inputCls}
                value={draft.quotationLanguage}
                onChange={(e) => set("quotationLanguage", e.target.value as "ar" | "en")}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>الشروط والأحكام (عربي) — سطر لكل بند</label>
              <textarea rows={5} className={inputCls} value={draft.termsText} onChange={(e) => set("termsText", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Terms & conditions (English) — one per line</label>
              <textarea rows={5} dir="ltr" className={inputCls} value={draft.termsTextEn} onChange={(e) => set("termsTextEn", e.target.value)} />
            </div>
          </section>

          <section className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900 leading-relaxed flex gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">خصوصية بياناتك</p>
              <p>
                لا يرسل التطبيق أي مخطط أو بند أو سعر إلى خوادم خارجية؛ كل شيء محفوظ داخل متصفح جهازك. لذلك احتفظ بنسخة
                احتياطية من شاشة المشاريع، فمسح بيانات المتصفح يحذف المشاريع.
              </p>
              <p>
                الكميات المستخرجة آلياً من PDF وDXF مساعدة تقديرية وتتطلب مراجعة مهندس مختص قبل اعتمادها أو إرسالها في عرض
                سعر.
              </p>
              <p className="text-emerald-700/80">الإصدار {appVersion}</p>
            </div>
          </section>

          {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-200">
            إلغاء
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            حفظ
          </button>
        </div>
      </div>
    </div>
  );
};
