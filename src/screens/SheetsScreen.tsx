import React from "react";
import { Plus, FileText, Ruler, Image as ImageIcon, Trash2, ChevronLeft } from "lucide-react";
import { BlueprintSheet, TakeoffItem } from "../types";
import { ScreenHeader } from "../components/Nav";
import { buildMarksTable } from "../engine/marks";

interface Props {
  sheets: BlueprintSheet[];
  items: TakeoffItem[];
  currencySymbol: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onUpload: () => void;
  onProjects: () => void;
}

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const KIND: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  pdf: { label: "PDF", Icon: FileText },
  dxf: { label: "CAD", Icon: Ruler },
  image: { label: "صورة", Icon: ImageIcon },
};

export const SheetsScreen: React.FC<Props> = ({ sheets, items, currencySymbol, onOpen, onDelete, onUpload, onProjects }) => {
  const marks = React.useMemo(() => buildMarksTable(sheets), [sheets]);
  const [showMarks, setShowMarks] = React.useState(false);
  const dups = marks.rows.filter((r) => r.warning).length;
  if (sheets.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <ScreenHeader title="اللوحات" />
        <section className="card px-6 py-10 text-center flex flex-col items-center">
          <svg className="w-48 mb-6 overflow-visible" viewBox="0 0 320 150" fill="none" aria-hidden="true">
            <path className="qto-draw" pathLength={1} d="M30 20H290V100H190M150 100H30V20" stroke="#0f2229" strokeWidth="3" strokeLinejoin="round" />
            <path className="qto-draw d2" pathLength={1} d="M70 20V100M230 20V100" stroke="#8da0a5" strokeWidth="1.5" />
            <g className="qto-draw d2" stroke="#0b8a7e" strokeWidth="1.5">
              <path pathLength={1} d="M30 128H290" />
              <path d="M30 120V136M290 120V136" />
            </g>
          </svg>
          <h2 className="text-xl font-extrabold text-slate-900">ابدأ بإضافة المخطط</h2>
          <p className="mt-2 text-sm leading-7 text-slate-500 max-w-xs">PDF أو DXF أو DWG أو صورة، أو نموذج ETABS / SAFE. القراءة تتم على جهازك ولا يُرفع شيء إلى أي خادم.</p>
          <button onClick={onUpload} className="qto-cta mt-6 flex items-center gap-2 rounded-xl px-8 py-3.5 text-base">
            <Plus className="w-5 h-5" /> إضافة مخطط
          </button>
          <button onClick={onProjects} className="mt-4 text-sm font-bold text-slate-600">أو افتح مشروعاً محفوظاً</button>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader
        title="اللوحات"
        sub={`${sheets.length} لوحة`}
        action={
          <button onClick={onUpload} className="qto-cta flex h-11 items-center gap-1.5 rounded-xl px-4 text-[14px]">
            <Plus className="w-[18px] h-[18px]" /> إضافة مخطط
          </button>
        }
      />
      <div className="grid gap-3 md:grid-cols-2 qto-stagger">
        {sheets.map((s) => {
          const mine = items.filter((i) => i.sheetId === s.id && i.reviewStatus !== "rejected");
          const value = mine.reduce((a, i) => a + (i.totalPrice || 0), 0);
          const k = KIND[s.fileType] || KIND.image;
          return (
            <div key={s.id} className="card flex items-stretch overflow-hidden">
              <button onClick={() => onOpen(s.id)} className="flex-1 min-w-0 flex items-center gap-3.5 p-4 text-right">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-100 text-teal-800 shrink-0">
                  <k.Icon className="w-6 h-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-bold text-teal-800 bg-teal-50 rounded-md px-1.5 py-0.5 shrink-0 whitespace-nowrap">{s.code}</span>
                    <span className="truncate text-[15px] font-extrabold text-slate-900">{s.title}</span>
                  </span>
                  <span className="mt-1 block text-[12.5px] text-slate-500 font-semibold">
                    {mine.length ? (
                      <>
                        {mine.length} بند{value > 0 && <> · <b className="font-mono text-slate-700">{money(value)}</b> {currencySymbol}</>}
                      </>
                    ) : (
                      "لم تُحصر كميات بعد"
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">{k.label} · مقياس {s.scale || "—"}{s.pdfTotalPages && s.pdfTotalPages > 1 ? ` · صفحة ${s.pdfPageNumber || 1}/${s.pdfTotalPages}` : ""}</span>
                </span>
                <ChevronLeft className="w-5 h-5 text-slate-300 shrink-0" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`حذف اللوحة (${s.code} - ${s.title}) وبنودها؟`)) onDelete(s.id);
                }}
                aria-label="حذف اللوحة"
                className="px-3.5 border-s border-slate-100 text-slate-300 hover:text-rose-600"
              >
                <Trash2 className="w-[18px] h-[18px]" />
              </button>
            </div>
          );
        })}
      </div>
      <button onClick={onUpload} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-teal-600 text-[15px] font-extrabold text-teal-800">
        <Plus className="w-5 h-5" /> إضافة مخطط آخر
      </button>
      {marks.rows.length > 0 && (
        <section className="card p-4">
          <button onClick={() => setShowMarks((v) => !v)} className="flex w-full items-center justify-between text-right">
            <span className="text-[15px] font-extrabold text-slate-900">جدول العلامات الموحّد <span className="font-mono text-[12px] text-slate-500">({marks.rows.length})</span></span>
            <span className="text-[12.5px] font-bold text-teal-800">{showMarks ? "إخفاء" : "عرض"}</span>
          </button>
          {dups > 0 && <p className="mt-1 text-[12.5px] font-semibold leading-6 text-amber-800">{dups} علامة مكررة بين لوحات: غالباً نفس العناصر من منظر آخر، لا تجمعها.</p>}
          {showMarks && (
            <div className="mt-3 max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-slate-100 text-slate-700">
                  <tr><th className="p-2 text-right">العلامة</th>{marks.codes.map((c) => <th key={c} className="p-2 font-mono">{c}</th>)}<th className="p-2">الأرجح</th></tr>
                </thead>
                <tbody>
                  {marks.rows.map((r) => (
                    <tr key={r.kind + r.label} className={"border-t border-slate-100 " + (r.warning ? "bg-amber-50" : "")} title={r.warning}>
                      <td className="p-2 text-right font-bold">{r.label} <span className="text-[10.5px] font-semibold text-slate-400">{r.kind}</span></td>
                      {marks.codes.map((c) => <td key={c} className="p-2 text-center font-mono">{r.perSheet[c] ?? ""}</td>)}
                      <td className="p-2 text-center font-mono font-extrabold">{r.best}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
