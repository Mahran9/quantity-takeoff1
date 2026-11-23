import React, { useState } from "react";
import { X, Calculator, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { packBarsFFD } from "../utils/barPacking";

interface SteelCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSheet: BlueprintSheet;
  onAddItem: (item: TakeoffItem) => void;
}

type CalcTab = "rebar" | "sections" | "plates" | "panel" | "bars";

interface SteelSectionSpec {
  name: string;
  weightPerMeter: number;
  group: string;
}

const STEEL_SECTIONS: SteelSectionSpec[] = [
  { name: "IPE 140", weightPerMeter: 12.9, group: "كمرات IPE" },
  { name: "IPE 160", weightPerMeter: 15.8, group: "كمرات IPE" },
  { name: "IPE 180", weightPerMeter: 18.8, group: "كمرات IPE" },
  { name: "IPE 200", weightPerMeter: 22.4, group: "كمرات IPE" },
  { name: "IPE 220", weightPerMeter: 26.2, group: "كمرات IPE" },
  { name: "IPE 240", weightPerMeter: 30.7, group: "كمرات IPE" },
  { name: "IPE 270", weightPerMeter: 36.1, group: "كمرات IPE" },
  { name: "IPE 300", weightPerMeter: 42.2, group: "كمرات IPE" },
  { name: "IPE 330", weightPerMeter: 49.1, group: "كمرات IPE" },
  { name: "IPE 360", weightPerMeter: 57.1, group: "كمرات IPE" },
  { name: "IPE 400", weightPerMeter: 66.3, group: "كمرات IPE" },
  { name: "HEA 100", weightPerMeter: 16.7, group: "أعمدة وكمرات HEA" },
  { name: "HEA 120", weightPerMeter: 19.9, group: "أعمدة وكمرات HEA" },
  { name: "HEA 140", weightPerMeter: 24.7, group: "أعمدة وكمرات HEA" },
  { name: "HEA 160", weightPerMeter: 30.4, group: "أعمدة وكمرات HEA" },
  { name: "HEA 180", weightPerMeter: 35.5, group: "أعمدة وكمرات HEA" },
  { name: "HEA 200", weightPerMeter: 42.3, group: "أعمدة وكمرات HEA" },
  { name: "HEA 220", weightPerMeter: 50.5, group: "أعمدة وكمرات HEA" },
  { name: "HEA 240", weightPerMeter: 60.3, group: "أعمدة وكمرات HEA" },
  { name: "HEA 260", weightPerMeter: 68.2, group: "أعمدة وكمرات HEA" },
  { name: "HEA 280", weightPerMeter: 76.4, group: "أعمدة وكمرات HEA" },
  { name: "HEA 300", weightPerMeter: 88.3, group: "أعمدة وكمرات HEA" },
  { name: "HEA 320", weightPerMeter: 97.6, group: "أعمدة وكمرات HEA" },
  { name: "HEA 340", weightPerMeter: 105, group: "أعمدة وكمرات HEA" },
  { name: "HEA 360", weightPerMeter: 112, group: "أعمدة وكمرات HEA" },
  { name: "HEA 400", weightPerMeter: 125, group: "أعمدة وكمرات HEA" },
  { name: "HEB 160", weightPerMeter: 42.6, group: "أعمدة HEB" },
  { name: "HEB 200", weightPerMeter: 61.3, group: "أعمدة HEB" },
  { name: "HEB 240", weightPerMeter: 83.2, group: "أعمدة HEB" },
  { name: "HEB 300", weightPerMeter: 117.0, group: "أعمدة HEB" },
  { name: "UPN 100", weightPerMeter: 10.6, group: "مجرى UPN" },
  { name: "UPN 120", weightPerMeter: 13.4, group: "مجرى UPN" },
  { name: "UPN 160", weightPerMeter: 18.8, group: "مجرى UPN" },
  { name: "UPN 200", weightPerMeter: 25.3, group: "مجرى UPN" },
  { name: "C-Purlin 150×50×2.0mm", weightPerMeter: 4.1, group: "مدادات Purlin" },
  { name: "C-Purlin 200×65×2.0mm", weightPerMeter: 5.4, group: "مدادات Purlin" },
  { name: "Z-Purlin 200×65×2.5mm", weightPerMeter: 6.7, group: "مدادات Purlin" },
  { name: "تيوب مربع 50×50×2mm", weightPerMeter: 2.95, group: "تيوبات SHS/RHS" },
  { name: "تيوب مربع 80×80×3mm", weightPerMeter: 7.09, group: "تيوبات SHS/RHS" },
  { name: "تيوب مربع 100×100×4mm", weightPerMeter: 11.73, group: "تيوبات SHS/RHS" },
  { name: "تيوب مستطيل 100×50×3mm", weightPerMeter: 6.62, group: "تيوبات SHS/RHS" },
  { name: "تيوب مستطيل 120×60×3mm", weightPerMeter: 8.03, group: "تيوبات SHS/RHS" },
  { name: "تيوب مستطيل 40×80×1.5mm", weightPerMeter: 2.75, group: "تيوبات SHS/RHS" },
  { name: "تيوب مستطيل 40×60×2mm", weightPerMeter: 2.89, group: "تيوبات SHS/RHS" },
  { name: "تيوب مستطيل 50×100×2mm", weightPerMeter: 4.43, group: "تيوبات SHS/RHS" },
  { name: "تيوب مستطيل 60×120×3mm", weightPerMeter: 8.03, group: "تيوبات SHS/RHS" },
  { name: "تيوب مربع 40×40×2mm", weightPerMeter: 2.31, group: "تيوبات SHS/RHS" },
  { name: "تيوب مربع 60×60×3mm", weightPerMeter: 5.19, group: "تيوبات SHS/RHS" },
  { name: "تيوب مربع 120×120×5mm", weightPerMeter: 17.5, group: "تيوبات SHS/RHS" },
];

