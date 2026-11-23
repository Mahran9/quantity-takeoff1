import React from "react";
import {
  FileSpreadsheet,
  Layers,
  ScanSearch,
  Download,
  Plus,
  Printer,
  ShieldCheck,
  Building2,
  FolderKanban,
  Calculator,
  Undo2,
  Settings,
} from "lucide-react";
import { ProjectMetadata, BlueprintSheet, TakeoffItem } from "../types";
import { PWAInstallButton } from "./PWAInstallButton";

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
  onOpenApkModal?: () => void;
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
  onOpenApkModal,
  onOpenProjectsModal,
  onOpenSteelCalc,
  onOpenSettings,
  onOpenQuotation,
  canUndo = false,
  onUndo,
}) => {
  const totalCost = takeoffItems.reduce(
    (sum, item) => sum + item.quantity * (item.unitPrice || 0),
    0
  );
  const taxAmount = (totalCost * metadata.taxRate) / 100;
  const grandTotal = totalCost + taxAmount;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Project Switcher */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Building2 className="w-6 h-6 text-slate-950 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                حصر الكميات
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  Quantity Takeoff • v6.1.0
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 truncate max-w-md">
              <span className="text-slate-200 font-medium">{metadata.projectName}</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                بحث بصري محلي بدون AI
              </span>
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
          <button
            onClick={() => setActiveView("workspace")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeView === "workspace"
                ? "bg-amber-500 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>المخططات والحصر</span>
            <span className="text-[11px] px-1.5 rounded-full bg-slate-900/30">{sheets.length}</span>
          </button>

          <button
            onClick={() => setActiveView("boq")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeView === "boq"
                ? "bg-amber-500 text-slate-950 shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>جدول الكميات وعرض السعر</span>
            <span className="text-[11px] px-1.5 rounded-full bg-slate-900/30 font-mono">
              {takeoffItems.length}
            </span>
          </button>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {canUndo && onUndo && (
            <button
              onClick={onUndo}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-600/90 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-sm"
              title="تراجع عن آخر تعديل أو استيراد"
            >
              <Undo2 className="w-4 h-4" />
              <span>تراجع</span>
            </button>
          )}
          <button
            onClick={onOpenProjectsModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 rounded-xl text-xs font-bold"
            title="إدارة المشاريع، مشروع جديد، ونسخ احتياطي"
          >
            <FolderKanban className="w-4 h-4" />
            <span className="hidden sm:inline">المشاريع</span>
          </button>

          <button
            onClick={onOpenSteelCalc}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 rounded-xl text-xs font-bold"
            title="حاسبة أوزان الحديد والهناجر والصاج"
          >
            <Calculator className="w-4 h-4" />
            <span className="hidden md:inline">حاسبة الحديد</span>
          </button>

          <button
            onClick={onOpenVisualSearch}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-900/30"
            title="محرك البحث البصري وقراءة الملفات محلياً"
          >
            <ScanSearch className="w-4 h-4 text-cyan-100" />
            <span className="hidden sm:inline">بحث بصري</span>
          </button>

          {onOpenExtractionModal && (
            <button
              onClick={onOpenExtractionModal}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
              title="استخراج الكميات الهندسية من ملفات CAD"
            >
              <Layers className="w-4 h-4" />
              <span className="hidden lg:inline">كميات CAD</span>
            </button>
          )}

          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
            title="إضافة مخطط PDF أو أوتوكاد DXF"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">إضافة مخطط</span>
          </button>

          {onOpenApkModal && <PWAInstallButton onOpenApkModal={onOpenApkModal} />}

          <div className="flex items-center gap-1 border-r border-slate-700 pr-2 mr-1">
            <button
              onClick={onOpenQuotation}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700/90 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm"
              title="عرض السعر: معاينة وطباعة وتصدير Excel"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">عرض السعر</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs"
              title="بيانات الشركة والورق الرسمي والإعدادات"
              aria-label="الإعدادات"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sub-header Ribbon */}
      <div className="bg-slate-950/60 border-t border-slate-800/80 px-4 sm:px-6 py-1.5 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 overflow-x-auto py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">كود المشروع:</span>
            <input
              type="text"
              value={metadata.projectCode}
              onChange={(e) => setMetadata({ ...metadata, projectCode: e.target.value })}
              className="bg-transparent border-b border-dashed border-slate-700 text-slate-300 font-mono text-xs w-28 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">العملة:</span>
            <select
              value={metadata.currency}
              onChange={(e) => {
                const cur = e.target.value as any;
                const symbols: Record<string, string> = {
                  SAR: "ر.س",
                  AED: "د.إ",
                  USD: "$",
                  EGP: "ج.م",
                  QAR: "ر.ق",
                  KWD: "د.ك",
                };
                setMetadata({ ...metadata, currency: cur, currencySymbol: symbols[cur] || cur });
              }}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-xs"
            >
              <option value="SAR">ريال سعودي (SAR)</option>
              <option value="AED">درهم إماراتي (AED)</option>
              <option value="USD">دولار أمريكي (USD)</option>
              <option value="EGP">جنيه مصري (EGP)</option>
              <option value="QAR">ريال قطري (QAR)</option>
              <option value="KWD">دينار كويتي (KWD)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">الضريبة (%):</span>
            <input
              type="number"
              value={metadata.taxRate}
              onChange={(e) => setMetadata({ ...metadata, taxRate: Math.max(0, Number(e.target.value)) })}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-xs w-14 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-slate-400">الصافي: </span>
            <span className="text-slate-200 font-semibold">
              {totalCost.toLocaleString("en-US", { maximumFractionDigits: 1 })} {metadata.currencySymbol}
            </span>
          </div>
          <div>
            <span className="text-slate-400">شامل الضريبة: </span>
            <span className="text-amber-400 font-bold">
              {grandTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })} {metadata.currencySymbol}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
