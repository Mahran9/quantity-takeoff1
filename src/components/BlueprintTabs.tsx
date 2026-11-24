import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { BlueprintSheet, TakeoffItem } from "../types";

interface BlueprintTabsProps {
  sheets: BlueprintSheet[];
  activeSheetId: string;
  onSelectSheet: (id: string) => void;
  takeoffItems: TakeoffItem[];
  onOpenUpload: () => void;
  onDeleteSheet: (id: string) => void;
}

/**
 * Sheet switcher. A single sheet needs no switcher on the phone (the + button adds more),
 * so it only appears there once there are two or more. Light chips on the page background,
 * the active one outlined in the accent colour; delete is always reachable on the active chip.
 */
export const BlueprintTabs: React.FC<BlueprintTabsProps> = ({
  sheets,
  activeSheetId,
  onSelectSheet,
  takeoffItems,
  onOpenUpload,
  onDeleteSheet,
}) => {
  return (
    <div className={sheets.length > 1 ? "" : "hidden sm:block"}>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {sheets.map((sheet) => {
          const isActive = sheet.id === activeSheetId;
          const count = takeoffItems.filter((i) => i.sheetId === sheet.id).length;
          return (
            <div
              key={sheet.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSheet(sheet.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelectSheet(sheet.id)}
              className={`shrink-0 flex items-center gap-2 pl-2 pr-3 py-2 rounded-xl border select-none cursor-pointer ${
                isActive ? "bg-white border-amber-500 text-slate-900" : "bg-white/50 border-slate-200 text-slate-500"
              }`}
            >
              <span className="font-mono text-[11px] font-bold">{sheet.code}</span>
              <span className="text-xs font-semibold truncate max-w-[130px]">{sheet.title}</span>
              <span className="text-[10px] text-slate-400 font-mono">{count}</span>
              {isActive && sheets.length > 1 && (
                <button
                  type="button"
                  aria-label="حذف اللوحة وبنودها"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`حذف اللوحة (${sheet.code} - ${sheet.title}) وبنودها؟`)) onDeleteSheet(sheet.id);
                  }}
                  className="p-1 -ml-0.5 rounded-md text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <button
          id="btn-tab-add-blueprint"
          onClick={onOpenUpload}
          aria-label="إضافة لوحة"
          className="hidden sm:flex shrink-0 items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-slate-500 hover:text-slate-800 text-xs font-semibold"
        >
          <Plus className="w-4 h-4" /> لوحة جديدة
        </button>
      </div>
    </div>
  );
};
