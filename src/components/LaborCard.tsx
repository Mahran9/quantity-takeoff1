import React, { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { TakeoffItem } from "../types";

export const LABOR_CATEGORY = "أعمال الأجور (شغل اليد)";

type Basis = "lump" | "ton" | "m2";
const BASES: { id: Basis; label: string; unit: string }[] = [
  { id: "lump", label: "مقطوعية", unit: "مقطوعية" },
  { id: "ton", label: "لكل طن حديد", unit: "طن" },
  { id: "m2", label: "لكل م² تكسية", unit: "م²" },
];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Workmanship (labour) line: a lump sum, or a rate per ton of steel / per m² of sheeting taken from the takeoff. */
export const LaborCard: React.FC<{
  items: TakeoffItem[];
  currencySymbol: string;
  onAdd: (item: TakeoffItem) => void;
}> = ({ items, currencySymbol, onAdd }) => {
  const [basis, setBasis] = useState<Basis>("ton");
  const [desc, setDesc] = useState("أجور تصنيع وتركيب الهيكل المعدني (شغل اليد)");
  const [price, setPrice] = useState("");
  const [qtyText, setQtyText] = useState("");

  const live = items.filter((i) => i.reviewStatus !== "rejected" && i.category !== LABOR_CATEGORY);
  const auto = useMemo(() => {
    if (basis === "lump") return 1;
    if (basis === "ton") return r2(live.filter((i) => i.unit === "طن").reduce((a, i) => a + (Number(i.quantity) || 0), 0));
    return r2(live.filter((i) => i.unit === "م²" && /هياكل|معدن/.test(i.category || "")).reduce((a, i) => a + (Number(i.quantity) || 0), 0));
  }, [basis, items]);
  const qty = qtyText.trim() === "" ? auto : Number(qtyText) || 0;
  const unitPrice = Number(price) || 0;
  const unit = BASES.find((b) => b.id === basis)!.unit;
  const total = r2(qty * unitPrice);
  const ok = desc.trim() && qty > 0 && unitPrice > 0;
  const field = "rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 w-full";

  const add = () => {
    if (!ok) return;
    onAdd({
      id: `labor-${Date.now()}`, sheetId: "", itemCode: "L", description: desc.trim(), category: LABOR_CATEGORY,
      dimensionType: basis === "m2" ? "area" : "count", location: "", count: 1, quantity: qty, unit, unitPrice, totalPrice: total,
      isVerified: true, reviewStatus: "approved", extractionSource: "manual_input",
      notes: basis === "lump" ? "مبلغ مقطوع" : `سعر ${unit === "طن" ? "الطن" : "المتر المربع"} من كميات الحصر`,
    } as TakeoffItem);
    setPrice(""); setQtyText("");
  };

  return (
    <section className="card p-4 flex flex-col gap-3 print:hidden">
      <div className="flex items-center gap-2 text-[15px] font-extrabold text-slate-900"><Calculator className="w-5 h-5 text-teal-600" /> إضافة بند شغل اليد</div>
      <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
        {BASES.map((b) => (
          <button key={b.id} onClick={() => { setBasis(b.id); setQtyText(""); }}
            className={`h-10 rounded-lg text-[13px] font-bold ${basis === b.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{b.label}</button>
        ))}
      </div>
      <input value={desc} onChange={(e) => setDesc(e.target.value)} className={field} placeholder="وصف البند" />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[12px] font-bold text-slate-500">الكمية ({unit})
          <input inputMode="decimal" value={qtyText} onChange={(e) => setQtyText(e.target.value)} placeholder={String(auto)} className={`${field} mt-1 font-mono`} />
        </label>
        <label className="text-[12px] font-bold text-slate-500">{basis === "lump" ? "المبلغ" : "السعر"} ({currencySymbol})
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className={`${field} mt-1 font-mono`} />
        </label>
      </div>
      {basis !== "lump" && <p className="text-[12px] text-slate-500 leading-6">الكمية تؤخذ تلقائياً من الحصر ({auto} {unit}) ويمكنك تعديلها.</p>}
      <button onClick={add} disabled={!ok} className="qto-cta w-full text-sm disabled:opacity-60">
        إضافة إلى عرض السعر{ok ? ` — ${total.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currencySymbol}` : ""}
      </button>
    </section>
  );
};
