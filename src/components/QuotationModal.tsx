import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { CompanyProfile, ProjectMetadata, TakeoffItem } from "../types";
import { buildQuotation, QUOTATION_LABELS, QuotationData, QuotationMeta } from "../utils/quotation";
import { defaultQuotationMeta, exportQuotationExcel } from "../utils/boqExporter";
import "../quotation.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  metadata: ProjectMetadata;
  company: CompanyProfile;
  items: TakeoffItem[];
  onOpenSettings: () => void;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface SheetProps {
  data: QuotationData;
  metadata: ProjectMetadata;
  company: CompanyProfile;
  meta: QuotationMeta;
  terms: string[];
}

/** One A4-width document; spacer rows repeat per printed page so text never touches the letterhead. */
const QuotationSheet: React.FC<SheetProps> = ({ data, metadata, company, meta, terms }) => {
  const L = QUOTATION_LABELS[meta.lang];
  const rtl = meta.lang === "ar";
  const sym = metadata.currencySymbol;
  const companyName = (rtl ? company.name || company.nameEn : company.nameEn || company.name) || "";
  const hasLetterhead = Boolean(company.letterheadDataUrl);

  return (
    <div className="qt-sheet" dir={rtl ? "rtl" : "ltr"}>
      {hasLetterhead && <img className="qt-letterhead" src={company.letterheadDataUrl} alt="" />}
      <table className="qt-flow">
        <thead>
          <tr><td><div className="qt-spacer-top" style={{ height: `${hasLetterhead ? company.letterheadTopCm : 1.2}cm` }} /></td></tr>
        </thead>
        <tfoot>
          <tr><td><div className="qt-spacer-bottom" style={{ height: `${hasLetterhead ? company.letterheadBottomCm : 1.2}cm` }} /></td></tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="qt-pad">
              {!hasLetterhead && (companyName || company.logoDataUrl) && (
                <div className="qt-header">
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{companyName}</div>
                    <div style={{ color: "#475569", fontSize: 10 }}>
                      {[company.address, company.phone, company.email].filter(Boolean).join("  |  ")}
                    </div>
                    <div style={{ color: "#475569", fontSize: 10 }}>
                      {[company.crNumber && `${L.crNumber}: ${company.crNumber}`, company.taxNumber && `${L.taxNumber}: ${company.taxNumber}`]
                        .filter(Boolean)
                        .join("  |  ")}
                    </div>
                  </div>
                  {company.logoDataUrl && <img src={company.logoDataUrl} alt="" />}
                </div>
              )}

              <div className="qt-titlebar">{L.title}</div>
              <table className="qt-info">
                <tbody>
                  <tr>
                    <td className="k">{L.number}</td><td>{meta.number}</td>
                    <td className="k">{L.date}</td><td>{metadata.date}</td>
                  </tr>
                  <tr>
                    <td className="k">{L.to}</td><td colSpan={3}>{metadata.clientName} {L.respectfully}</td>
                  </tr>
                  <tr>
                    <td className="k">{L.project}</td><td>{metadata.projectName}</td>
                    <td className="k">{L.validity}</td><td>{meta.validityDays} {L.days}</td>
                  </tr>
                  {meta.subject && (
                    <tr><td className="k">{L.subject}</td><td colSpan={3}>{meta.subject}</td></tr>
                  )}
                </tbody>
              </table>

              <table className="qt-table">
                <thead>
                  <tr>
                    <th style={{ width: "6%" }}>{L.index}</th>
                    <th>{L.description}</th>
                    <th style={{ width: "9%" }}>{L.unit}</th>
                    <th style={{ width: "11%" }}>{L.quantity}</th>
                    <th style={{ width: "15%" }}>{L.unitPrice} ({sym})</th>
                    <th style={{ width: "16%" }}>{L.total} ({sym})</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sections.map((section) => (
                    <React.Fragment key={section.title}>
                      <tr className="sec"><td colSpan={6}>{section.title}</td></tr>
                      {section.rows.map((row) => (
                        <tr key={row.index}>
                          <td className="qt-num">{row.index}</td>
                          <td>{row.description}</td>
                          <td style={{ textAlign: "center" }}>{row.unit}</td>
                          <td className="qt-num">{fmt(row.quantity)}</td>
                          <td className="qt-num">{fmt(row.unitPrice)}</td>
                          <td className="qt-num">{fmt(row.total)}</td>
                        </tr>
                      ))}
                      <tr className="sub">
                        <td colSpan={5}>{L.sectionSubtotal} - {section.title}</td>
                        <td className="qt-num">{fmt(section.subtotal)}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              <table className="qt-summary">
                <tbody>
                  <tr><td>{L.subtotal}</td><td className="qt-num">{fmt(data.subtotal)} {sym}</td></tr>
                  <tr><td>{L.vat} ({data.taxRate}%)</td><td className="qt-num">{fmt(data.tax)} {sym}</td></tr>
                  <tr className="grand"><td>{L.grandTotal}</td><td className="qt-num">{fmt(data.grandTotal)} {sym}</td></tr>
                </tbody>
              </table>

              {terms.length > 0 && (
                <div className="qt-terms">
                  <h4>{L.terms}</h4>
                  <ol>{terms.map((t, i) => <li key={i}>{t}</li>)}</ol>
                </div>
              )}

              <div className="qt-signature">
                <div className="box">
                  {company.stampDataUrl && <img className="stamp" src={company.stampDataUrl} alt="" />}
                  <div className="line">
                    {[company.signatoryName, company.signatoryTitle].filter(Boolean).join(" — ") || L.signature}
                  </div>
                </div>
                <div className="box"><div className="line">{metadata.clientName}</div></div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const QuotationModal: React.FC<Props> = ({ isOpen, onClose, metadata, company, items, onOpenSettings }) => {
  const [meta, setMeta] = useState<QuotationMeta>(() => defaultQuotationMeta(metadata, company));
  const [termsText, setTermsText] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const m = defaultQuotationMeta(metadata, company);
    setMeta(m);
    setTermsText(m.lang === "en" ? company.termsTextEn : company.termsText);
    // Re-seed only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const data = useMemo(() => buildQuotation(items, metadata.taxRate), [items, metadata.taxRate]);
  const terms = useMemo(() => termsText.split("\n").map((t) => t.trim()).filter(Boolean), [termsText]);

  useEffect(() => {
    if (!isOpen) return;
    const cleanup = () => document.body.classList.remove("printing-quotation");
    window.addEventListener("afterprint", cleanup);
    return () => {
      window.removeEventListener("afterprint", cleanup);
      cleanup();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const changeLang = (lang: "ar" | "en") => {
    setMeta((m) => ({ ...m, lang }));
    setTermsText(lang === "en" ? company.termsTextEn : company.termsText);
  };

  const doPrint = () => {
    document.body.classList.add("printing-quotation");
    // Let the print root paint before opening the dialog.
    setTimeout(() => window.print(), 60);
  };

  const noCompany = !company.name && !company.nameEn;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 qto-fade-in print:hidden">
        <div className="qto-pop-in bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden text-right">
          <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-base font-bold">عرض السعر — معاينة وطباعة</h2>
            <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-white/10"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr]">
            <div className="overflow-y-auto p-4 space-y-3 border-b lg:border-b-0 lg:border-l border-slate-200 bg-slate-50 text-xs">
              {(data.zeroPriceCount > 0 || data.pendingCount > 0 || noCompany) && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-3 space-y-1 leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold"><AlertTriangle className="w-4 h-4" /> قبل الإرسال للعميل</div>
                  {data.zeroPriceCount > 0 && <p>• {data.zeroPriceCount} بند بسعر وحدة صفر.</p>}
                  {data.pendingCount > 0 && <p>• {data.pendingCount} بند لم يُعتمد بعد.</p>}
                  {noCompany && (
                    <p>
                      • لم تُدخل بيانات شركتك.{" "}
                      <button className="underline font-bold" onClick={onOpenSettings}>افتح الإعدادات</button>
                    </p>
                  )}
                </div>
              )}

              <label className="block font-semibold text-slate-600">رقم العرض
                <input className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white" dir="ltr"
                  value={meta.number} onChange={(e) => setMeta({ ...meta, number: e.target.value })} />
              </label>
              <label className="block font-semibold text-slate-600">الموضوع
                <input className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  value={meta.subject} onChange={(e) => setMeta({ ...meta, subject: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block font-semibold text-slate-600">الصلاحية (يوم)
                  <input type="number" min={1} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    value={meta.validityDays}
                    onChange={(e) => setMeta({ ...meta, validityDays: Math.max(1, Number(e.target.value) || 1) })} />
                </label>
                <label className="block font-semibold text-slate-600">اللغة
                  <select className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    value={meta.lang} onChange={(e) => changeLang(e.target.value as "ar" | "en")}>
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>
              <label className="block font-semibold text-slate-600">الشروط والأحكام (سطر لكل بند)
                <textarea rows={6} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  value={termsText} onChange={(e) => setTermsText(e.target.value)} />
              </label>

              <div className="flex flex-col gap-2 pt-1">
                <button onClick={doPrint}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
                  <Printer className="w-4 h-4" /> طباعة / حفظ PDF
                </button>
                <button onClick={() => exportQuotationExcel(metadata, company, items, meta)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold">
                  <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
                </button>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  لحفظ PDF اختر «حفظ كـ PDF» في نافذة الطباعة وفعّل «الرسومات الخلفية». في تطبيق الأندرويد قد لا تعمل
                  الطباعة؛ استخدم المتصفح أو تصدير Excel.
                </p>
              </div>
            </div>

            <div className="overflow-auto bg-slate-200 p-4">
              <div className="mx-auto shadow-xl origin-top qt-preview-scale" style={{ width: "fit-content" }}>
                <QuotationSheet data={data} metadata={metadata} company={company} meta={meta} terms={terms} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {createPortal(
        <div id="qt-print-root">
          <QuotationSheet data={data} metadata={metadata} company={company} meta={meta} terms={terms} />
        </div>,
        document.body
      )}
    </>
  );
};
