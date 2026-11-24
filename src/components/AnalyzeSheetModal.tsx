import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Sparkles, CheckCircle2, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { Candidate, SOURCE_LABEL, candidatesToTakeoff } from "../engine/candidate";
import { reconcile, rank } from "../engine/reconcile";
import { fromAi, fromOcr, readCad, readPdf, CadAssumptions } from "../engine/readers";
import { readPrintedLabels } from "../utils/ocrLabels";
import { buildPrompt, loadAiKey, prepareImages, runAiTakeoff } from "../utils/aiTakeoff";
import { importWithRecovery } from "../utils/lazyImport";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sheet: BlueprintSheet;
  existingItemsCount: number;
  previousCadCount: number;
  onAddItems: (items: TakeoffItem[], opts?: { replaceSheetId?: string }) => void;
  onOpenAdvanced: () => void;
  onOpenAi: () => void;
}

const GROUPS: { key: "high" | "medium" | "low"; title: string; hint: string; tone: string }[] = [
  { key: "high", title: "مؤكدة", hint: "أكّدها أكثر من مصدر", tone: "border-emerald-300 bg-emerald-50" },
  { key: "medium", title: "للمراجعة", hint: "مصدر واحد موثوق", tone: "border-slate-200 bg-white" },
  { key: "low", title: "تحتاج تحقق", hint: "رقم ناقص أو مشكوك فيه", tone: "border-rose-200 bg-rose-50/60" },
];

