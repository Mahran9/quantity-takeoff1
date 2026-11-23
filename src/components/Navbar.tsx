import React from "react";
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
  onOpenExtractionModal?: () => void;
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
  onOpenExtractionModal,
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

  const tab = (active: boolean) =>
    `flex-1 min-w-0 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold transition-all ${
      active ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-300 hover:text-white hover:bg-slate-700/50"
    }`;
  const chip =
    "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border transition-colors whitespace-nowrap";

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md print:hidden">
      {/* Row 1: brand + primary actions */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/icon.svg" alt="" width={40} height={40} className="w-10 h-10 shrink-0 rounded-xl shadow-lg shadow-black/30" />
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold leading-tight text-white flex items-center gap-2">
              <span className="truncate">حصر الكميات</span>
              <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30">
                v6.2.0
              </span>
            </h1>
            <p className="text-xs text-slate-400 truncate">{metadata.projectName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canUndo && onUndo && (
            <button
              onClick={onUndo}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-600/90 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
              title="تراجع عن آخر تعديل أو استيراد"
            >
              <Undo2 className="w-4 h-4" />
              <span className="hidden sm:inline">تراجع</span>
            </button>
          )}
          <button
            onClick={onOpenQuotation}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-sm"
            title="عرض السعر: معاينة وطباعة وتصدير Excel"
          >
            <Printer className="w-4 h-4" />
            <span>عرض السعر</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl"
            title="بيانات الشركة والورق الرسمي"
            aria-label="الإعدادات"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Row 2: view tabs (full width) */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pb-2">
        <div className="flex items-stretch gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
          <button onClick={() => setActiveView("workspace")} className={tab(activeView === "workspace")}>
            <Layers className="w-4 h-4 shrink-0" />
            <span className="truncate">
              المخططات<span className="hidden sm:inline"> والحصر</span>
            </span>
            <span className="text-[11px] px-1.5 rounded-full bg-slate-900/30 font-mono">{sheets.length}</span>
          </button>
          <button onClick={() => setActiveView("boq")} className={tab(activeView === "boq")}>
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span className="truncate">
              الجدول<span className="hidden sm:inline"> وعرض السعر</span>
            </span>
            <span className="text-[11px] px-1.5 rounded-full bg-slate-900/30 font-mono">{takeoffItems.length}</span>
          </button>
        </div>
      </div>

      {/* Row 3: labelled action chips, one scrollable line */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
          <button onClick={onOpenUpload} className={`${chip} bg-amber-500 border-amber-400 text-slate-950 hover:bg-amber-400`}>
            <Plus className="w-4 h-4" />
            إضافة مخطط
          </button>
          {onOpenExtractionModal && (
            <button onClick={onOpenExtractionModal} className={`${chip} bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500`}>
              <Layers className="w-4 h-4" />
              حصر الكميات
            </button>
          )}
          <button onClick={onOpenVisualSearch} className={`${chip} bg-slate-800 border-slate-700 text-cyan-300 hover:bg-slate-700`}>
            <ScanSearch className="w-4 h-4" />
            بحث بصري
          </button>
          <button onClick={onOpenProjectsModal} className={`${chip} bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700`}>
            <FolderKanban className="w-4 h-4" />
            المشاريع
          </button>
          <button onClick={onOpenSteelCalc} className={`${chip} bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700`}>
            <Calculator className="w-4 h-4" />
            حاسبة الحديد
          </button>
          <PWAInstallButton className="shrink-0" />
        </div>
      </div>

      {/* Totals + project data */}
      <div className="bg-slate-950/60 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            <label className="flex items-center gap-1.5 shrink-0">
              <span className="text-slate-500">الكود</span>
              <input
                type="text"
                value={metadata.projectCode}
                onChange={(e) => setMetadata({ ...metadata, projectCode: e.target.value })}
                className="bg-transparent border-b border-dashed border-slate-700 text-slate-300 font-mono text-xs w-24 focus:outline-none focus:border-amber-400"
              />
            </label>
            <label className="flex items-center gap-1.5 shrink-0">
              <span className="text-slate-500">العملة</span>
              <select
                value={metadata.currency}
                onChange={(e) => {
                  const cur = e.target.value as any;
                  const symbols: Record<string, string> = { SAR: "ر.س", AED: "د.إ", USD: "$", EGP: "ج.م", QAR: "ر.ق", KWD: "د.ك" };
                  setMetadata({ ...metadata, currency: cur, currencySymbol: symbols[cur] || cur });
                }}
                className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-1.5 py-1 text-xs"
              >
                <option value="SAR">ريال سعودي</option>
                <option value="AED">درهم إماراتي</option>
                <option value="USD">دولار أمريكي</option>
                <option value="EGP">جنيه مصري</option>
                <option value="QAR">ريال قطري</option>
                <option value="KWD">دينار كويتي</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 shrink-0">
              <span className="text-slate-500">الضريبة %</span>
              <input
                type="number"
                value={metadata.taxRate}
                onChange={(e) => setMetadata({ ...metadata, taxRate: Math.max(0, Number(e.target.value)) })}
                className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-1.5 py-1 text-xs w-14 font-mono"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-5 font-mono">
            <div className="rounded-lg bg-slate-800/70 sm:bg-transparent px-3 py-1.5 sm:p-0">
              <div className="text-[10px] sm:text-xs text-slate-500 sm:inline sm:ml-1">الصافي</div>
              <div className="text-sm sm:text-xs text-slate-100 font-semibold sm:inline">
                {money(q.subtotal)} {metadata.currencySymbol}
              </div>
            </div>
            <div className="rounded-lg bg-amber-500/10 sm:bg-transparent px-3 py-1.5 sm:p-0">
              <div className="text-[10px] sm:text-xs text-amber-300/70 sm:text-slate-500 sm:inline sm:ml-1">شامل الضريبة</div>
              <div className="text-sm sm:text-xs text-amber-400 font-bold sm:inline">
                {money(q.grandTotal)} {metadata.currencySymbol}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
