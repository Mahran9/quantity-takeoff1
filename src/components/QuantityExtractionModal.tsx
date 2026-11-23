import React, { useState, useMemo, useEffect } from "react";
import {
  BlueprintSheet,
  TakeoffItem,
  TradeCategory,
  DimensionType,
  ExtractedCadQuantity,
} from "../types";
import {
  extractEngineeringQuantitiesFromDxf,
  analyzeParsedDxfObject,
  auditExtraction,
  summarizeAudit,
  DeduplicatedHatchRecord,
  LayerRule,
  LayerRuleKind,
  loadLayerRules,
  saveLayerRules,
} from "../utils/dxfParser";
import { VisualAnalysisPanel } from "./VisualAnalysisPanel";
import {
  X,
  Layers,
  Calculator,
  Box,
  Square,
  Ruler,
  Hash,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowRight,
  Filter,
  CheckSquare,
  Square as EmptySquare,
  Settings2,
  RefreshCw,
  ScanSearch,
} from "lucide-react";

export interface QuantityExtractionModalProps {
  sheet?: BlueprintSheet;
  activeSheet?: BlueprintSheet;
  isOpen: boolean;
  onClose: () => void;
  onAddExtractedItems?: (items: TakeoffItem[]) => void;
  onApplyTakeoffItems?: (items: TakeoffItem[]) => void;
  existingItemsCount?: number;
  /** Items already in the project (used to prevent restoring the same excluded hatch twice). */
  existingTakeoffItems?: TakeoffItem[];
}

const RULE_CATEGORIES: TradeCategory[] = [
  "أعمال الحفر والردم والأساسات",
  "أعمال خرسانية مسلحة وعادية",
  "أعمال حديد التسليح",
  "أعمال الهياكل المعدنية والهناجر",
  "أعمال الساندوتش بانل والكلادينج",
  "أعمال المباني والبلوك",
  "أعمال العزل المائي والحراري",
  "أعمال البياض والتشطيبات الداخلية",
  "أعمال الأرضيات والرخام والبورسلين",
  "أعمال الدهانات والديكورات",
  "أعمال الأبواب والشبابيك والألمنيوم",
  "أعمال التغذية والصرف الصحي",
  "أعمال التمديدات الكهربائية والإنارة",
  "أعمال التكييف والتهوية",
  "أعمال متنوعة أخرى",
];

const RULE_KIND_LABELS: Record<"auto" | LayerRuleKind, string> = {
  auto: "تلقائي",
  area: "مساحة",
  linear: "طول",
  count: "عدد",
  ignore: "تجاهل",
};

