import React, { useState, useRef, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
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
import { onPaperColor } from "../utils/paperColor";

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
      fitView();
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

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 8));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.2));
  // Fit the whole sheet inside the stage (what a phone needs first); the stage is centred, so scale about its middle.
  const fitView = () => {
    const r = containerRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const z = Math.min(1, r.width / STAGE_W, r.height / STAGE_H);
    setZoom(z);
    setPan({ x: (r.width / 2) * (1 - z), y: (r.height / 2) * (1 - z) });
  };
  const handleResetView = fitView;

  // ── Pan / pinch / wheel (pointer events: one code path for mouse, touch and pen) ──
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{ dist: number; zoom: number; pan: { x: number; y: number }; mid: { x: number; y: number } } | null>(null);
  const suppressClickRef = useRef(false);
  const viewRef = useRef({ zoom, pan });
  viewRef.current = { zoom, pan };
  const MAX_ZOOM = 8;
  const MIN_ZOOM = 0.2;

  const localPoint = (clientX: number, clientY: number) => {
    const r = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      gestureRef.current = {
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1,
        zoom: viewRef.current.zoom,
        pan: viewRef.current.pan,
        mid: localPoint((p1.x + p2.x) / 2, (p1.y + p2.y) / 2),
      };
      setIsDragging(false);
      suppressClickRef.current = true;
    } else if (pointersRef.current.size === 1 && (toolMode === "select" || e.button === 1 || e.altKey)) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (pointersRef.current.size === 2 && g) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.zoom * (dist / g.dist)));
      const mid = localPoint((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      // keep the drawing point that was under the fingers at the start under the fingers now
      const cx = (g.mid.x - g.pan.x) / g.zoom;
      const cy = (g.mid.y - g.pan.y) / g.zoom;
      setZoom(nz);
      setPan({ x: mid.x - cx * nz, y: mid.y - cy * nz });
    } else if (isDragging) {
      const dx = e.clientX - dragStart.x - pan.x;
      const dy = e.clientY - dragStart.y - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) suppressClickRef.current = true;
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
    if (pointersRef.current.size === 0) {
      setIsDragging(false);
      // a pinch or drag must not also drop a measuring point
      window.setTimeout(() => { suppressClickRef.current = false; }, 300);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const { zoom: z0, pan: p0 } = viewRef.current;
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z0 * Math.exp(-ev.deltaY * 0.0015)));
      const r = el.getBoundingClientRect();
      const mx = ev.clientX - r.left;
      const my = ev.clientY - r.top;
      const cx = (mx - p0.x) / z0;
      const cy = (my - p0.y) / z0;
      setZoom(nz);
      setPan({ x: mx - cx * nz, y: my - cy * nz });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [sheet.id]);

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
    if (isDragging || suppressClickRef.current || toolMode === "select") return;
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

  const toolBtn = (on: boolean) =>
    `grid sm:flex h-8 min-w-8 place-items-center sm:items-center sm:gap-1.5 px-1.5 sm:px-2.5 shrink-0 rounded-lg ${
      on ? "bg-amber-500 text-slate-900" : "text-slate-600 hover:bg-slate-100"
    }`;
  const svgContent = sampleDrawingsSvg[sheet.id] || "";

  return (
    <div className="flex flex-col h-[56dvh] min-h-[340px] max-h-[600px] lg:h-[640px] lg:max-h-none rounded-xl border border-slate-300 overflow-hidden relative" style={{ background: "var(--paper)" }}>
      {/* Toolbar: same paper as the page, a hairline under it */}
      <div className="px-2 sm:px-3 py-1.5 border-b border-slate-300 flex items-center justify-between gap-2 z-10" dir="rtl">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setToolMode("select");
              setActivePoints([]);
            }}
            className={toolBtn(toolMode === "select")}
            title="تحريك وتصفح المخطط"
            aria-label="تصفح"
          >
            <MousePointer className="w-[18px] h-[18px]" />
            <span className="hidden sm:inline text-xs font-bold">تصفح</span>
          </button>
          <button
            onClick={() => {
              setToolMode("calibrate");
              setActivePoints([]);
            }}
            className={toolBtn(toolMode === "calibrate") + (sheet.calibration && toolMode !== "calibrate" ? " !text-amber-700" : "")}
            title="معايرة مقياس الرسم بنقطتين معلومتي المسافة بالمتر"
            aria-label="معايرة المقياس"
          >
            <SlidersHorizontal className="w-[18px] h-[18px]" />
            <span className="hidden sm:inline text-xs font-bold">{sheet.calibration ? "معاير ✓" : "معايرة"}</span>
          </button>
          <button
            onClick={() => {
              setToolMode("count");
              setActivePoints([]);
            }}
            className={toolBtn(toolMode === "count")}
            title="عد"
            aria-label="عد"
          >
            <Hash className="w-[18px] h-[18px]" />
            <span className="hidden sm:inline text-xs font-bold">عد</span>
          </button>
          <button
            onClick={() => {
              setToolMode("length");
              setActivePoints([]);
            }}
            className={toolBtn(toolMode === "length")}
            title="مسافة"
            aria-label="مسافة"
          >
            <Ruler className="w-[18px] h-[18px]" />
            <span className="hidden sm:inline text-xs font-bold">مسافة</span>
          </button>
          <button
            onClick={() => {
              setToolMode("area");
              setActivePoints([]);
            }}
            className={toolBtn(toolMode === "area")}
            title="مساحة"
            aria-label="مساحة"
          >
            <Square className="w-[18px] h-[18px]" />
            <span className="hidden sm:inline text-xs font-bold">مساحة</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          {sheet.dxfLayers && sheet.dxfLayers.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowLayersDropdown(!showLayersDropdown)}
                className="flex h-8 items-center gap-1.5 px-2.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold"
              >
                <Layers className="w-4 h-4" />
                <span>طبقات {sheet.dxfLayers.length}</span>
              </button>

              {showLayersDropdown && (
                <div className="absolute left-0 top-full mt-1.5 w-56 border border-slate-300 rounded-xl p-1.5 z-50 text-xs max-h-60 overflow-y-auto" style={{ background: "var(--paper)" }}>
                  <div className="font-bold text-slate-800 px-2 py-1 mb-1 border-b border-slate-200">طبقات ملف CAD</div>
                  {sheet.dxfLayers.map((l) => (
                    <div
                      key={l.name}
                      onClick={() => toggleLayer(l.name)}
                      className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer text-slate-700"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: onPaperColor(l.color || "#38bdf8") }} />
                        <span className="truncate">{l.name}</span>
                      </div>
                      {dxfLayerState[l.name] === false ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-amber-600" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={handleZoomOut} className="hidden sm:grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" title="تصغير" aria-label="تصغير">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={handleResetView} className="h-8 min-w-[3rem] px-1 rounded-lg text-xs font-mono font-bold text-slate-700 hover:bg-slate-100" title="ملاءمة الشاشة">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={handleZoomIn} className="hidden sm:grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" title="تكبير" aria-label="تكبير">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Visual Search Highlight Banner */}
      {highlightedTokens.length > 0 && (
        <div className="border-b border-slate-300 px-4 py-1.5 flex items-center justify-between text-xs text-slate-700 z-10">
          <div className="flex items-center gap-2">
            <ScanSearch className="w-4 h-4 text-amber-600" />
            <span>
              تم تحديد <strong>{highlightedTokens.length}</strong> تطابق بصري لـ{" "}
              <strong className="text-amber-700">"{highlightLabel}"</strong> على المخطط
            </span>
          </div>
          {onClearHighlights && (
            <button
              onClick={onClearHighlights}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 text-slate-700"
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClick={handleContainerClick}
        style={{ touchAction: "none" }}
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
              style={{ background: "var(--paper)" }}
            />
          ) : (
            <div
              className="w-[1000px] h-[700px]"
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

                <div className="hidden group-hover:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-3 py-2 border border-slate-400 text-slate-900 keep-paper rounded-xl text-[11px] font-sans whitespace-nowrap flex-col items-center gap-1 z-30" style={{ background: "var(--paper)" }}>
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
            style={{ background: "var(--paper)" }}
            className="absolute top-3 right-3 z-30 w-80 max-w-[92%] border border-slate-400 rounded-xl p-4 text-right text-slate-900 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold text-amber-700">
                  مراجعة الحصر على اللوحة ({sheet.code})
                </div>
                <h4 className="text-sm font-extrabold text-slate-900 mt-0.5 leading-snug">
                  {focusedItem.description}
                </h4>
              </div>
              {onCloseFocusedItem && (
                <button
                  onClick={onCloseFocusedItem}
                  className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
                  title="إغلاق بطاقة المراجعة"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] rounded-lg p-2.5 border border-slate-300">
              <div>
                <span className="text-slate-500 block">الكمية الصافية:</span>
                <span className="font-mono font-black text-amber-700 text-sm">
                  {focusedItem.quantity} {focusedItem.unit}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">التصنيف:</span>
                <span className="text-slate-800 font-semibold truncate block">{focusedItem.category}</span>
              </div>
              {focusedItem.formula && (
                <div className="col-span-2 border-t border-slate-200 pt-1.5">
                  <span className="text-slate-500 block">المعادلة:</span>
                  <span className="font-mono text-slate-700 text-[11px] break-all">{focusedItem.formula}</span>
                </div>
              )}
              {(focusedItem.sourceEvidence || focusedItem.sourceDetails?.layer) && (
                <div className="col-span-2 border-t border-slate-200 pt-1.5">
                  <span className="text-slate-500 block">المصدر / الطبقة:</span>
                  <span className="text-slate-700 text-[11px]">
                    {focusedItem.sourceDetails?.layer ? `طبقة: ${focusedItem.sourceDetails.layer} — ` : ""}
                    {focusedItem.sourceEvidence || "حصر من اللوحة"}
                  </span>
                  {sheet.dxfRawSummary?.unitInfo && (
                    <span className="block text-[10px] text-amber-700 font-mono mt-0.5">
                      وحدة CAD: {sheet.dxfRawSummary.unitInfo.name} (معامل التحويل: ×{sheet.dxfRawSummary.unitInfo.toMeters})
                    </span>
                  )}
                </div>
              )}
            </div>

            {focusedItem.auditLog && focusedItem.auditLog.length > 0 && (
              <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
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
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-900 text-white text-[11px] font-bold"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>اعتماد</span>
                </button>
                <button
                  onClick={() => onUpdateFocusedItemStatus(focusedItem, "needs_review", "تم تأشير البند للمراجعة")}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg qto-cta text-[11px] font-bold"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>مراجعة</span>
                </button>
                <button
                  onClick={() => onUpdateFocusedItemStatus(focusedItem, "rejected", "مرفوض بعد المطابقة")}
                  className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg border border-rose-300 text-rose-700 text-[11px] font-bold"
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
            className="absolute inset-0 z-30 bg-slate-900/30 flex items-center justify-center p-4"
          >
            <div className="keep-paper rounded-xl p-5 max-w-sm w-full border border-slate-400 text-right space-y-3" style={{ background: "var(--paper)" }}>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-700" />
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
                  className="px-4 py-1.5 rounded-lg qto-cta text-xs font-bold"
                >
                  اعتماد المعايرة
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Tool Guidance & Finish Polygon Button */}
        {toolMode !== "select" && (
          <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-20 px-3.5 py-2 rounded-xl border border-slate-400 text-slate-800 text-xs font-semibold flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
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
                className="px-2.5 py-1 rounded-lg qto-cta text-xs flex items-center gap-1"
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