export const AnalyzeSheetModal: React.FC<Props> = ({ isOpen, onClose, sheet, existingItemsCount, previousCadCount, onAddItems, onOpenAdvanced, onOpenAi }) => {
  const [cands, setCands] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [replacePrev, setReplacePrev] = useState(true);
  const [hasAiKey] = useState(Boolean(loadAiKey()));
  const [assume, setAssume] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("qto-assume") || "{}"); } catch { return {}; }
  });
  const num = (k: string) => { const n = parseFloat(String(assume[k] ?? "").replace(",", ".")); return n > 0 ? n : 0; };
  const assumptions = (): CadAssumptions => ({ wallHeight: num("wall"), footingDepth: num("foot"), slabThickness: num("slab"), floorSlabThickness: num("sog") });
  const raw = useRef<{ cad: Candidate[]; ocr: Candidate[]; ai: Candidate[] }>({ cad: [], ocr: [], ai: [] });
  const started = useRef(false);

  const apply = () => {
    const all = reconcile([...raw.current.cad, ...raw.current.ocr, ...raw.current.ai]).sort((a, b) => rank(a) - rank(b));
    setCands(all);
    setPicked((prev) => {
      const next: Record<string, boolean> = {};
      for (const c of all) next[c.id] = c.id in prev ? prev[c.id] : c.selected;
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen) { started.current = false; raw.current = { cad: [], ocr: [], ai: [] }; setCands([]); setError(""); return; }
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        if (sheet.dxfData) { raw.current.cad = readCad(sheet, assumptions()); apply(); }
        else if (sheet.pdfVector) { raw.current.cad = readPdf(sheet); apply(); }
        if (sheet.imageUrl) {
          setBusy("قراءة الأرقام المدوّنة على اللوحة…");
          const r = await readPrintedLabels(sheet.imageUrl, () => importWithRecovery(() => import("tesseract.js")), (m, p) => { setBusy(m); setPct(p); });
          raw.current.ocr = fromOcr(r.quantities);
          apply();
        }
      } catch (e: any) {
        setError(e?.message || "تعذرت قراءة بعض المصادر.");
      } finally { setBusy(""); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const setA = (k: string, v: string) => {
    const next = { ...assume, [k]: v };
    setAssume(next);
    try { localStorage.setItem("qto-assume", JSON.stringify(next)); } catch { /* ignore */ }
  };
  // Re-read the CAD geometry whenever an assumption changes (volumes / wall areas appear).
  useEffect(() => {
    if (!isOpen || !sheet.dxfData || !started.current) return;
    raw.current.cad = readCad(sheet, assumptions());
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assume]);

  const runAi = async () => {
    setError("");
    setBusy("قراءة اللوحة بـ Claude…"); setPct(50);
    try {
      const images = await prepareImages(sheet.imageUrl!);
      const r = await runAiTakeoff({ apiKey: loadAiKey(), images, prompt: buildPrompt({ title: `${sheet.code} — ${sheet.title}`, scale: sheet.scale }) });
      raw.current.ai = fromAi(r.items);
      apply();
    } catch (e: any) { setError(e?.message || "فشلت قراءة Claude."); }
    finally { setBusy(""); }
  };

  const n = useMemo(() => Object.values(picked).filter(Boolean).length, [picked]);
  if (!isOpen) return null;

  const insert = () => {
    const chosen = cands.filter((c) => picked[c.id]);
    if (!chosen.length) return;
    const replace = replacePrev && previousCadCount > 0 && chosen.some((c) => c.sources.includes("cad") || c.sources.includes("pdf"));
    onAddItems(candidatesToTakeoff(chosen, sheet, existingItemsCount), replace ? { replaceSheetId: sheet.id } : undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 print:hidden" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-3xl h-[92vh] sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div>
            <div className="font-bold">تحليل اللوحة</div>
            <div className="text-[11px] text-slate-300">{sheet.code} — {sheet.title}</div>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {busy && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
              <div className="flex items-center gap-2 font-bold"><Loader2 className="w-4 h-4 animate-spin" /> {busy}</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} /></div>
            </div>
          )}
          {error && <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">{error}</p>}

          {sheet.dxfData && (
            <details open className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-bold text-slate-800">أرقام لا يحتويها الرسم (بالمتر) — اتركها فارغة إن لم تعرفها</summary>
              <p className="mt-1 text-[11px] text-slate-500 leading-5">لا أخمّن هذه الأرقام. أدخل ما تعرفه من المواصفات فتظهر الأحجام ومساحات الجدران فوراً.</p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([["wall", "ارتفاع الجدار"], ["foot", "عمق القواعد"], ["slab", "سمك بلاطة السقف"], ["sog", "سمك الأرضية"]] as const).map(([k, label]) => (
                  <label key={k} className="text-[11px] font-semibold text-slate-600">
                    {label}
                    <input inputMode="decimal" value={assume[k] ?? ""} onChange={(e) => setA(k, e.target.value)} placeholder="مثال 0.60"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center font-mono text-sm focus:border-amber-500 focus:outline-none" />
                  </label>
                ))}
              </div>
            </details>
          )}

          {!busy && cands.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600 leading-7">
              لم أجد كميات جاهزة في هذه اللوحة بالقراءة التلقائية. ملفات PDF المسطّحة تحتاج قياساً بالمقياس: افتح «قياس وأدوات متقدمة» لتعاير المقياس وتقيس الخطوط.
            </div>
          )}

          {GROUPS.map((g) => {
            const rows = cands.filter((c) => c.confidence === g.key);
            if (!rows.length) return null;
            return (
              <section key={g.key}>
                <div className="flex items-baseline gap-2 mb-2">
                  {g.key === "high" ? <CheckCircle2 className="w-4 h-4 text-emerald-600 self-center" /> : g.key === "low" ? <AlertTriangle className="w-4 h-4 text-rose-600 self-center" /> : null}
                  <h3 className="font-extrabold text-slate-900">{g.title} ({rows.length})</h3>
                  <span className="text-[11px] text-slate-500">{g.hint}</span>
                </div>
                <div className="space-y-2">
                  {rows.map((c) => (
                    <label key={c.id} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${g.tone} ${picked[c.id] ? "ring-2 ring-amber-400" : ""}`}>
                      <input type="checkbox" className="mt-1.5 w-4 h-4" checked={Boolean(picked[c.id])} onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked }))} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900 leading-snug">{c.description}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.sources.map((s) => <span key={s} className="rounded-md bg-slate-900/90 text-white text-[10px] font-bold px-1.5 py-0.5">{SOURCE_LABEL[s]}</span>)}
                          <span className="text-[10px] text-slate-500 self-center">{c.category}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-600 leading-relaxed break-words">{c.evidence}</div>
                        {c.checks.map((t, i) => <div key={i} className="mt-0.5 text-[11px] font-bold text-slate-800">• {t}</div>)}
                      </div>
                      <div className="text-left shrink-0">
                        <div className="font-mono font-extrabold text-lg leading-none text-slate-900">{c.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                        <div className="text-[11px] text-slate-600 mt-1">{c.unit}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="border-t border-slate-200 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {sheet.imageUrl && !cands.some((c) => c.sources.includes("ai")) && (
              <button disabled={!!busy} onClick={hasAiKey ? runAi : () => { onClose(); onOpenAi(); }} className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-800 disabled:opacity-50">
                <Sparkles className="w-4 h-4" /> أضف قراءة Claude
              </button>
            )}
            <button onClick={() => { onClose(); onOpenAdvanced(); }} className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-800">
              <SlidersHorizontal className="w-4 h-4" /> قياس وأدوات متقدمة
            </button>
            {previousCadCount > 0 && (
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-auto cursor-pointer">
                <input type="checkbox" checked={replacePrev} onChange={(e) => setReplacePrev(e.target.checked)} /> حذف بنود الحصر السابقة ({previousCadCount})
              </label>
            )}
          </div>
          <button onClick={insert} disabled={n === 0 || !!busy} className="qto-cta w-full rounded-xl py-3 text-sm disabled:opacity-50">
            إدراج ({n}) بنود في الجدول
          </button>
        </div>
      </div>
    </div>
  );
};
