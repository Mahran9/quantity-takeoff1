import React from "react";
import { House, Layers, ListChecks, Receipt, FolderKanban, ChevronDown, Sun, Moon } from "lucide-react";
import { toggleTheme, effectiveTheme } from "../theme";

declare const __APP_BUILD__: string;
export const APP_BUILD = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev";

export type Tab = "home" | "sheets" | "items" | "price";

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "الرئيسية", Icon: House },
  { id: "sheets", label: "اللوحات", Icon: Layers },
  { id: "items", label: "الكميات", Icon: ListChecks },
  { id: "price", label: "التسعير", Icon: Receipt },
];

interface NavProps {
  tab: Tab;
  onTab: (t: Tab) => void;
  counts: Partial<Record<Tab, number>>;
}

/** Phone: four destinations at the bottom. The active one sits in a turquoise pill. */
export const BottomNav: React.FC<NavProps> = ({ tab, onTab, counts }) => (
  <nav className="nav-bottom print:hidden" aria-label="التنقل">
    {TABS.map(({ id, label, Icon }) => (
      <button key={id} onClick={() => onTab(id)} className={tab === id ? "is-active" : ""} aria-current={tab === id ? "page" : undefined}>
        <span className="pill relative">
          <Icon className="w-[22px] h-[22px]" />
          {!!counts[id] && tab !== id && (
            <span className="absolute -top-0.5 right-2 min-w-[16px] h-4 px-1 rounded-full bg-slate-900 text-white text-[10px] leading-4 font-mono">{counts[id]}</span>
          )}
        </span>
        {label}
      </button>
    ))}
  </nav>
);

interface SideProps extends NavProps {
  projectName: string;
  onProjects: () => void;
}

/** Tablet / desktop: a fixed rail on the right with the project switcher and the same four destinations. */
export const SideNav: React.FC<SideProps> = ({ tab, onTab, counts, projectName, onProjects }) => (
  <aside className="hidden md:flex fixed inset-y-0 right-0 w-64 flex-col bg-white border-l border-slate-200 p-4 gap-5 z-30 print:hidden">
    <div className="flex items-center gap-2.5 px-1 pt-1">
      <img src="/icon.svg" alt="" width={36} height={36} className="w-9 h-9 rounded-xl" />
      <div className="leading-tight">
        <div className="font-extrabold text-slate-900">حصر الكميات</div>
        <div className="text-[11px] text-slate-500 font-semibold">للمقاولين والمقدّرين</div>
      </div>
    </div>
    <button onClick={onProjects} className="flex items-center gap-2.5 rounded-xl bg-slate-100 px-3 py-2.5 text-right">
      <FolderKanban className="w-4 h-4 text-slate-500 shrink-0" />
      <span className="flex-1 truncate text-sm font-bold text-slate-800">{projectName}</span>
      <ChevronDown className="w-4 h-4 text-slate-400" />
    </button>
    <nav className="flex flex-col gap-1">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTab(id)}
          className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${tab === id ? "bg-teal-100 text-teal-800" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <Icon className="w-5 h-5" />
          <span className="flex-1 text-right">{label}</span>
          {!!counts[id] && <span className="text-[11px] font-mono text-slate-400">{counts[id]}</span>}
        </button>
      ))}
    </nav>
    <div className="mt-auto flex items-center justify-between px-1">
      <ThemeToggle />
      <span className="text-[10px] font-mono text-slate-400" dir="ltr">{APP_BUILD}</span>
    </div>
  </aside>
);

/** Day / night switch: sun and moon swap with a turn (the colour change itself cross-fades). */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [dark, setDark] = React.useState(() => effectiveTheme() === "dark");
  React.useEffect(() => {
    const on = () => setDark(effectiveTheme() === "dark");
    window.addEventListener("qto-theme", on);
    return () => window.removeEventListener("qto-theme", on);
  }, []);
  return (
    <button onClick={toggleTheme} className={`theme-toggle ${className}`} aria-label={dark ? "الوضع النهاري" : "الوضع الليلي"} title={dark ? "الوضع النهاري" : "الوضع الليلي"}>
      <Sun className="t-sun" /><Moon className="t-moon" />
    </button>
  );
};

/** Large screen title with an optional action on the opposite side. */
export const ScreenHeader: React.FC<{ title: string; sub?: string; action?: React.ReactNode }> = ({ title, sub, action }) => (
  <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-1">
    <div className="min-w-0 flex-1 basis-44">
      <h1 className="text-[26px] leading-tight font-extrabold text-slate-900 truncate">{title}</h1>
      {sub && <p className="mt-0.5 text-[13px] text-slate-500 font-semibold">{sub}</p>}
    </div>
    <div className="flex items-center gap-2 shrink-0 flex-wrap">
      {action}
      <ThemeToggle />
    </div>
  </header>
);
