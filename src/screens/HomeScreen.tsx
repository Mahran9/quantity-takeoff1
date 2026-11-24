import React, { useState } from "react";
import {
  Printer,
  FileSpreadsheet,
  Plus,
  Layers,
  ListChecks,
  Receipt,
  Check,
  ChevronLeft,
  FolderKanban,
  ScanSearch,
  Calculator,
  Settings,
  RefreshCw,
} from "lucide-react";
import { ProjectMetadata, BlueprintSheet, TakeoffItem } from "../types";
import { buildQuotation } from "../utils/quotation";
import { PWAInstallButton } from "../components/PWAInstallButton";
import { APP_BUILD, Tab } from "../components/Nav";

interface Props {
  metadata: ProjectMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<ProjectMetadata>>;
  sheets: BlueprintSheet[];
  items: TakeoffItem[];
  onTab: (t: Tab) => void;
  onUpload: () => void;
  onQuotation: () => void;
  onExcel: () => void;
  onAutoAll: () => string;
  onProjects: () => void;
  onVisualSearch: () => void;
  onSteelCalc: () => void;
  onSettings: () => void;
}

const SYMBOLS: Record<string, string> = { SAR: "ر.س", AED: "د.إ", USD: "$", EGP: "ج.م", QAR: "ر.ق", KWD: "د.ك" };
const CURRENCIES: [string, string][] = [
  ["SAR", "ريال سعودي"],
  ["AED", "درهم إماراتي"],
  ["USD", "دولار أمريكي"],
  ["EGP", "جنيه مصري"],
  ["QAR", "ريال قطري"],
  ["KWD", "دينار كويتي"],
];

