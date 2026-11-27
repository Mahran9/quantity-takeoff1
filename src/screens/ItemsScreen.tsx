import React from "react";
import { FileSpreadsheet, Loader2, ScanLine, Undo2 } from "lucide-react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { ScreenHeader } from "../components/Nav";
import { CladdingCard } from "../components/CladdingCard";

interface Props {
  sheets: BlueprintSheet[];
  items: TakeoffItem[];
  /** "" = all sheets in one table. */
  activeSheetId: string;
  /** "" selects all sheets. */
  onSelectSheet: (id: string) => void;
  onAnalyze: () => void;
  onAddItems?: (items: TakeoffItem[]) => void;
  onAuto: () => Promise<string>;
  onGoSheets: () => void;
  /** Result of the automatic read right after an upload. */
  readMsg?: string;
  /** Download the quantities as an Excel workbook. */
  onExcel?: () => void;
  /** Undo the last change (absent when there is nothing to undo). */
  onUndo?: () => void;
  /** Storey height / slab thickness (m) for CAD files; absent when the project has none. */
  structural?: { storeyHeight?: number; slabThickness?: number };
  /** Save the values and read the drawings again with them. */
  onStructural?: (v: { storeyHeight?: number; slabThickness?: number }) => Promise<string>;
  children: React.ReactNode; // the table for the active sheet
}

/** Two numbers a structural DWG never states (column height, slab thickness), one row under the header. */
const StructuralRow: React.FC<{
  value: { storeyHeight?: number; slabThickness?: number };
  busy: boolean;
  onApply: (v: { storeyHeight?: number; slabThickness?: number }) => void;
}> = ({ value, busy, onApply }) => {
  const [h, setH] = React.useState(value.storeyHeight ? String(value.storeyHeight) : "");
  const [t, setT] = React.useState(value.slabThickness ? String(Math.round(value.slabThickness * 100)) : "");
  const num = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : undefined; };
  const cm = num(t);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onApply({ storeyHeight: num(h), slabThickness: cm ? cm / 100 : undefined }); }}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
    >
      <label className="flex flex-col gap-1 text-[12px] font-bold text-slate-600">
        ارتفاع الدور (م)
        <input value={h} onChange={(e) => setH(e.target.value)} inputMode="decimal" placeholder="3.40"
          className="h-9 w-24 rounded-lg border border-slate-300 bg-white px-2 text-sm font-mono text-slate-900" />
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-bold text-slate-600">
        سمك البلاطة (سم)
        <input value={t} onChange={(e) => setT(e.target.value)} inputMode="decimal" placeholder="—"
          className="h-9 w-24 rounded-lg border border-slate-300 bg-white px-2 text-sm font-mono text-slate-900" />
      </label>
      <button type="submit" disabled={busy} className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800 disabled:opacity-50">
        أعد الحساب
      </button>
      <p className="basis-full text-[12px] leading-5 text-slate-500">
        للأعمدة والبلاطات من ملف DWG: الارتفاع × مقاطع الأعمدة، والسمك × مساحة البلاطة.
      </p>
    </form>
  );
};

