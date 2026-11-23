import React, { useRef, useState } from "react";
import { X, Sparkles, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { AiItem, aiItemsToTakeoff, buildPrompt, loadAiKey, prepareImages, runAiTakeoff, saveAiKey } from "../utils/aiTakeoff";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sheet: BlueprintSheet;
  existingItemsCount: number;
  onAddItems: (items: TakeoffItem[]) => void;
}

const CONF = { high: ["عالية", "bg-emerald-50 text-emerald-700 border-emerald-200"], medium: ["متوسطة", "bg-amber-50 text-amber-800 border-amber-200"], low: ["منخفضة", "bg-rose-50 text-rose-700 border-rose-200"] } as const;

export const AiTakeoffModal: React.FC<Props> = ({ isOpen, onClose, sheet, existingItemsCount, onAddItems }) => {
  const [key, setKey] = useState(loadAiKey());
  const [remember, setRemember] = useState(Boolean(loadAiKey()));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<AiItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const abort = useRef<AbortController | null>(null);
  if (!isOpen) return null;

  const run = async () => {
    setError(""); setItems([]); setWarnings([]);
    if (!sheet.imageUrl) { setError("لا توجد صورة لهذه اللوحة. هذه الميزة تعمل مع PDF والصور."); return; }
    if (!key.trim()) { setError("أدخل مفتاح API أولاً."); return; }
    setBusy(true);
    abort.current = new AbortController();
    try {
      saveAiKey(remember ? key : "");
      const images = await prepareImages(sheet.imageUrl);
      const r = await runAiTakeoff({ apiKey: key.trim(), images, prompt: buildPrompt({ title: `${sheet.code} — ${sheet.title}`, scale: sheet.scale, notes }), signal: abort.current.signal });
      setItems(r.items); setWarnings(r.warnings);
      setPicked(Object.fromEntries(r.items.map((_, i) => [i, r.items[i].confidence !== "low" && r.items[i].quantity > 0])));
      if (r.items.length === 0) setError("لم يجد النموذج بنوداً قابلة للحساب في هذه اللوحة.");
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || "حدث خطأ غير متوقع.");
    } finally { setBusy(false); }
  };

  const insert = () => {
    const chosen = items.filter((_, i) => picked[i]);
    if (!chosen.length) return;
    onAddItems(aiItemsToTakeoff(chosen, sheet, existingItemsCount));
    onClose();
  };
  const n = Object.values(picked).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 print:hidden" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-3xl max-h-[94vh] sm:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2 font-bold"><Sparkles className="w-5 h-5 text-amber-300" /> قراءة اللوحة بالذكاء الاصطناعي</div>
          <button onClick={onClose} aria-label="إغلاق" className="p-2 rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>ميزة اختيارية: عند الضغط على «اقرأ اللوحة» تُرسل صورة هذه اللوحة إلى خدمة Claude باستخدام مفتاحك أنت (تكلفة الاستخدام على حسابك). بدون الضغط لا يُرسل شيء. كل بند يأتي مع الأساس الذي اعتمد عليه ويحتاج مراجعتك.</span>
          </div>

          <label className="block text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5 mb-1"><KeyRound className="w-4 h-4" /> مفتاح Anthropic API</span>
            <input type="password" dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono" />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> احفظ المفتاح على هذا الجهاز فقط</label>

          <label className="block text-xs font-bold text-slate-700">ملاحظات تساعد القراءة (اختياري)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="مثال: المقياس الفعلي 1:250، احسب الجدران والأبواب والمساحات المدوّنة فقط" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" />
          </label>

          <button onClick={run} disabled={busy} className="qto-cta w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-60">
            {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> جارٍ قراءة اللوحة… (قد تستغرق دقيقة)</> : <><Sparkles className="w-5 h-5" /> اقرأ اللوحة</>}
          </button>
          {busy && <button onClick={() => abort.current?.abort()} className="w-full text-xs text-slate-500 underline">إلغاء</button>}
          {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}
          {warnings.length > 0 && <ul className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 list-disc pr-6 space-y-1">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((it, i) => (
                <label key={i} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${picked[i] ? "border-teal-400 bg-teal-50/40" : "border-slate-200"}`}>
                  <input type="checkbox" className="mt-1" checked={Boolean(picked[i])} onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900">{it.description}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{it.category}</div>
                    <div className="mt-1 text-[11px] text-slate-600 leading-relaxed"><b>الأساس:</b> {it.basis || "—"}</div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="font-mono font-bold text-base text-slate-900">{it.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                    <div className="text-[11px] text-slate-600">{it.unit}</div>
                    <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${CONF[it.confidence][1]}`}>{CONF[it.confidence][0]}</span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-3 border-t border-slate-200 flex gap-2">
            <button onClick={onClose} className="px-4 py-3 rounded-xl bg-slate-100 text-sm font-bold text-slate-700">إلغاء</button>
            <button onClick={insert} disabled={n === 0} className="qto-cta flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50">إدراج ({n}) بنود في الجدول</button>
          </div>
        )}
      </div>
    </div>
  );
};
