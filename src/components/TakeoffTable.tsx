import React, { useState, useRef } from "react";
import {
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  Calculator,
  Filter,
  Search,
  Check,
  AlertCircle,
  Tag,
  Sparkles,
  Info,
  Box,
  Square,
  Ruler,
  Hash,
  Layers,
  ChevronDown,
  Eye,
  FileUp,
  MoreHorizontal,
  History,
} from "lucide-react";
import { TakeoffItem, BlueprintSheet, TradeCategory, DimensionType, ReviewStatus } from "../types";
import { importBoqFromExcel } from "../utils/boqExporter";

interface TakeoffTableProps {
  sheet: BlueprintSheet;
  items: TakeoffItem[];
  onAddItem: (item: TakeoffItem) => void;
  onUpdateItem: (updatedItem: TakeoffItem) => void;
  onDeleteItem: (id: string) => void;
  onDeleteMany?: (ids: string[]) => void;
  currencySymbol: string;
  onOpenVisualSearch: () => void;
  onOpenExtractionModal?: () => void;
  onInspectItemOnSheet?: (item: TakeoffItem) => void;
  onImportExcelItems?: (items: TakeoffItem[]) => void;
  onUpdateStatus?: (item: TakeoffItem, status: ReviewStatus, reason?: string) => void;
  /** One table for every sheet of the project: no "linked to sheet" badge; rows show their sheet code. */
  combined?: boolean;
}

