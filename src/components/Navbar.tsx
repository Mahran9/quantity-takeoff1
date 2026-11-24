import React, { useState } from "react";
import {
  FileSpreadsheet,
  Layers,
  ScanSearch,
  Plus,
  Printer,
  FolderKanban,
  Calculator,
  Undo2,
  Settings,
  MoreHorizontal,
  Ruler,
  X,
} from "lucide-react";
import { ProjectMetadata, BlueprintSheet, TakeoffItem } from "../types";
import { PWAInstallButton } from "./PWAInstallButton";
import { buildQuotation } from "../utils/quotation";

interface NavbarProps {
  metadata: ProjectMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<ProjectMetadata>>;
  activeView: "workspace" | "boq";
  setActiveView: (view: "workspace" | "boq") => void;
  sheets: BlueprintSheet[];
  takeoffItems: TakeoffItem[];
  onOpenUpload: () => void;
  onOpenVisualSearch: () => void;
  onAnalyze: () => void;
  onOpenAdvanced: () => void;
  onOpenProjectsModal: () => void;
  onOpenSteelCalc: () => void;
  onOpenSettings: () => void;
  onOpenQuotation: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  metadata,
  setMetadata,
  activeView,
  setActiveView,
  sheets,
  takeoffItems,
  onOpenUpload,
  onOpenVisualSearch,
  onAnalyze,
  onOpenAdvanced,
  onOpenProjectsModal,
  onOpenSteelCalc,
  onOpenSettings,
  onOpenQuotation,
  canUndo = false,
  onUndo,
}) => {
  // Same numbers as the quotation, print and Excel (rejected lines excluded).
  const q = buildQuotation(takeoffItems, metadata.taxRate);
  const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  const [more, setMore] = useState(false);
  const symbols: Record<string, string> = { SAR: "ر.س", AED: "د.إ", USD: "$", EGP: "ج.م", QAR: "ر.ق", KWD: "د.ك" };

  const deskTab = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
      active ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white hover:bg-slate-700/50"
    }`;
  const chip =
    "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border transition-colors whitespace-nowrap";
  const navBtn = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold whitespace-nowrap transition-colors ${
      active ? "qto-nav-active text-amber-600" : "text-slate-500"
    }`;
  const sheetRow =
    "w-full flex items-center gap-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 px-4 py-3.5 text-sm font-bold text-slate-800 text-right";
  const field = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <>
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md print:hidden">
        {/* Compact top bar */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/icon.svg" alt="" width={36} height={36} className="w-9 h-9 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold leading-tight truncate">حصر الكميات</h1>
              <p className="text-[11px] text-slate-400 truncate leading-tight">{metadata.projectName}</p>
            </div>
          </div>

          {/* Desktop tabs */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button onClick={() => setActiveView("workspace")} className={deskTab(activeView === "workspace")}>
              <Layers className="w-4 h-4" /> المخططات والحصر
              <span className="text-[11px] px-1.5 rounded-full bg-slate-900/30 font-mono">{sheets.length}</span>
            </button>
            <button onClick={() => setActiveView("boq")} className={deskTab(activeView === "boq")}>
              <FileSpreadsheet className="w-4 h-4" /> الجدول وعرض السعر
              <span className="text-[11px] px-1.5 rounded-full bg-slate-900/30 font-mono">{takeoffItems.length}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {canUndo && onUndo && (
              <button onClick={onUndo} className="p-2 bg-rose-600/90 hover:bg-rose-500 rounded-xl" title="تراجع" aria-label="تراجع">
                <Undo2 className="w-[18px] h-[18px]" />
              </button>
            )}
            <button
              onClick={onOpenQuotation}
              className="qto-cta flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-bold"
              title="عرض السعر: معاينة وطباعة وتصدير Excel"
            >
              <Printer className="w-4 h-4" />
              عرض السعر
            </button>
            <button
              onClick={onOpenSettings}
              className="hidden sm:block p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
              aria-label="الإعدادات"
              title="بيانات الشركة والورق الرسمي"
            >
              <Settings className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {/* Totals strip */}
        <div className="bg-slate-950/70 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-9 flex items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-400">
              <span className="font-sans">الصافي</span>
              <b className="text-slate-100">{money(q.subtotal)} {metadata.currencySymbol}</b>
            </div>
            <div className="flex items-center gap-2 text-amber-300/80">
              <span className="font-sans">شامل الضريبة {metadata.taxRate}%</span>
              <b className="text-amber-400">{money(q.grandTotal)} {metadata.currencySymbol}</b>
            </div>
          </div>
        </div>

        {/* Desktop action chips */}
        <div className="hidden sm:block bg-slate-900 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button onClick={onOpenUpload} className={`${chip} bg-amber-500 border-amber-400 text-slate-950 hover:bg-amber-400`}>
              <Plus className="w-4 h-4" /> إضافة مخطط
            </button>
            <button onClick={onAnalyze} className={`${chip} bg-slate-700 border-slate-600 text-white hover:bg-slate-600`}>
              <Layers className="w-4 h-4" /> حلّل اللوحة
            </button>
            <button onClick={onOpenVisualSearch} className={`${chip} bg-slate-800 border-slate-700 text-cyan-300 hover:bg-slate-700`}>
              <ScanSearch className="w-4 h-4" /> بحث بصري
            </button>
            <button onClick={onOpenProjectsModal} className={`${chip} bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700`}>
              <FolderKanban className="w-4 h-4" /> المشاريع
            </button>
            <button onClick={onOpenSteelCalc} className={`${chip} bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700`}>
              <Calculator className="w-4 h-4" /> حاسبة الحديد
            </button>
            <button onClick={onOpenAdvanced} className={`${chip} bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700`}>
              <Ruler className="w-4 h-4" /> قياس يدوي ومتقدم
            </button>
            <PWAInstallButton className="shrink-0" />
            <div className="mr-auto hidden 2xl:flex items-center gap-3 text-xs text-slate-400">
              <label className="flex items-center gap-1.5">الكود
                <input value={metadata.projectCode} onChange={(e) => setMetadata({ ...metadata, projectCode: e.target.value })} className="bg-transparent border-b border-dashed border-slate-700 text-slate-300 font-mono w-24 focus:outline-none focus:border-amber-400" />
              </label>
              <label className="flex items-center gap-1.5">الضريبة %
                <input type="number" value={metadata.taxRate} onChange={(e) => setMetadata({ ...metadata, taxRate: Math.max(0, Number(e.target.value)) })} className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-1.5 py-1 w-14 font-mono" />
              </label>
              <select value={metadata.currency} onChange={(e) => { const cur = e.target.value as any; setMetadata({ ...metadata, currency: cur, currencySymbol: symbols[cur] || cur }); }} className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-1.5 py-1">
                <option value="SAR">ريال سعودي</option><option value="AED">درهم إماراتي</option><option value="USD">دولار أمريكي</option><option value="EGP">جنيه مصري</option><option value="QAR">ريال قطري</option><option value="KWD">دينار كويتي</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile floating pill navigation */}
      <nav className="qto-pillnav sm:hidden print:hidden">
        <button onClick={() => setActiveView("workspace")} className={activeView === "workspace" ? "is-active" : ""}>
          <Layers className="w-[22px] h-[22px] justify-self-center" />
          المخططات
        </button>
        <button onClick={() => setActiveView("boq")} className={activeView === "boq" ? "is-active" : ""}>
          <FileSpreadsheet className="w-[22px] h-[22px] justify-self-center" />
          الجدول
        </button>
        <button onClick={onOpenUpload} aria-label="إضافة مخطط" className={`qto-plus ${sheets.length === 0 ? "qto-fab-attention" : ""}`}>
          <Plus className="w-6 h-6" />
        </button>
        <button onClick={onAnalyze}>
          <Calculator className="w-[22px] h-[22px] justify-self-center" />
          حلّل
        </button>
        <button onClick={() => setMore(true)} className={more ? "is-active" : ""}>
          <MoreHorizontal className="w-[22px] h-[22px] justify-self-center" />
          المزيد
        </button>
      </nav>

      {/* More sheet (mobile) */}
      {more && (
        <div className="sm:hidden fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm flex items-end print:hidden" onClick={() => setMore(false)}>
          <div className="qto-sheet-up w-full max-h-[85vh] overflow-y-auto bg-white rounded-t-3xl p-4 pb-8 text-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-slate-900">المزيد</h2>
              <button onClick={() => setMore(false)} aria-label="إغلاق" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button className={sheetRow} onClick={() => { setMore(false); onOpenVisualSearch(); }}><ScanSearch className="w-5 h-5 text-cyan-600" />بحث بصري</button>
              <button className={sheetRow} onClick={() => { setMore(false); onOpenProjectsModal(); }}><FolderKanban className="w-5 h-5 text-amber-600" />المشاريع</button>
              <button className={sheetRow} onClick={() => { setMore(false); onOpenAdvanced(); }}><Ruler className="w-5 h-5 text-slate-600" />قياس يدوي ومتقدم</button>
              <button className={sheetRow} onClick={() => { setMore(false); onOpenSteelCalc(); }}><Calculator className="w-5 h-5 text-amber-600" />حاسبة الحديد</button>
              <button className={sheetRow} onClick={() => { setMore(false); onOpenSettings(); }}><Settings className="w-5 h-5 text-slate-600" />الإعدادات</button>
            </div>
            <div className="mt-3 flex justify-center"><PWAInstallButton /></div>

            <h3 className="mt-5 mb-2 text-xs font-bold text-slate-500">بيانات المشروع</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="col-span-2 text-xs font-semibold text-slate-600 space-y-1">كود المشروع
                <input value={metadata.projectCode} onChange={(e) => setMetadata({ ...metadata, projectCode: e.target.value })} className={`${field} w-full font-mono`} />
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1">العملة
                <select value={metadata.currency} onChange={(e) => { const cur = e.target.value as any; setMetadata({ ...metadata, currency: cur, currencySymbol: symbols[cur] || cur }); }} className={`${field} w-full`}>
                  <option value="SAR">ريال سعودي</option><option value="AED">درهم إماراتي</option><option value="USD">دولار أمريكي</option><option value="EGP">جنيه مصري</option><option value="QAR">ريال قطري</option><option value="KWD">دينار كويتي</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1">الضريبة %
                <input type="number" value={metadata.taxRate} onChange={(e) => setMetadata({ ...metadata, taxRate: Math.max(0, Number(e.target.value)) })} className={`${field} w-full font-mono`} />
              </label>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
