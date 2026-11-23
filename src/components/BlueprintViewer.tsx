import React, { useState, useRef, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MousePointer,
  Hash,
  Ruler,
  Square,
  Layers,
  ScanSearch,
  Eye,
  EyeOff,
  MapPin,
  CheckCircle2,
  SlidersHorizontal,
  PlusCircle,
  X,
  Calculator,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  History,
} from "lucide-react";
import {
  BlueprintSheet,
  MeasurementPin,
  SheetCalibration,
  VisualSearchToken,
  TakeoffItem,
  ReviewStatus,
} from "../types";
import { sampleDrawingsSvg } from "../data/sampleBlueprints";
import { renderDxfToCanvas, ParsedDxfResult } from "../utils/dxfParser";

interface BlueprintViewerProps {
  sheet: BlueprintSheet;
  onAddMeasurementPin: (pin: MeasurementPin) => void;
  onRemoveMeasurementPin: (pinId: string) => void;
  onConvertPinToItem: (pin: MeasurementPin) => void;
  onCalibrateSheet: (calibration: SheetCalibration) => void;
  onOpenVisualSearch: () => void;
  onOpenExtractionModal?: () => void;
  onOpenSteelCalc?: () => void;
  highlightedTokens?: VisualSearchToken[];
  highlightLabel?: string;
  onClearHighlights?: () => void;
  focusedItem?: TakeoffItem | null;
  onCloseFocusedItem?: () => void;
  onUpdateFocusedItemStatus?: (item: TakeoffItem, status: ReviewStatus, reason?: string) => void;
}

type ToolMode = "select" | "calibrate" | "count" | "length" | "area";

const STAGE_W = 1000;
const STAGE_H = 700;

