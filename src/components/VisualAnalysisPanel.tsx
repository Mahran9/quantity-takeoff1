import React, { useMemo, useState } from "react";
import { Activity, Crosshair, Ruler, ScanSearch, AlertTriangle, CheckCircle2 } from "lucide-react";
import { analyzePlanImage, VisualAnalysisResult } from "../utils/visualAnalyzer";
import { BlueprintSheet } from "../types";

export const VisualAnalysisPanel: React.FC<{ sheet: BlueprintSheet }> = ({ sheet }) => {
  const [result, setResult] = useState<VisualAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [knownLength, setKnownLength] = useState("");
  const [lengthValue, setLengthValue] = useState("");
  const [showLines, setShowLines] = useState(true);

  const calibration = useMemo(() => {
    if (points.length !== 2 || !result) return null;
    const px = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const meters = Number(knownLength);
    if (!px || !Number.isFinite(meters) || meters <= 0) return null;
    return meters / px;
  }, [points, result, knownLength]);

  const runAnalysis = async () => {
    if (!sheet.imageUrl) return;
    setBusy(true); setError(""); setPoints([]); setResult(null);
    try { setResult(await analyzePlanImage(sheet.imageUrl)); }
    catch (e) { setError(e instanceof Error ? e.message : "حدث خطأ أثناء تحليل المخطط"); }
    finally { setBusy(false); }
  };

  const recordPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!result) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * result.width;
    const y = ((event.clientY - rect.top) / rect.height) * result.height;
    setPoints((old) => old.length >= 2 ? [{ x, y }] : [...old, { x, y }]);
  };

  if (!sheet.imageUrl) return <div className="p-8 text-center text-slate-400">لا توجد صورة معاينة لهذه اللوحة. ارفع PDF أو صورة أولاً؛ ملفات DXF تستخدم محرك CAD المباشر.</div>;

  return <div className="flex-1 overflow-y-auto p-5 space-y-5">
    <div className="rounded-xl border border-cyan-700/40 bg-cyan-950/20 p-4">
      <div className="flex items-center gap-2 text-cyan-300 font-bold"><ScanSearch className="w-5 h-5"/> محرك التحليل البصري المحلي</div>
      <p className="text-xs text-slate-300 mt-2 leading-6">يفحص صورة اللوحة ويحدد الخطوط الأفقية والرأسية الطويلة، ثم يتيح معايرة المقياس وقياس الأطوال. لا يستخدم AI ولا يرفع الملفات للإنترنت.</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={runAnalysis} disabled={busy} className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2 text-sm font-bold text-white flex items-center gap-2"><Activity className="w-4 h-4"/>{busy ? "جارٍ فحص الصورة..." : "تحليل الصورة الآن"}</button>
        {result && <button onClick={() => { setResult(null); setPoints([]); }} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-white">إعادة ضبط</button>}
      </div>
      {error && <p className="text-sm text-red-300 mt-3">{error}</p>}
    </div>

    {result && <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="دقة الفحص" value={`${result.width} × ${result.height}`} />
        <Metric label="الخطوط الأفقية" value={String(result.horizontal.length)} />
        <Metric label="الخطوط الرأسية" value={String(result.vertical.length)} />
        <Metric label="نسبة الحبر" value={`${(result.darkPixelRatio * 100).toFixed(1)}%`} />
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)] gap-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center"><span className="text-sm font-bold text-white">معاينة ومعايرة المقياس</span><button onClick={() => setShowLines(!showLines)} className="text-xs text-cyan-300">{showLines ? "إخفاء الخطوط" : "إظهار الخطوط"}</button></div>
          <div className="relative inline-block w-full cursor-crosshair select-none" onClick={recordPoint}>
            <img src={sheet.imageUrl} alt="المخطط الهندسي" className="block w-full rounded-lg border border-slate-700" />
            {showLines && <svg viewBox={`0 0 ${result.width} ${result.height}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
              {result.horizontal.map((l) => <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#22d3ee" strokeWidth="2" opacity=".8"/>)}
              {result.vertical.map((l) => <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#f59e0b" strokeWidth="2" opacity=".8"/>)}
              {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="9" fill="#ef4444" stroke="white" strokeWidth="3"/>)}
              {points.length === 2 && <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#ef4444" strokeWidth="4"/>}
            </svg>}
          </div>
          <p className="text-[11px] text-slate-400">اضغط على نقطتين تمثلان بُعداً معروفاً في المخطط. النقطة الثالثة تبدأ معايرة جديدة.</p>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm"><Crosshair className="w-4 h-4 text-red-400"/> معايرة المقياس</div>
            <label className="block text-xs text-slate-300">المسافة الحقيقية بين النقطتين (متر)</label>
            <input type="number" min="0" step="0.01" value={knownLength} onChange={(e) => setKnownLength(e.target.value)} placeholder="مثال: 5.00" className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-white" />
            {calibration ? <div className="rounded-lg bg-emerald-950/40 p-3 text-emerald-300 text-sm"><CheckCircle2 className="inline w-4 h-4 ml-1"/>معايرة: {calibration.toFixed(6)} متر/بكسل</div> : <p className="text-xs text-amber-300">حدد نقطتين وأدخل المسافة الحقيقية لتفعيل القياس.</p>}
            <div className="border-t border-slate-700 pt-3">
              <label className="block text-xs text-slate-300 mb-1">قياس طول مرسوم (بكسل)</label>
              <input type="number" min="0" value={lengthValue} onChange={(e) => setLengthValue(e.target.value)} placeholder="أدخل طول الخط بالبكسل" className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-white" />
              {calibration && Number(lengthValue) > 0 && <p className="mt-2 text-sm text-cyan-300"><Ruler className="inline w-4 h-4 ml-1"/>{(Number(lengthValue) * calibration).toFixed(3)} متر</p>}
            </div>
          </div>
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200 leading-6"><AlertTriangle className="inline w-4 h-4 ml-1"/>لا تعتمد الخطوط المكتشفة كجدران أو كمرات أو حدود خرسانة تلقائياً؛ يلزم تحديد العنصر ومراجعة القياس ومقياس الرسم من مهندس.</div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <LineList title="أطول الخطوط الأفقية" lines={result.horizontal}/>
        <LineList title="أطول الخطوط الرأسية" lines={result.vertical}/>
      </div>
      <ul className="text-xs text-slate-400 list-disc pr-5 space-y-1">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </>}
  </div>;
};

const Metric = ({ label, value }: { label: string; value: string }) => <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3"><div className="text-[10px] text-slate-400">{label}</div><div className="text-sm font-bold text-white mt-1">{value}</div></div>;
const LineList = ({ title, lines }: { title: string; lines: VisualAnalysisResult["horizontal"] }) => <div className="rounded-xl border border-slate-700 overflow-hidden"><div className="bg-slate-800 px-3 py-2 text-xs font-bold text-white">{title}</div><div className="max-h-44 overflow-y-auto divide-y divide-slate-800">{lines.slice(0, 12).map((l) => <div key={l.id} className="flex justify-between p-2 text-xs"><span className="text-slate-300">{l.id}</span><span className="font-mono text-cyan-300">{Math.round(l.pixelLength)} px</span></div>)}</div></div>;