/** Quantities: pick a drawing, review its lines. */
export const ItemsScreen: React.FC<Props> = ({ sheets, items, activeSheetId, onSelectSheet, onAnalyze, onAddItems, onAuto, onGoSheets, readMsg, onExcel, onUndo, structural, onStructural, children }) => {
  const live = items.filter((i) => i.reviewStatus !== "rejected").length;
  const picked = items.filter((i) => i.reviewStatus === "approved" || i.isVerified).length;
  const [msg, setMsg] = React.useState(readMsg || "");
  React.useEffect(() => { if (readMsg) setMsg(readMsg); }, [readMsg]);
  const [reading, setReading] = React.useState(false);
  const runAuto = async () => {
    setReading(true);
    setMsg("جارٍ قراءة المخطط…");
    try { setMsg(await onAuto()); }
    catch { setMsg("تعذرت قراءة المخطط. افتح تحليل اللوحة لمراجعتها."); }
    finally { setReading(false); }
  };
  if (sheets.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <ScreenHeader title="الكميات" />
        <section className="card px-6 py-10 text-center">
          <p className="text-sm text-slate-500 leading-7">لا توجد لوحات بعد. أضف مخططاً أولاً ثم تظهر كمياته هنا.</p>
          <button onClick={onGoSheets} className="qto-cta mt-5 rounded-xl px-7 py-3 text-sm">إلى اللوحات</button>
        </section>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader
        title="الكميات"
        sub={`${items.filter((i) => i.reviewStatus !== "rejected").length} بند في المشروع`}
        action={
          <div className="flex gap-2">
            <button onClick={runAuto} disabled={reading} className="qto-cta flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm disabled:opacity-65">
              {reading ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <ScanLine className="w-[18px] h-[18px]" />}
              {reading ? "جارٍ القراءة…" : "اقرأ واحصر"}
            </button>
            <button onClick={onAnalyze} className="flex h-10 items-center rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-800">
              راجع
            </button>
            <button
              onClick={onUndo}
              disabled={!onUndo}
              title="تراجع عن آخر تعديل (Ctrl+Z)"
              className="flex h-10 items-center gap-1 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-800 disabled:opacity-40"
            >
              <Undo2 className="w-4 h-4" />
              تراجع
            </button>
          </div>
        }
      />
      {structural && onStructural && (
        <StructuralRow
          value={structural}
          busy={reading}
          onApply={async (v) => {
            setReading(true);
            setMsg("جارٍ إعادة الحساب…");
            try { setMsg(await onStructural(v)); }
            catch { setMsg("تعذرت إعادة الحساب."); }
            finally { setReading(false); }
          }}
        />
      )}
      {msg && <p className="rounded-lg bg-teal-50 px-3 py-2 text-[13px] font-bold leading-6 text-teal-900">{msg}</p>}
      {/* The next step after a read: take the table out as Excel (all sheets, quotation + detailed sheet). */}
      {onExcel && live > 0 && !reading && (
        <button
          onClick={onExcel}
          disabled={picked === 0}
          className="qto-cta sticky bottom-24 z-30 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] shadow-lg disabled:opacity-60"
        >
          <FileSpreadsheet className="w-5 h-5" />
          {picked > 0 ? `تصدير المحدد إلى Excel (${picked} من ${live})` : "حدد البنود بعلامة ✓ ثم صدّر Excel"}
        </button>
      )}
      {onAddItems && <CladdingCard onAdd={onAddItems} />}
      {sheets.length > 1 && (() => {
        // One table for the whole project by default. A many-page PDF used to show a strip of 16 page buttons here;
        // picking a single sheet is now one dropdown, sheets with lines first.
        const count = (id: string) => items.filter((i) => i.sheetId === id).length;
        const ordered = [...sheets].sort((a, b) => Number(count(b.id) > 0) - Number(count(a.id) > 0));
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectSheet("")}
              className={`shrink-0 flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold border ${
                !activeSheetId ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              كل اللوحات
              <span className={`font-mono text-[11px] ${!activeSheetId ? "text-teal-300" : "text-slate-400"}`}>{items.length}</span>
            </button>
            <select
              value={activeSheetId}
              onChange={(e) => onSelectSheet(e.target.value)}
              aria-label="عرض لوحة واحدة"
              className={`min-w-0 flex-1 sm:flex-none sm:w-64 rounded-full border px-3.5 py-2 text-[13px] font-bold ${
                activeSheetId ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              <option value="">عرض لوحة واحدة… ({sheets.length})</option>
              {ordered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.title} — {count(s.id)} بند
                </option>
              ))}
            </select>
          </div>
        );
      })()}
      {children}
    </div>
  );
};