export const QuantityExtractionModal: React.FC<QuantityExtractionModalProps> = ({
  sheet: propSheet,
  activeSheet,
  isOpen,
  onClose,
  onAddExtractedItems,
  onApplyTakeoffItems,
  existingItemsCount = 0,
  existingTakeoffItems = [],
}) => {
  const sheet = propSheet || activeSheet;

  const handleAddItems = (items: TakeoffItem[]) => {
    if (onAddExtractedItems) {
      onAddExtractedItems(items);
    } else if (onApplyTakeoffItems) {
      onApplyTakeoffItems(items);
    }
  };

  const [activeTab, setActiveTab] = useState<"cad" | "calc" | "visual">(() =>
    sheet?.fileType === "dxf" ? "cad" : "visual"
  );

  useEffect(() => {
    if (sheet?.fileType === "dxf") {
      setActiveTab("cad");
    } else {
      setActiveTab("visual");
    }
  }, [sheet?.fileType]);

  // CAD Extraction Config
  const [wallHeight, setWallHeight] = useState<number>(0);
  const [slabThickness, setSlabThickness] = useState<number>(0);
  const [floorSlabThickness, setFloorSlabThickness] = useState<number>(0);
  const [blindingThickness, setBlindingThickness] = useState<number>(0);
  const [footingDepth, setFootingDepth] = useState<number>(0);
  const [unitScale, setUnitScale] = useState<number>(
    () => sheet?.dxfData?.unitInfo?.toMeters ?? 1.0
  );

  useEffect(() => {
    if (sheet?.dxfData?.unitInfo?.toMeters) {
      setUnitScale(sheet.dxfData.unitInfo.toMeters);
    }
  }, [sheet?.id, sheet?.dxfData?.unitInfo?.toMeters]);

  // Layer rules, wall / closed-perimeter options, unit confirmation
  const [layerRules, setLayerRules] = useState<LayerRule[]>(() => loadLayerRules());
  const [ruleMatch, setRuleMatch] = useState("");
  const [ruleCategory, setRuleCategory] = useState<string>("أعمال خرسانية مسلحة وعادية");
  const [ruleKind, setRuleKind] = useState<"auto" | LayerRuleKind>("auto");
  const [doubleLineWalls, setDoubleLineWalls] = useState<boolean>(false);
  const [includeClosedPerimeter, setIncludeClosedPerimeter] = useState<boolean>(false);
  const [unitConfirmed, setUnitConfirmed] = useState<boolean>(false);
  // Audit UI state
  const [includeHidden, setIncludeHidden] = useState<boolean>(false);
  const [riskAccepted, setRiskAccepted] = useState<boolean>(false);
  const [auditOpen, setAuditOpen] = useState<boolean>(false);
  const [quickCategory, setQuickCategory] = useState<Record<string, string>>({});

  useEffect(() => {
    setUnitConfirmed(false);
    setIncludeHidden(false);
    setRiskAccepted(false);
    setAuditOpen(false);
  }, [sheet?.id]);

  const updateLayerRules = (next: LayerRule[]) => {
    setLayerRules(next);
    saveLayerRules(next);
  };

  const handleAddLayerRule = () => {
    const match = ruleMatch.trim();
    if (!match) return;
    const rule: LayerRule = {
      match,
      category: ruleKind === "ignore" ? "" : ruleCategory,
      kind: ruleKind === "auto" ? undefined : ruleKind,
    };
    updateLayerRules([...layerRules.filter((r) => r.match.toUpperCase() !== match.toUpperCase()), rule]);
    setRuleMatch("");
  };

  // Filter for CAD table
  const [typeFilter, setTypeFilter] = useState<"all" | DimensionType>("all");
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [showExcludedHatches, setShowExcludedHatches] = useState<boolean>(false);
  const [restoredHatchIds, setRestoredHatchIds] = useState<Record<string, boolean>>({});

  // Manual Quick Calc State
  const [manualName, setManualName] = useState("");
  const [manualCategory, setManualCategory] = useState<TradeCategory>("أعمال خرسانية مسلحة وعادية");
  const [manualType, setManualType] = useState<DimensionType>("volume");
  const [manualLocation, setManualLocation] = useState("");
  const [manualCount, setManualCount] = useState(1);
  const [manualLength, setManualLength] = useState<number>(0);
  const [manualWidth, setManualWidth] = useState<number>(0);
  const [manualHeight, setManualHeight] = useState<number>(0);
  const [manualDeduction, setManualDeduction] = useState<number>(0);
  const [manualUnitPrice, setManualUnitPrice] = useState<number>(0);

  // DXF analysis actually used: re-analysed when the user asks to include frozen / off layers
  const dxf = useMemo(() => {
    const base = sheet?.dxfData;
    if (!base) return undefined;
    if (includeHidden && base.parsedData && (base.parsedData.entities || base.parsedData.blocks)) {
      try {
        return analyzeParsedDxfObject(base.parsedData, { includeHiddenLayers: true });
      } catch {
        return base;
      }
    }
    return base;
  }, [sheet?.dxfData, includeHidden]);
  const canIncludeHidden = (sheet?.dxfData?.hiddenLayers?.length || 0) > 0 && !!sheet?.dxfData?.parsedData;

  // Compute CAD entities if DXF
  const cadQuantities = useMemo(() => {
    if (!dxf) return [];
    return extractEngineeringQuantitiesFromDxf(dxf, {
      defaultWallHeight: wallHeight,
      defaultFootingDepth: footingDepth,
      defaultSlabThickness: slabThickness,
      defaultFloorSlabThickness: floorSlabThickness,
      defaultBlindingThickness: blindingThickness,
      unitScaleFactor: unitScale,
      layerRules,
      wallLineDivisor: doubleLineWalls ? 2 : 1,
      includeClosedPerimeter,
    });
  }, [
    dxf,
    wallHeight,
    footingDepth,
    slabThickness,
    floorSlabThickness,
    blindingThickness,
    unitScale,
    layerRules,
    doubleLineWalls,
    includeClosedPerimeter,
  ]);

  // Audit: makes doubtful extraction loud (traffic light + confidence + coverage)
  const audit = useMemo(() => {
    if (!dxf) return null;
    return auditExtraction(dxf, cadQuantities, {
      defaultWallHeight: wallHeight,
      defaultFootingDepth: footingDepth,
      defaultSlabThickness: slabThickness,
      defaultFloorSlabThickness: floorSlabThickness,
      defaultBlindingThickness: blindingThickness,
      unitScaleFactor: unitScale,
      layerRules,
      wallLineDivisor: doubleLineWalls ? 2 : 1,
      includeClosedPerimeter,
      unitConfirmed,
      includeHiddenLayers: includeHidden,
    });
  }, [dxf, cadQuantities, wallHeight, footingDepth, slabThickness, floorSlabThickness, blindingThickness, unitScale, layerRules, doubleLineWalls, includeClosedPerimeter, unitConfirmed, includeHidden]);
  const auditNeedsAck = !!audit && (audit.level === "error" || audit.confidence === "low");

  // Initialize selected items when CAD quantities change
  React.useEffect(() => {
    if (cadQuantities.length > 0) {
      const initial: Record<string, boolean> = {};
      cadQuantities.forEach((q) => {
        initial[q.id] = q.selected !== false;
      });
      setSelectedItems(initial);
    }
  }, [cadQuantities]);

  if (!isOpen || !sheet) return null;

  // Filtered CAD items
  const filteredCadItems = cadQuantities.filter((item) => {
    if (typeFilter === "all") return true;
    return item.type === typeFilter;
  });

  const toggleSelectAll = () => {
    const allSelected = filteredCadItems.every((item) => selectedItems[item.id]);
    const updated = { ...selectedItems };
    filteredCadItems.forEach((item) => {
      updated[item.id] = !allSelected;
    });
    setSelectedItems(updated);
  };

  const selectedCadCount = Object.values(selectedItems).filter(Boolean).length;
  const deduplicatedHatches: DeduplicatedHatchRecord[] = sheet?.dxfData?.deduplicatedHatches || [];
  const skippedPaperSpaceCount: number = sheet?.dxfData?.skippedPaperSpaceCount || 0;
  const dxfWarnings: string[] = Array.isArray(dxf?.warnings) ? dxf!.warnings! : [];
  const dxfBounds = sheet?.dxfData?.bounds;
  const drawingSpanRaw: number =
    typeof sheet?.dxfData?.drawingSpan === "number"
      ? sheet.dxfData.drawingSpan
      : dxfBounds
      ? Math.max(Math.abs(dxfBounds.maxX - dxfBounds.minX), Math.abs(dxfBounds.maxY - dxfBounds.minY))
      : 0;
  const unitNeedsConfirmation = Boolean(sheet?.dxfData?.unitInfo?.guessed) && !unitConfirmed;

  const isHatchAlreadyRestored = (recId: string): boolean => {
    if (restoredHatchIds[recId]) return true;
    return existingTakeoffItems.some(
      (i) => i.sheetId === sheet?.id && i.restoredDeduplicatedId === recId
    );
  };

  const handleRestoreExcludedHatch = (rec: DeduplicatedHatchRecord) => {
    if (!sheet || isHatchAlreadyRestored(rec.id)) return;
    const areaM2 = Number((rec.netAreaRaw * unitScale * unitScale).toFixed(2));
    const now = new Date().toISOString();
    const restoredItem: TakeoffItem = {
      id: `item-restored-hatch-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sheetId: sheet.id,
      sheetCode: sheet.code,
      sheetTitle: sheet.title,
      itemCode: `HATCH-${existingItemsCount + 1}`,
      description: `مساحة تهشير مستعادة يدوياً من طبقة (${rec.layer})${rec.holeCount > 0 ? ` بعد طرح ${rec.holeCount} فتحة` : ""}`,
      category: "أعمال متنوعة أخرى",
      dimensionType: "area",
      location: sheet.title,
      count: 1,
      quantity: areaM2,
      unit: "م²",
      unitPrice: 0,
      totalPrice: 0,
      formula: `مساحة HATCH صافية (${areaM2} م²) — مستعادة بعد مراجعة الازدواجية`,
      extractionSource: "cad_geometry",
      reviewStatus: "needs_review",
      restoredDeduplicatedId: rec.id,
      sourceEvidence: `تهشير مستعاد من طبقة ${rec.layer} (${rec.reason})`,
      sourceDetails: {
        layer: rec.layer,
        entityType: "HATCH (مستعاد)",
      },
      notes: "تمت استعادة هذا العنصر يدوياً من قائمة المستبعدات بسبب الازدواجية — يرجى مطابقته على اللوحة وإدخال السعر.",
      auditLog: [
        {
          timestamp: now,
          action: "استعادة عنصر مستبعد بسبب الازدواجية",
          reason: rec.reason,
          newQty: areaM2,
          status: "needs_review",
        },
      ],
    };
    handleAddItems([restoredItem]);
    setRestoredHatchIds((prev) => ({ ...prev, [rec.id]: true }));
  };

  // Import CAD items
  const handleImportCadItems = () => {
    const itemsToImport: TakeoffItem[] = cadQuantities
      .filter((q) => selectedItems[q.id])
      .map((q, idx) => {
        const itemIndex = existingItemsCount + idx + 1;
        const codePrefix =
          q.type === "volume" ? "VOL" : q.type === "area" ? "ARA" : q.type === "linear" ? "LIN" : "CNT";
        return {
          id: `item-cad-${Date.now()}-${idx}`,
          sheetId: sheet.id,
          sheetCode: sheet.code,
          sheetTitle: sheet.title,
          itemCode: `${codePrefix}-${String(itemIndex).padStart(2, "0")}`,
          description: q.description,
          category: q.suggestedCategory,
          dimensionType: q.type,
          location: `طبقة أوتوكاد: ${q.layer}`,
          count: q.count || 1,
          length: q.length,
          width: q.width,
          height: q.height,
          formula: q.formula,
          deduction: 0,
          quantity: q.value,
          unit: q.unit,
          unitPrice: 0,
          totalPrice: 0,
          notes: `تم الاستخراج الآلي من العناصر الهندسية للوحة (${sheet.code} - ${sheet.title})${audit ? ` — تدقيق: ${summarizeAudit(audit)}` : ""}`,
          isVerified: false,
          sourceEvidence: `هندسة CAD من الطبقة ${q.layer}؛ يلزم مطابقة التصنيف والأبعاد مع اللوحة${audit ? ` (${summarizeAudit(audit)})` : ""}`,
          reviewFlags: ["كمية هندسية مستخرجة من هندسة CAD وتحتاج مراجعة مهندس قبل الاعتماد", "لم يتم إدخال سعر وحدة"],
          extractionSource: "cad_geometry",
          sourceDetails: {
            layer: q.layer,
            blockName: q.type === "count" ? q.name : undefined,
          },
        };
      });

    if (itemsToImport.length > 0) {
      handleAddItems(itemsToImport);
      onClose();
    }
  };

  // Manual Quick Calc Add
  const handleAddManualItem = () => {
    if (!manualName.trim()) return;

    let qty = 0;
    let unit = "م³";
    let formula = "";

    if (manualType === "volume") {
      const gross = manualCount * manualLength * manualWidth * manualHeight;
      qty = Math.max(0, gross - manualDeduction);
      unit = "م³";
      formula = `${manualCount} × ${manualLength} × ${manualWidth} × ${manualHeight}${
        manualDeduction > 0 ? ` - خصم (${manualDeduction})` : ""
      }`;
    } else if (manualType === "area") {
      const gross = manualCount * manualLength * manualWidth;
      qty = Math.max(0, gross - manualDeduction);
      unit = "م²";
      formula = `${manualCount} × ${manualLength} × ${manualWidth}${
        manualDeduction > 0 ? ` - خصم (${manualDeduction})` : ""
      }`;
    } else if (manualType === "linear") {
      const gross = manualCount * manualLength;
      qty = Math.max(0, gross - manualDeduction);
      unit = "م.ط";
      formula = `${manualCount} × ${manualLength}${
        manualDeduction > 0 ? ` - خصم (${manualDeduction})` : ""
      }`;
    } else {
      qty = Math.max(0, manualCount - manualDeduction);
      unit = "عدد";
      formula = `تكرار بالعدد = ${qty}`;
    }

    const newItem: TakeoffItem = {
      id: `item-calc-${Date.now()}`,
      sheetId: sheet.id,
      sheetCode: sheet.code,
      sheetTitle: sheet.title,
      itemCode: `M-${String(existingItemsCount + 1).padStart(2, "0")}`,
      description: manualName,
      category: manualCategory,
      dimensionType: manualType,
      location: manualLocation || `لوحة ${sheet.code}`,
      count: manualCount,
      length: manualType !== "count" ? manualLength : undefined,
      width: manualType === "volume" || manualType === "area" ? manualWidth : undefined,
      height: manualType === "volume" ? manualHeight : undefined,
      formula: formula,
      deduction: manualDeduction,
      quantity: Number(qty.toFixed(2)),
      unit: unit,
      unitPrice: manualUnitPrice,
      totalPrice: Number((qty * manualUnitPrice).toFixed(2)),
      notes: `تم حسابه يدوياً بمعادلة الأبعاد للوحة ${sheet.code}`,
      isVerified: true,
      extractionSource: "manual_input",
    };

    handleAddItems([newItem]);
    onClose();
  };

  return (
    <div
      id="quantity-extraction-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 shrink-0 bg-amber-500 text-slate-950/20 text-amber-400 border border-amber-500/30 rounded-xl">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span className="sm:hidden">استخراج الكميات</span><span className="hidden sm:inline">مركز استخراج الكميات الهندسية التفصيلية</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  {sheet.code}
                </span>
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-[60vw] sm:max-w-none">
                <span className="hidden sm:inline">اللوحة الحالية: </span><span className="text-slate-200 font-semibold">{sheet.title}</span><span className="hidden sm:inline"> | ربط تلقائي باللوحة لمنع تداخل الكميات</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Blueprint Linkage Security Banner */}
        <div className="hidden sm:flex bg-emerald-950/40 border-b border-emerald-800/40 px-6 py-2.5 items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>ضمان العزل الهندسي:</strong> جميع البنود المستخرجة سترتبط حصراً بالمعرف{" "}
              <code className="bg-emerald-900/60 px-1.5 py-0.5 rounded text-emerald-200 font-mono">
                sheetId: {sheet.id}
              </code>{" "}
              ولن تختلط مع أي لوحة أو موضوع آخر في المشروع.
            </span>
          </div>
          <span className="text-emerald-400/80 font-mono hidden sm:inline">
            نوع اللوحة: {sheet.fileType.toUpperCase()}
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/80 px-3 sm:px-6 pt-2 gap-2 overflow-x-auto no-scrollbar">
          {sheet.fileType === "dxf" && (
            <button
              onClick={() => setActiveTab("cad")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl border-t border-x transition-all ${
                activeTab === "cad"
                  ? "bg-slate-800 text-amber-400 border-slate-700 shadow-inner"
                  : "text-slate-400 border-transparent hover:text-slate-200"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span><span className="sm:hidden">عناصر الرسم</span><span className="hidden sm:inline">استخراج هندسي مباشر من عناصر الأوتوكاد (DXF)</span></span>
              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded text-[10px]">
                {cadQuantities.length}
              </span>
            </button>
          )}



          {sheet.fileType !== "dxf" && (
            <button
              onClick={() => setActiveTab("visual")}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl border-t border-x transition-all ${
                activeTab === "visual"
                  ? "bg-slate-800 text-cyan-300 border-slate-700 shadow-inner"
                  : "text-slate-400 border-transparent hover:text-slate-200"
              }`}
            >
              <ScanSearch className="w-4 h-4" />
              <span>التحليل البصري المحلي</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab("calc")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl border-t border-x transition-all ${
              activeTab === "calc"
                ? "bg-slate-800 text-amber-400 border-slate-700 shadow-inner"
                : "text-slate-400 border-transparent hover:text-slate-200"
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span><span className="sm:hidden">حاسبة سريعة</span><span className="hidden sm:inline">حاسبة الأبعاد السريعة (حجوم / مساحات / أطوال)</span></span>
          </button>
        </div>

        {activeTab === "visual" && <VisualAnalysisPanel sheet={sheet} />}

        {/* Tab 1: CAD Entity Extraction Engine */}
        {activeTab === "cad" && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
            {/* Audit header: traffic light + confidence + coverage */}
            {audit && (
              <div
                role="status"
                className={`rounded-xl border p-4 text-xs ${
                  audit.level === "error"
                    ? "bg-red-500/10 border-red-500/50 text-red-100"
                    : audit.level === "warn"
                    ? "bg-amber-500/10 border-amber-400/50 text-amber-100"
                    : "bg-emerald-500/10 border-emerald-500/40 text-emerald-100"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {audit.level === "ok" ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <AlertCircle className={`w-5 h-5 ${audit.level === "error" ? "text-red-400" : "text-amber-300"}`} />
                    )}
                    <span>
                      {audit.level === "ok" ? "تدقيق الاستخراج: سليم" : audit.level === "warn" ? "تدقيق الاستخراج: يحتاج مراجعة" : "تدقيق الاستخراج: أخطاء محتملة في الأرقام"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span>
                      الثقة:{" "}
                      <b>{audit.confidence === "high" ? "عالية" : audit.confidence === "medium" ? "متوسطة" : "منخفضة"}</b>
                    </span>
                    <span>
                      تغطية التصنيف: <b>{Math.round(audit.coveragePct)}%</b>
                    </span>
                    {audit.checks.length > 0 && (
                      <button onClick={() => setAuditOpen((v) => !v)} className="underline underline-offset-2">
                        {auditOpen ? "إخفاء التفاصيل" : `عرض التفاصيل (${audit.checks.length})`}
                      </button>
                    )}
                  </div>
                </div>

                {canIncludeHidden && (
                  <label className="mt-3 flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} />
                    <span>تضمين الطبقات المجمّدة / المطفأة ({sheet?.dxfData?.hiddenLayers?.map((h: any) => h.name).join("، ")})</span>
                  </label>
                )}

                {auditOpen && audit.checks.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {audit.checks.map((c) => (
                      <li key={c.id} className="flex gap-2">
                        <span
                          className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                            c.level === "error" ? "bg-red-400" : c.level === "warn" ? "bg-amber-300" : "bg-sky-300"
                          }`}
                        />
                        <span>
                          {c.message}
                          {c.detail && <span className="block text-[10px] opacity-75 font-mono break-all">{c.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {auditOpen && audit.unclassified.length > 0 && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="font-bold mb-2">طبقات غير مصنّفة ({audit.unclassified.length}) — صنّفها لتظهر بتصنيف صحيح:</div>
                    <ul className="space-y-1.5">
                      {audit.unclassified.map((u) => (
                        <li key={u.layer} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-amber-300">{u.layer}</span>
                          <span className="opacity-75">
                            {u.entityCount} عنصر · {u.areaM2} م² · {u.lengthM} م
                          </span>
                          <select
                            value={quickCategory[u.layer] ?? ruleCategory}
                            onChange={(e) => setQuickCategory((m) => ({ ...m, [u.layer]: e.target.value }))}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white max-w-[220px]"
                          >
                            {RULE_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() =>
                              updateLayerRules([
                                ...layerRules.filter((r) => r.match.toUpperCase() !== u.layer.toUpperCase()),
                                { match: u.layer, category: quickCategory[u.layer] ?? ruleCategory },
                              ])
                            }
                            className="px-2.5 py-1 bg-amber-500 text-slate-950 hover:bg-amber-500 text-white font-bold rounded-lg"
                          >
                            تصنيف
                          </button>
                          <button
                            onClick={() =>
                              updateLayerRules([
                                ...layerRules.filter((r) => r.match.toUpperCase() !== u.layer.toUpperCase()),
                                { match: u.layer, category: "", kind: "ignore" },
                              ])
                            }
                            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg"
                          >
                            تجاهل
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {auditNeedsAck && (
                  <label className="mt-3 flex items-start gap-2 cursor-pointer font-bold text-red-100">
                    <input type="checkbox" checked={riskAccepted} onChange={(e) => setRiskAccepted(e.target.checked)} className="mt-0.5" />
                    <span>راجعت التحذيرات وأتحمل مسؤولية الأرقام</span>
                  </label>
                )}
              </div>
            )}

            {/* Geometric Config Toolbar */}
            <details className="group bg-slate-800/60 border border-slate-700/80 rounded-xl p-4">
              <summary className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer list-none">
                <Settings2 className="w-4 h-4 text-amber-400" />
                <span>معايير الارتفاع والسماكة (اختياري)</span>
                <span className="mr-auto text-[11px] font-normal text-slate-500 group-open:hidden">اضغط للتعديل — الفارغ = بدون افتراض</span>
              </summary>
              <div className="mt-3" />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">ارتفاع الجدران من المخطط (م):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={wallHeight}
                    onChange={(e) => setWallHeight(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-400">اتركه 0 إذا لم يكن موضحاً؛ لن يتم افتراض ارتفاع</span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">سمك بلاطة السقف من المخطط (م):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={slabThickness}
                    onChange={(e) => setSlabThickness(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-400">اتركه 0 إذا لم يكن موضحاً؛ لن يتم افتراض سمك</span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">عمق القواعد من المخطط (م):</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="3"
                    value={footingDepth}
                    onChange={(e) => setFootingDepth(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-400">لبثق مكعب خرسانة القواعد (م³)</span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">سمك خرسانة الأرضية SOG (م):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={floorSlabThickness}
                    onChange={(e) => setFloorSlabThickness(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-400">لصبة أرضية المستودع (مثال: 0.15 أو 0.20)</span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">سمك صبة النظافة (م):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="0.5"
                    value={blindingThickness}
                    onChange={(e) => setBlindingThickness(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-400">أسفل القواعد والميدات (مثال: 0.10)</span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">وحدة الرسم الأصلية:</label>
                  <select
                    value={unitScale}
                    onChange={(e) => setUnitScale(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                  >
                    <option value={1.0}>متر (1 وحدة = 1 متر)</option>
                    <option value={0.001}>مليمتر (1000 وحدة = 1 متر)</option>
                    <option value={0.01}>سنتيمتر (100 وحدة = 1 متر)</option>
                    <option value={0.0254}>بوصة (Inch)</option>
                    <option value={0.3048}>قدم (Foot)</option>
                  </select>
                  <span className="text-[10px] text-slate-400">معامل التحويل للأمتار القياسية</span>
                </div>
              </div>
            </details>

            {/* Unit confirmation banner (shown when the DXF has no $INSUNITS) */}
            {sheet?.dxfData?.unitInfo?.guessed && !unitConfirmed && (
              <div className="bg-amber-500/15 border border-amber-400/50 rounded-xl p-4 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <AlertCircle className="w-4 h-4" />
                    <span>وحدة الرسم غير محددة في الملف — يرجى تأكيدها قبل الإدراج</span>
                  </div>
                  <div>
                    أكبر بُعد في الرسم ≈{" "}
                    <span className="font-mono font-bold">{Math.round(drawingSpanRaw).toLocaleString("en-US")}</span> وحدة
                    ← بالوحدة المختارة يساوي{" "}
                    <span className="font-mono font-bold">{(drawingSpanRaw * unitScale).toLocaleString("en-US", { maximumFractionDigits: 1 })}</span> م.
                    إن كان هذا الطول يطابق أبعاد المبنى الحقيقية فأكّد الوحدة، وإلا غيّرها من القائمة أعلاه.
                  </div>
                </div>
                <button
                  onClick={() => setUnitConfirmed(true)}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg"
                >
                  تأكيد الوحدة
                </button>
              </div>
            )}

            {/* Measurement options */}
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doubleLineWalls}
                  onChange={(e) => setDoubleLineWalls(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold text-white block">الجدران مرسومة بخطين متوازيين</span>
                  <span className="text-[10px] text-slate-400">يقسم أطوال طبقات الجدران/البلوك على 2 حتى لا يتضاعف طول الجدار</span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeClosedPerimeter}
                  onChange={(e) => setIncludeClosedPerimeter(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold text-white block">احتساب محيط الأشكال المغلقة ضمن الأطوال</span>
                  <span className="text-[10px] text-slate-400">لطبقات الجدران والكمرات والميدات المرسومة كمستطيلات مغلقة (تظهر أيضاً كمساحات)</span>
                </span>
              </label>
            </div>

            {/* Parser warnings */}
            {dxfWarnings.length > 0 && (
              <div className="bg-slate-800/60 border border-amber-500/30 rounded-xl p-4 text-xs">
                <div className="flex items-center gap-2 mb-2 font-bold text-amber-300">
                  <AlertCircle className="w-4 h-4" />
                  <span>تنبيهات تحليل الملف ({dxfWarnings.length})</span>
                </div>
                <ul className="space-y-1 text-slate-300 list-disc pr-5">
                  {dxfWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Layer / block rules */}
            <details className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 text-xs">
              <summary className="flex items-center gap-2 mb-1 font-bold text-slate-300 cursor-pointer list-none">
                <Settings2 className="w-4 h-4 text-amber-400" />
                <span>قواعد تصنيف الطبقات والبلوكات (اختياري)</span>
              </summary>
              <p className="text-[10px] text-slate-400 mb-3">
                اكتب جزءاً من اسم الطبقة أو البلوك ليُصنَّف كما تريد، أو اختر «تجاهل». القواعد لها الأولوية على التصنيف التلقائي.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">اسم الطبقة/البلوك يحتوي</label>
                  <input
                    type="text"
                    value={ruleMatch}
                    onChange={(e) => setRuleMatch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddLayerRule()}
                    placeholder="مثال: WALL-EXT"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono w-44"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">القياس</label>
                  <select
                    value={ruleKind}
                    onChange={(e) => setRuleKind(e.target.value as "auto" | LayerRuleKind)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                  >
                    {(Object.keys(RULE_KIND_LABELS) as ("auto" | LayerRuleKind)[]).map((k) => (
                      <option key={k} value={k}>
                        {RULE_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                {ruleKind !== "ignore" && (
                  <div>
                    <label className="block text-slate-400 mb-1">التصنيف</label>
                    <select
                      value={ruleCategory}
                      onChange={(e) => setRuleCategory(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white max-w-[260px]"
                    >
                      {RULE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={handleAddLayerRule}
                  disabled={!ruleMatch.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-slate-950 hover:bg-amber-500 text-white font-bold rounded-lg disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة قاعدة</span>
                </button>
              </div>
              {layerRules.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {layerRules.map((r) => (
                    <li
                      key={r.match}
                      className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200"
                    >
                      <span className="font-mono text-amber-300">{r.match}</span>
                      <span className="text-slate-500">←</span>
                      <span>{r.kind === "ignore" ? "تجاهل" : `${r.category || "تلقائي"}${r.kind ? ` · ${RULE_KIND_LABELS[r.kind]}` : ""}`}</span>
                      <button
                        onClick={() => updateLayerRules(layerRules.filter((x) => x.match !== r.match))}
                        className="text-slate-400 hover:text-red-400"
                        aria-label="حذف القاعدة"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </details>

            {/* Filter by Dimension Type */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                <span className="hidden sm:flex text-xs text-slate-400 items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> تصفية نوع الكمية:
                </span>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar min-w-0">
                  <button
                    onClick={() => setTypeFilter("all")}
                    className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      typeFilter === "all"
                        ? "bg-slate-700 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    الكل ({cadQuantities.length})
                  </button>
                  <button
                    onClick={() => setTypeFilter("volume")}
                    className={`flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      typeFilter === "volume"
                        ? "bg-amber-500 text-slate-950 text-white"
                        : "bg-slate-800 text-purple-300 hover:bg-slate-700"
                    }`}
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>حجوم (م³)</span>
                    <span className="text-[10px] opacity-75">
                      ({cadQuantities.filter((q) => q.type === "volume").length})
                    </span>
                  </button>
                  <button
                    onClick={() => setTypeFilter("area")}
                    className={`flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      typeFilter === "area"
                        ? "bg-amber-500 text-slate-950 text-white"
                        : "bg-slate-800 text-amber-300 hover:bg-slate-700"
                    }`}
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>مساحات (م²)</span>
                    <span className="text-[10px] opacity-75">
                      ({cadQuantities.filter((q) => q.type === "area").length})
                    </span>
                  </button>
                  <button
                    onClick={() => setTypeFilter("linear")}
                    className={`flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      typeFilter === "linear"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-800 text-emerald-300 hover:bg-slate-700"
                    }`}
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    <span>أطوال (م.ط)</span>
                    <span className="text-[10px] opacity-75">
                      ({cadQuantities.filter((q) => q.type === "linear").length})
                    </span>
                  </button>
                  <button
                    onClick={() => setTypeFilter("count")}
                    className={`flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      typeFilter === "count"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-800 text-amber-300 hover:bg-slate-700"
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5" />
                    <span>أعداد (عدد)</span>
                    <span className="text-[10px] opacity-75">
                      ({cadQuantities.filter((q) => q.type === "count").length})
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  تحديد / إلغاء تحديد الكل
                </button>
                <span className="text-xs text-slate-400">
                  المحدد: <strong className="text-white">{selectedCadCount}</strong> من{" "}
                  {cadQuantities.length}
                </span>
              </div>
            </div>

            {/* Deduplicated / Excluded Elements Review Banner & Panel */}
            {(deduplicatedHatches.length > 0 || skippedPaperSpaceCount > 0) && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-amber-200">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      تم استبعاد{" "}
                      <strong className="text-amber-300 font-mono">{deduplicatedHatches.length}</strong>{" "}
                      عنصر تهشير (HATCH) بسبب الازدواجية المكانية مع حدود مغلقة
                      {skippedPaperSpaceCount > 0 && (
                        <>
                          {" "}
                          و{" "}
                          <strong className="text-slate-200 font-mono">{skippedPaperSpaceCount}</strong>{" "}
                          عنصر من Paper Space
                        </>
                      )}
                      .
                    </span>
                  </div>

                  {deduplicatedHatches.length > 0 && (
                    <button
                      onClick={() => setShowExcludedHatches((v) => !v)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-bold transition-colors"
                    >
                      {showExcludedHatches
                        ? "إخفاء العناصر المستبعدة"
                        : `عرض العناصر المستبعدة للمراجعة (${deduplicatedHatches.length})`}
                    </button>
                  )}
                </div>

                {showExcludedHatches && deduplicatedHatches.length > 0 && (
                  <div className="border border-amber-500/30 rounded-lg overflow-hidden bg-slate-950/80">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-900 text-amber-300 border-b border-slate-800">
                          <tr>
                            <th className="p-2.5">الطبقة</th>
                            <th className="p-2.5 text-center">المساحة المستبعدة</th>
                            <th className="p-2.5 text-center">مساحة الـ Polyline المطابق</th>
                            <th className="p-2.5 text-center">فرق المساحة</th>
                            <th className="p-2.5 text-center">التداخل المكاني (IoU)</th>
                            <th className="p-2.5">سبب الاستبعاد</th>
                            <th className="p-2.5 text-center">إجراء</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          {deduplicatedHatches.map((rec) => {
                            const netM2 = (rec.netAreaRaw * unitScale * unitScale).toFixed(2);
                            const matchedM2 = (rec.matchedPolylineAreaRaw * unitScale * unitScale).toFixed(2);
                            const isRestored = isHatchAlreadyRestored(rec.id);
                            return (
                              <tr key={rec.id} className="hover:bg-slate-900/60">
                                <td className="p-2.5 font-mono text-amber-200">{rec.layer}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-white">
                                  {netM2} م²
                                  {rec.holeCount > 0 && (
                                    <span className="block text-[10px] text-slate-400">
                                      (طُرحت {rec.holeCount} فتحة)
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-center font-mono text-slate-300">{matchedM2} م²</td>
                                <td className="p-2.5 text-center font-mono text-cyan-300">{rec.areaDiffPercent}%</td>
                                <td className="p-2.5 text-center font-mono text-emerald-300">{rec.bboxIoU}%</td>
                                <td className="p-2.5 text-[11px] text-slate-400">{rec.reason}</td>
                                <td className="p-2.5 text-center">
                                  <button
                                    onClick={() => handleRestoreExcludedHatch(rec)}
                                    disabled={isRestored}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                      isRestored
                                        ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 cursor-default"
                                        : "bg-amber-500 hover:bg-amber-400 text-slate-950"
                                    }`}
                                  >
                                    {isRestored ? "مستعاد مسبقاً ✓" : "استعادة للحصر"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CAD Extracted Table */}
            <div className="sm:hidden space-y-2">
              {filteredCadItems.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm border border-slate-700 rounded-xl">
                  لا توجد عناصر مطابقة لهذا النوع في الملف.
                </div>
              ) : (
                filteredCadItems.map((item) => {
                  const isSelected = Boolean(selectedItems[item.id]);
                  return (
                    <button
                      key={`m-${item.id}`}
                      type="button"
                      onClick={() => setSelectedItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className={`w-full text-right rounded-xl border p-3 flex items-start gap-3 transition-colors ${
                        isSelected ? "border-amber-500/60 bg-amber-950/30" : "border-slate-700 bg-slate-900"
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <EmptySquare className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white leading-snug">{item.description}</div>
                        <div className="mt-1 text-[11px] text-slate-400 font-mono truncate">{item.layer}</div>
                        <div className="mt-1 text-[11px] text-slate-500 truncate">{item.suggestedCategory}</div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className="font-mono font-bold text-emerald-400 text-base leading-none">
                          {item.value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] text-slate-300 mt-1">{item.unit}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="hidden sm:block border border-slate-700 rounded-xl overflow-hidden bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-800/90 text-slate-300 border-b border-slate-700">
                    <tr>
                      <th className="p-3 w-10 text-center">اختيار</th>
                      <th className="p-3">نوع الكمية</th>
                      <th className="p-3">طبقة / بلوك الأوتوكاد</th>
                      <th className="p-3">الوصف الهندسي المقترح</th>
                      <th className="p-3">معادلة الحساب الهندسية</th>
                      <th className="p-3 text-center">الكمية الصافية</th>
                      <th className="p-3 text-center">الوحدة</th>
                      <th className="p-3">التصنيف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredCadItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          لا توجد عناصر هندسية مطابقة لهذا النوع في ملف الأوتوكاد.
                        </td>
                      </tr>
                    ) : (
                      filteredCadItems.map((item) => {
                        const isSelected = Boolean(selectedItems[item.id]);
                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-800/50 transition-colors ${
                              isSelected ? "bg-amber-950/20" : ""
                            }`}
                          >
                            <td className="p-3 text-center">
                              <button
                                onClick={() =>
                                  setSelectedItems((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                                className="text-slate-400 hover:text-white"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-amber-400" />
                                ) : (
                                  <EmptySquare className="w-4 h-4" />
                                )}
                              </button>
                            </td>

                            <td className="p-3">
                              {item.type === "volume" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-semibold">
                                  <Box className="w-3 h-3" /> حجوم (م³)
                                </span>
                              )}
                              {item.type === "area" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold">
                                  <Square className="w-3 h-3" /> مساحات (م²)
                                </span>
                              )}
                              {item.type === "linear" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">
                                  <Ruler className="w-3 h-3" /> أطوال (م.ط)
                                </span>
                              )}
                              {item.type === "count" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold">
                                  <Hash className="w-3 h-3" /> أعداد (عدد)
                                </span>
                              )}
                            </td>

                            <td className="p-3 font-mono text-slate-300 text-xs">
                              {item.layer}
                            </td>

                            <td className="p-3 font-medium text-white max-w-xs truncate">
                              {item.description}
                            </td>

                            <td className="p-3 font-mono text-slate-400 text-[11px] max-w-sm truncate" dir="ltr">
                              {item.formula}
                            </td>

                            <td className="p-3 text-center font-mono font-bold text-emerald-400 text-sm">
                              {item.value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })}
                            </td>

                            <td className="p-3 text-center text-slate-300 font-semibold">
                              {item.unit}
                            </td>

                            <td className="p-3 text-slate-400 text-[11px] max-w-[140px] truncate">
                              {item.suggestedCategory}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Manual Quick Calc */}
        {activeTab === "calc" && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  حاسبة الأبعاد السريعة (إضافة بند حصر يدوي مع معادلة الأبعاد)
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="md:col-span-2">
                  <label className="block text-slate-300 mb-1 font-semibold">وصف البند الهندسي:</label>
                  <input
                    type="text"
                    placeholder="مثال: خرسانة مسلحة لقواعد منفصلة ق3 أو بياض محارة لصالة الاستقبال..."
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">نوع البند الهندسي:</label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as DimensionType)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold"
                  >
                    <option value="volume">حجم مكعب (م³) - عدد × طول × عرض × ارتفاع</option>
                    <option value="area">مسطح ومساحة (م²) - عدد × طول × عرض</option>
                    <option value="linear">طول خطي (م.ط) - عدد × طول</option>
                    <option value="count">عدد وقطع (عدد) - عدد وتكرار</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">بند الأعمال / التخصص:</label>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value as TradeCategory)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="أعمال الحفر والردم والأساسات">أعمال الحفر والردم والأساسات</option>
                    <option value="أعمال خرسانية مسلحة وعادية">أعمال خرسانية مسلحة وعادية</option>
                    <option value="أعمال حديد التسليح">أعمال حديد التسليح</option>
                    <option value="أعمال المباني والبلوك">أعمال المباني والبلوك</option>
                    <option value="أعمال العزل المائي والحراري">أعمال العزل المائي والحراري</option>
                    <option value="أعمال البياض والتشطيبات الداخلية">أعمال البياض والتشطيبات الداخلية</option>
                    <option value="أعمال الأرضيات والرخام والبورسلين">أعمال الأرضيات والرخام والبورسلين</option>
                    <option value="أعمال الدهانات والديكورات">أعمال الدهانات والديكورات</option>
                    <option value="أعمال الأبواب والشبابيك والألمنيوم">أعمال الأبواب والشبابيك والألمنيوم</option>
                    <option value="أعمال التغذية والصرف الصحي">أعمال التغذية والصرف الصحي</option>
                    <option value="أعمال التمديدات الكهربائية والإنارة">أعمال التمديدات الكهربائية والإنارة</option>
                    <option value="أعمال التكييف والتهوية">أعمال التكييف والتهوية</option>
                    <option value="أعمال متنوعة أخرى">أعمال متنوعة أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الموقع أو المحاور في اللوحة:</label>
                  <input
                    type="text"
                    placeholder="مثال: محاور A-C أو سقف الدور الأرضي..."
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">سعر الوحدة التقديري (ر.س):</label>
                  <input
                    type="number"
                    min="0"
                    value={manualUnitPrice}
                    onChange={(e) => setManualUnitPrice(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Dimension Calculator Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Ruler className="w-4 h-4" />
                  <span>معادلة الأبعاد الهندسية (العدد × الطول × العرض × الارتفاع - الخصم):</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">العدد / التكرار:</label>
                    <input
                      type="number"
                      min="1"
                      value={manualCount}
                      onChange={(e) => setManualCount(Number(e.target.value) || 1)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center font-mono"
                    />
                  </div>

                  {manualType !== "count" && (
                    <div>
                      <label className="block text-slate-400 mb-1">الطول (م):</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={manualLength}
                        onChange={(e) => setManualLength(Number(e.target.value) || 0)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center font-mono"
                      />
                    </div>
                  )}

                  {(manualType === "volume" || manualType === "area") && (
                    <div>
                      <label className="block text-slate-400 mb-1">العرض (م):</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={manualWidth}
                        onChange={(e) => setManualWidth(Number(e.target.value) || 0)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center font-mono"
                      />
                    </div>
                  )}

                  {manualType === "volume" && (
                    <div>
                      <label className="block text-slate-400 mb-1">الارتفاع / السُمك (م):</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={manualHeight}
                        onChange={(e) => setManualHeight(Number(e.target.value) || 0)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-400 mb-1">الخصم (فتحات/فراغات):</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={manualDeduction}
                      onChange={(e) => setManualDeduction(Number(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-red-300 text-center font-mono"
                    />
                  </div>
                </div>

                {/* Calculation Preview */}
                <div className="p-3 bg-slate-800/80 rounded-lg flex items-center justify-between text-xs mt-2 border border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">الناتج الصافي المحسوب:</span>
                    <strong className="text-emerald-400 font-mono text-base">
                      {manualType === "volume" &&
                        Math.max(0, manualCount * manualLength * manualWidth * manualHeight - manualDeduction).toFixed(2) + " م³"}
                      {manualType === "area" &&
                        Math.max(0, manualCount * manualLength * manualWidth - manualDeduction).toFixed(2) + " م²"}
                      {manualType === "linear" &&
                        Math.max(0, manualCount * manualLength - manualDeduction).toFixed(2) + " م.ط"}
                      {manualType === "count" &&
                        Math.max(0, manualCount - manualDeduction) + " عدد"}
                    </strong>
                  </div>
                  <div className="text-slate-300 font-mono">
                    إجمالي القيمة:{" "}
                    <strong className="text-white">
                      {(
                        (manualType === "volume"
                          ? Math.max(0, manualCount * manualLength * manualWidth * manualHeight - manualDeduction)
                          : manualType === "area"
                          ? Math.max(0, manualCount * manualLength * manualWidth - manualDeduction)
                          : manualType === "linear"
                          ? Math.max(0, manualCount * manualLength - manualDeduction)
                          : Math.max(0, manualCount - manualDeduction)) * manualUnitPrice
                      ).toLocaleString("ar-SA")}{" "}
                      ر.س
                    </strong>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleAddManualItem}
                  disabled={!manualName.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 text-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة البند المحسوب إلى دفتر حصر هذه اللوحة</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-2" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="hidden sm:flex text-xs text-slate-400 items-center gap-2">
            <span>اللوحة المستهدفة:</span>
            <span className="text-white font-semibold">{sheet.code} - {sheet.title}</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="px-4 py-3 sm:py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition-colors"
            >
              إلغاء
            </button>

            {activeTab === "cad" && (
              <button
                onClick={handleImportCadItems}
                disabled={selectedCadCount === 0 || unitNeedsConfirmation || (auditNeedsAck && !riskAccepted)}
                title={
                  unitNeedsConfirmation
                    ? "أكّد وحدة الرسم أولاً"
                    : auditNeedsAck && !riskAccepted
                    ? "ثقة التدقيق منخفضة — أقرّ بمراجعة التحذيرات أولاً"
                    : undefined
                }
                className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-5 py-3 sm:py-2 bg-amber-500 text-slate-950 hover:bg-amber-500 text-white text-sm sm:text-xs font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span><span className="sm:hidden">إدراج ({selectedCadCount}) بنود</span><span className="hidden sm:inline">إدراج ({selectedCadCount}) بنود هندسية إلى اللوحة</span></span>
              </button>
            )}


          </div>
        </div>
      </div>
    </div>
  );
};