export const BlueprintViewer: React.FC<BlueprintViewerProps> = ({
  sheet,
  onAddMeasurementPin,
  onRemoveMeasurementPin,
  onConvertPinToItem,
  onCalibrateSheet,
  onOpenVisualSearch,
  onOpenExtractionModal,
  onOpenSteelCalc,
  highlightedTokens = [],
  highlightLabel = "",
  onClearHighlights,
  focusedItem = null,
  onCloseFocusedItem,
  onUpdateFocusedItemStatus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dxfCanvasRef = useRef<HTMLCanvasElement>(null);

  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [activePoints, setActivePoints] = useState<{ x: number; y: number }[]>([]);
  const [showLayersDropdown, setShowLayersDropdown] = useState<boolean>(false);
  const [dxfLayerState, setDxfLayerState] = useState<Record<string, boolean>>({});

  // Calibration prompt state
  const [pendingCalibPts, setPendingCalibPts] = useState<{ x: number; y: number }[] | null>(null);
  const [calibMetersInput, setCalibMetersInput] = useState<string>("5.0");

  const viewStateBySheetRef = useRef<Record<string, { zoom: number; pan: { x: number; y: number } }>>({});

  // Restore last saved zoom & pan for this sheet
  useEffect(() => {
    const saved = viewStateBySheetRef.current[sheet.id];
    if (saved) {
      setZoom(saved.zoom);
      setPan(saved.pan);
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
    setActivePoints([]);
    setPendingCalibPts(null);
  }, [sheet.id]);

  // Save current zoom & pan whenever changed
  useEffect(() => {
    viewStateBySheetRef.current[sheet.id] = { zoom, pan };
  }, [sheet.id, zoom, pan]);

  useEffect(() => {
    if (sheet.fileType === "dxf" && sheet.dxfRawSummary && dxfCanvasRef.current) {
      const targetLayer = focusedItem?.sourceDetails?.layer;
      renderDxfToCanvas(
        dxfCanvasRef.current,
        sheet.dxfRawSummary as ParsedDxfResult,
        dxfLayerState,
        targetLayer
      );
    }
  }, [sheet, dxfLayerState, focusedItem]);

  const metersPerPixel = sheet.calibration?.metersPerPixel ?? 0.02; // default 20m / 1000px if uncalibrated

  const toggleLayer = (layerName: string) => {
    setDxfLayerState((prev) => ({
      ...prev,
      [layerName]: prev[layerName] === false ? true : false,
    }));
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.4));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode === "select" || e.button === 1 || e.altKey) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const finishPolygonArea = (pts: { x: number; y: number }[]) => {
    if (pts.length < 3) return;
    // Shoelace formula in stage pixels -> convert to m²
    let areaPx2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const xi = pts[i].x * STAGE_W;
      const yi = pts[i].y * STAGE_H;
      const xj = pts[j].x * STAGE_W;
      const yj = pts[j].y * STAGE_H;
      areaPx2 += xi * yj - xj * yi;
    }
    areaPx2 = Math.abs(areaPx2) / 2;
    const areaM2 = areaPx2 * metersPerPixel * metersPerPixel;

    const newPin: MeasurementPin = {
      id: `pin-${Date.now()}`,
      sheetId: sheet.id,
      type: "area",
      label: `مساحة مضلع (${areaM2.toFixed(2)} م²)`,
      color: "#10b981",
      points: pts,
      calculatedValue: Number(areaM2.toFixed(2)),
      unit: "م²",
    };
    onAddMeasurementPin(newPin);
    setActivePoints([]);
  };

  const confirmCalibration = () => {
    if (!pendingCalibPts || pendingCalibPts.length !== 2) return;
    const realMeters = parseFloat(calibMetersInput);
    if (!realMeters || realMeters <= 0) return;

    const dxPx = (pendingCalibPts[1].x - pendingCalibPts[0].x) * STAGE_W;
    const dyPx = (pendingCalibPts[1].y - pendingCalibPts[0].y) * STAGE_H;
    const distPx = Math.hypot(dxPx, dyPx);
    if (distPx < 2) return;

    onCalibrateSheet({
      metersPerPixel: realMeters / distPx,
      referenceMeters: realMeters,
      p1: pendingCalibPts[0],
      p2: pendingCalibPts[1],
      calibratedAt: new Date().toISOString(),
    });
    setPendingCalibPts(null);
    setActivePoints([]);
    setToolMode("length");
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging || toolMode === "select") return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const rawX = (e.clientX - rect.left - pan.x) / zoom;
    const rawY = (e.clientY - rect.top - pan.y) / zoom;

    const normX = Math.max(0, Math.min(1, rawX / rect.width));
    const normY = Math.max(0, Math.min(1, rawY / rect.height));

    if (toolMode === "calibrate") {
      const nextPoints = [...activePoints, { x: normX, y: normY }];
      if (nextPoints.length === 2) {
        setPendingCalibPts(nextPoints);
        setActivePoints([]);
      } else {
        setActivePoints(nextPoints);
      }
      return;
    }

    if (toolMode === "count") {
      const newPin: MeasurementPin = {
        id: `pin-${Date.now()}`,
        sheetId: sheet.id,
        type: "count",
        label: `نقطة عد #${(sheet.measurementPins?.length || 0) + 1}`,
        color: "#f59e0b",
        points: [{ x: normX, y: normY }],
        calculatedValue: 1,
        unit: "عدد",
      };
      onAddMeasurementPin(newPin);
    } else if (toolMode === "length") {
      const nextPoints = [...activePoints, { x: normX, y: normY }];
      if (nextPoints.length === 2) {
        const dxPx = (nextPoints[1].x - nextPoints[0].x) * STAGE_W;
        const dyPx = (nextPoints[1].y - nextPoints[0].y) * STAGE_H;
        const lengthMeters = Math.hypot(dxPx, dyPx) * metersPerPixel;

        const newPin: MeasurementPin = {
          id: `pin-${Date.now()}`,
          sheetId: sheet.id,
          type: "length",
          label: `مسافة مقاسة (${lengthMeters.toFixed(2)} م)`,
          color: "#38bdf8",
          points: nextPoints,
          calculatedValue: Number(lengthMeters.toFixed(2)),
          unit: "م.ط",
        };
        onAddMeasurementPin(newPin);
        setActivePoints([]);
      } else {
        setActivePoints(nextPoints);
      }
    } else if (toolMode === "area") {
      setActivePoints((prev) => [...prev, { x: normX, y: normY }]);
    }
  };

  const svgContent = sampleDrawingsSvg[sheet.id] || "";

  return (
    <div className="flex flex-col h-[540px] lg:h-[640px] bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden relative">
      {/* Toolbar */}
      <div className="bg-slate-900/95 backdrop-blur-md px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 z-10">
        {/* Measurement Tools */}
        <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              setToolMode("select");
              setActivePoints([]);
            }}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1.5 ${
              toolMode === "select" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
            }`}
            title="تحريك وتصفح المخطط"
          >
            <MousePointer className="w-4 h-4" />
            <span className="hidden sm:inline">تصفح</span>
          </button>

          <button
            onClick={() => {
              setToolMode("calibrate");
              setActivePoints([]);
            }}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1.5 ${
              toolMode === "calibrate"
                ? "bg-emerald-500 text-slate-950 font-bold"
                : sheet.calibration
                ? "text-emerald-400 hover:bg-slate-800"
                : "text-amber-300 hover:bg-slate-800"
            }`}
            title="معايرة مقياس الرسم بنقطتين معلومتي المسافة بالمتر"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">
              {sheet.calibration ? "معاير ✓" : "معايرة المقياس"}
            </span>
          </button>

          <button
            onClick={() => {
              setToolMode("count");
              setActivePoints([]);
            }}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1.5 ${
              toolMode === "count" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            <Hash className="w-4 h-4" />
            <span className="hidden sm:inline">عد</span>
          </button>

          <button
            onClick={() => {
              setToolMode("length");
              setActivePoints([]);
            }}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1.5 ${
              toolMode === "length" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            <Ruler className="w-4 h-4" />
            <span className="hidden sm:inline">مسافة</span>
          </button>

          <button
            onClick={() => {
              setToolMode("area");
              setActivePoints([]);
            }}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1.5 ${
              toolMode === "area" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            <Square className="w-4 h-4" />
            <span className="hidden sm:inline">مساحة</span>
          </button>
        </div>

        {/* Center Info & DXF Layers */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 font-mono text-slate-200">
            <span>المقياس:</span>
            <span className="font-bold text-amber-400">{sheet.scale}</span>
          </div>

          {sheet.dxfLayers && sheet.dxfLayers.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowLayersDropdown(!showLayersDropdown)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-md text-xs font-mono border border-slate-700"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>طبقات CAD ({sheet.dxfLayers.length})</span>
              </button>

              {showLayersDropdown && (
                <div className="absolute left-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 text-xs max-h-60 overflow-y-auto">
                  <div className="font-bold text-slate-200 px-2 py-1 mb-1 border-b border-slate-800">
                    طبقات ملف CAD:
                  </div>
                  {sheet.dxfLayers.map((l) => (
                    <div
                      key={l.name}
                      onClick={() => toggleLayer(l.name)}
                      className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-800 cursor-pointer text-slate-300"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color || "#38bdf8" }} />
                        <span className="truncate">{l.name}</span>
                      </div>
                      {dxfLayerState[l.name] === false ? (
                        <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Zoom & Self-Reliant Engines */}
        <div className="flex items-center gap-1.5">
          <button onClick={handleZoomIn} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg" title="تكبير">
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomOut} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg" title="تصغير">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={handleResetView} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg" title="إعادة ضبط">
            <RotateCcw className="w-4 h-4" />
          </button>

        </div>
      </div>

      {/* Active Visual Search Highlight Banner */}
      {highlightedTokens.length > 0 && (
        <div className="bg-cyan-950/90 border-b border-cyan-700/60 px-4 py-1.5 flex items-center justify-between text-xs text-cyan-200 z-10">
          <div className="flex items-center gap-2">
            <ScanSearch className="w-4 h-4 text-cyan-400" />
            <span>
              تم تحديد <strong>{highlightedTokens.length}</strong> تطابق بصري لـ{" "}
              <strong className="text-amber-300">"{highlightLabel}"</strong> على المخطط
            </span>
          </div>
          {onClearHighlights && (
            <button
              onClick={onClearHighlights}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-900 hover:bg-cyan-800 text-cyan-100"
            >
              <X className="w-3 h-3" />
              <span>مسح التحديد</span>
            </button>
          )}
        </div>
      )}

      {/* Main Interactive Stage */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleContainerClick}
        className={`flex-1 relative w-full h-full overflow-hidden select-none ${
          toolMode === "select" ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-crosshair"
        }`}
      >
        <div
          className="absolute inset-0 transition-transform origin-top-left flex items-center justify-center pointer-events-auto"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {sheet.imageUrl ? (
            <img
              src={sheet.imageUrl}
              alt={sheet.title}
              className="max-w-none max-h-none pointer-events-none"
              style={{ width: `${STAGE_W}px`, height: `${STAGE_H}px`, objectFit: "contain" }}
            />
          ) : sheet.fileType === "dxf" && sheet.dxfRawSummary ? (
            <canvas
              ref={dxfCanvasRef}
              width={STAGE_W}
              height={STAGE_H}
              className="border border-slate-800 shadow-2xl bg-slate-950"
            />
          ) : (
            <div
              className="w-[1000px] h-[700px] border border-slate-800 shadow-2xl"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          )}

          {/* Visual Search Highlight Boxes */}
          {highlightedTokens.map((tok) => (
            <div
              key={tok.id}
              className="absolute z-20 pointer-events-none border-2 border-cyan-400 bg-cyan-400/25 rounded-sm shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-pulse"
              style={{
                left: `${tok.x * STAGE_W}px`,
                top: `${tok.y * STAGE_H}px`,
                width: `${Math.max(24, tok.w * STAGE_W)}px`,
                height: `${Math.max(18, tok.h * STAGE_H)}px`,
              }}
            />
          ))}

          {/* In-progress polygon/line points */}
          {activePoints.map((pt, idx) => (
            <div
              key={idx}
              className="absolute z-20 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-white pointer-events-none"
              style={{
                left: `${pt.x * STAGE_W}px`,
                top: `${pt.y * STAGE_H}px`,
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}

          {/* Measurement Pins */}
          {sheet.measurementPins?.map((pin) => {
            if (!pin.points || pin.points.length === 0) return null;
            const primaryPoint = pin.points[0];
            return (
              <div
                key={pin.id}
                className="absolute z-20 group"
                style={{
                  left: `${primaryPoint.x * STAGE_W}px`,
                  top: `${primaryPoint.y * STAGE_H}px`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[10px] shadow-lg ring-2 ring-white/70 cursor-pointer"
                  style={{ backgroundColor: pin.color || "#f59e0b" }}
                >
                  <MapPin className="w-3 h-3" />
                </div>

                <div className="hidden group-hover:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-xl text-[11px] font-sans whitespace-nowrap shadow-2xl flex-col items-center gap-1 z-30">
                  <span className="font-bold text-amber-300">{pin.label}</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {pin.calculatedValue} {pin.unit}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onConvertPinToItem(pin);
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px]"
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>تحويل لبند حصر</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveMeasurementPin(pin.id);
                      }}
                      className="text-rose-400 text-[10px] hover:underline"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>


        {/* Review-on-Blueprint Overlay Card (مراجعة الحصر على اللوحة) */}
        {focusedItem && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-3 right-3 z-30 w-80 max-w-[92%] bg-slate-900/95 backdrop-blur-md border border-amber-400/50 rounded-2xl shadow-2xl p-4 text-right text-white space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  مراجعة الحصر على اللوحة ({sheet.code})
                </div>
                <h4 className="text-xs font-bold text-white mt-0.5 leading-snug">
                  {focusedItem.description}
                </h4>
              </div>
              {onCloseFocusedItem && (
                <button
                  onClick={onCloseFocusedItem}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                  title="إغلاق بطاقة المراجعة"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/70 rounded-xl p-2.5 border border-slate-800">
              <div>
                <span className="text-slate-400 block">الكمية الصافية:</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  {focusedItem.quantity} {focusedItem.unit}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">التصنيف:</span>
                <span className="text-slate-200 font-semibold truncate block">{focusedItem.category}</span>
              </div>
              {focusedItem.formula && (
                <div className="col-span-2 border-t border-slate-800 pt-1.5">
                  <span className="text-slate-400 block">المعادلة:</span>
                  <span className="font-mono text-cyan-300 text-[11px] break-all">{focusedItem.formula}</span>
                </div>
              )}
              {(focusedItem.sourceEvidence || focusedItem.sourceDetails?.layer) && (
                <div className="col-span-2 border-t border-slate-800 pt-1.5">
                  <span className="text-slate-400 block">المصدر / الطبقة:</span>
                  <span className="text-amber-200 text-[11px]">
                    {focusedItem.sourceDetails?.layer ? `طبقة: ${focusedItem.sourceDetails.layer} — ` : ""}
                    {focusedItem.sourceEvidence || "حصر من اللوحة"}
                  </span>
                  {sheet.dxfRawSummary?.unitInfo && (
                    <span className="block text-[10px] text-emerald-300 font-mono mt-0.5">
                      وحدة CAD: {sheet.dxfRawSummary.unitInfo.name} (معامل التحويل: ×{sheet.dxfRawSummary.unitInfo.toMeters})
                    </span>
                  )}
                </div>
              )}
            </div>

            {focusedItem.auditLog && focusedItem.auditLog.length > 0 && (
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  سجل التعديلات: {focusedItem.auditLog.length} حركة — آخر تحديث:{" "}
                  {new Date(focusedItem.auditLog[focusedItem.auditLog.length - 1].timestamp).toLocaleString("ar-SA")}
                </span>
              </div>
            )}

            {onUpdateFocusedItemStatus && (
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  onClick={() => onUpdateFocusedItemStatus(focusedItem, "approved", "اعتماد بعد المراجعة على اللوحة")}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>اعتماد</span>
                </button>
                <button
                  onClick={() => onUpdateFocusedItemStatus(focusedItem, "needs_review", "تم تأشير البند للمراجعة")}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>مراجعة</span>
                </button>
                <button
                  onClick={() => onUpdateFocusedItemStatus(focusedItem, "rejected", "مرفوض بعد المطابقة")}
                  className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-bold"
                  title="رفض البند"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Calibration Modal Overlay */}
        {pendingCalibPts && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-30 bg-slate-950/60 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl text-right space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                <span>أدخل المسافة الحقيقية بين النقطتين</span>
              </h3>
              <p className="text-xs text-slate-500">
                أدخل البعد الحقيقي بالمتر (مثال: المسافة بين محورين = 5.0 م) لمعايرة جميع القياسات على هذه اللوحة.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={calibMetersInput}
                  onChange={(e) => setCalibMetersInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm text-slate-900"
                  autoFocus
                />
                <span className="text-xs font-bold text-slate-600">متر</span>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setPendingCalibPts(null)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  onClick={confirmCalibration}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                >
                  اعتماد المعايرة
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Tool Guidance & Finish Polygon Button */}
        {toolMode !== "select" && (
          <div className="absolute bottom-4 left-4 z-20 px-3.5 py-2 rounded-xl bg-slate-900/95 border border-amber-500/40 text-amber-300 text-xs font-semibold shadow-lg flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>
              {toolMode === "calibrate" &&
                (activePoints.length === 0
                  ? "انقر على النقطة الأولى لمسافة معلومة على المخطط"
                  : "انقر على النقطة الثانية لإدخال المسافة الحقيقية بالمتر")}
              {toolMode === "count" && "انقر على المخطط لوضع نقطة عد (ثم مرر عليها لتحويلها لبند حصر)"}
              {toolMode === "length" &&
                (activePoints.length === 0 ? "انقر لتحديد بداية المسافة" : "انقر لتحديد نهاية المسافة")}
              {toolMode === "area" && `انقر لتحديد زوايا المضلع (${activePoints.length} نقاط)`}
            </span>
            {toolMode === "area" && activePoints.length >= 3 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  finishPolygonArea(activePoints);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>إنهاء وحساب المساحة</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
