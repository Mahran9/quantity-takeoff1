import React, { useEffect, useMemo, useState } from "react";
import { X, Ruler, AlertTriangle, CheckCircle2, ShieldAlert, Plus, ScanLine } from "lucide-react";
import { BlueprintSheet, TakeoffItem, TradeCategory } from "../types";
import { VisualAnalysisPanel } from "./VisualAnalysisPanel";
import { buildPdfItems, denominatorFromKnownLength, GroupAssignment, GroupMode, measureGroup, suggestRole, COMMON_SCALES } from "../utils/pdfPlan";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sheet: BlueprintSheet;
  onAddItems: (items: TakeoffItem[]) => void;
}

const CATEGORIES: TradeCategory[] = [
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

const MODE_LABEL: Record<GroupMode, string> = { skip: "تجاهل", length: "طول (م.ط)", area: "مساحة (م²)", count: "عدد" };
const cell = "px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:border-amber-500";
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function parseSheetScale(s: string | undefined): number | undefined {
  const m = (s || "").match(/1\s*[:/]\s*(\d{1,4})/);
  return m ? parseInt(m[1], 10) : undefined;
}

export const PdfVectorModal: React.FC<Props> = ({ isOpen, onClose, sheet, onAddItems }) => {
  const v = sheet.pdfVector;
  const initialDen = v?.scaleConfidence === "low" && v.textScale ? v.textScale : v?.detectedDenominator || v?.textScale || parseSheetScale(sheet.scale) || 100;
  const [den, setDen] = useState<number>(initialDen);
  const [assign, setAssign] = useState<Record<string, GroupAssignment>>({});
  const [ack, setAck] = useState(false);
  const [calGroup, setCalGroup] = useState<string>("");
  const [calMetres, setCalMetres] = useState<string>("");
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !v) return;
    setDen(initialDen);
    setAck(false);
    const next: Record<string, GroupAssignment> = {};
    v.groups.forEach((g, i) => {
      const s = suggestRole(g, initialDen);
      next[g.id] = {
        groupId: g.id,
        mode: "skip",
        category: s.mode === "count" ? "أعمال خرسانية مسلحة وعادية" : s.mode === "area" ? "أعمال الأرضيات والرخام والبورسلين" : "أعمال المباني والبلوك",
        description: g.label,
        clusterIndex: s.mode === "count" ? 0 : undefined,
      };
      void i;
    });
    setAssign(next);
    setCalGroup(v.groups[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sheet.id]);

  const rows = useMemo(
    () =>
      (v?.groups || []).map((g) => ({
        g,
        hint: suggestRole(g, den),
        m: measureGroup(g, den, v?.userUnit || 1, assign[g.id]?.mode === "count" ? assign[g.id]?.clusterIndex : undefined),
      })),
    [v, den, assign]
  );

  if (!isOpen) return null;

  if (!v) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 print:hidden">
        <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90dvh] overflow-y-auto p-6 text-right space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-700 font-bold">
              <ScanLine className="w-5 h-5" /> لا توجد خطوط متجهة في هذه اللوحة
            </div>
            <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            اللوحة صورة ممسوحة ضوئياً (أو أُضيفت قبل هذا الإصدار؛ أعد رفعها لاستخراج الخطوط الحقيقية). استخدم القارئ البصري أدناه لاكتشاف الخطوط الطويلة ومعايرة المقياس بقياس بُعد معروف. نتائجه تقريبية وتحتاج مراجعتك.
          </p>
          <VisualAnalysisPanel sheet={sheet} />
        </div>
      </div>
    );
  }

  const lowConf = v.scaleConfidence === "low" || den !== (v.detectedDenominator ?? v.textScale ?? den);
  const chosen = Object.values(assign).filter((a) => a.mode !== "skip");
  const set = (id: string, patch: Partial<GroupAssignment>) => setAssign((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const items = buildPdfItems({
    groups: v.groups,
    assignments: chosen,
    denominator: den,
    userUnit: v.userUnit,
    sheetId: sheet.id,
    sheetCode: sheet.code,
    pageNumber: sheet.pdfPageNumber || 1,
  });
  const canImport = items.length > 0 && (!lowConf || ack);

  const applyCalibration = () => {
    const g = v.groups.find((x) => x.id === calGroup);
    const metres = parseFloat(calMetres.replace(",", "."));
    if (!g || !(metres > 0)) return;
    const d = denominatorFromKnownLength(g.maxPathPt * (v.userUnit || 1), metres);
    if (Number.isFinite(d)) setDen(Math.round(d * 10) / 10);
  };

  const TONES = {
    high: { box: "bg-emerald-50 border-emerald-200", icon: "text-emerald-600" },
    medium: { box: "bg-amber-50 border-amber-200", icon: "text-amber-600" },
    low: { box: "bg-rose-50 border-rose-200", icon: "text-rose-600" },
  } as const;
  const tone = TONES[v.scaleConfidence];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 qto-fade-in print:hidden">
      <div className="qto-pop-in bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92dvh] flex flex-col overflow-hidden text-right">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">حصر الكميات من رسم PDF المتجه</h2>
            <p className="text-xs text-slate-400">
              {sheet.code} — {sheet.title} · يُقرأ الرسم الأصلي (خطوط ومساحات) وليس الصورة، والكميات مساعدة تتطلب مراجعتك
            </p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-xl hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <section className={`rounded-2xl border p-4 ${tone.box}`}>
            <div className="flex flex-wrap items-center gap-3">
              {v.scaleConfidence === "high" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className={`w-5 h-5 ${tone.icon}`} />}
              <p className="text-xs font-semibold flex-1 min-w-[220px]">{v.scaleMessage}</p>
              <label className="text-xs font-bold flex items-center gap-2">
                المقياس 1:
                <input
                  type="number" min={1} max={5000} value={den} dir="ltr"
                  onChange={(e) => setDen(Math.max(1, Number(e.target.value) || 1))}
                  className={`${cell} w-24`}
                  list="qto-scales"
                />
                <datalist id="qto-scales">{COMMON_SCALES.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Ruler className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600">معايرة يدوية: أطول عنصر في</span>
              <select className={cell} value={calGroup} onChange={(e) => setCalGroup(e.target.value)}>
                {v.groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              <span className="text-slate-600">طوله الحقيقي</span>
              <input className={`${cell} w-20`} dir="ltr" placeholder="م" value={calMetres} onChange={(e) => setCalMetres(e.target.value)} />
              <button onClick={applyCalibration} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold">تطبيق</button>
            </div>
          </section>

          {v.groups.some((g) => g.preview?.length) && (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
              <div className="text-[11px] text-slate-500 px-2 pb-1">
                معاينة ما قُرئ من الرسم — مرّر الفأرة/المس صفاً في الجدول لإبرازه (الأزرق = مضاف للحصر)
              </div>
              <svg viewBox={`0 0 1 ${(v.pageHeightPt / v.pageWidthPt).toFixed(4)}`} className="w-full max-h-72 bg-white rounded-xl border border-slate-200" preserveAspectRatio="xMidYMid meet">
                {v.groups.map((g) => {
                  const on = assign[g.id]?.mode && assign[g.id].mode !== "skip";
                  const hot = focus === g.id;
                  const d = g.preview || [];
                  let path = "";
                  for (let i = 0; i + 3 < d.length; i += 4) path += `M${d[i]} ${d[i + 1]}L${d[i + 2]} ${d[i + 3]}`;
                  return (
                    <path key={g.id} d={path} fill="none" strokeLinecap="round"
                      stroke={hot ? "#f59e0b" : on ? "#2563eb" : "#cbd5e1"}
                      strokeWidth={hot ? 0.004 : 0.0017} opacity={hot || on ? 1 : 0.8} />
                  );
                })}
              </svg>
            </section>
          )}

          {v.warnings.length > 0 && (
            <ul className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1 list-disc pr-6">
              {v.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          {v.groups.length === 0 ? (
            <div className="text-sm text-slate-600 p-6 text-center">لا توجد خطوط متجهة في هذه الصفحة.</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2 text-right">المجموعة (لون/سُمك/طبقة)</th>
                    <th className="p-2">عناصر</th>
                    <th className="p-2">الطول م</th>
                    <th className="p-2">المساحة م²</th>
                    <th className="p-2">مغلقة</th>
                    <th className="p-2">النوع</th>
                    <th className="p-2">التصنيف</th>
                    <th className="p-2">الوصف</th>
                    <th className="p-2">ارتفاع م</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ g, hint, m }) => {
                    const a = assign[g.id];
                    if (!a) return null;
                    return (
                      <tr key={g.id} onMouseEnter={() => setFocus(g.id)} onMouseLeave={() => setFocus(null)} onClick={() => setFocus(g.id)} className={`border-t border-slate-100 ${a.mode !== "skip" ? "bg-amber-50/50" : ""}`}>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0" style={{ background: `#${g.color}` }} />
                            <div>
                              <div className="font-semibold">{g.label}</div>
                              <div className="text-[10px] text-slate-400">{hint.hint}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-2 text-center">{g.pathCount}</td>
                        <td className="p-2 text-center">{fmt(m.lengthM)}</td>
                        <td className="p-2 text-center">{fmt(m.areaM2)}</td>
                        <td className="p-2 text-center">{g.closedCount}</td>
                        <td className="p-2">
                          <select className={cell} value={a.mode} onChange={(e) => set(g.id, { mode: e.target.value as GroupMode })}>
                            {(Object.keys(MODE_LABEL) as GroupMode[]).map((k) => <option key={k} value={k}>{MODE_LABEL[k]}</option>)}
                          </select>
                          {a.mode === "count" && g.sizeClusters.length > 0 && (
                            <select className={`${cell} mt-1 block`} value={a.clusterIndex ?? -1} onChange={(e) => set(g.id, { clusterIndex: Number(e.target.value) < 0 ? undefined : Number(e.target.value) })}>
                              <option value={-1}>كل الأشكال المغلقة ({g.closedCount})</option>
                              {g.sizeClusters.map((c, i) => (
                                <option key={i} value={i}>{c.count} × {fmt(c.wPt * 25.4 / 72 * den / 1000)}×{fmt(c.hPt * 25.4 / 72 * den / 1000)} م</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="p-2">
                          <select className={`${cell} max-w-[11rem]`} value={a.category} onChange={(e) => set(g.id, { category: e.target.value })} disabled={a.mode === "skip"}>
                            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="p-2"><input className={`${cell} w-44`} value={a.description} onChange={(e) => set(g.id, { description: e.target.value })} disabled={a.mode === "skip"} /></td>
                        <td className="p-2">
                          <input className={`${cell} w-16`} dir="ltr" type="number" min={0} step="0.1" placeholder="—" disabled={a.mode !== "length"} value={a.height ?? ""} onChange={(e) => set(g.id, { height: e.target.value ? Number(e.target.value) : undefined })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center gap-3 justify-between">
          <div className="text-xs text-slate-600 space-y-1">
            <div className="font-bold">{items.length} بند جاهز للإضافة · المقياس 1:{den}</div>
            {lowConf && (
              <label className="flex items-center gap-2 text-rose-700 font-semibold cursor-pointer">
                <ShieldAlert className="w-4 h-4" />
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                راجعت المقياس وأتحمل مسؤولية الأرقام
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-200">إلغاء</button>
            <button
              disabled={!canImport}
              onClick={() => { onAddItems(items); onClose(); }}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-sm font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> إضافة للجدول
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
