import React from "react";
import {
  FileText,
  Compass,
  Layers,
  Plus,
  Trash2,
  Lock,
  Sparkles,
  CheckCircle2,
  Clock,
  FileCode2,
} from "lucide-react";
import { BlueprintSheet, TakeoffItem, DisciplineType } from "../types";

interface BlueprintTabsProps {
  sheets: BlueprintSheet[];
  activeSheetId: string;
  onSelectSheet: (id: string) => void;
  takeoffItems: TakeoffItem[];
  onOpenUpload: () => void;
  onDeleteSheet: (id: string) => void;
}

export const BlueprintTabs: React.FC<BlueprintTabsProps> = ({
  sheets,
  activeSheetId,
  onSelectSheet,
  takeoffItems,
  onOpenUpload,
  onDeleteSheet,
}) => {
  const getDisciplineStyle = (discipline: DisciplineType) => {
    switch (discipline) {
      case "إنشائي":
        return {
          bg: "bg-blue-950/40 text-blue-300 border-blue-800/60",
          badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        };
      case "معماري":
        return {
          bg: "bg-emerald-950/40 text-emerald-300 border-emerald-800/60",
          badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        };
      case "صحي وتغذية":
        return {
          bg: "bg-orange-950/40 text-orange-300 border-orange-800/60",
          badge: "bg-orange-500/20 text-orange-300 border-orange-500/30",
        };
      case "كهرباء وإنارة":
        return {
          bg: "bg-amber-950/40 text-amber-300 border-amber-800/60",
          badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        };
      default:
        return {
          bg: "bg-slate-800/40 text-slate-300 border-slate-700/60",
          badge: "bg-slate-700/40 text-slate-300 border-slate-600/40",
        };
    }
  };

  const activeSheet = sheets.find((s) => s.id === activeSheetId);
  const activeItemsCount = takeoffItems.filter((i) => i.sheetId === activeSheetId).length;

  return (
    <div className="bg-slate-900 border-b border-slate-800/90 shadow-inner">
      {/* Upper Status & Segregation Assurance Bar */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950/40 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-slate-200">
            نظام العزل الهندسي الصارم:
          </span>
          <span className="text-slate-400">
            كميات كل لوحة مسجلة ومحسوبة في دفتر حصر مستقل بنسبة 100% دون أي اختلاط.
          </span>
        </div>

        {activeSheet && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">اللوحة المعروضة حالياً:</span>
            <span className="font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              {activeSheet.code} - {activeSheet.title}
            </span>
            <span className="text-slate-500 font-mono">
              ({activeItemsCount} بند حصر مستقل)
            </span>
          </div>
        )}
      </div>

      {/* Horizontal Scrollable Tabs */}
      <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
        {sheets.map((sheet) => {
          const isActive = sheet.id === activeSheetId;
          const itemsCount = takeoffItems.filter((item) => item.sheetId === sheet.id).length;
          const style = getDisciplineStyle(sheet.discipline);

          return (
            <div
              key={sheet.id}
              onClick={() => onSelectSheet(sheet.id)}
              className={`group relative flex items-center gap-3 px-3.5 py-2 rounded-xl cursor-pointer transition-all border shrink-0 select-none ${
                isActive
                  ? "bg-slate-800 border-amber-500/80 shadow-md shadow-amber-500/5 ring-1 ring-amber-500/40"
                  : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/70 hover:border-slate-700 text-slate-300"
              }`}
            >
              {/* File type & code icon */}
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[11px] font-mono border ${style.badge}`}
              >
                {sheet.fileType === "dxf" ? (
                  <FileCode2 className="w-4 h-4 text-cyan-400" />
                ) : (
                  sheet.code
                )}
              </div>

              {/* Title & Metadata */}
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold truncate max-w-[180px] sm:max-w-[220px] ${
                      isActive ? "text-amber-300" : "text-slate-200"
                    }`}
                  >
                    {sheet.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                  <span className={`px-1.5 py-0.2 rounded ${style.badge}`}>
                    {sheet.discipline}
                  </span>
                  <span>{sheet.scale}</span>
                  <span className="text-slate-600">•</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {itemsCount} بند
                  </span>
                </div>
              </div>

              {/* Delete button (only if more than 1 sheet) */}
              {sheets.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      window.confirm(
                        `هل أنت متأكد من حذف المخطط (${sheet.code} - ${sheet.title}) وبنود حصره؟`
                      )
                    ) {
                      onDeleteSheet(sheet.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/20 hover:text-rose-400 text-slate-500 rounded transition-all mr-1"
                  title="حذف اللوحة وبنودها"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* Add Blueprint Tab Button */}
        <button
          id="btn-tab-add-blueprint"
          onClick={onOpenUpload}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-700 hover:border-amber-500/60 hover:bg-slate-800 text-slate-400 hover:text-amber-300 text-xs font-semibold shrink-0 transition-all"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>إضافة لوحة جديدة</span>
        </button>
      </div>
    </div>
  );
};
