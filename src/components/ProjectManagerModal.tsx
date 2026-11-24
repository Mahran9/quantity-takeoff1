import React, { useState, useRef } from "react";
import { X, Plus, Trash2, Copy, Download, Upload, Check, AlertCircle } from "lucide-react";
import { ProjectRecord, PROJECT_SCHEMA_VERSION } from "../types";
import { normalizeProjectRecord, serializeProjectForBackup, markBackupDone } from "../utils/projectStorage";

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectRecord[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (project: ProjectRecord) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onImportProject: (project: ProjectRecord) => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen, onClose, projects, activeProjectId, onSelectProject, onCreateProject, onDuplicateProject, onDeleteProject, onImportProject,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const create = () => {
    const today = new Date().toISOString().split("T")[0];
    const project: ProjectRecord = {
      id: `prj-${Date.now()}`,
      metadata: {
        projectName: newName.trim() || "مشروع جديد",
        projectCode: `PRJ-${new Date().getFullYear()}-${String(projects.length + 1).padStart(2, "0")}`,
        clientName: newClient.trim(),
        contractorName: "",
        consultantName: "",
        currency: "SAR",
        currencySymbol: "ر.س",
        date: today,
        taxRate: 15,
        notes: "",
      },
      // A new project starts empty: the first thing it asks for is the drawing.
      sheets: [],
      takeoffItems: [],
      updatedAt: new Date().toISOString(),
      schemaVersion: PROJECT_SCHEMA_VERSION,
    };
    onCreateProject(project);
    setNewName(""); setNewClient(""); setCreating(false);
    onClose();
  };

  const backup = (project: ProjectRecord) => {
    const blob = new Blob([serializeProjectForBackup(project)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeCode = (project.metadata.projectCode || "project").replace(/[^a-zA-Z0-9_-]/g, "_");
    a.download = `QTO_${safeCode}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    markBackupDone(project.id);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error("الملف كبير جداً.");
      const text = await file.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new Error("الملف ليس نسخة احتياطية صالحة."); }
      onImportProject(normalizeProjectRecord(parsed, `prj-imp-${Date.now()}`));
      onClose();
    } catch (err: any) {
      setImportError(err?.message || "تعذر قراءة الملف.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const field = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[15px] text-slate-900 focus:border-teal-600 focus:outline-none";
  const link = "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-bold text-slate-700";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-xl max-h-[92dvh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-extrabold text-slate-900">المشاريع</h2>
          <button onClick={onClose} aria-label="إغلاق" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pb-6 overflow-y-auto flex flex-col gap-4">
          {creating ? (
            <div className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
              <label className="text-[13px] font-bold text-slate-600">اسم المشروع
                <input autoFocus className={`${field} mt-1`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: هنجر الدمام" />
              </label>
              <label className="text-[13px] font-bold text-slate-600">العميل (اختياري)
                <input className={`${field} mt-1`} value={newClient} onChange={(e) => setNewClient(e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setCreating(false)} className="h-12 rounded-xl border border-slate-200 font-bold text-slate-700">إلغاء</button>
                <button onClick={create} className="qto-cta h-12 rounded-xl">إنشاء المشروع</button>
              </div>
              <p className="text-[12.5px] text-slate-500 leading-6">يبدأ المشروع فارغاً، وأول خطوة فيه رفع المخطط.</p>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="qto-cta h-12 rounded-xl flex items-center justify-center gap-2 text-[15px]">
              <Plus className="w-5 h-5" /> مشروع جديد
            </button>
          )}

          <div className="flex flex-col gap-2.5">
            {projects.map((prj) => {
              const active = prj.id === activeProjectId;
              const files = prj.sheets.filter((x) => x.fileName !== "لم يتم رفع ملف بعد").length;
              return (
                <div key={prj.id} className={`rounded-2xl border p-4 ${active ? "border-teal-500 bg-teal-50/50" : "border-slate-200"}`}>
                  <button className="w-full text-right" onClick={() => { onSelectProject(prj.id); onClose(); }}>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[15px] text-slate-900 truncate">{prj.metadata.projectName}</span>
                      {active && <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-900"><Check className="w-3 h-3" /> مفتوح</span>}
                    </div>
                    <div className="mt-1 text-[12.5px] text-slate-500 font-semibold">{files} لوحة · {prj.takeoffItems.length} بند{prj.metadata.clientName ? ` · ${prj.metadata.clientName}` : ""}</div>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!active && <button onClick={() => { onSelectProject(prj.id); onClose(); }} className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-bold text-white">فتح</button>}
                    <button onClick={() => backup(prj)} className={link}><Download className="w-4 h-4" /> نسخة احتياطية</button>
                    <button onClick={() => onDuplicateProject(prj.id)} className={link}><Copy className="w-4 h-4" /> تكرار</button>
                    {projects.length > 1 && (confirmDel === prj.id ? (
                      <button onClick={() => { onDeleteProject(prj.id); setConfirmDel(""); }} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-[13px] font-bold text-white"><Trash2 className="w-4 h-4" /> تأكيد الحذف</button>
                    ) : (
                      <button onClick={() => setConfirmDel(prj.id)} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-[13px] font-bold text-rose-700"><Trash2 className="w-4 h-4" /> حذف</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <input ref={fileInputRef} type="file" accept=".json,application/json,text/plain" onChange={handleImportFile} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className={link}><Upload className="w-4 h-4" /> استرجاع مشروع من نسخة احتياطية</button>
            {importError && <p className="mt-2 flex items-center gap-2 text-[13px] text-rose-700"><AlertCircle className="w-4 h-4 shrink-0" />{importError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