export const TakeoffTable: React.FC<TakeoffTableProps> = ({
  sheet,
  items,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onDeleteMany,
  currencySymbol,
  onOpenVisualSearch,
  onOpenExtractionModal,
  onInspectItemOnSheet,
  onImportExcelItems,
  onUpdateStatus,
  combined = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDimensionType, setSelectedDimensionType] = useState<"all" | DimensionType>("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | ReviewStatus>("all");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  // Phone list: which row is open for editing, and which sections are folded.
  const [menuOpen, setMenuOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [catClosed, setCatClosed] = useState<Record<string, boolean>>({});
  const money2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const STATUS_META: Record<ReviewStatus, { label: string; cls: string }> = {
    draft: { label: "مسودة", cls: "bg-slate-100 text-slate-700 border-slate-300" },
    extracted: { label: "مستخرج", cls: "bg-cyan-50 text-cyan-800 border-cyan-300" },
    needs_review: { label: "يحتاج مراجعة", cls: "bg-amber-50 text-amber-800 border-amber-300" },
    reviewed: { label: "تمت مراجعته", cls: "bg-blue-50 text-blue-800 border-blue-300" },
    approved: { label: "معتمد ✓", cls: "bg-emerald-50 text-emerald-800 border-emerald-300" },
    rejected: { label: "مرفوض", cls: "bg-rose-50 text-rose-700 border-rose-300" },
  };

  const getEffectiveStatus = (item: TakeoffItem): ReviewStatus => {
    if (item.reviewStatus) return item.reviewStatus;
    if (item.isVerified) return "approved";
    if (item.extractionSource === "cad_geometry" || item.extractionSource === "visual_search") return "extracted";
    return "draft";
  };

  const handleExcelFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportExcelItems) return;
    try {
      const imported = await importBoqFromExcel(file, sheet);
      if (imported.length === 0) {
        alert("لم يتم العثور على بنود صالحة داخل ملف Excel.");
      } else {
        onImportExcelItems(imported);
      }
    } catch (err: any) {
      alert(err?.message || "تعذر قراءة ملف Excel.");
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = "";
    }
  };

  // New item form state
  const [newItem, setNewItem] = useState<Partial<TakeoffItem>>({
    itemCode: `${(items.length + 1).toString().padStart(2, "0")}.01`,
    description: "",
    category: "أعمال خرسانية مسلحة وعادية",
    dimensionType: "volume",
    location: "",
    count: 1,
    length: 0,
    width: 0,
    height: 0,
    deduction: 0,
    quantity: 1,
    unit: "م³",
    unitPrice: 0,
    notes: "",
  });

  // Filter items strictly belonging to this sheet
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      (item.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.itemCode || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.location || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || item.category === selectedCategory;
    const matchesDimensionType =
      selectedDimensionType === "all" ||
      item.dimensionType === selectedDimensionType ||
      (selectedDimensionType === "volume" && item.unit === "م³") ||
      (selectedDimensionType === "area" && item.unit === "م²") ||
      (selectedDimensionType === "linear" && item.unit === "م.ط") ||
      (selectedDimensionType === "count" && (item.unit === "عدد" || item.unit === "نقطة"));
    const matchesStatus = selectedStatus === "all" || getEffectiveStatus(item) === selectedStatus;
    return matchesSearch && matchesCategory && matchesDimensionType && matchesStatus;
  });

  const draftItems = items.filter((i) => !(i.reviewStatus === "approved" || i.isVerified));

  // Phone list: sections in first-appearance order, numbering matches the desktop table.
  const phoneGroups = (() => {
    const map = new Map<string, { title: string; rows: { item: TakeoffItem; index: number }[] }>();
    filteredItems.forEach((item, index) => {
      const title = item.category || "بدون تصنيف";
      if (!map.has(title)) map.set(title, { title, rows: [] });
      map.get(title)!.rows.push({ item, index });
    });
    return [...map.values()];
  })();
  // Long lists start folded (so 300 lines do not bury the rest); short ones start open.
  const isCatClosed = (title: string) => (title in catClosed ? catClosed[title] : filteredItems.length > 30);

  // Sheet Summary Metrics
  const volumeTotal = items
    .filter((i) => i.dimensionType === "volume" || i.unit === "م³")
    .reduce((sum, i) => sum + i.quantity, 0);

  const areaTotal = items
    .filter((i) => i.dimensionType === "area" || i.unit === "م²")
    .reduce((sum, i) => sum + i.quantity, 0);

  const lengthTotal = items
    .filter((i) => i.dimensionType === "linear" || i.unit === "م.ط")
    .reduce((sum, i) => sum + i.quantity, 0);

  const countTotal = items
    .filter((i) => i.dimensionType === "count" || i.unit === "عدد" || i.unit === "نقطة")
    .reduce((sum, i) => sum + i.quantity, 0);

  const weightTotal = items
    .filter((i) => i.unit === "طن")
    .reduce((sum, i) => sum + i.quantity, 0);

  const sheetCostTotal = items.reduce(
    (sum, i) => sum + i.quantity * (i.unitPrice || 0),
    0
  );

  const categories = Array.from(new Set(items.map((i) => i.category))).filter(Boolean);

  const handleSaveNewItem = () => {
    if (!newItem.description?.trim()) return;

    let qty = Number(newItem.quantity) || 0;
    // Auto calculate if dimensions are given
    if (newItem.length && newItem.width && newItem.height && newItem.count) {
      qty =
        newItem.count * newItem.length * newItem.width * newItem.height -
        (newItem.deduction || 0);
    } else if (newItem.length && newItem.width && newItem.count) {
      qty =
        newItem.count * newItem.length * newItem.width - (newItem.deduction || 0);
    }

    const created: TakeoffItem = {
      id: `item-${Date.now()}`,
      sheetId: sheet.id,
      sheetCode: sheet.code,
      sheetTitle: sheet.title,
      itemCode: newItem.itemCode || `${items.length + 1}.01`,
      description: newItem.description || "بند جديد",
      category: newItem.category || "أعمال متنوعة أخرى",
      dimensionType: newItem.dimensionType || "volume",
      location: newItem.location || "",
      count: Number(newItem.count) || 1,
      length: Number(newItem.length) || 0,
      width: Number(newItem.width) || 0,
      height: Number(newItem.height) || 0,
      formula:
        newItem.formula ||
        `${newItem.count || 1} × ${newItem.length || 0} × ${newItem.width || 0}`,
      deduction: Number(newItem.deduction) || 0,
      quantity: Number(qty.toFixed(2)),
      unit: newItem.unit || "م³",
      unitPrice: Number(newItem.unitPrice) || 0,
      totalPrice: Number((qty * (newItem.unitPrice || 0)).toFixed(2)),
      notes: newItem.notes || "",
      isVerified: true,
      extractionSource: "manual_input",
    };

    onAddItem(created);
    setIsAddingNew(false);
    setNewItem({
      itemCode: `${(items.length + 2).toString().padStart(2, "0")}.01`,
      description: "",
      category: "أعمال خرسانية مسلحة وعادية",
      dimensionType: "volume",
      location: "",
      count: 1,
      length: 0,
      width: 0,
      height: 0,
      deduction: 0,
      quantity: 1,
      unit: "م³",
      unitPrice: 0,
      notes: "",
    });
  };

  const handleDuplicate = (item: TakeoffItem) => {
    const duplicated: TakeoffItem = {
      ...item,
      id: `item-${Date.now()}`,
      itemCode: `${item.itemCode}-نسخة`,
      description: `${item.description} (نسخة مكررة)`,
    };
    onAddItem(duplicated);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
      {/* Top Banner with Strict Segregation Badge & Summary Cards */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-slate-950 font-mono font-bold text-xs">
                {sheet.code}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-800">
                {combined ? `جدول الكميات: ${sheet.title}` : `دفتر حصر كميات: ${sheet.title}`}
              </h2>
            </div>
            {combined ? (
              <p className="text-xs text-slate-500 mt-1 hidden sm:block">كل لوحات المشروع في جدول واحد ({sheet.fileName}). رمز اللوحة بجانب كل بند.</p>
            ) : (
              <p className="text-xs text-slate-500 mt-1 hidden sm:flex items-center gap-2 flex-wrap">
                <span>التخصص: {sheet.discipline}</span>
                <span>•</span>
                <span>الملف: {sheet.fileName}</span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  حصر منعزل ومربوط باللوحة {sheet.code}
                </span>
              </p>
            )}
          </div>

          <div className="sm:hidden relative flex items-center gap-2 w-full">
            <button
              onClick={() => setIsAddingNew(true)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-3 text-sm font-bold text-white"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>بند يدوي</span>
            </button>
            {(onImportExcelItems || draftItems.length > 0) && (
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="خيارات أخرى"
                aria-expanded={menuOpen}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            )}
            {menuOpen && (
              <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {onImportExcelItems && (
                  <button
                    onClick={() => { setMenuOpen(false); excelInputRef.current?.click(); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-right text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <FileUp className="w-4 h-4 text-slate-500" /> استيراد بنود من Excel
                  </button>
                )}
                {draftItems.length > 0 && onDeleteMany && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (window.confirm(`سيُحذف ${draftItems.length} بنداً غير معتمد من هذه اللوحة، وتبقى البنود المعتمدة. يمكنك التراجع بزر الرجوع الأحمر في الأعلى.`)) onDeleteMany(draftItems.map((i) => i.id));
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-right text-sm font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" /> حذف غير المعتمدة ({draftItems.length})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2 sm:flex-wrap w-full sm:w-auto">
            {onDeleteMany && (() => {
              const drafts = items.filter((i) => !(i.reviewStatus === "approved" || i.isVerified));
              if (drafts.length === 0) return null;
              return (
                <button
                  onClick={() => {
                    if (window.confirm(`سيُحذف ${drafts.length} بنداً غير معتمد من هذه اللوحة، وتبقى البنود المعتمدة. يمكنك التراجع بزر الرجوع الأحمر في الأعلى.`)) onDeleteMany(drafts.map((i) => i.id));
                  }}
                  className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-all"
                  title="يحذف كل البنود التي لم تعتمدها بعد"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف غير المعتمدة ({drafts.length})</span>
                </button>
              );
            })()}

            {onImportExcelItems && (
              <>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={handleExcelFileImport}
                  className="hidden"
                />
                <button
                  onClick={() => excelInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all"
                  title="استيراد بنود من جدول Excel موجود إلى هذه اللوحة"
                >
                  <FileUp className="w-4 h-4 text-slate-500" />
                  <span>استيراد Excel</span>
                </button>
              </>
            )}

            <button
              id="btn-add-item-row"
              onClick={() => setIsAddingNew(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>بند يدوي</span>
            </button>

          </div>
        </div>

        {/* Metric Badges for this specific sheet */}
        <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 text-right -mx-1 px-1 sm:mx-0 sm:px-0 qto-stagger">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs shrink-0 min-w-[132px] sm:min-w-0">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Box className="w-3 h-3 text-purple-600" /> الحجوم والخرسانات
            </span>
            <span className="text-base font-bold font-mono text-slate-800">
              {volumeTotal.toFixed(2)}{" "}
              <span className="text-xs font-normal text-slate-500">م³</span>
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs shrink-0 min-w-[132px] sm:min-w-0">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Square className="w-3 h-3 text-blue-600" /> المسطحات والمباني
            </span>
            <span className="text-base font-bold font-mono text-slate-800">
              {areaTotal.toFixed(1)}{" "}
              <span className="text-xs font-normal text-slate-500">م²</span>
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs shrink-0 min-w-[132px] sm:min-w-0">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Ruler className="w-3 h-3 text-emerald-600" /> الأطوال والمسارات
            </span>
            <span className="text-base font-bold font-mono text-slate-800">
              {lengthTotal.toFixed(1)}{" "}
              <span className="text-xs font-normal text-slate-500">م.ط</span>
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs shrink-0 min-w-[132px] sm:min-w-0">
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Hash className="w-3 h-3 text-amber-600" /> الأعداد والقطع
            </span>
            <span className="text-base font-bold font-mono text-slate-800">
              {countTotal}{" "}
              <span className="text-xs font-normal text-slate-500">عدد</span>
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs shrink-0 min-w-[132px] sm:min-w-0">
            <span className="text-[11px] text-slate-500 block">حديد التسليح</span>
            <span className="text-base font-bold font-mono text-slate-800">
              {weightTotal.toFixed(2)}{" "}
              <span className="text-xs font-normal text-slate-500">طن</span>
            </span>
          </div>

          <div className="bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/80 shadow-2xs">
            <span className="text-[11px] text-amber-800 font-medium block">
              قيمة أعمال المخطط
            </span>
            <span className="text-base font-bold font-mono text-amber-900">
              {sheetCostTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
              <span className="text-xs font-normal text-amber-700">{currencySymbol}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Dimension Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="بحث في بنود هذا المخطط (الوصف، الرمز، الموقع)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-amber-500 transition-all text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Review Status Filter */}
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-xs text-slate-500">الحالة:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as "all" | ReviewStatus)}
            className="px-2.5 py-1 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-semibold"
          >
            <option value="all">جميع الحالات</option>
            <option value="draft">مسودة</option>
            <option value="extracted">مستخرج</option>
            <option value="needs_review">يحتاج مراجعة</option>
            <option value="reviewed">تمت مراجعته</option>
            <option value="approved">معتمد ✓</option>
            <option value="rejected">مرفوض</option>
          </select>
        </div>

        {/* Dimension Type Quick Filters */}
        <div className="hidden sm:flex items-center gap-1.5 sm:flex-wrap">
          <span className="text-xs text-slate-500 ml-1 whitespace-nowrap">نوع القياس:</span>
          <button
            onClick={() => setSelectedDimensionType("all")}
            className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              selectedDimensionType === "all"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            الكل ({items.length})
          </button>
          <button
            onClick={() => setSelectedDimensionType("volume")}
            className={`flex items-center gap-1 shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              selectedDimensionType === "volume"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Box className="w-3 h-3" />
            <span>حجوم (م³)</span>
          </button>
          <button
            onClick={() => setSelectedDimensionType("area")}
            className={`flex items-center gap-1 shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              selectedDimensionType === "area"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Square className="w-3 h-3" />
            <span>مساحات (م²)</span>
          </button>
          <button
            onClick={() => setSelectedDimensionType("linear")}
            className={`flex items-center gap-1 shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              selectedDimensionType === "linear"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Ruler className="w-3 h-3" />
            <span>أطوال (م.ط)</span>
          </button>
          <button
            onClick={() => setSelectedDimensionType("count")}
            className={`flex items-center gap-1 shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              selectedDimensionType === "count"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Hash className="w-3 h-3" />
            <span>أعداد</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500">التصنيف:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-500"
          >
            <option value="all">جميع التصنيفات</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Adding New Item Form Row */}
      {isAddingNew && (
        <div className="p-4 bg-amber-50/50 border-b border-amber-200 text-xs">
          <div className="font-bold text-amber-900 mb-3 flex items-center justify-between">
            <span>إضافة بند حصر هندسي جديد للوحة {sheet.code}:</span>
            <button
              onClick={() => setIsAddingNew(false)}
              className="text-slate-500 hover:text-slate-800"
            >
              إلغاء
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-slate-600 block mb-1">رمز البند:</label>
              <input
                type="text"
                value={newItem.itemCode}
                onChange={(e) => setNewItem({ ...newItem, itemCode: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="text-slate-600 block mb-1">تصنيف الأعمال:</label>
              <select
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
              >
                <option value="أعمال الحفر والردم والأساسات">أعمال الحفر والردم والأساسات</option>
                <option value="أعمال خرسانية مسلحة وعادية">أعمال خرسانية مسلحة وعادية</option>
                <option value="أعمال حديد التسليح">أعمال حديد التسليح</option>
                <option value="أعمال المباني والبلوك">أعمال المباني والبلوك</option>
                <option value="أعمال العزل المائي والحراري">أعمال العزل المائي والحراري</option>
                <option value="أعمال البياض والتشطيبات الداخلية">أعمال البياض والتشطيبات الداخلية</option>
                <option value="أعمال الأرضيات والرخام والبورسلين">أعمال الأرضيات والرخام والبورسلين</option>
                <option value="أعمال الأبواب والشبابيك والألمنيوم">أعمال الأبواب والشبابيك والألمنيوم</option>
                <option value="أعمال التغذية والصرف الصحي">أعمال التغذية والصرف الصحي</option>
                <option value="أعمال التمديدات الكهربائية والإنارة">أعمال التمديدات الكهربائية والإنارة</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-slate-600 block mb-1">الوصف الهندسي للبند:</label>
              <input
                type="text"
                placeholder="مثال: خرسانة مسلحة للأعمدة سُمك 25 سم..."
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-slate-600 block mb-1">الموقع / المحاور:</label>
              <input
                type="text"
                placeholder="محاور A-D، الدور الأرضي..."
                value={newItem.location}
                onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="text-slate-600 block mb-1">العدد × الطول × العرض × الارتفاع:</label>
              <div className="grid grid-cols-4 gap-1">
                <input
                  type="number"
                  placeholder="عدد"
                  value={newItem.count || ""}
                  onChange={(e) => setNewItem({ ...newItem, count: Number(e.target.value) })}
                  className="px-1.5 py-1 bg-white border border-slate-300 rounded text-center font-mono"
                />
                <input
                  type="number"
                  placeholder="طول"
                  value={newItem.length || ""}
                  onChange={(e) => setNewItem({ ...newItem, length: Number(e.target.value) })}
                  className="px-1.5 py-1 bg-white border border-slate-300 rounded text-center font-mono"
                />
                <input
                  type="number"
                  placeholder="عرض"
                  value={newItem.width || ""}
                  onChange={(e) => setNewItem({ ...newItem, width: Number(e.target.value) })}
                  className="px-1.5 py-1 bg-white border border-slate-300 rounded text-center font-mono"
                />
                <input
                  type="number"
                  placeholder="ارتفاع"
                  value={newItem.height || ""}
                  onChange={(e) => setNewItem({ ...newItem, height: Number(e.target.value) })}
                  className="px-1.5 py-1 bg-white border border-slate-300 rounded text-center font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-600 block mb-1">الكمية الصافية والوحدة:</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={newItem.quantity || ""}
                  onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                  className="w-24 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold"
                />
                <select
                  value={newItem.unit}
                  onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                  className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded"
                >
                  <option value="م³">م³</option>
                  <option value="م²">م²</option>
                  <option value="م.ط">م.ط</option>
                  <option value="عدد">عدد</option>
                  <option value="طن">طن</option>
                  <option value="كجم">كجم</option>
                  <option value="نقطة">نقطة</option>
                  <option value="مقطوعية">مقطوعية</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-slate-600 block mb-1">سعر الوحدة التقديري ({currencySymbol}):</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={newItem.unitPrice || ""}
                  onChange={(e) => setNewItem({ ...newItem, unitPrice: Number(e.target.value) })}
                  className="w-24 px-2 py-1 bg-white border border-slate-300 rounded font-mono font-bold"
                />
                <button
                  onClick={handleSaveNewItem}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded px-3 py-1 flex items-center justify-center gap-1"
                >
                  <Check className="w-4 h-4" />
                  حفظ البند
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Takeoff Items Table */}
      {/* Phone: compact rows grouped by section; tap a row to edit everything */}
      <div className="sm:hidden">
        {filteredItems.length === 0 ? (
          <div className="py-10 px-4 text-center text-slate-400">
            <Calculator className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600 text-sm">لا توجد بنود في هذا المخطط بعد</p>
            <p className="text-xs mt-1">اضغط «حلّل اللوحة» أو أضف بنداً يدوياً.</p>
          </div>
        ) : (
          phoneGroups.map((grp) => {
            const closed = isCatClosed(grp.title);
            const subtotal = grp.rows.reduce((sum, r) => sum + (getEffectiveStatus(r.item) === "rejected" ? 0 : r.item.quantity * (r.item.unitPrice || 0)), 0);
            return (
              <section key={grp.title} className="border-b border-slate-200">
                <button
                  onClick={() => setCatClosed((m) => ({ ...m, [grp.title]: !closed }))}
                  aria-expanded={!closed}
                  className="w-full flex items-center gap-2 bg-slate-100 px-3 py-2.5 text-right"
                >
                  <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${closed ? "-rotate-90" : ""}`} />
                  <span className="flex-1 min-w-0 truncate text-xs font-bold text-slate-800">{grp.title}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-mono text-slate-600 border border-slate-200">{grp.rows.length}</span>
                  <span className="shrink-0 font-mono text-[11px] font-bold text-amber-800">{money2(subtotal)}</span>
                </button>
                {!closed && (
                  <div className="divide-y divide-slate-100">
                    {grp.rows.map(({ item, index }) => {
                      const st = getEffectiveStatus(item);
                      const total = item.quantity * (item.unitPrice || 0);
                      const open = openId === item.id;
                      const rejected = st === "rejected";
                      const fld = "w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-mono text-center focus:bg-white focus:border-amber-500 focus:outline-none";
                      const setStatus = (next: ReviewStatus) => {
                        if (onUpdateStatus) onUpdateStatus(item, next, "تغيير الحالة من الجدول");
                        else onUpdateItem({ ...item, reviewStatus: next, isVerified: next === "approved" });
                      };
                      return (
                        <article key={item.id} className={`px-3 py-2.5 ${rejected ? "opacity-50" : ""}`}>
                          <div className="flex items-start gap-2.5">
                            <button
                              onClick={() => setStatus(st === "approved" ? "reviewed" : "approved")}
                              aria-label={st === "approved" ? "إلغاء الاعتماد" : "اعتماد البند"}
                              aria-pressed={st === "approved"}
                              className={`mt-0.5 shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition ${st === "approved" ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-400"}`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setOpenId(open ? null : item.id)} className="min-w-0 flex-1 text-right" aria-expanded={open}>
                              <div className={`text-[13px] font-semibold leading-5 text-slate-900 ${open ? "" : "line-clamp-2"} ${rejected ? "line-through" : ""}`}>{item.description || "بند بلا وصف"}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                                <span className="font-mono">#{index + 1}</span>
                                {combined && item.sheetCode && <span className="font-mono font-bold text-slate-600">{item.sheetCode}</span>}
                                {item.location && <span>{item.location}</span>}
                                {st === "needs_review" && <span className={`px-1.5 rounded border text-[10px] font-bold ${STATUS_META[st].cls}`}>{STATUS_META[st].label}</span>}
                              </div>
                            </button>
                            <button onClick={() => setOpenId(open ? null : item.id)} aria-label={open ? "إغلاق التعديل" : "تعديل البند"} className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                              <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
                            </button>
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <span className="min-w-[88px] font-mono text-sm font-bold text-slate-900 whitespace-nowrap">
                              {item.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                              <span className="mr-1 font-sans text-[11px] font-normal text-slate-500">{item.unit}</span>
                            </span>
                            <span className="text-slate-300">×</span>
                            <input
                              type="number" min={0} step="any" inputMode="decimal" aria-label="سعر الوحدة"
                              value={item.unitPrice || ""} placeholder="السعر"
                              onChange={(e) => { const price = Math.max(0, Number(e.target.value) || 0); onUpdateItem({ ...item, unitPrice: price, totalPrice: Number((item.quantity * price).toFixed(2)) }); }}
                              className={`w-[84px] rounded-lg border px-2 py-1.5 text-center font-mono text-sm focus:outline-none focus:border-amber-500 ${item.unitPrice > 0 ? "border-slate-300 bg-white" : "border-amber-400 bg-amber-50"}`}
                            />
                            <span className="mr-auto font-mono text-sm font-bold text-amber-800 whitespace-nowrap">
                              {money2(total)}
                            </span>
                          </div>

                          {open && (
                            <div className="mt-3 space-y-2.5 rounded-xl bg-slate-50 border border-slate-200 p-3">
                              <label className="block text-[11px] font-semibold text-slate-600">الوصف
                                <textarea rows={2} value={item.description} onChange={(e) => onUpdateItem({ ...item, description: e.target.value })}
                                  className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm leading-6 focus:border-amber-500 focus:outline-none" />
                              </label>
                              <div className="grid grid-cols-3 gap-2">
                                <label className="text-[11px] font-semibold text-slate-600">الكمية
                                  <input type="number" step="0.01" inputMode="decimal" value={item.quantity} className={`mt-1 ${fld} font-bold`}
                                    onChange={(e) => onUpdateItem({ ...item, quantity: Number(e.target.value), totalPrice: Number((Number(e.target.value) * (item.unitPrice || 0)).toFixed(2)) })} />
                                </label>
                                <label className="text-[11px] font-semibold text-slate-600">الوحدة
                                  <select value={item.unit} className={`mt-1 ${fld}`} onChange={(e) => onUpdateItem({ ...item, unit: e.target.value })}>
                                    {["م³", "م²", "م.ط", "عدد", "طن", "كجم", "نقطة", "مقطوعية"].map((u) => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </label>
                                <label className="text-[11px] font-semibold text-slate-600">الحالة
                                  <select value={st} className={`mt-1 ${fld} font-sans`} onChange={(e) => setStatus(e.target.value as ReviewStatus)}>
                                    <option value="draft">مسودة</option>
                                    <option value="extracted">مستخرج</option>
                                    <option value="needs_review">يحتاج مراجعة</option>
                                    <option value="reviewed">تمت مراجعته</option>
                                    <option value="approved">معتمد</option>
                                    <option value="rejected">مرفوض</option>
                                  </select>
                                </label>
                              </div>
                              {(item.formula || item.sourceEvidence) && (
                                <p className="text-[11px] leading-5 text-slate-500">{item.formula || item.sourceEvidence}</p>
                              )}
                              <div className="flex items-center justify-end gap-1.5">
                                {onInspectItemOnSheet && (
                                  <button onClick={() => onInspectItemOnSheet(item)} className="flex items-center gap-1 rounded-lg bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800"><Eye className="w-4 h-4" />على المخطط</button>
                                )}
                                <button onClick={() => handleDuplicate(item)} className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"><Copy className="w-4 h-4" />تكرار</button>
                                <button
                                  onClick={() => { if (window.confirm(`هل أنت متأكد من حذف البند "${item.description}"؟`)) onDeleteItem(item.id); }}
                                  className="flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"><Trash2 className="w-4 h-4" />حذف</button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200">
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              <th className="py-2.5 px-3 w-20">كود البند</th>
              <th className="py-2.5 px-2 text-center w-24">نوع القياس</th>
              <th className="py-2.5 px-3 min-w-[190px]">الوصف الهندسي والمواصفات</th>
              <th className="py-2.5 px-3 min-w-[120px]">الموقع / المحاور</th>
              <th className="py-2.5 px-3 min-w-[140px]">معادلة الحساب والأبعاد</th>
              <th className="py-2.5 px-3 text-center">الخصم</th>
              <th className="py-2.5 px-3 text-center font-bold text-slate-900">الكمية الصافية</th>
              <th className="py-2.5 px-3 text-center">الوحدة</th>
              <th className="py-2.5 px-3 text-center">سعر الوحدة ({currencySymbol})</th>
              <th className="py-2.5 px-3 text-center font-bold text-amber-900">الإجمالي ({currencySymbol})</th>
              <th className="py-2.5 px-2 text-center w-28">حالة المراجعة</th>
              <th className="py-2.5 px-3 text-center w-24">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-slate-400">
                  <Calculator className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-600">لا توجد بنود حصر في هذا المخطط حتى الآن.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    انقر على "استخراج الكميات الهندسية" أو "بحث بصري في الملف" لقراءة المخطط واستخراج الكميات فوراً.
                  </p>
                </td>
              </tr>
            ) : (
              filteredItems.map((item, index) => {
                const itemTotal = item.quantity * (item.unitPrice || 0);

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-amber-50/30 transition-colors group"
                  >
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                      {index + 1}
                    </td>

                    <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                      <input
                        type="text"
                        value={item.itemCode}
                        onChange={(e) =>
                          onUpdateItem({ ...item, itemCode: e.target.value })
                        }
                        className="w-16 px-1.5 py-0.5 bg-transparent hover:bg-slate-100 focus:bg-white rounded border border-transparent focus:border-slate-300"
                      />
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      {item.dimensionType === "volume" || item.unit === "م³" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold whitespace-nowrap">
                          <Box className="w-3 h-3" /> حجم (م³)
                        </span>
                      ) : item.dimensionType === "area" || item.unit === "م²" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold whitespace-nowrap">
                          <Square className="w-3 h-3" /> مساحة (م²)
                        </span>
                      ) : item.dimensionType === "linear" || item.unit === "م.ط" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold whitespace-nowrap">
                          <Ruler className="w-3 h-3" /> طول (م.ط)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold whitespace-nowrap">
                          <Hash className="w-3 h-3" /> عدد
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800">
                        <textarea
                          rows={1}
                          value={item.description}
                          onChange={(e) =>
                            onUpdateItem({ ...item, description: e.target.value })
                          }
                          className="w-full px-1.5 py-0.5 bg-transparent hover:bg-slate-100 focus:bg-white rounded border border-transparent focus:border-slate-300 resize-none"
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {item.category}
                        </span>
                        {item.extractionSource === "cad_geometry" && (
                          <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                            CAD: {item.sourceDetails?.layer || "Geometry"}
                          </span>
                        )}
                        {item.notes && <span className="truncate max-w-xs">{item.notes}</span>}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-slate-600">
                      {combined && item.sheetCode && <div className="px-1.5 font-mono text-[11px] font-bold text-slate-500">{item.sheetCode}</div>}
                      <input
                        type="text"
                        value={item.location}
                        onChange={(e) =>
                          onUpdateItem({ ...item, location: e.target.value })
                        }
                        className="w-full px-1.5 py-0.5 bg-transparent hover:bg-slate-100 focus:bg-white rounded border border-transparent focus:border-slate-300"
                      />
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                      <input
                        type="text"
                        value={item.formula || ""}
                        onChange={(e) =>
                          onUpdateItem({ ...item, formula: e.target.value })
                        }
                        placeholder="معادلة الحساب"
                        className="w-full px-1.5 py-0.5 bg-transparent hover:bg-slate-100 focus:bg-white rounded border border-transparent focus:border-slate-300"
                      />
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono text-rose-600">
                      <input
                        type="number"
                        value={item.deduction || 0}
                        onChange={(e) =>
                          onUpdateItem({
                            ...item,
                            deduction: Number(e.target.value),
                          })
                        }
                        className="w-14 text-center px-1 py-0.5 bg-transparent hover:bg-slate-100 focus:bg-white rounded border border-transparent focus:border-slate-300"
                      />
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                      <input
                        type="number"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) =>
                          onUpdateItem({
                            ...item,
                            quantity: Number(e.target.value),
                            totalPrice: Number(e.target.value) * (item.unitPrice || 0),
                          })
                        }
                        className="w-20 text-center font-bold px-1.5 py-0.5 bg-slate-100/60 focus:bg-white rounded border border-slate-200 focus:border-amber-500"
                      />
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <select
                        value={item.unit}
                        onChange={(e) =>
                          onUpdateItem({ ...item, unit: e.target.value })
                        }
                        className="bg-transparent hover:bg-slate-100 rounded px-1 py-0.5 text-xs text-slate-700"
                      >
                        <option value="م³">م³</option>
                        <option value="م²">م²</option>
                        <option value="م.ط">م.ط</option>
                        <option value="عدد">عدد</option>
                        <option value="طن">طن</option>
                        <option value="كجم">كجم</option>
                        <option value="نقطة">نقطة</option>
                        <option value="مقطوعية">مقطوعية</option>
                      </select>
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono">
                      <input
                        type="number"
                        value={item.unitPrice || 0}
                        onChange={(e) =>
                          onUpdateItem({
                            ...item,
                            unitPrice: Number(e.target.value),
                            totalPrice: item.quantity * Number(e.target.value),
                          })
                        }
                        className="w-18 text-center px-1.5 py-0.5 bg-transparent hover:bg-slate-100 focus:bg-white rounded border border-transparent focus:border-slate-300"
                      />
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-900 bg-amber-50/20">
                      {itemTotal.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      <select
                        value={getEffectiveStatus(item)}
                        onChange={(e) => {
                          const nextSt = e.target.value as ReviewStatus;
                          if (onUpdateStatus) {
                            onUpdateStatus(item, nextSt, "تغيير الحالة من الجدول");
                          } else {
                            onUpdateItem({
                              ...item,
                              reviewStatus: nextSt,
                              isVerified: nextSt === "approved",
                            });
                          }
                        }}
                        className={`text-[11px] font-bold px-2 py-1 rounded-lg border cursor-pointer ${STATUS_META[getEffectiveStatus(item)].cls}`}
                        title={
                          item.auditLog && item.auditLog.length > 0
                            ? `سجل المراجعة (${item.auditLog.length} حركة) — آخر تحديث: ${item.auditLog[item.auditLog.length - 1].action}`
                            : "اختر حالة المراجعة والاعتماد"
                        }
                      >
                        <option value="draft">مسودة</option>
                        <option value="extracted">مستخرج</option>
                        <option value="needs_review">يحتاج مراجعة</option>
                        <option value="reviewed">تمت مراجعته</option>
                        <option value="approved">معتمد ✓</option>
                        <option value="rejected">مرفوض</option>
                      </select>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        {onInspectItemOnSheet && (
                          <button
                            onClick={() => onInspectItemOnSheet(item)}
                            className="p-1 text-cyan-600 hover:text-cyan-800 rounded hover:bg-cyan-50"
                            title="مراجعة الحصر على اللوحة"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDuplicate(item)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                          title="تكرار البند"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف البند "${item.description}"؟`)) {
                              onDeleteItem(item.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                          title="حذف البند"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
