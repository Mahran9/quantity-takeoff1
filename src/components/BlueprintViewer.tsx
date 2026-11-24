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
  Undo2,
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
import { ptToMetres } from "../utils/pdfPlan";

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

/** Quick names for a measurement, with the BOQ section each one belongs to. */
const QUICK: Record<"length" | "area" | "count", { name: string; category: string }[]> = {
  length: [
    { name: "جدار بلوك", category: "أعمال المباني والبلوك" },
    { name: "ميدة خرسانية", category: "أعمال خرسانية مسلحة وعادية" },
    { name: "أنبوب صرف", category: "أعمال التغذية والصرف الصحي" },
    { name: "تمديد كهرباء", category: "أعمال التمديدات الكهربائية والإنارة" },
  ],
  area: [
    { name: "أرضية", category: "أعمال الأرضيات والرخام والبورسلين" },
    { name: "لياسة", category: "أعمال البياض والتشطيبات الداخلية" },
    { name: "دهان", category: "أعمال الدهانات والديكورات" },
    { name: "بلاطة سقف", category: "أعمال خرسانية مسلحة وعادية" },
  ],
  count: [
    { name: "باب", category: "أعمال الأبواب والشبابيك والألمنيوم" },
    { name: "نافذة", category: "أعمال الأبواب والشبابيك والألمنيوم" },
    { name: "نقطة إنارة", category: "أعمال التمديدات الكهربائية والإنارة" },
    { name: "عمود", category: "أعمال خرسانية مسلحة وعادية" },
  ],
};
const TYPE_LABEL = { length: "مسافة", area: "مساحة", count: "عدّ" } as const;

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
  const [size, setSize] = useState({ w: STAGE_W, h: STAGE_H });
  const [draft, setDraft] = useState<{ type: "length" | "area" | "count"; value: number; unit: string; points: { x: number; y: number }[] } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCat, setDraftCat] = useState("");
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
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
    setDraft(null);
    setSelectedPinId(null);
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

  // Stage pixel -> metres. A person's own calibration wins; otherwise the scale the PDF reader verified from the drawing's
  // own dimension numbers is used (stage = page fitted into 1000x700, so one stage pixel is a fixed number of PDF points).
  const autoMpp = (() => {
    const v = sheet.pdfVector;
    if (!v || !v.detectedDenominator || v.scaleConfidence === "low" || !v.pageWidthPt || !v.pageHeightPt) return 0;
    const usedW = Math.min(STAGE_W, (STAGE_H * v.pageWidthPt) / v.pageHeightPt);
    const stagePxPerPt = usedW / v.pageWidthPt;
    return ptToMetres(1, v.detectedDenominator, v.userUnit || 1) / stagePxPerPt;
  })();
  const metersPerPixel = sheet.calibration?.metersPerPixel ?? (autoMpp || 0.02);
  const scaleState: "manual" | "auto" | "none" = sheet.calibration ? "manual" : autoMpp ? "auto" : "none";

  // The stage is centred in the viewport; overlays live in a stage-sized layer at this offset.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setSize({ w: r.width, h: r.height }); };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheet.id]);
  const stageOx = (size.w - STAGE_W) / 2;
  const stageOy = (size.h - STAGE_H) / 2;

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

  const polyLengthM = (pts: { x: number; y: number }[]) => {
    let px = 0;
    for (let i = 1; i < pts.length; i++) px += Math.hypot((pts[i].x - pts[i - 1].x) * STAGE_W, (pts[i].y - pts[i - 1].y) * STAGE_H);
    return px * metersPerPixel;
  };
  const polyAreaM2 = (pts: { x: number; y: number }[]) => {
    let a2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      a2 += pts[i].x * STAGE_W * pts[j].y * STAGE_H - pts[j].x * STAGE_W * pts[i].y * STAGE_H;
    }
    return (Math.abs(a2) / 2) * metersPerPixel * metersPerPixel;
  };
  /** Live value of the measurement being drawn. */
  const liveValue = () =>
    toolMode === "length" ? polyLengthM(activePoints) : toolMode === "area" ? polyAreaM2(activePoints) : activePoints.length;
  const minPoints = toolMode === "area" ? 3 : toolMode === "length" ? 2 : 1;

  const finishMeasure = () => {
    if ((toolMode !== "length" && toolMode !== "area" && toolMode !== "count") || activePoints.length < minPoints) return;
    const v = liveValue();
    setDraft({ type: toolMode, value: Number(v.toFixed(2)), unit: toolMode === "length" ? "م.ط" : toolMode === "area" ? "م²" : "عدد", points: activePoints });
    setDraftName("");
    setDraftCat("");
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draftName.trim() || `${TYPE_LABEL[draft.type]} مقاسة`;
    const pin: MeasurementPin = {
      id: `pin-${Date.now()}`,
      sheetId: sheet.id,
      type: draft.type,
      label: name,
      color: draft.type === "length" ? "#0d9488" : draft.type === "area" ? "#0f766e" : "#d97706",
      points: draft.points,
      calculatedValue: draft.value,
      unit: draft.unit,
      category: draftCat || undefined,
    };
    onAddMeasurementPin(pin);
    onConvertPinToItem(pin);
    setDraft(null);
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

    if (draft) return;
    const rawX = (e.clientX - rect.left - pan.x) / zoom;
    const rawY = (e.clientY - rect.top - pan.y) / zoom;

    // viewport -> stage (the stage is centred in the viewport) -> 0..1 of the stage
    const normX = Math.max(0, Math.min(1, (rawX - stageOx) / STAGE_W));
    const normY = Math.max(0, Math.min(1, (rawY - stageOy) / STAGE_H));

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

    if (toolMode === "count" || toolMode === "length" || toolMode === "area") {
      setSelectedPinId(null);
      setActivePoints((prev) => [...prev, { x: normX, y: normY }]);
    }
  };

  const toolBtn = (on: boolean) =>
    `grid sm:flex h-8 min-w-8 place-items-center sm:items-center sm:gap-1.5 px-1.5 sm:px-2.5 shrink-0 rounded-lg ${
      on ? "bg-amber-500 text-slate-900" : "text-slate-600 hover:bg-slate-100"
    }`;
  const svgContent = sampleDrawingsSvg[sheet.id] || "";

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative" style={{ background: "var(--surface)" }}>
      {/* Toolbar: same paper as the page, a hairline under it */}
      <div className="px-2 sm:px-3 py-1.5 border-b border-slate-200 flex items-center justify-between gap-2 z-10" dir="rtl">
        <button
          onClick={() => { setToolMode("calibrate"); setActivePoints([]); setDraft(null); }}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold ${scaleState === "none" ? "border-amber-500 text-amber-800" : "border-slate-300 text-slate-700"}`}
          title="معايرة مقياس الرسم بنقطتين معلومتي المسافة"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {scaleState === "manual" ? "المقياس: معاير ✓" : scaleState === "auto" ? `المقياس 1:${sheet.pdfVector?.detectedDenominator} (من الرسم)` : "المقياس غير معاير"}
        </button>

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
                <div className="absolute left-0 top-full mt-1.5 w-56 border border-slate-300 rounded-xl p-1.5 z-50 text-xs max-h-60 overflow-y-auto shadow-lg" style={{ background: "var(--surface)" }}>
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
              style={{ background: "var(--surface)" }}
            />
          ) : (
            <div
              className="w-[1000px] h-[700px]"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          )}

          <div className="absolute pointer-events-none" style={{ left: stageOx, top: stageOy, width: STAGE_W, height: STAGE_H }}>
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


          {/* Measurements: saved ones and the one being drawn */}
          <svg className="absolute inset-0 z-10 pointer-events-none" width={STAGE_W} height={STAGE_H} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
            {sheet.measurementPins?.map((pin) => {
              if (pin.points.length < 2 || pin.type === "count") return null;
              const pts = pin.points.map((q) => `${q.x * STAGE_W},${q.y * STAGE_H}`).join(" ");
              const on = pin.id === selectedPinId;
              return pin.type === "area"
                ? <polygon key={pin.id} points={pts} fill={pin.color} fillOpacity={on ? 0.35 : 0.2} stroke={pin.color} strokeWidth={on ? 4 : 2.5} vectorEffect="non-scaling-stroke" />
                : <polyline key={pin.id} points={pts} fill="none" stroke={pin.color} strokeWidth={on ? 5 : 3.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
            })}
            {activePoints.length >= 2 && (toolMode === "area"
              ? <polygon points={activePoints.map((q) => `${q.x * STAGE_W},${q.y * STAGE_H}`).join(" ")} fill="#14b8a6" fillOpacity={0.18} stroke="#0d9488" strokeWidth={3} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
              : toolMode === "length"
                ? <polyline points={activePoints.map((q) => `${q.x * STAGE_W},${q.y * STAGE_H}`).join(" ")} fill="none" stroke="#0d9488" strokeWidth={3.5} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
                : null)}
          </svg>

          {activePoints.map((pt, idx) => (
            <div key={`a${idx}`} className="absolute z-20 w-3.5 h-3.5 rounded-full bg-teal-500 ring-2 ring-white pointer-events-none" style={{ left: pt.x * STAGE_W, top: pt.y * STAGE_H, transform: "translate(-50%, -50%)" }} />
          ))}

          {sheet.measurementPins?.map((pin) => {
            if (!pin.points?.length) return null;
            const pts = pin.type === "count" ? pin.points : [pin.points[0]];
            return pts.map((q, i) => (
              <button
                key={`${pin.id}-${i}`}
                onClick={(e) => { e.stopPropagation(); setToolMode("select"); setActivePoints([]); setSelectedPinId(pin.id === selectedPinId ? null : pin.id); }}
                className={`absolute z-20 grid place-items-center rounded-full text-white shadow-lg ring-2 pointer-events-auto ${pin.id === selectedPinId ? "ring-teal-300 w-7 h-7" : "ring-white/80 w-5 h-5"}`}
                style={{ left: q.x * STAGE_W, top: q.y * STAGE_H, transform: "translate(-50%, -50%)", backgroundColor: pin.color || "#0d9488", minHeight: 0 }}
                aria-label={pin.label}
              >
                <MapPin className="w-3 h-3" />
              </button>
            ));
          })}
          </div>
        </div>

        {/* Calibration Modal Overlay */}
        {pendingCalibPts && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-30 bg-slate-900/30 flex items-center justify-center p-4"
          >
            <div className="rounded-xl p-5 max-w-sm w-full border border-slate-300 text-right space-y-3 shadow-xl" style={{ background: "var(--surface)" }}>
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

        {/* Bottom dock: what to do next, then the tools (always labelled, phone first) */}
        <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 p-2.5 pointer-events-none" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {(() => {
            const card = "pointer-events-auto rounded-2xl border border-slate-200 p-3.5 shadow-xl text-right";
            const pin = sheet.measurementPins?.find((q) => q.id === selectedPinId);
            if (draft) {
              const quick = QUICK[draft.type];
              return (
                <div className={card} style={{ background: "var(--surface)" }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-bold text-slate-500">{TYPE_LABEL[draft.type]}{draft.type !== "count" && scaleState === "none" ? " (المقياس غير معاير: تقريبي)" : ""}</span>
                    <span className="font-mono text-2xl font-extrabold text-slate-900">{draft.value.toLocaleString("en-US")} <span className="text-sm text-slate-500">{draft.unit}</span></span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {quick.map((q) => (
                      <button key={q.name} onClick={() => { setDraftName(q.name); setDraftCat(q.category); }}
                        className={`rounded-full border px-3 py-1.5 text-[13px] font-bold ${draftName === q.name ? "border-teal-600 bg-teal-50 text-teal-900" : "border-slate-300 text-slate-700"}`}>{q.name}</button>
                    ))}
                  </div>
                  <input value={draftName} onChange={(e) => { setDraftName(e.target.value); setDraftCat(""); }} placeholder="أو اكتب اسم البند"
                    className="mt-2.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[15px]" style={{ background: "var(--surface)" }} />
                  <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
                    <button onClick={saveDraft} className="qto-cta h-12 rounded-xl text-[15px] flex items-center justify-center gap-2"><PlusCircle className="w-5 h-5" /> إضافة للجدول</button>
                    <button onClick={() => setDraft(null)} className="h-12 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700">رجوع</button>
                  </div>
                </div>
              );
            }
            if (pin && toolMode === "select") {
              return (
                <div className={card} style={{ background: "var(--surface)" }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-extrabold text-slate-900 truncate">{pin.label}</span>
                    <span className="font-mono text-lg font-extrabold text-slate-900">{pin.calculatedValue} <span className="text-sm text-slate-500">{pin.unit}</span></span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <button onClick={() => { onConvertPinToItem(pin); setSelectedPinId(null); }} className="qto-cta h-11 rounded-xl text-sm col-span-2">إضافة للجدول</button>
                    <button onClick={() => { onRemoveMeasurementPin(pin.id); setSelectedPinId(null); }} className="h-11 rounded-xl border border-rose-300 text-sm font-bold text-rose-700">حذف</button>
                  </div>
                </div>
              );
            }
            if (toolMode === "calibrate") {
              return (
                <div className={`${card} flex items-center gap-3`} style={{ background: "var(--surface)" }}>
                  <span className="flex-1 text-[13.5px] font-bold text-slate-800 leading-6">{activePoints.length === 0 ? "عاير المقياس: اضغط طرفي بُعد مكتوب على اللوحة (مثلاً 28.00 م)" : "الآن اضغط الطرف الثاني"}</span>
                  <button onClick={() => { setToolMode("select"); setActivePoints([]); }} className="h-10 rounded-xl border border-slate-300 px-3.5 text-sm font-bold text-slate-700">إلغاء</button>
                </div>
              );
            }
            if (toolMode === "select") return null;
            const n = activePoints.length;
            return (
              <div className={`${card} flex items-center gap-2`} style={{ background: "var(--surface)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-slate-600 leading-5">
                    {n === 0
                      ? toolMode === "length" ? "اضغط نقاط الخط على اللوحة (يمكن أن ينعطف)" : toolMode === "area" ? "اضغط زوايا المساحة بالترتيب" : "اضغط على كل عنصر لتعدّه"
                      : toolMode === "count" ? `${n} عنصر` : `${n} نقطة`}
                  </div>
                  {n >= minPoints && <div className="font-mono text-lg font-extrabold text-slate-900">{liveValue().toLocaleString("en-US", { maximumFractionDigits: 2 })} <span className="text-xs text-slate-500">{toolMode === "length" ? "م.ط" : toolMode === "area" ? "م²" : "عدد"}</span></div>}
                  {toolMode !== "count" && scaleState === "none" && (
                    <button onClick={() => { setToolMode("calibrate"); setActivePoints([]); }} className="text-[12px] font-bold text-amber-800 underline">المقياس غير معاير: عايره أولاً</button>
                  )}
                </div>
                {n > 0 && <button onClick={() => setActivePoints((p) => p.slice(0, -1))} aria-label="تراجع" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 text-slate-700"><Undo2 className="w-5 h-5" /></button>}
                <button disabled={n < minPoints} onClick={finishMeasure} className="qto-cta h-11 rounded-xl px-4 text-sm disabled:opacity-40">إنهاء</button>
              </div>
            );
          })()}

          <div className="pointer-events-auto grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 p-1 shadow-xl" style={{ background: "var(--surface)" }}>
            {([
              ["select", "تصفح", MousePointer],
              ["length", "مسافة", Ruler],
              ["area", "مساحة", Square],
              ["count", "عدّ", Hash],
            ] as const).map(([mode, label, Icon]) => (
              <button
                key={mode}
                onClick={() => { setToolMode(mode); setActivePoints([]); setDraft(null); setSelectedPinId(null); }}
                className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-bold ${toolMode === mode ? "bg-teal-500 text-slate-900" : "text-slate-600"}`}
              >
                <Icon className="w-[18px] h-[18px]" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


