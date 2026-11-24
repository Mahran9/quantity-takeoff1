import React, { useState, useRef } from "react";
import {
  X,
  FolderKanban,
  Plus,
  Trash2,
  Copy,
  Download,
  Upload,
  CheckCircle2,
  Building2,
  Warehouse,
  FilePlus2,
  AlertCircle,
} from "lucide-react";
import { ProjectRecord, BlueprintSheet, PROJECT_SCHEMA_VERSION } from "../types";
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

type ProjectTemplate = "blank" | "hangar" | "villa";

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDuplicateProject,
  onDeleteProject,
  onImportProject,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newContractor, setNewContractor] = useState("");
  const [template, setTemplate] = useState<ProjectTemplate>("hangar");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const buildTemplateSheets = (tpl: ProjectTemplate): BlueprintSheet[] => {
    const now = new Date().toISOString();
    const ts = Date.now();
    if (tpl === "hangar") {
      return [
        {
          id: `sheet-${ts}-1`,
          code: "S-01",
          title: "مخطط القواعد والأساسات والميدات",
          discipline: "إنشائي",
          fileType: "pdf",
          fileName: "لم يتم رفع ملف بعد",
          scale: "1:100",
          status: "new",
          measurementPins: [],
          createdAt: now,
        },
        {
          id: `sheet-${ts}-2`,
          code: "ST-01",
          title: "الهيكل المعدني والأعمدة والرافتر",
          discipline: "إنشائي",
          fileType: "dxf",
          fileName: "لم يتم رفع ملف بعد",
          scale: "1:100",
          status: "new",
          measurementPins: [],
          createdAt: now,
        },
        {
          id: `sheet-${ts}-3`,
          code: "ST-02",
          title: "السقف والساندوتش بانل والكلادينج",
          discipline: "معماري",
          fileType: "pdf",
          fileName: "لم يتم رفع ملف بعد",
          scale: "1:100",
          status: "new",
          measurementPins: [],
          createdAt: now,
        },
        {
          id: `sheet-${ts}-4`,
          code: "A-01",
          title: "المباني والأرضيات والتشطيبات",
          discipline: "معماري",
          fileType: "pdf",
          fileName: "لم يتم رفع ملف بعد",
          scale: "1:100",
          status: "new",
          measurementPins: [],
          createdAt: now,
        },
      ];
    }
    if (tpl === "villa") {
      return [
        {
          id: `sheet-${ts}-1`,
          code: "S-01",
          title: "مخطط القواعد والميدات",
          discipline: "إنشائي",
          fileType: "pdf",
          fileName: "لم يتم رفع ملف بعد",
          scale: "1:100",
          status: "new",
          measurementPins: [],
          createdAt: now,
        },
        {
          id: `sheet-${ts}-2`,
          code: "S-02",
          title: "مخطط الأعمدة والأسقف",
          discipline: "إنشائي",
          fileType: "pdf",
          fileName: "لم يتم رفع ملف بعد",
          scale: "1:100",
          status: "new",
          measurementPins: [],
          createdAt: now,
        },
        {
          id: `sheet-${ts}-3`,
          code: "A-01",
          title: "المسقط المعماري والبلوك والتشطيبات",
          discipline: "معماري",
          fileType: "pdf",
          fileName: "لم يتم رفع ملف بعد",
          scale: "1:100",
          status: "new",
          measurementPins: [],
          createdAt: now,
        },
      ];
    }
    return [
      {
        id: `sheet-${ts}-1`,
        code: "PLN-01",
        title: "اللوحة الأولى - جاهزة للرفع والحصر",
        discipline: "إنشائي",
        fileType: "pdf",
        fileName: "لم يتم رفع ملف بعد",
        scale: "1:100",
        status: "new",
        measurementPins: [],
        createdAt: now,
      },
    ];
  };

  const handleCreateSubmit = () => {
    const title = newName.trim() || "مشروع مقاولات جديد";
    const today = new Date().toISOString().split("T")[0];
    const codeSuffix = String(projects.length + 1).padStart(2, "0");
    const newProject: ProjectRecord = {
      id: `prj-${Date.now()}`,
      metadata: {
        projectName: title,
        projectCode: `PRJ-${new Date().getFullYear()}-${codeSuffix}`,
        clientName: newClient.trim() || "العميل",
        contractorName: newContractor.trim(),
        consultantName: "",
        currency: "SAR",
        currencySymbol: "ر.س",
        date: today,
        taxRate: 15,
        notes: "",
      },
      sheets: buildTemplateSheets(template),
      takeoffItems: [],
      updatedAt: new Date().toISOString(),
      schemaVersion: PROJECT_SCHEMA_VERSION,
    };
    onCreateProject(newProject);
    setNewName("");
    setNewClient("");
    setShowCreateForm(false);
    onClose();
  };

  const handleExportJson = (project: ProjectRecord) => {
    const blob = new Blob([serializeProjectForBackup(project)], {
      type: "application/json;charset=utf-8",
    });
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
      const text = await file.text();
      if (file.size > 200 * 1024 * 1024) throw new Error("الملف كبير جداً.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("الملف ليس نسخة احتياطية صالحة (JSON تالف).");
      }
      // Validates structure, normalises numbers, drops orphan items and rejects files from newer app versions.
      const imported: ProjectRecord = normalizeProjectRecord(parsed, `prj-imp-${Date.now()}`);
      onImportProject(imported);
      onClose();
    } catch (err: any) {
      setImportError(err?.message || "تعذر قراءة ملف المشروع JSON.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[88dvh] flex flex-col overflow-hidden text-right">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold">إدارة المشاريع والنسخ الاحتياطي</h2>
              <p className="text-xs text-slate-400">
                افتح مشروعاً جديداً نظيفاً أو تنقّل بين مناقصاتك واحفظ نسخة احتياطية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() => setShowCreateForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs sm:text-sm font-bold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>{showCreateForm ? "إغلاق نموذج الإنشاء" : "إنشاء مشروع جديد نظيف"}</span>
            </button>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json,text/plain"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                <span>استيراد نسخة احتياطية (JSON)</span>
              </button>
            </div>
          </div>

          {importError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {showCreateForm && (
            <div className="p-5 rounded-2xl bg-slate-50 border border-amber-300/70 space-y-4">
              <h3 className="text-sm font-bold text-slate-800">بيانات المشروع الجديد</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">اسم المشروع *</label>
                  <input
                    type="text"
                    placeholder="مثال: مستودع ومبنى إداري"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">اسم العميل / المالك</label>
                  <input
                    type="text"
                    placeholder="مثال: شركة ..."
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    اسم المقاول (يظهر في عرض السعر)
                  </label>
                  <input
                    type="text"
                    value={newContractor}
                    onChange={(e) => setNewContractor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">
                  اختر قالب اللوحات المبدئي (جميع الكميات تبدأ من صفر):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setTemplate("hangar")}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      template === "hangar"
                        ? "border-amber-500 bg-amber-50 ring-2 ring-amber-400/40"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <Warehouse className="w-5 h-5 text-amber-600 mb-1" />
                    <div className="text-xs font-bold text-slate-800">هنجر / مستودع حديد</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      4 لوحات: قواعد، هيكل معدني، ساندوتش بانل، مباني
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTemplate("villa")}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      template === "villa"
                        ? "border-amber-500 bg-amber-50 ring-2 ring-amber-400/40"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <Building2 className="w-5 h-5 text-blue-600 mb-1" />
                    <div className="text-xs font-bold text-slate-800">فيلا / مبنى خرساني</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      3 لوحات: قواعد، أعمدة وأسقف، معماري
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTemplate("blank")}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      template === "blank"
                        ? "border-amber-500 bg-amber-50 ring-2 ring-amber-400/40"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <FilePlus2 className="w-5 h-5 text-emerald-600 mb-1" />
                    <div className="text-xs font-bold text-slate-800">مشروع فارغ</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      لوحة واحدة فارغة تماماً تبدأ منها بنفسك
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleCreateSubmit}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                >
                  إنشاء وفتح المشروع
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-500">المشاريع المحفوظة ({projects.length})</h3>
            {projects.map((prj) => {
              const isActive = prj.id === activeProjectId;
              const subtotal = prj.takeoffItems.reduce(
                (s, i) => s + i.quantity * (i.unitPrice || 0),
                0
              );
              return (
                <div
                  key={prj.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-wrap items-center justify-between gap-3 ${
                    isActive
                      ? "border-amber-400 bg-amber-50/50 shadow-xs"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div
                    onClick={() => {
                      onSelectProject(prj.id);
                      onClose();
                    }}
                    className="cursor-pointer flex-1 min-w-[200px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{prj.metadata.projectName}</span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          نشط حالياً
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                      <span>العميل: {prj.metadata.clientName || "—"}</span>
                      <span>•</span>
                      <span>{prj.sheets.length} لوحات</span>
                      <span>•</span>
                      <span>{prj.takeoffItems.length} بند</span>
                      <span>•</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {subtotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}{" "}
                        {prj.metadata.currencySymbol}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isActive && (
                      <button
                        onClick={() => {
                          onSelectProject(prj.id);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                      >
                        فتح
                      </button>
                    )}
                    <button
                      onClick={() => handleExportJson(prj)}
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                      title="تصدير نسخة احتياطية JSON"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDuplicateProject(prj.id)}
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                      title="نسخ المشروع"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {projects.length > 1 && (
                      <button
                        onClick={() => onDeleteProject(prj.id)}
                        className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600"
                        title="حذف المشروع"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