const REBAR_DIAMETERS = [8, 10, 12, 14, 16, 18, 20, 22, 25, 32];

export const SteelCalculatorModal: React.FC<SteelCalculatorModalProps> = ({
  isOpen,
  onClose,
  activeSheet,
  onAddItem,
}) => {
  const [tab, setTab] = useState<CalcTab>("sections");
  const [rebarDia, setRebarDia] = useState<number>(16);
  const [rebarLen, setRebarLen] = useState<number>(12);
  const [rebarCount, setRebarCount] = useState<number>(50);
  const [rebarWastage, setRebarWastage] = useState<number>(5);
  const [rebarLoc, setRebarLoc] = useState<string>("القواعد / الأعمدة");

  const [selectedSection, setSelectedSection] = useState<string>(STEEL_SECTIONS[7].name);
  const [customWeightPerM, setCustomWeightPerM] = useState<number>(STEEL_SECTIONS[7].weightPerMeter);
  const [secLen, setSecLen] = useState<number>(12);
  const [secCount, setSecCount] = useState<number>(10);
  const [secWastage, setSecWastage] = useState<number>(5);
  const [secLoc, setSecLoc] = useState<string>("الهيكل المعدني الرئيسي");

  const [plateLen, setPlateLen] = useState<number>(0.5);
  const [plateWidth, setPlateWidth] = useState<number>(0.5);
  const [plateThickMm, setPlateThickMm] = useState<number>(16);
  const [plateCount, setPlateCount] = useState<number>(20);
  const [plateWastage, setPlateWastage] = useState<number>(5);
  const [plateLoc, setPlateLoc] = useState<string>("بيس بليت الأعمدة (Base Plates)");

  const [panelType, setPanelType] = useState<string>("ساندوتش بانل سقف سماكة 5 سم");
  const [panelLen, setPanelLen] = useState<number>(30);
  const [panelWidth, setPanelWidth] = useState<number>(20);
  const [panelCount, setPanelCount] = useState<number>(1);
  const [panelWastage, setPanelWastage] = useState<number>(7);
  const [outputUnit, setOutputUnit] = useState<"طن" | "كجم">("طن");

  // Standard bars (cutting stock) mode
  const [barSection, setBarSection] = useState<string>("HEA 300");
  const [barWeightPerM, setBarWeightPerM] = useState<number>(88.3);
  const [barStock, setBarStock] = useState<number>(12);
  const [barRows, setBarRows] = useState<{ id: number; len: number; qty: number }[]>([
    { id: 1, len: 7, qty: 10 },
  ]);
  const [barLoc, setBarLoc] = useState<string>("الهيكل المعدني الرئيسي");

  if (!isOpen) return null;

  const rebarKgPerM = (rebarDia * rebarDia) / 162.2;
  const rebarNetKg = rebarKgPerM * rebarLen * rebarCount;
  const rebarTotalKg = rebarNetKg * (1 + rebarWastage / 100);

  const secNetKg = customWeightPerM * secLen * secCount;
  const secTotalKg = secNetKg * (1 + secWastage / 100);

  const plateNetKg = plateLen * plateWidth * plateThickMm * 7.85 * plateCount;
  const plateTotalKg = plateNetKg * (1 + plateWastage / 100);

  const panelNetArea = panelLen * panelWidth * panelCount;
  const panelTotalArea = panelNetArea * (1 + panelWastage / 100);

  const barResult = packBarsFFD(
    barRows.map((r) => ({ length: r.len, qty: r.qty })),
    barStock
  );
  const barTotalKg = barResult.barCount * barStock * barWeightPerM;

  const handleAddCalculatedItem = () => {
    const now = Date.now();
    if (tab === "bars") {
      if (barResult.barCount === 0) return;
      const qty = outputUnit === "طن" ? barTotalKg / 1000 : barTotalKg;
      const cutsText = barRows
        .filter((r) => r.len > 0 && r.qty > 0)
        .map((r) => `${r.qty}×${r.len}م`)
        .join(" + ");
      onAddItem({
        id: `item-bars-${now}`,
        sheetId: activeSheet.id,
        sheetCode: activeSheet.code,
        sheetTitle: activeSheet.title,
        itemCode: `ST-BAR`,
        description: `توريد وتصنيع وتركيب قطاع حديد ${barSection} — ${barResult.barCount} عود قياسي ${barStock} م`,
        category: "أعمال الهياكل المعدنية والهناجر",
        dimensionType: "linear",
        location: barLoc,
        count: barResult.barCount,
        length: barStock,
        formula: `${barResult.barCount} عود × ${barStock} م × ${barWeightPerM} كجم/م`,
        quantity: Number(qty.toFixed(3)),
        unit: outputUnit,
        unitPrice: 0,
        totalPrice: 0,
        extractionSource: "manual_input",
        notes: `قطع: ${cutsText}. الطول المستعمل ${barResult.usedLength.toFixed(2)} م من ${barResult.stockTotalLength.toFixed(0)} م — الهالك ${barResult.wasteLength.toFixed(2)} م (${barResult.wastePercent}%) محسوب ضمن الكمية`,
      });
      onClose();
      return;
    }
    if (tab === "rebar") {
      const qty = outputUnit === "طن" ? rebarTotalKg / 1000 : rebarTotalKg;
      onAddItem({
        id: `item-steel-${now}`,
        sheetId: activeSheet.id,
        sheetCode: activeSheet.code,
        sheetTitle: activeSheet.title,
        itemCode: `RB-${rebarDia}`,
        description: `توريد وتقطيع وتشكيل حديد تسليح قطر ${rebarDia} مم (${rebarCount} سيخ × ${rebarLen} م + هالك ${rebarWastage}%)`,
        category: "أعمال حديد التسليح",
        dimensionType: "count",
        location: rebarLoc,
        count: rebarCount,
        length: rebarLen,
        wastagePercent: rebarWastage,
        formula: `(${rebarDia}²/162.2) × ${rebarLen} × ${rebarCount} × (1 + ${rebarWastage}%)`,
        quantity: Number(qty.toFixed(3)),
        unit: outputUnit,
        unitPrice: 0,
        totalPrice: 0,
        extractionSource: "manual_input",
        notes: `الوزن الصافي ${rebarNetKg.toFixed(1)} كجم — شامل الهالك ${rebarTotalKg.toFixed(1)} كجم`,
      });
    } else if (tab === "sections") {
      const qty = outputUnit === "طن" ? secTotalKg / 1000 : secTotalKg;
      onAddItem({
        id: `item-sec-${now}`,
        sheetId: activeSheet.id,
        sheetCode: activeSheet.code,
        sheetTitle: activeSheet.title,
        itemCode: `ST-SEC`,
        description: `توريد وتصنيع وتركيب قطاع حديد ${selectedSection} (${secCount} قطعة × ${secLen} م + هالك ${secWastage}%)`,
        category: "أعمال الهياكل المعدنية والهناجر",
        dimensionType: "linear",
        location: secLoc,
        count: secCount,
        length: secLen,
        wastagePercent: secWastage,
        formula: `${customWeightPerM} كجم/م × ${secLen} م × ${secCount} × (1 + ${secWastage}%)`,
        quantity: Number(qty.toFixed(3)),
        unit: outputUnit,
        unitPrice: 0,
        totalPrice: 0,
        extractionSource: "manual_input",
        notes: `الوزن الصافي ${secNetKg.toFixed(1)} كجم — شامل الهالك ${secTotalKg.toFixed(1)} كجم`,
      });
    } else if (tab === "plates") {
      const qty = outputUnit === "طن" ? plateTotalKg / 1000 : plateTotalKg;
      onAddItem({
        id: `item-plt-${now}`,
        sheetId: activeSheet.id,
        sheetCode: activeSheet.code,
        sheetTitle: activeSheet.title,
        itemCode: `ST-PLT`,
        description: `توريد وتقطيع ألواح صاج حديد سماكة ${plateThickMm} مم (${plateLen}×${plateWidth} م × ${plateCount} قطعة + هالك ${plateWastage}%)`,
        category: "أعمال الهياكل المعدنية والهناجر",
        dimensionType: "area",
        location: plateLoc,
        count: plateCount,
        length: plateLen,
        width: plateWidth,
        wastagePercent: plateWastage,
        formula: `${plateLen} × ${plateWidth} × ${plateThickMm}مم × 7.85 × ${plateCount} × (1 + ${plateWastage}%)`,
        quantity: Number(qty.toFixed(3)),
        unit: outputUnit,
        unitPrice: 0,
        totalPrice: 0,
        extractionSource: "manual_input",
        notes: `الوزن الصافي ${plateNetKg.toFixed(1)} كجم — شامل الهالك ${plateTotalKg.toFixed(1)} كجم`,
      });
    } else {
      onAddItem({
        id: `item-pnl-${now}`,
        sheetId: activeSheet.id,
        sheetCode: activeSheet.code,
        sheetTitle: activeSheet.title,
        itemCode: `SP-01`,
        description: `توريد وتركيب ${panelType} شامل الإكسسوارات والبراغي (شامل تراكب وهالك ${panelWastage}%)`,
        category: "أعمال الساندوتش بانل والكلادينج",
        dimensionType: "area",
        location: "السقف / الجوانب",
        count: panelCount,
        length: panelLen,
        width: panelWidth,
        wastagePercent: panelWastage,
        formula: `${panelLen} × ${panelWidth} × ${panelCount} × (1 + ${panelWastage}%)`,
        quantity: Number(panelTotalArea.toFixed(2)),
        unit: "م²",
        unitPrice: 0,
        totalPrice: 0,
        extractionSource: "manual_input",
        notes: `المساحة الصافية ${panelNetArea.toFixed(2)} م²`,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-right">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold">حاسبة أوزان الحديد والهناجر السريعة</h2>
              <p className="text-xs text-slate-400">
                احسب وزن القطاعات أو التسليح أو الصاج أو البانل وأضفه مباشرة إلى لوحة ({activeSheet.code})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap gap-2">
          {[
            { id: "sections", label: "كمرات وقطاعات (IPE/HEA/HEB/تيوب)" },
            { id: "bars", label: "أعواد قياسية (12 م)" },
            { id: "plates", label: "صاج وبيس بليت (Plates)" },
            { id: "rebar", label: "حديد تسليح (Rebar)" },
            { id: "panel", label: "ساندوتش بانل وشينكو" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as CalcTab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                tab === t.id
                  ? "bg-slate-900 text-amber-400 shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {tab === "sections" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">اختر القطاع القياسي</label>
                  <select
                    value={selectedSection}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSection(val);
                      const spec = STEEL_SECTIONS.find((s) => s.name === val);
                      if (spec) setCustomWeightPerM(spec.weightPerMeter);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  >
                    {STEEL_SECTIONS.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.group} — {s.name} ({s.weightPerMeter} كجم/م)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">الوزن للمتر الطولي (كجم/م)</label>
                  <input type="number" step="0.1" value={customWeightPerM} onChange={(e) => setCustomWeightPerM(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">طول القطعة (متر)</label>
                  <input type="number" step="0.1" value={secLen} onChange={(e) => setSecLen(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">العدد</label>
                  <input type="number" value={secCount} onChange={(e) => setSecCount(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">نسبة الهالك (%)</label>
                  <input type="number" value={secWastage} onChange={(e) => setSecWastage(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">الموقع في المشروع</label>
                  <input type="text" value={secLoc} onChange={(e) => setSecLoc(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-amber-800">الوزن الإجمالي شامل الهالك ({secWastage}%)</div>
                  <div className="text-2xl font-black font-mono text-slate-900 mt-1">
                    {(secTotalKg / 1000).toFixed(3)} <span className="text-sm font-bold text-amber-700">طن</span>
                    <span className="text-xs text-slate-500 mr-2">({secTotalKg.toFixed(1)} كجم)</span>
                  </div>
                </div>
                <select value={outputUnit} onChange={(e) => setOutputUnit(e.target.value as "طن" | "كجم")} className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold">
                  <option value="طن">طن</option>
                  <option value="كجم">كجم</option>
                </select>
              </div>
            </div>
          )}

          {tab === "bars" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                تُشترى القطاعات (HEA/IPE…) أعواداً قياسية؛ أدخل أطوال القطع المطلوبة وسيُرتّبها البرنامج على الأعواد
                (الأطول أولاً مع إعادة استخدام المتبقي) ويحتسب عدد الأعواد والهالك الفعلي.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">القطاع</label>
                  <select
                    value={barSection}
                    onChange={(e) => {
                      setBarSection(e.target.value);
                      const spec = STEEL_SECTIONS.find((x) => x.name === e.target.value);
                      if (spec) setBarWeightPerM(spec.weightPerMeter);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  >
                    {STEEL_SECTIONS.map((x) => (
                      <option key={x.name} value={x.name}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">الوزن (كجم/م)</label>
                  <input type="number" step="0.1" value={barWeightPerM} onChange={(e) => setBarWeightPerM(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">طول العود القياسي (م)</label>
                  <input type="number" step="0.5" min="1" value={barStock} onChange={(e) => setBarStock(Math.max(1, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] font-bold text-slate-500">
                  <span>طول القطعة (م)</span>
                  <span>العدد</span>
                  <span />
                </div>
                {barRows.map((r) => (
                  <div key={r.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <input
                      type="number"
                      step="0.01"
                      value={r.len}
                      onChange={(e) => setBarRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, len: Math.max(0, Number(e.target.value)) } : x)))}
                      className="px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm"
                    />
                    <input
                      type="number"
                      value={r.qty}
                      onChange={(e) => setBarRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, qty: Math.max(0, Math.floor(Number(e.target.value))) } : x)))}
                      className="px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm"
                    />
                    <button
                      onClick={() => setBarRows((rows) => (rows.length > 1 ? rows.filter((x) => x.id !== r.id) : rows))}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                      aria-label="حذف الصف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setBarRows((rows) => [...rows, { id: Date.now(), len: 0, qty: 1 }])}
                  className="text-xs font-bold text-amber-700 hover:text-amber-600"
                >
                  + إضافة طول آخر
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">الموقع في المشروع</label>
                <input type="text" value={barLoc} onChange={(e) => setBarLoc(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
              </div>

              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div>
                    <div className="text-[11px] text-amber-800">عدد الأعواد</div>
                    <div className="text-xl font-black font-mono">{barResult.barCount}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-amber-800">الطول المستعمل</div>
                    <div className="text-xl font-black font-mono">{barResult.usedLength.toFixed(2)} م</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-amber-800">الهالك المحسوب</div>
                    <div className="text-xl font-black font-mono">
                      {barResult.wasteLength.toFixed(2)} م <span className="text-xs">({barResult.wastePercent}%)</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-amber-800">الوزن</div>
                    <div className="text-xl font-black font-mono">{(barTotalKg / 1000).toFixed(3)} طن</div>
                  </div>
                </div>
                {barResult.oversizedCuts.length > 0 && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                    تنبيه: {barResult.oversizedCuts.length} قطعة أطول من العود القياسي ({barStock} م) لم تُحتسب — تحتاج وصلات أو عوداً أطول.
                  </div>
                )}
                <select value={outputUnit} onChange={(e) => setOutputUnit(e.target.value as "طن" | "كجم")} className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold">
                  <option value="طن">طن</option>
                  <option value="كجم">كجم</option>
                </select>
              </div>
            </div>
          )}

          {tab === "plates" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">طول اللوح (متر)</label>
                  <input type="number" step="0.05" value={plateLen} onChange={(e) => setPlateLen(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">عرض اللوح (متر)</label>
                  <input type="number" step="0.05" value={plateWidth} onChange={(e) => setPlateWidth(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">السماكة (ملم - mm)</label>
                  <input type="number" step="0.5" value={plateThickMm} onChange={(e) => setPlateThickMm(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">العدد</label>
                  <input type="number" value={plateCount} onChange={(e) => setPlateCount(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">نسبة الهالك (%)</label>
                  <input type="number" value={plateWastage} onChange={(e) => setPlateWastage(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">الموقع</label>
                  <input type="text" value={plateLoc} onChange={(e) => setPlateLoc(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-amber-800">الوزن الإجمالي شامل الهالك (كثافة 7.85)</div>
                  <div className="text-2xl font-black font-mono text-slate-900 mt-1">
                    {(plateTotalKg / 1000).toFixed(3)} <span className="text-sm font-bold text-amber-700">طن</span>
                    <span className="text-xs text-slate-500 mr-2">({plateTotalKg.toFixed(1)} كجم)</span>
                  </div>
                </div>
                <select value={outputUnit} onChange={(e) => setOutputUnit(e.target.value as "طن" | "كجم")} className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold">
                  <option value="طن">طن</option>
                  <option value="كجم">كجم</option>
                </select>
              </div>
            </div>
          )}

          {tab === "rebar" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">قطر السيخ (مم)</label>
                  <select value={rebarDia} onChange={(e) => setRebarDia(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-sm">
                    {REBAR_DIAMETERS.map((d) => (
                      <option key={d} value={d}>
                        Ø {d} mm ({((d * d) / 162.2).toFixed(3)} كجم/م)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">طول السيخ (متر)</label>
                  <input type="number" step="0.1" value={rebarLen} onChange={(e) => setRebarLen(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">عدد الأسياخ</label>
                  <input type="number" value={rebarCount} onChange={(e) => setRebarCount(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">نسبة الهالك (%)</label>
                  <input type="number" value={rebarWastage} onChange={(e) => setRebarWastage(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-600 block mb-1">الموقع</label>
                  <input type="text" value={rebarLoc} onChange={(e) => setRebarLoc(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-amber-800">وزن حديد التسليح شامل الهالك (معادلة d²/162.2)</div>
                  <div className="text-2xl font-black font-mono text-slate-900 mt-1">
                    {(rebarTotalKg / 1000).toFixed(3)} <span className="text-sm font-bold text-amber-700">طن</span>
                    <span className="text-xs text-slate-500 mr-2">({rebarTotalKg.toFixed(1)} كجم)</span>
                  </div>
                </div>
                <select value={outputUnit} onChange={(e) => setOutputUnit(e.target.value as "طن" | "كجم")} className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold">
                  <option value="طن">طن</option>
                  <option value="كجم">كجم</option>
                </select>
              </div>
            </div>
          )}

          {tab === "panel" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-600 block mb-1">نوع التغطية</label>
                  <select value={panelType} onChange={(e) => setPanelType(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm">
                    <option value="ساندوتش بانل سقف سماكة 5 سم">ساندوتش بانل سقف سماكة 5 سم</option>
                    <option value="ساندوتش بانل سقف سماكة 7.5 سم">ساندوتش بانل سقف سماكة 7.5 سم</option>
                    <option value="ساندوتش بانل جدران سماكة 5 سم">ساندوتش بانل جدران سماكة 5 سم</option>
                    <option value="صاج معرج (شينكو) معزول مع صوف صخري">صاج معرج (شينكو) معزول مع صوف صخري</option>
                    <option value="صاج معرج مفرد 0.5 مم">صاج معرج مفرد 0.5 مم</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">الطول (متر)</label>
                  <input type="number" step="0.1" value={panelLen} onChange={(e) => setPanelLen(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">العرض / الارتفاع (متر)</label>
                  <input type="number" step="0.1" value={panelWidth} onChange={(e) => setPanelWidth(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">العدد (واجهات / أسقف)</label>
                  <input type="number" value={panelCount} onChange={(e) => setPanelCount(Math.max(1, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">نسبة التراكب والهالك (%)</label>
                  <input type="number" value={panelWastage} onChange={(e) => setPanelWastage(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm" />
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                <div className="text-xs text-emerald-800">المساحة الإجمالية شاملة التراكب والهالك ({panelWastage}%)</div>
                <div className="text-2xl font-black font-mono text-slate-900 mt-1">
                  {panelTotalArea.toFixed(2)} <span className="text-sm font-bold text-emerald-700">م²</span>
                  <span className="text-xs text-slate-500 mr-2">(الصافي: {panelNetArea.toFixed(2)} م²)</span>
                </div>
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>يُضاف البند بسعر وحدة = 0 حتى تدخل سعرك التجاري بنفسك في الجدول.</span>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200">
            إغلاق
          </button>
          <button onClick={handleAddCalculatedItem} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold shadow-sm">
            <Plus className="w-4 h-4" />
            <span>إضافة البند إلى جدول الحصر</span>
          </button>
        </div>
      </div>
    </div>
  );
};
