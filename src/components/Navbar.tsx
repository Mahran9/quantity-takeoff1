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
  X,
  RefreshCw,
  ChevronLeft,
} from "lucide-react";
import { ProjectMetadata, BlueprintSheet, TakeoffItem } from "../types";
import { PWAInstallButton } from "./PWAInstallButton";
import { buildQuotation } from "../utils/quotation";

declare const __APP_BUILD__: string;
const APP_BUILD = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev";

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

const SYMBOLS: Record<string, string> = { SAR: "ر.س", AED: "د.إ", USD: "$", EGP: "ج.م", QAR: "ر.ق", KWD: "د.ك" };
const CURRENCIES: [string, string][] = [
  ["SAR", "ريال سعودي"],
  ["AED", "درهم إماراتي"],
  ["USD", "دولار أمريكي"],
  ["EGP", "جنيه مصري"],
  ["QAR", "ريال قطري"],
  ["KWD", "دينار كويتي"],
];

/**
 * Header + navigation. One paper colour everywhere: the header is a single row (project, quotation)
 * with the totals under it, separated by hairlines only. On the phone the four destinations live in a
 * flat bottom bar; secondary tools are a plain list under "المزيد".
 */
export const Navbar: React.FC<NavbarProps> = ({
  metadata,
  setMetadata,
  activeView,
  setActiveView,
  sheets,
  takeoffItems,
  onOpenUpload,
  onOpenVisualSearch,
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
  const [refreshing, setRefreshing] = useState(false);
  // Drops the offline copy of the app (service worker + caches) and reloads. Saved projects (IndexedDB) are untouched.
  const refreshApp = async () => {
    setRefreshing(true);
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = (await caches?.keys?.()) || [];
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* reload anyway */
    }
    window.location.reload();
  };

  const setCurrency = (cur: string) => setMetadata({ ...metadata, currency: cur as any, currencySymbol: SYMBOLS[cur] || cur });

  const tab = (active: boolean) =>
    `relative px-1 py-4 text-sm font-bold whitespace-nowrap ${active ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`;
  const tabBar = (active: boolean) => (active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-500" /> : null);
  const row = "w-full flex items-center gap-3 py-3.5 text-sm font-bold text-slate-800 text-right border-b border-slate-200";
  const field = "rounded-lg border px-3 py-2.5 text-sm text-slate-900 w-full";

  return (
    <>
      <header className="qto-header print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onOpenProjectsModal}
              className="flex items-center gap-2.5 min-w-0 text-right"
              aria-label="المشاريع"
              title="المشاريع"
            >
              <img src="/icon.svg" alt="" width={32} height={32} className="w-8 h-8 shrink-0 rounded-lg" />
              <span className="min-w-0 block">
                <span className="block text-[15px] font-extrabold leading-tight truncate text-slate-900">{metadata.projectName}</span>
                <span className="block text-[11px] leading-tight text-slate-500 font-semibold">حصر الكميات</span>
              </span>
            </button>

            {/* Desktop destinations */}
            <nav className="hidden sm:flex items-center gap-6 mx-auto">
              <button onClick={() => setActiveView("workspace")} className={tab(activeView === "workspace")}>
                المخططات <span className="text-[11px] font-mono text-slate-400 mr-1">{sheets.length}</span>
                {tabBar(activeView === "workspace")}
              </button>
              <button onClick={() => setActiveView("boq")} className={tab(activeView === "boq")}>
                الجدول <span className="text-[11px] font-mono text-slate-400 mr-1">{takeoffItems.length}</span>
                {tabBar(activeView === "boq")}
              </button>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              {canUndo && onUndo && (
                <button onClick={onUndo} className="p-2 rounded-lg text-slate-700 border border-slate-300" title="تراجع" aria-label="تراجع">
                  <Undo2 className="w-[18px] h-[18px]" />
                </button>
              )}
              <button
                onClick={onOpenQuotation}
                className="qto-cta flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px]"
                title="عرض السعر: معاينة وطباعة وتصدير Excel"
              >
                <Printer className="w-4 h-4" />
                عرض السعر
              </button>
              <button onClick={onOpenUpload} className="hidden sm:flex h-9 items-center gap-1.5 px-3 rounded-lg border border-slate-300 text-[13px] font-bold text-slate-800">
                <Plus className="w-4 h-4" /> مخطط
              </button>
              <button onClick={() => setMore(true)} className="hidden sm:grid h-9 w-9 place-items-center rounded-lg border border-slate-300 text-slate-700" aria-label="المزيد">
                <MoreHorizontal className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>

          {/* Totals: two figures, no band */}
          <div className="pb-2.5 -mt-0.5 flex items-baseline justify-between gap-3">
            <div className="qto-total">
              <small>الصافي</small>
              <b className="font-mono text-slate-900">{money(q.subtotal)}</b>
              <small>{metadata.currencySymbol}</small>
            </div>
            <div className="qto-total">
              <small>
                شامل الضريبة<span className="hidden min-[360px]:inline"> {metadata.taxRate}%</span>
              </small>
              <b className="font-mono text-amber-700">{money(q.grandTotal)}</b>
              <small>{metadata.currencySymbol}</small>
            </div>
          </div>
        </div>
      </header>

      {/* Phone navigation */}
      <nav className="qto-pillnav sm:hidden print:hidden">
        <button onClick={() => setActiveView("workspace")} className={activeView === "workspace" ? "is-active" : ""}>
          <Layers className="w-[21px] h-[21px] justify-self-center" />
          المخططات
        </button>
        <button onClick={() => setActiveView("boq")} className={activeView === "boq" ? "is-active" : ""}>
          <FileSpreadsheet className="w-[21px] h-[21px] justify-self-center" />
          الجدول
        </button>
        <button onClick={onOpenUpload} aria-label="إضافة مخطط" className="qto-plus">
          <span>
            <Plus className="w-5 h-5" />
          </span>
        </button>
        <button onClick={() => setMore(true)} className={more ? "is-active" : ""}>
          <MoreHorizontal className="w-[21px] h-[21px] justify-self-center" />
          المزيد
        </button>
      </nav>

      {/* More: a plain list */}
      {more && (
        <div className="fixed inset-0 z-40 bg-slate-950/40 flex items-end sm:items-start sm:justify-start print:hidden" onClick={() => setMore(false)}>
          <div
            className="qto-sheet-up w-full sm:w-96 sm:mt-14 sm:mx-6 max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl px-5 pt-4 pb-8 text-right keep-paper"
            style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-extrabold text-slate-900">المزيد</h2>
              <button onClick={() => setMore(false)} aria-label="إغلاق" className="p-2 -ml-2 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <button className={row} onClick={() => { setMore(false); onOpenProjectsModal(); }}>
              <FolderKanban className="w-5 h-5 text-slate-500" /> <span className="flex-1">المشاريع</span> <ChevronLeft className="w-4 h-4 text-slate-300" />
            </button>
            <button className={row} onClick={() => { setMore(false); onOpenVisualSearch(); }}>
              <ScanSearch className="w-5 h-5 text-slate-500" /> <span className="flex-1">بحث بصري</span> <ChevronLeft className="w-4 h-4 text-slate-300" />
            </button>
            <button className={row} onClick={() => { setMore(false); onOpenSteelCalc(); }}>
              <Calculator className="w-5 h-5 text-slate-500" /> <span className="flex-1">حاسبة الحديد</span> <ChevronLeft className="w-4 h-4 text-slate-300" />
            </button>
            <button className={row} onClick={() => { setMore(false); onOpenSettings(); }}>
              <Settings className="w-5 h-5 text-slate-500" /> <span className="flex-1">بيانات الشركة والورق الرسمي</span> <ChevronLeft className="w-4 h-4 text-slate-300" />
            </button>
            <button className={row} onClick={refreshApp} disabled={refreshing}>
              <RefreshCw className={`w-5 h-5 text-slate-500 ${refreshing ? "animate-spin" : ""}`} />
              <span className="flex-1">{refreshing ? "جارٍ التحديث…" : "تحديث التطبيق"}</span>
              <span className="text-[11px] text-slate-400 font-mono" dir="ltr">{APP_BUILD}</span>
            </button>
            <div className="py-2 flex">
              <PWAInstallButton />
            </div>

            <h3 className="mt-4 mb-2 text-xs font-bold text-slate-500">المشروع</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs font-semibold text-slate-600 space-y-1 block">
                الاسم
                <input value={metadata.projectName} onChange={(e) => setMetadata({ ...metadata, projectName: e.target.value })} className={field} />
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1 block">
                العملة
                <select value={metadata.currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
                  {CURRENCIES.map(([c, n]) => (
                    <option key={c} value={c}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1 block">
                الضريبة %
                <input type="number" value={metadata.taxRate} onChange={(e) => setMetadata({ ...metadata, taxRate: Math.max(0, Number(e.target.value)) })} className={`${field} font-mono`} />
              </label>
              <label className="col-span-2 text-xs font-semibold text-slate-600 space-y-1 block">
                كود المشروع
                <input value={metadata.projectCode} onChange={(e) => setMetadata({ ...metadata, projectCode: e.target.value })} className={`${field} font-mono`} />
              </label>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
