import React from "react";
import { TakeoffItem } from "../types";
import { claddingAreas, r2 } from "../utils/cladding";
import { kgPerMetre } from "../utils/steelWeights";

interface Props { onAdd: (items: TakeoffItem[]) => void; items?: TakeoffItem[]; onReplace?: (removeIds: string[], add: TakeoffItem[]) => void }

const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

export const CladdingCard: React.FC<Props> = ({ onAdd, items = [], onReplace }) => {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ L: "69.78", W: "29.8", eave: "7.5", ridge: "9", openings: "0", wallPct: "0" });
  const [done, setDone] = React.useState("");
  const [rafter, setRafter] = React.useState("IPE500");
  const [steelDone, setSteelDone] = React.useState("");
  const a = claddingAreas(num(v.L), num(v.W), num(v.eave), num(v.ridge), num(v.openings), num(v.wallPct));
  // Steel by weight: column lines already read as counts (أعمدة IPE600 × 24) and the number of portal frames.
  const live = items.filter((i) => i.reviewStatus !== "rejected");
  const colLines = live
    .map((i) => ({ i, m: /^أعمدة\s*((?:IPE|HEA|HEB|UPN)\d+)/.exec(i.description) }))
    .filter((x) => x.m && x.i.unit === "عدد")
    .map((x) => ({ item: x.i, sec: x.m![1], kg: kgPerMetre(x.m![1]) }));
  const frames = live.find((i) => /^جملونات/.test(i.description) && i.unit === "عدد");
  const eaveH = num(v.eave);
  const colTons = (c: { item: TakeoffItem; kg: number | null }) => r2(((c.item.quantity * eaveH * (c.kg || 0)) / 1000));
  const rafterKg = kgPerMetre(rafter) || 0;
  const rafterTons = frames ? r2((frames.quantity * 2 * a.slopeLen * rafterKg) / 1000) : 0;
  const mkSteel = (id: string, desc: string, tons: number, formula: string): TakeoffItem => ({
    id: `${id}-${Date.now()}`, sheetId: "", itemCode: "STL-T", description: desc, category: "أعمال الهياكل المعدنية والهناجر",
    dimensionType: "count", location: "المبنى", count: 1, quantity: tons, unit: "طن", unitPrice: 0, totalPrice: 0, formula,
    extractionSource: "manual_input", reviewFlags: ["الوزن بالطول المفترض وجدول أوزان المقاطع، لا من قوائم المواد"],
    sourceEvidence: "محسوب: العدد المقروء من المخطط × الطول × وزن المتر الطولي للمقطع",
  } as TakeoffItem);
  const convertSteel = () => {
    const add: TakeoffItem[] = [];
    const remove: string[] = [];
    for (const c of colLines) {
      if (!c.kg) continue;
      add.push(mkSteel(`stl-col-${c.sec}`, `حديد أعمدة ${c.sec} — ${c.item.quantity} عمود × ${eaveH} م × ${c.kg} كجم/م`, colTons(c), `${c.item.quantity} × ${eaveH} × ${c.kg} ÷ 1000`));
      remove.push(c.item.id);
    }
    if (frames && rafterKg) add.push(mkSteel(`stl-raf-${rafter}`, `حديد رفترات الجملونات ${rafter} — ${frames.quantity} إطار × 2 × ${a.slopeLen} م × ${rafterKg} كجم/م`, rafterTons, `${frames.quantity} × 2 × ${a.slopeLen} × ${rafterKg} ÷ 1000`));
    if (!add.length) { setSteelDone("لا توجد بنود أعمدة بمقاطع معروفة لتحويلها."); return; }
    if (onReplace) onReplace(remove, add); else onAdd(add);
    setSteelDone(`أُضيف ${add.length} بند بالطن، وحُذفت بنود الأعمدة بالعدد التي حُسبت منها.`);
  };
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
        <span className="text-[15px] font-extrabold text-slate-900">حاسبة المبنى: التكسية والحديد بالطن</span>
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
          <div className="mt-1 border-t border-slate-200 pt-3">
            <p className="text-[13.5px] font-extrabold text-slate-900">الحديد بالطن</p>
            {colLines.length === 0 && !frames ? (
              <p className="mt-1 text-[12.5px] font-semibold leading-6 text-slate-500">لا توجد بنود أعمدة أو جملونات مقروءة بعد. شغّل «اقرأ واحصر» أولاً.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2 text-[13px] font-semibold text-slate-800">
                {colLines.map((c) => (
                  <p key={c.item.id}>أعمدة {c.sec}: <b className="font-mono">{c.item.quantity}</b> × {eaveH} م = <b className="font-mono">{c.kg ? colTons(c) : "؟"}</b> طن</p>
                ))}
                {frames && (
                  <label className="flex flex-col gap-1">
                    رفترات {frames.quantity} إطار: اختر مقطع الرفتر
                    <select value={rafter} onChange={(e) => setRafter(e.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-2 font-mono">
                      {["IPE300", "IPE360", "IPE400", "IPE450", "IPE500", "IPE550", "IPE600"].map((x) => <option key={x}>{x}</option>)}
                    </select>
                    <span className="font-mono">= {rafterTons} طن</span>
                  </label>
                )}
                <button onClick={convertSteel} className="qto-cta h-12 rounded-xl text-[15px]">تحويل الحديد إلى طن وإضافته</button>
                {steelDone && <p className="text-[13px] font-bold text-teal-900">{steelDone}</p>}
                <p className="text-[12px] leading-6 text-slate-500">طول العمود = ارتفاع الحافة أعلاه. الرفتر بطول المنحدر × 2 لكل إطار. أوزان المقاطع من الجداول القياسية، فراجع المقطع الفعلي في لوحة التفاصيل.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