/** Counts up to the new value so a changed total is noticed. */
const CountUp: React.FC<{ value: number }> = ({ value }) => {
  const [shown, setShown] = useState(value);
  const from = React.useRef(value);
  React.useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from.current === value) { from.current = value; setShown(value); return; }
    const a = from.current, b = value, t0 = performance.now(), D = 800;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{money(shown)}</>;
};

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export const HomeScreen: React.FC<Props> = ({ metadata, setMetadata, sheets, items, onTab, onUpload, onQuotation, onExcel, onAutoAll, onProjects, onVisualSearch, onSteelCalc, onSettings }) => {
  const q = buildQuotation(items, metadata.taxRate);
  const live = items.filter((i) => i.reviewStatus !== "rejected");
  const approved = live.filter((i) => i.reviewStatus === "approved" || i.isVerified).length;
  const priced = live.filter((i) => i.unitPrice > 0).length;
  const [refreshing, setRefreshing] = useState(false);

  // Drops the offline copy of the app (service worker + caches) and reloads. Saved projects are untouched.
  const refreshApp = async () => {
    setRefreshing(true);
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = (await caches?.keys?.()) || [];
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* reload anyway */
    }
    window.location.reload();
  };

  const steps: { n: number; Icon: React.ComponentType<{ className?: string }>; title: string; line: string; done: boolean; pct?: number; go: () => void; cta: string }[] = [
    {
      n: 1,
      Icon: Layers,
      title: "اللوحات",
      line: sheets.length ? `${sheets.length} لوحة مضافة` : "أضف مخطط المشروع (PDF أو DXF أو صورة)",
      done: sheets.length > 0,
      go: sheets.length ? () => onTab("sheets") : onUpload,
      cta: sheets.length ? "فتح" : "إضافة",
    },
    {
      n: 2,
      Icon: ListChecks,
      title: "مراجعة الكميات",
      line: live.length ? `${approved} من ${live.length} بند معتمد` : "حلّل اللوحة ثم راجع كل رقم",
      done: live.length > 0 && approved === live.length,
      pct: live.length ? approved / live.length : 0,
      go: () => onTab(sheets.length ? "items" : "sheets"),
      cta: "مراجعة",
    },
    {
      n: 3,
      Icon: Receipt,
      title: "التسعير",
      line: live.length ? `${priced} من ${live.length} بند مسعّر` : "بعد الكميات تُدخل الأسعار",
      done: live.length > 0 && priced === live.length,
      pct: live.length ? priced / live.length : 0,
      go: () => onTab("price"),
      cta: "تسعير",
    },
  ];
  const [autoMsg, setAutoMsg] = useState("");
  const next = steps.find((s) => !s.done);

  const tool = "w-full flex items-center gap-3.5 px-4 py-3.5 text-right text-sm font-bold text-slate-800 border-b border-slate-100 last:border-b-0";
  const tile = "grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600 shrink-0";
  const field = "rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 w-full";

  return (
    <div className="flex flex-col gap-5 qto-stagger">
      {/* Project + total: the one dark, memorable block */}
      <section className="hero-card p-5 sm:p-6">
        <button onClick={onProjects} className="flex items-center gap-2 text-right max-w-full" title="المشاريع">
          <FolderKanban className="w-4 h-4 text-teal-300 shrink-0" />
          <span className="truncate text-[15px] font-bold">{metadata.projectName}</span>
          <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
        <div className="mt-5 text-[13px] text-slate-300 font-semibold">الإجمالي شامل الضريبة {metadata.taxRate}%</div>
        <div className="mt-1 flex items-baseline gap-2" dir="rtl">
          <span className="text-[40px] sm:text-5xl leading-none font-extrabold tracking-tight font-mono"><CountUp value={q.grandTotal} /></span>
          <span className="text-base font-bold text-teal-300">{metadata.currencySymbol}</span>
        </div>
        <div className="mt-2 text-[12px] text-slate-400">
          الصافي {money(q.subtotal)} · {q.itemCount} بند
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button onClick={onQuotation} className="qto-cta flex h-11 items-center justify-center gap-2 rounded-xl text-sm">
            <Printer className="w-[18px] h-[18px]" />
            عرض السعر
          </button>
          <button onClick={onExcel} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-bold text-white">
            <FileSpreadsheet className="w-[18px] h-[18px]" />
            جدول Excel
          </button>
        </div>
      </section>

      {sheets.length === 0 && (
        <section className="card p-5 text-center">
          <h2 className="text-lg font-extrabold text-slate-900">ابدأ برفع المخطط</h2>
          <p className="mt-1 text-[13px] leading-6 text-slate-500 font-semibold">PDF أو DXF أو DWG أو صورة. القراءة على جهازك.</p>
          <button onClick={onUpload} className="qto-cta mt-4 w-full h-14 rounded-xl text-base flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" /> رفع مخطط
          </button>
        </section>
      )}

      {sheets.length > 0 && (
        <section className="card p-4">
          <button onClick={() => setAutoMsg(onAutoAll())} className="qto-cta w-full h-14 rounded-xl text-[15px] flex items-center justify-center gap-2">
            <ListChecks className="w-5 h-5" /> اقرأ المخطط واحصر الكميات
          </button>
          <p className="mt-2 text-[12.5px] leading-6 text-slate-500 font-semibold">
            يقرأ كل لوحة: الأبعاد المقاسة والعلامات المكتوبة (أعمدة، كمرات، براغي…) ويملأ جدول الكميات. بعدها صدّر Excel من الأعلى.
          </p>
          {autoMsg && <p className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-[13px] font-bold text-teal-900">{autoMsg}</p>}
        </section>
      )}

      {/* Workflow: what is done, what is next */}
      <section>
        <h2 className="mb-2.5 text-[15px] font-extrabold text-slate-900">خطوات العمل</h2>
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {steps.map((s) => {
            const isNext = next?.n === s.n;
            return (
              <button key={s.n} onClick={s.go} className={`w-full flex items-center gap-3.5 px-4 py-4 text-right ${isNext ? "bg-teal-50" : ""}`}>
                <span
                  className={`grid h-10 w-10 place-items-center rounded-full shrink-0 ${
                    s.done ? "bg-teal-500 text-slate-900" : isNext ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {s.done ? <Check className="w-5 h-5" /> : <s.Icon className="w-5 h-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-extrabold text-slate-900">{s.title}</span>
                  <span className="block text-[12.5px] text-slate-500 font-semibold">{s.line}</span>
                  {s.pct !== undefined && s.pct > 0 && !s.done && (
                    <span className="mt-2 block h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <span className="block h-full rounded-full bg-teal-500 qto-grow" style={{ width: `${Math.round(s.pct * 100)}%` }} />
                    </span>
                  )}
                </span>
                {isNext ? (
                  <span className="qto-cta rounded-lg px-3.5 py-2 text-xs shrink-0">{s.cta}</span>
                ) : (
                  <ChevronLeft className="w-5 h-5 text-slate-300 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
        {sheets.length > 0 && (
          <button onClick={onUpload} className="mt-3 flex items-center gap-1.5 text-[13px] font-bold text-teal-800">
            <Plus className="w-4 h-4" /> إضافة لوحة أخرى
          </button>
        )}
      </section>

      {/* Tools */}
      <section>
        <h2 className="mb-2.5 text-[15px] font-extrabold text-slate-900">أدوات</h2>
        <div className="card overflow-hidden">
          <button className={tool} onClick={onVisualSearch}>
            <span className={tile}><ScanSearch className="w-[18px] h-[18px]" /></span>
            <span className="flex-1">بحث بصري في اللوحة</span>
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
          <button className={tool} onClick={onSteelCalc}>
            <span className={tile}><Calculator className="w-[18px] h-[18px]" /></span>
            <span className="flex-1">حاسبة الحديد</span>
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
          <button className={tool} onClick={onSettings}>
            <span className={tile}><Settings className="w-[18px] h-[18px]" /></span>
            <span className="flex-1">بيانات الشركة والورق الرسمي</span>
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
          <button className={tool} onClick={onProjects}>
            <span className={tile}><FolderKanban className="w-[18px] h-[18px]" /></span>
            <span className="flex-1">المشاريع والنسخ الاحتياطي</span>
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </section>

      {/* Project details */}
      <section>
        <h2 className="mb-2.5 text-[15px] font-extrabold text-slate-900">بيانات المشروع</h2>
        <div className="card p-4 grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs font-bold text-slate-600 space-y-1 block">
            اسم المشروع
            <input value={metadata.projectName} onChange={(e) => setMetadata({ ...metadata, projectName: e.target.value })} className={field} />
          </label>
          <label className="col-span-2 text-xs font-bold text-slate-600 space-y-1 block">
            العميل
            <input value={metadata.clientName} onChange={(e) => setMetadata({ ...metadata, clientName: e.target.value })} className={field} />
          </label>
          <label className="text-xs font-bold text-slate-600 space-y-1 block">
            العملة
            <select
              value={metadata.currency}
              onChange={(e) => setMetadata({ ...metadata, currency: e.target.value as ProjectMetadata["currency"], currencySymbol: SYMBOLS[e.target.value] || e.target.value })}
              className={field}
            >
              {CURRENCIES.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600 space-y-1 block">
            الضريبة %
            <input type="number" inputMode="decimal" value={metadata.taxRate} onChange={(e) => setMetadata({ ...metadata, taxRate: Math.max(0, Number(e.target.value)) })} className={`${field} font-mono`} />
          </label>
          <label className="col-span-2 text-xs font-bold text-slate-600 space-y-1 block">
            رقم المشروع
            <input value={metadata.projectCode} onChange={(e) => setMetadata({ ...metadata, projectCode: e.target.value })} className={`${field} font-mono`} />
          </label>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 pb-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <PWAInstallButton />
        </div>
        <button onClick={refreshApp} disabled={refreshing} className="flex items-center gap-1.5 font-bold text-slate-600">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "جارٍ التحديث…" : "تحديث التطبيق"}
          <span className="font-mono text-slate-400" dir="ltr">{APP_BUILD}</span>
        </button>
      </section>
    </div>
  );
};
