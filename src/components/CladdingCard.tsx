import React from "react";
import { TakeoffItem } from "../types";
import { claddingAreas, r2 } from "../utils/cladding";

interface Props { onAdd: (items: TakeoffItem[]) => void }

const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

export const CladdingCard: React.FC<Props> = ({ onAdd }) => {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ L: "69.78", W: "29.8", eave: "7.5", ridge: "9", openings: "0", wallPct: "0" });
  const [done, setDone] = React.useState("");
  const a = claddingAreas(num(v.L), num(v.W), num(v.eave), num(v.ridge), num(v.openings), num(v.wallPct));
  const field = (k: keyof typeof v, label: string) => (
    <label className="flex flex-col gap-1 text-[12.5px] font-bold text-slate-700">
      {label}
      <input inputMode="decimal" value={v[k]} onChange={(e) => { setV({ ...v, [k]: e.target.value }); setDone(""); }}
        className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-center font-mono text-[15px] text-slate-900" />
    </label>
  );
  const make = (kind: "roof" | "walls"): TakeoffItem => {
    const q = kind === "roof" ? a.roof : a.walls;
    const desc = kind === "roof"
      ? `تكسية سقف (شنكو) — ${v.L}×${v.W} م، ميل الجملون ${a.slopeLen} م`
      : `تكسية جدران (شنكو) — محيط ${v.L}×${v.W} م وارتفاع ${v.eave} م وقمة ${v.ridge} م${num(v.wallPct) < 100 ? ` (${v.wallPct}٪ مكسو)` : ""}`;
    return {
      id: `clad-${kind}-${Date.now()}`, sheetId: "", itemCode: kind === "roof" ? "CLD-R" : "CLD-W", description: desc,
      category: "أعمال الهياكل المعدنية والهناجر", dimensionType: "area", location: "المبنى", count: 1,
      length: num(v.L), width: num(v.W), height: num(v.eave), quantity: q, unit: "م²", unitPrice: 0, totalPrice: 0,
      deduction: kind === "walls" ? num(v.openings) : 0, extractionSource: "manual_input",
      formula: kind === "roof" ? `2 × ${v.L} × ${a.slopeLen}` : `(2×${v.L}×${v.eave} + 2×(${v.W}×${v.eave} + ½×${v.W}×${r2(num(v.ridge) - num(v.eave))}))${num(v.wallPct) < 100 ? ` × ${v.wallPct}٪` : ""} − ${v.openings}`,
      sourceEvidence: "حاسبة التكسية: محسوبة من الأبعاد العامة المدخلة، وليست مقروءة من خطوط المخطط", reviewFlags: ["تحقق من الأبعاد والفتحات"],
    } as TakeoffItem;
  };
  return (
    <section className="card p-4">
      <button onClick={() => setOpen((x) => !x)} className="flex w-full items-center justify-between text-right">
        <span className="text-[15px] font-extrabold text-slate-900">حاسبة التكسية (الشنكو)</span>
        <span className="text-[12.5px] font-bold text-teal-800">{open ? "إخفاء" : "حساب"}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {field("L", "الطول (م)")}{field("W", "العرض / البحر (م)")}
            {field("eave", "ارتفاع الحافة (م)")}{field("ridge", "قمة الجملون (م)")}
            {field("wallPct", "الجدران المكسوة ٪ (بلوك = 0)")}{field("openings", "خصم الفتحات (م²)")}
          </div>
          <div className="rounded-lg bg-teal-50 px-3 py-2 text-[13px] font-bold leading-7 text-teal-900">
            سقف: <b className="font-mono">{a.roof}</b> م² · جدران: <b className="font-mono">{a.walls}</b> م²
            <span className="block text-[12px] font-semibold text-teal-800">مجموع الجدران قبل الخصم {a.gross} م². الأطوال من الأبعاد العامة المطبوعة على اللوحة، بلا هالك ولا تراكب.</span>
          </div>
          <button onClick={() => { onAdd(a.walls > 0 ? [make("roof"), make("walls")] : [make("roof")]); setDone(a.walls > 0 ? "أُضيف بندا التكسية إلى الجدول." : "أُضيف بند تكسية السقف إلى الجدول."); }} className="qto-cta h-12 rounded-xl text-[15px]">
            إضافة التكسية للجدول
          </button>
          {done && <p className="text-[13px] font-bold text-teal-900">{done}</p>}
        </div>
      )}
    </section>
  );
};
