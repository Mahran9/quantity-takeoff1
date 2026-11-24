import React, { useState } from "react";
import {
  FileSpreadsheet,
  Download,
  Printer,
  Layers,
  Search,
  Filter,
  DollarSign,
  ShieldCheck,
  Building2,
  FileCheck,
  CheckCircle2,
  Box,
  Square,
  Ruler,
  Hash,
} from "lucide-react";
import { BlueprintSheet, TakeoffItem, ProjectMetadata, CompanyProfile } from "../types";
import { exportBoqToExcel, exportBoqToCsv, getExportWarnings } from "../utils/boqExporter";
import { buildQuotation } from "../utils/quotation";

interface BOQViewProps {
  metadata: ProjectMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<ProjectMetadata>>;
  sheets: BlueprintSheet[];
  takeoffItems: TakeoffItem[];
  onUpdateItem: (item: TakeoffItem) => void;
  company: CompanyProfile;
  onOpenQuotation: () => void;
  onOpenSettings: () => void;
}

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const BOQView: React.FC<BOQViewProps> = ({
  metadata,
  setMetadata,
  sheets,
  takeoffItems,
  onUpdateItem,
  company,
  onOpenQuotation,
  onOpenSettings,
}) => {
  const [displayMode, setDisplayMode] = useState<"quotation" | "by-sheet" | "consolidated">("quotation");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDiscipline, setFilterDiscipline] = useState("all");

  const isItemApproved = (item: TakeoffItem): boolean =>
    item.reviewStatus === "approved" || Boolean(item.isVerified);

  const approvedItems = takeoffItems.filter(
    (item) => isItemApproved(item) && item.reviewStatus !== "rejected"
  );
  const pendingReviewItems = takeoffItems.filter(
    (item) => !isItemApproved(item) && item.reviewStatus !== "rejected"
  );

  const approvedSubtotal = approvedItems.reduce(
    (sum, item) => sum + item.quantity * (item.unitPrice || 0),
    0
  );
  const pendingSubtotal = pendingReviewItems.reduce(
    (sum, item) => sum + item.quantity * (item.unitPrice || 0),
    0
  );

  // Single source of truth shared with Excel / print: rejected lines never count anywhere.
  const quotation = buildQuotation(takeoffItems, metadata.taxRate);
  const exportWarnings = getExportWarnings(takeoffItems);
  const totalCostBeforeTax = quotation.subtotal;
  const taxAmount = quotation.tax;
  const grandTotal = quotation.grandTotal;
  const approvedGrandTotal = approvedSubtotal + (approvedSubtotal * metadata.taxRate) / 100;

  // Filter items (rejected lines are hidden here exactly as they are excluded from totals/exports)
  const filteredItems = takeoffItems.filter((item) => {
    if (item.reviewStatus === "rejected") return false;
    const parentSheet = sheets.find((s) => s.id === item.sheetId);
    const matchesSearch =
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (parentSheet?.code || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (parentSheet?.title || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDiscipline =
      filterDiscipline === "all" || parentSheet?.discipline === filterDiscipline;

    return matchesSearch && matchesDiscipline;
  });

  // Group by category for consolidated view
  const categoriesMap: Record<string, TakeoffItem[]> = {};
  filteredItems.forEach((item) => {
    const cat = item.category || "أعمال متنوعة أخرى";
    if (!categoriesMap[cat]) categoriesMap[cat] = [];
    categoriesMap[cat].push(item);
  });

  return (
    <div className="space-y-6">
      {/* Project Financial Summary Card (Screen & Print) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 print:border-none print:shadow-none print:p-0">
        {/* Engineering Header (appears cleanly in Print) */}
        <div className="border-b border-slate-200 pb-5 mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-600 font-bold text-xs">
              <Building2 className="w-4 h-4" />
              <span><span className="sm:hidden">جدول الكميات (BOQ)</span><span className="hidden sm:inline">جدول الكميات والمواصفات المعتمد (Bill of Quantities - BOQ)</span></span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {metadata.projectName}
            </h1>
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {metadata.projectCode && <span>كود المشروع: <span className="font-mono font-bold text-slate-700">{metadata.projectCode}</span></span>}
              {metadata.clientName && <span>المالك: <span className="text-slate-700">{metadata.clientName}</span></span>}
              {metadata.consultantName && <span>الاستشاري: <span className="text-slate-700">{metadata.consultantName}</span></span>}
            </p>
          </div>

          {/* Action Toolbar (hidden on print) */}
          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto print:hidden">
            <button
              onClick={onOpenQuotation}
              className="flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold shadow-sm transition-all"
              title="معاينة عرض السعر وطباعته على الورق الرسمي أو حفظه PDF"
            >
              <FileCheck className="w-4 h-4" />
              <span>عرض السعر / PDF</span>
            </button>

            <button
              onClick={() => exportBoqToExcel(metadata, sheets, takeoffItems, company)}
              className="flex items-center justify-center gap-2 whitespace-nowrap col-span-2 sm:col-span-1 order-first sm:order-none px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
              title="تصدير ملف Excel شامل (عرض السعر + الموحد + صفحة لكل مخطط)"
            >
              <Download className="w-4 h-4" />
              <span>تصدير Excel</span>
            </button>

            <button
              onClick={() => exportBoqToCsv(metadata, sheets, takeoffItems)}
              className="flex items-center justify-center gap-2 whitespace-nowrap px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all border border-slate-200"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير CSV</span>
            </button>

            <button
              onClick={() => window.print()}
              className="hidden sm:flex items-center justify-center gap-2 whitespace-nowrap px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all"
              title="طباعة جدول الكميات الظاهر على الشاشة"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة BOQ</span>
            </button>
          </div>
        </div>

        {/* Financial KPI Dashboard Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 qto-stagger">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-xs text-slate-500 block">إجمالي الكميات قبل الضريبة</span>
            <span key={totalCostBeforeTax} className="qto-tick text-lg sm:text-xl font-bold font-mono text-slate-900 mt-1 block">
              {totalCostBeforeTax.toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
              <span className="text-xs font-normal text-slate-500">{metadata.currencySymbol}</span>
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-xs text-slate-500 block">
              ضريبة القيمة المضافة ({metadata.taxRate}%)
            </span>
            <span className="text-lg sm:text-xl font-bold font-mono text-slate-900 mt-1 block">
              {taxAmount.toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
              <span className="text-xs font-normal text-slate-500">{metadata.currencySymbol}</span>
            </span>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-xs text-amber-800 font-medium block">
              الإجمالي العام شامل الضريبة
            </span>
            <span key={grandTotal} className="qto-tick text-lg sm:text-xl font-black font-mono text-amber-900 mt-1 block">
              {grandTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
              <span className="text-xs font-normal text-amber-700">{metadata.currencySymbol}</span>
            </span>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-xs text-emerald-800 font-medium block">المعتمد مقابل قيد المراجعة</span>
            <div className="text-xs font-mono text-emerald-950 font-bold mt-1">
              معتمد: {approvedSubtotal.toLocaleString("en-US", { maximumFractionDigits: 1 })} {metadata.currencySymbol} ({approvedItems.length})
            </div>
            <div className="text-[11px] font-mono text-amber-800 mt-0.5">
              قيد المراجعة: {pendingSubtotal.toLocaleString("en-US", { maximumFractionDigits: 1 })} {metadata.currencySymbol} ({pendingReviewItems.length})
            </div>
          </div>
        </div>

        {(exportWarnings.zeroPrice > 0 || exportWarnings.rejectedExcluded > 0) && (
          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1 print:hidden">
            {exportWarnings.zeroPrice > 0 && (
              <span>⚠ {exportWarnings.zeroPrice} بند بسعر وحدة صفر سيظهر بقيمة 0 في العرض.</span>
            )}
            {exportWarnings.rejectedExcluded > 0 && (
              <span>{exportWarnings.rejectedExcluded} بند مرفوض مستبعد من الأرقام والملفات.</span>
            )}
          </div>
        )}

        {pendingReviewItems.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
            <span>
              تنبيه اعتماد: يوجد <strong>{pendingReviewItems.length}</strong> بند غير معتمد بعد (أو مستعاد للمراجعة) بقيمة تقديرية{" "}
              <strong className="font-mono">{pendingSubtotal.toLocaleString("en-US", { maximumFractionDigits: 1 })} {metadata.currencySymbol}</strong> — الإجمالي المعتمد حالياً:{" "}
              <strong className="font-mono text-emerald-800">{approvedGrandTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })} {metadata.currencySymbol}</strong> شامل الضريبة.
            </span>
          </div>
        )}
      </div>

      {/* Mode Switcher & Filter Bar (hidden on print) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs print:hidden">
        {/* Toggle between per-sheet vs consolidated */}
        <div className="grid grid-cols-3 sm:flex items-center bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setDisplayMode("quotation")}
            className={`flex items-center gap-2 justify-center px-2 sm:px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              displayMode === "quotation"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>عرض السعر</span>
          </button>

          <button
            onClick={() => setDisplayMode("by-sheet")}
            className={`flex items-center gap-2 justify-center px-2 sm:px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              displayMode === "by-sheet"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span><span className="sm:hidden">حسب المخطط</span><span className="hidden sm:inline">حسب كل مخطط منفصل (معزول)</span></span>
          </button>

          <button
            onClick={() => setDisplayMode("consolidated")}
            className={`flex items-center gap-2 justify-center px-2 sm:px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              displayMode === "consolidated"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="w-4 h-4 text-blue-600" />
            <span><span className="sm:hidden">مجمّع</span><span className="hidden sm:inline">مجمع حسب تصنيف الأعمال مع كود المخطط</span></span>
          </button>
        </div>

        {/* Search & Discipline Filter (the quotation always shows the complete list) */}
        <div className={`flex items-center gap-2 w-full sm:w-auto ${displayMode === "quotation" ? "hidden" : ""}`}>
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="بحث في جدول الكميات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 pl-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-amber-500 w-full sm:w-52"
            />
          </div>

          <select
            value={filterDiscipline}
            onChange={(e) => setFilterDiscipline(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-amber-500"
          >
            <option value="all">جميع التخصصات</option>
            <option value="إنشائي">إنشائي</option>
            <option value="معماري">معماري</option>
            <option value="صحي وتغذية">صحي وتغذية</option>
            <option value="كهرباء وإنارة">كهرباء وإنارة</option>
          </select>
        </div>
      </div>

      {/* Main BOQ Presentation Tables */}
      {displayMode === "quotation" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none qto-fade-in">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="text-xs font-bold text-slate-700">
              عرض السعر — مقسّم إلى أقسام حسب تسلسل التنفيذ بالموقع، وهو نفس ما يُطبع ويُصدَّر
            </div>
            <button
              onClick={onOpenSettings}
              className="text-xs font-semibold text-amber-700 hover:text-amber-600 underline underline-offset-4"
            >
              {company.name || company.nameEn ? "تعديل بيانات الشركة والورق الرسمي" : "أدخل بيانات شركتك وورقك الرسمي"}
            </button>
          </div>

                    {/* Phone: one card per line so quantity, price and total are all visible */}
          <div className="sm:hidden print:hidden">
            {quotation.sections.length === 0 && (
              <p className="py-10 text-center text-slate-400 text-sm">لا توجد بنود بعد. أضف بنوداً من شاشة «المخططات والحصر».</p>
            )}
            {quotation.sections.map((section) => (
              <div key={section.title}>
                <div className="bg-slate-800 text-white px-4 py-2 text-xs font-bold">{section.title}</div>
                {section.rows.map((row) => {
                  const item = takeoffItems.find((i) => i.id === row.id);
                  return (
                    <div key={row.id} className="px-4 py-3 border-b border-slate-100">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 font-mono text-[11px] text-slate-400 w-5 shrink-0">{row.index}</span>
                        <span className="font-semibold text-slate-900 text-sm leading-snug">{row.description}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 items-end text-center">
                        <div>
                          <div className="text-[10px] text-slate-500">الكمية</div>
                          <div className="font-mono font-bold text-slate-900 text-sm">{n2(row.quantity)}</div>
                          <div className="text-[11px] text-slate-500">{row.unit}</div>
                        </div>
                        <label>
                          <div className="text-[10px] text-slate-500">سعر الوحدة</div>
                          <input
                            type="number" min={0} step="any" inputMode="decimal" value={row.unitPrice} aria-label="سعر الوحدة"
                            onChange={(e) => {
                              if (!item) return;
                              const price = Math.max(0, Number(e.target.value) || 0);
                              onUpdateItem({ ...item, unitPrice: price, totalPrice: Number((item.quantity * price).toFixed(2)) });
                            }}
                            className={`w-full px-2 py-1.5 rounded-lg border text-center font-mono text-sm focus:outline-none focus:border-amber-500 ${row.unitPrice > 0 ? "border-slate-300" : "border-amber-400 bg-amber-50"}`}
                          />
                        </label>
                        <div>
                          <div className="text-[10px] text-slate-500">الإجمالي</div>
                          <div className="font-mono font-bold text-slate-900 text-sm">{n2(row.total)}</div>
                          <div className="text-[11px] text-slate-500">{metadata.currencySymbol}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between bg-blue-50/70 px-4 py-2 text-xs font-bold text-slate-800 border-b border-slate-200">
                  <span>الإجمالي الفرعي</span>
                  <span className="font-mono">{n2(section.subtotal)} {metadata.currencySymbol}</span>
                </div>
              </div>
            ))}
            <div className="border-t-2 border-slate-300 bg-slate-100 px-4 py-3 flex justify-between text-sm font-bold text-slate-900">
              <span>إجمالي قيمة الأعمال</span><span className="font-mono">{n2(totalCostBeforeTax)} {metadata.currencySymbol}</span>
            </div>
            <div className="bg-slate-50 px-4 py-2.5 flex justify-between text-sm text-slate-700">
              <span>ضريبة القيمة المضافة ({metadata.taxRate}%)</span><span className="font-mono">{n2(taxAmount)} {metadata.currencySymbol}</span>
            </div>
            <div className="bg-amber-50 border-t border-amber-300 px-4 py-3.5 flex justify-between text-base font-black text-amber-950">
              <span>الإجمالي شامل الضريبة</span><span className="font-mono">{n2(grandTotal)} {metadata.currencySymbol}</span>
            </div>
          </div>

          <div className="overflow-x-auto hidden sm:block print:block">
            <table className="w-full text-right text-sm border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-xs">
                  <th className="py-3 px-3 font-bold text-center w-12">م</th>
                  <th className="py-3 px-4 font-bold">البيان</th>
                  <th className="py-3 px-3 font-bold text-center w-24">الوحدة</th>
                  <th className="py-3 px-3 font-bold text-center w-28">الكمية</th>
                  <th className="py-3 px-3 font-bold text-center w-32">سعر الوحدة ({metadata.currencySymbol})</th>
                  <th className="py-3 px-4 font-bold text-left w-36">الإجمالي ({metadata.currencySymbol})</th>
                </tr>
              </thead>
              <tbody>
                {quotation.sections.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 text-sm">
                      لا توجد بنود بعد. أضف بنوداً من شاشة «المخططات والحصر».
                    </td>
                  </tr>
                )}
                {quotation.sections.map((section) => (
                  <React.Fragment key={section.title}>
                    <tr className="bg-slate-800 text-white">
                      <td colSpan={6} className="py-2 px-4 text-xs font-bold">{section.title}</td>
                    </tr>
                    {section.rows.map((row) => {
                      const item = takeoffItems.find((i) => i.id === row.id);
                      return (
                        <tr key={row.id} className="hover:bg-slate-50 border-b border-slate-100">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-xs">{row.index}</td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">{row.description}</td>
                          <td className="py-2.5 px-3 text-center text-slate-600">{row.unit}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                            {row.quantity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.unitPrice}
                              aria-label="سعر الوحدة"
                              onChange={(e) => {
                                if (!item) return;
                                const price = Math.max(0, Number(e.target.value) || 0);
                                onUpdateItem({ ...item, unitPrice: price, totalPrice: Number((item.quantity * price).toFixed(2)) });
                              }}
                              className={`w-24 px-2 py-1 rounded-lg border text-center font-mono text-xs focus:outline-none focus:border-amber-500 print:border-none print:bg-transparent ${
                                row.unitPrice > 0 ? "border-slate-300" : "border-amber-400 bg-amber-50"
                              }`}
                            />
                          </td>
                          <td className="py-2.5 px-4 text-left font-mono font-bold text-slate-900">
                            {row.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-blue-50/70 font-bold text-slate-800 border-b border-slate-200">
                      <td colSpan={5} className="py-2 px-4 text-left text-xs">الإجمالي الفرعي - {section.title}</td>
                      <td className="py-2 px-4 text-left font-mono text-xs">
                        {section.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={5} className="py-3 px-4 text-left">إجمالي قيمة الأعمال</td>
                  <td className="py-3 px-4 text-left font-mono">
                    {totalCostBeforeTax.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {metadata.currencySymbol}
                  </td>
                </tr>
                <tr className="bg-slate-50 text-slate-700">
                  <td colSpan={5} className="py-2.5 px-4 text-left">ضريبة القيمة المضافة ({metadata.taxRate}%)</td>
                  <td className="py-2.5 px-4 text-left font-mono">
                    {taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {metadata.currencySymbol}
                  </td>
                </tr>
                <tr className="bg-amber-50 font-black text-amber-950 text-base border-t border-amber-300">
                  <td colSpan={5} className="py-3.5 px-4 text-left">الإجمالي الكلي شامل الضريبة</td>
                  <td className="py-3.5 px-4 text-left font-mono">
                    {grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {metadata.currencySymbol}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : displayMode === "by-sheet" ? (
        /* MODE 1: Strictly isolated by sheet */
        <div className="space-y-6">
          {sheets.map((sheet) => {
            const sheetItems = filteredItems.filter((i) => i.sheetId === sheet.id);
            if (sheetItems.length === 0 && searchQuery) return null;

            const sheetTotal = sheetItems.reduce(
              (sum, item) => sum + item.quantity * (item.unitPrice || 0),
              0
            );

            return (
              <div
                key={sheet.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden page-break-inside-avoid"
              >
                {/* Sheet Section Header */}
                <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 font-mono font-bold text-xs">
                      {sheet.code}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        {sheet.title}
                      </h3>
                      <span className="text-[11px] text-slate-400">
                        التخصص: {sheet.discipline} | المقياس: {sheet.scale} | الملف: {sheet.fileName}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-400">
                      عدد البنود: <span className="text-white font-bold">{sheetItems.length}</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-amber-400 font-bold">
                      إجمالي اللوحة: {sheetTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
                      {metadata.currencySymbol}
                    </span>
                  </div>
                </div>

                {/* Items Table for this Sheet */}
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200">
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3 w-20">كود البند</th>
                        <th className="py-2.5 px-2 text-center w-24">نوع القياس</th>
                        <th className="py-2.5 px-3 min-w-[200px]">الوصف الهندسي والمواصفات الفنية</th>
                        <th className="py-2.5 px-3 min-w-[120px]">الموقع والمحاور</th>
                        <th className="py-2.5 px-3 min-w-[130px]">معادلة الحساب والأبعاد</th>
                        <th className="py-2.5 px-3 text-center">الخصومات</th>
                        <th className="py-2.5 px-3 text-center font-bold text-slate-900">الكمية الصافية</th>
                        <th className="py-2.5 px-3 text-center">الوحدة</th>
                        <th className="py-2.5 px-3 text-center">سعر الوحدة ({metadata.currencySymbol})</th>
                        <th className="py-2.5 px-3 text-center font-bold text-slate-900">الإجمالي ({metadata.currencySymbol})</th>
                        <th className="py-2.5 px-3 min-w-[120px]">ملاحظات ومصدر الحصر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sheetItems.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="py-6 text-center text-slate-400">
                            لا توجد بنود حصر في هذا المخطط
                          </td>
                        </tr>
                      ) : (
                        sheetItems.map((item, idx) => {
                          const itemTotal = item.quantity * (item.unitPrice || 0);

                          return (
                            <tr key={item.id} className="hover:bg-slate-50/70">
                              <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-700">
                                {item.itemCode}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {item.dimensionType === "volume" || item.unit === "م³" ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold">
                                    <Box className="w-2.5 h-2.5" /> حجم
                                  </span>
                                ) : item.dimensionType === "area" || item.unit === "م²" ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold">
                                    <Square className="w-2.5 h-2.5" /> مساحة
                                  </span>
                                ) : item.dimensionType === "linear" || item.unit === "م.ط" ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                                    <Ruler className="w-2.5 h-2.5" /> طول
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                                    <Hash className="w-2.5 h-2.5" /> عدد
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800">
                                <div>{item.description}</div>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  {item.category}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-600">{item.location}</td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                                {item.formula || "-"}
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-rose-600">
                                {item.deduction || 0}
                              </td>
                              <td className="py-2 px-3 text-center font-mono font-bold text-slate-900 bg-slate-50/50">
                                {item.quantity}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-600">
                                {item.unit}
                              </td>
                              <td className="py-2 px-3 text-center font-mono">
                                <input
                                  type="number"
                                  value={item.unitPrice || 0}
                                  onChange={(e) =>
                                    onUpdateItem({
                                      ...item,
                                      unitPrice: Math.max(0, Number(e.target.value) || 0),
                                      totalPrice: item.quantity * Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  className="w-16 text-center px-1 py-0.5 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:border-amber-500"
                                />
                              </td>
                              <td className="py-2 px-3 text-center font-mono font-bold text-slate-900 bg-amber-50/20">
                                {itemTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                              </td>
                              <td className="py-2 px-3 text-[11px] text-slate-500">
                                {item.extractionSource === "cad_geometry" && (
                                  <span className="block text-[10px] text-blue-700 font-semibold mb-0.5">
                                    CAD: {item.sourceDetails?.layer || "Geometry"}
                                  </span>
                                )}
                                <span>{item.notes || "-"}</span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                        <td colSpan={10} className="py-2.5 px-4 text-left">
                          إجمالي لوحة {sheet.code}:
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-amber-900">
                          {sheetTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
                          <span className="text-[10px] font-normal">{metadata.currencySymbol}</span>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MODE 2: Consolidated by trade with sheet origin tags */
        <div className="space-y-6">
          {Object.entries(categoriesMap).map(([category, catItems]) => {
            const catTotal = catItems.reduce(
              (sum, item) => sum + item.quantity * (item.unitPrice || 0),
              0
            );

            return (
              <div
                key={category}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="bg-slate-800 text-white px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <h3 className="text-sm font-bold text-slate-100">{category}</h3>
                    <span className="text-xs text-slate-400 font-mono">
                      ({catItems.length} بنود)
                    </span>
                  </div>

                  <div className="font-mono text-xs text-amber-400 font-bold">
                    المجموع: {catTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
                    {metadata.currencySymbol}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3 w-20">كود البند</th>
                        <th className="py-2.5 px-3 w-24 text-center">المخطط المصدري</th>
                        <th className="py-2.5 px-2 text-center w-24">نوع القياس</th>
                        <th className="py-2.5 px-3 min-w-[220px]">الوصف الهندسي والمواصفات</th>
                        <th className="py-2.5 px-3 min-w-[120px]">الموقع / المحاور</th>
                        <th className="py-2.5 px-3 text-center font-bold text-slate-900">الكمية الصافية</th>
                        <th className="py-2.5 px-3 text-center">الوحدة</th>
                        <th className="py-2.5 px-3 text-center">سعر الوحدة</th>
                        <th className="py-2.5 px-3 text-center font-bold text-slate-900">الإجمالي ({metadata.currencySymbol})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {catItems.map((item, idx) => {
                        const parentSheet = sheets.find((s) => s.id === item.sheetId);
                        const itemTotal = item.quantity * (item.unitPrice || 0);

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-700">
                              {item.itemCode}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[10px] font-bold border border-slate-200">
                                {parentSheet?.code || item.sheetCode || "-"}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-center">
                              {item.dimensionType === "volume" || item.unit === "م³" ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold">
                                  <Box className="w-2.5 h-2.5" /> حجم
                                </span>
                              ) : item.dimensionType === "area" || item.unit === "م²" ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold">
                                  <Square className="w-2.5 h-2.5" /> مساحة
                                </span>
                              ) : item.dimensionType === "linear" || item.unit === "م.ط" ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                                  <Ruler className="w-2.5 h-2.5" /> طول
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                                  <Hash className="w-2.5 h-2.5" /> عدد
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-800">
                              <div>{item.description}</div>
                              {item.extractionSource === "cad_geometry" && (
                                <span className="text-[10px] text-blue-700 font-mono">
                                  CAD Layer: {item.sourceDetails?.layer || "Geometry"}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{item.location}</td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                              {item.quantity}
                            </td>
                            <td className="py-2 px-3 text-center text-slate-600">{item.unit}</td>
                            <td className="py-2 px-3 text-center font-mono">
                              <input
                                type="number"
                                value={item.unitPrice || 0}
                                onChange={(e) =>
                                  onUpdateItem({
                                    ...item,
                                    unitPrice: Math.max(0, Number(e.target.value) || 0),
                                    totalPrice: item.quantity * Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                className="w-16 text-center px-1 py-0.5 border border-slate-200 rounded font-mono text-xs focus:outline-none"
                              />
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-900 bg-amber-50/20">
                              {itemTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Engineering Signatures Block (Standard in official engineering BOQs) */}
      <div className="hidden sm:block print:block bg-white rounded-2xl border border-slate-200 p-6 print:border-t-2 print:border-slate-800 print:mt-8">
        <div className="text-xs font-bold text-slate-800 mb-6 border-b border-slate-100 pb-2">
          اعتمادات وتواقيع جدول الكميات الهندسي:
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center text-xs text-slate-600">
          <div className="space-y-4">
            <div className="font-semibold text-slate-800">مهندس حصر الكميات والمكتب الفني</div>
            <div className="h-16 border-b border-dashed border-slate-300 flex items-center justify-center text-slate-400 italic">
              التوقيع والختم
            </div>
            <div>التاريخ: {metadata.date}</div>
          </div>

          <div className="space-y-4">
            <div className="font-semibold text-slate-800">مدير المشروع - المقاول العام</div>
            <div className="h-16 border-b border-dashed border-slate-300 flex items-center justify-center text-slate-400 italic">
              التوقيع والختم
            </div>
            <div>الاعتماد: {metadata.contractorName}</div>
          </div>

          <div className="space-y-4">
            <div className="font-semibold text-slate-800">المهندس الاستشاري المشرف</div>
            <div className="h-16 border-b border-dashed border-slate-300 flex items-center justify-center text-slate-400 italic">
              التوقيع والختم المعتمد
            </div>
            <div>المكتب: {metadata.consultantName}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
