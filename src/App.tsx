import React, { useState, useEffect, useRef } from "react";
import { Navbar } from "./components/Navbar";
import { BlueprintTabs } from "./components/BlueprintTabs";
import { BlueprintViewer } from "./components/BlueprintViewer";
import { TakeoffTable } from "./components/TakeoffTable";
import { BOQView } from "./components/BOQView";
import { UploadModal } from "./components/UploadModal";
import { VisualSearchModal } from "./components/VisualSearchModal";
import { QuantityExtractionModal } from "./components/QuantityExtractionModal";
import { PdfVectorModal } from "./components/PdfVectorModal";
import { ApkInstallModal } from "./components/ApkInstallModal";
import { CompanySettingsModal } from "./components/CompanySettingsModal";
import { QuotationModal } from "./components/QuotationModal";
import { SaveStatusBar, StorageNotice } from "./components/SaveStatusBar";
import { ProjectManagerModal } from "./components/ProjectManagerModal";
import { SteelCalculatorModal } from "./components/SteelCalculatorModal";
import { OfflineIndicator } from "./components/OfflineIndicator";
import {
  BlueprintSheet,
  TakeoffItem,
  ProjectMetadata,
  MeasurementPin,
  ProjectRecord,
  SheetCalibration,
  VisualSearchToken,
  ReviewStatus,
  CompanyProfile,
  EMPTY_COMPANY_PROFILE,
  PROJECT_SCHEMA_VERSION,
} from "./types";
import {
  initialProjectMetadata,
  sampleSheets,
  sampleTakeoffItems,
} from "./data/sampleBlueprints";
import { getSheetVisualTokens, searchSheetTokens } from "./utils/visualSearchEngine";
import {
  loadProjectsFromStorage,
  saveProjectsToStorage,
  loadCompanyProfile,
  saveCompanyProfile,
  requestPersistentStorage,
  getStorageUsage,
  pruneOrphanAssets,
  serializeProjectForBackup,
  getLastBackup,
  markBackupDone,
} from "./utils/projectStorage";

export const APP_VERSION = "6.1.0";

// Persistent high-capacity storage powered by IndexedDB (src/utils/projectStorage.ts)

function createInitialProject(): ProjectRecord {
  return {
    id: "prj-default-sample",
    metadata: { ...initialProjectMetadata },
    sheets: sampleSheets,
    takeoffItems: sampleTakeoffItems,
    updatedAt: new Date().toISOString(),
  };
}

// Snapshots hold references only: every state update in this app is immutable, so a reference is a
// complete, free snapshot (the old deep JSON clone copied every drawing image 20 times).
interface HistorySnapshot {
  sheets: BlueprintSheet[];
  takeoffItems: TakeoffItem[];
  metadata: ProjectMetadata;
}

const HISTORY_LIMIT = 30;

export default function App() {
  const [projects, setProjects] = useState<ProjectRecord[]>(() => [createInitialProject()]);
  const [activeProjectId, setActiveProjectId] = useState<string>("prj-default-sample");
  const [storageReady, setStorageReady] = useState<boolean>(false);
  const [company, setCompany] = useState<CompanyProfile>(EMPTY_COMPANY_PROFILE);
  const [storageNotice, setStorageNotice] = useState<StorageNotice | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState<string>("");

  // Hydrate projects asynchronously from IndexedDB (migrates legacy localStorage automatically)
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProjectsFromStorage(), loadCompanyProfile()])
      .then(([{ projects: loaded, activeProjectId: loadedId }, profile]) => {
        if (cancelled) return;
        setCompany(profile);
        if (loaded && loaded.length > 0) {
          setProjects(loaded);
          if (loadedId && loaded.some((p) => p.id === loadedId)) {
            setActiveProjectId(loadedId);
          } else {
            setActiveProjectId(loaded[0].id);
          }
          pruneOrphanAssets(loaded);
        }
        setStorageReady(true);
        requestPersistentStorage();
      })
      .catch((err) => {
        console.error("Storage hydration failed:", err);
        if (!cancelled) {
          setStorageNotice({ kind: "failed", quotaExceeded: false });
          setStorageReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];
  const { metadata, sheets, takeoffItems } = activeProject;

  const [activeSheetId, setActiveSheetId] = useState<string>(() => sheets[0]?.id || "");
  const [activeView, setActiveView] = useState<"workspace" | "boq">("workspace");

  // Undo history stack (up to 20 snapshots for current session)
  const [historyStack, setHistoryStack] = useState<HistorySnapshot[]>([]);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isVisualSearchOpen, setIsVisualSearchOpen] = useState(false);
  const [isExtractionModalOpen, setIsExtractionModalOpen] = useState(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isSteelCalcOpen, setIsSteelCalcOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isQuotationOpen, setIsQuotationOpen] = useState(false);

  // Visual Search Highlights & Review-on-Blueprint state
  const [highlightedTokens, setHighlightedTokens] = useState<VisualSearchToken[]>([]);
  const [highlightLabel, setHighlightLabel] = useState<string>("");
  const [focusedItem, setFocusedItem] = useState<TakeoffItem | null>(null);
  const viewerSectionRef = useRef<HTMLDivElement>(null);

  // Keep a valid active sheet (e.g. after deleting one) without disturbing highlights.
  useEffect(() => {
    if (!sheets.some((s) => s.id === activeSheetId)) {
      setActiveSheetId(sheets[0]?.id || "");
    }
  }, [sheets, activeSheetId]);

  // Highlights belong to a sheet: clear them only when the project or sheet really changes.
  useEffect(() => {
    setHighlightedTokens([]);
    setHighlightLabel("");
    setFocusedItem(null);
  }, [activeProjectId, activeSheetId]);

  // Debounced autosave + immediate flush when the page is hidden/closed.
  const latestRef = useRef({ projects, activeId: activeProject.id });
  latestRef.current = { projects, activeId: activeProject.id };

  const runSave = React.useCallback(async () => {
    const { projects: ps, activeId } = latestRef.current;
    const result = await saveProjectsToStorage(ps, activeId);
    if (result.status === "failed") {
      setStorageNotice({ kind: "failed", quotaExceeded: result.quotaExceeded });
    } else if (result.status === "fallback") {
      setStorageNotice((n) => (n?.kind === "failed" ? n : { kind: "fallback" }));
    } else {
      setStorageNotice((n) => (n?.kind === "failed" || n?.kind === "fallback" ? null : n));
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const timer = setTimeout(runSave, 400);
    return () => clearTimeout(timer);
  }, [projects, activeProject.id, storageReady, runSave]);

  useEffect(() => {
    if (!storageReady) return;
    const flush = () => {
      if (document.visibilityState === "hidden") runSave();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", runSave);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", runSave);
    };
  }, [storageReady, runSave]);

  // Gentle reminders: storage pressure and stale backups (data lives only on this device).
  useEffect(() => {
    if (!storageReady) return;
    let cancelled = false;
    (async () => {
      const usage = await getStorageUsage();
      if (cancelled) return;
      if (usage && usage.ratio > 0.8) {
        setStorageNotice((n) => n || { kind: "quota", percent: Math.round(usage.ratio * 100) });
        return;
      }
      const last = getLastBackup(activeProject.id);
      const hasWork = takeoffItems.length > 0 && activeProject.id !== "prj-default-sample";
      const stale = !last || Date.now() - last > 7 * 24 * 3600 * 1000;
      if (hasWork && stale) setStorageNotice((n) => n || { kind: "backup" });
    })();
    return () => {
      cancelled = true;
    };
    // Evaluate on project switch / after hydration only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageReady, activeProject.id]);

  const pushUndoSnapshot = () => {
    setHistoryStack((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), { sheets, takeoffItems, metadata }]);
  };

  // Rapid edits of the same field (typing a price) collapse into one undo step.
  const lastCoalesceRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const pushUndoCoalesced = (key: string) => {
    const now = Date.now();
    if (lastCoalesceRef.current.key === key && now - lastCoalesceRef.current.at < 2000) {
      lastCoalesceRef.current.at = now;
      return;
    }
    lastCoalesceRef.current = { key, at: now };
    pushUndoSnapshot();
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const last = historyStack[historyStack.length - 1];
    setHistoryStack((prev) => prev.slice(0, -1));
    lastCoalesceRef.current = { key: "", at: 0 };
    updateActiveProject((p) => ({
      ...p,
      sheets: last.sheets,
      takeoffItems: last.takeoffItems,
      metadata: last.metadata,
    }));
    setFocusedItem(null);
  };

  const handleSaveCompany = (profile: CompanyProfile) => {
    setCompany(profile);
    saveCompanyProfile(profile).then((ok) => {
      if (!ok) setStorageNotice({ kind: "failed", quotaExceeded: false });
    });
  };

  const handleBackupActive = () => {
    try {
      const blob = new Blob([serializeProjectForBackup(activeProject)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (activeProject.metadata.projectCode || "project").replace(/[^a-zA-Z0-9_-]/g, "_");
      a.href = url;
      a.download = `QTO_${safe}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      markBackupDone(activeProject.id);
      setStorageNotice((n) => (n?.kind === "failed" || n?.kind === "fallback" ? n : null));
    } catch (e) {
      console.error("Backup failed", e);
    }
  };

  const updateActiveProject = (updater: (prj: ProjectRecord) => ProjectRecord) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProject.id ? { ...updater(p), updatedAt: new Date().toISOString() } : p
      )
    );
  };

  const setMetadata: React.Dispatch<React.SetStateAction<ProjectMetadata>> = (val) => {
    updateActiveProject((p) => ({
      ...p,
      metadata: typeof val === "function" ? val(p.metadata) : val,
    }));
  };

  const currentSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];
  const currentSheetItems = takeoffItems.filter((item) => item.sheetId === currentSheet?.id);

  // Item handlers with Audit Trail & Undo support
  const handleAddItem = (newItem: TakeoffItem) => {
    if (!currentSheet) return;
    pushUndoSnapshot();
    const now = new Date().toISOString();
    const initialStatus: ReviewStatus =
      newItem.reviewStatus ||
      (newItem.extractionSource === "cad_geometry" || newItem.extractionSource === "visual_search"
        ? "extracted"
        : "draft");

    const guaranteedItem: TakeoffItem = {
      ...newItem,
      sheetId: currentSheet.id,
      sheetCode: currentSheet.code,
      sheetTitle: currentSheet.title,
      reviewStatus: initialStatus,
      auditLog: newItem.auditLog || [
        {
          timestamp: now,
          action: "إنشاء البند",
          newQty: newItem.quantity,
          status: initialStatus,
        },
      ],
    };
    updateActiveProject((p) => ({
      ...p,
      takeoffItems: [guaranteedItem, ...p.takeoffItems],
    }));
  };

  const handleUpdateItem = (updatedItem: TakeoffItem) => {
    pushUndoCoalesced(`item:${updatedItem.id}`);
    const prev = takeoffItems.find((i) => i.id === updatedItem.id);
    const now = new Date().toISOString();
    let auditLog = updatedItem.auditLog || prev?.auditLog || [];

    if (prev && prev.quantity !== updatedItem.quantity) {
      auditLog = [
        ...auditLog,
        {
          timestamp: now,
          action: "تعديل الكمية",
          previousQty: prev.quantity,
          newQty: updatedItem.quantity,
          status: updatedItem.reviewStatus,
        },
      ];
    }

    const finalItem: TakeoffItem = { ...updatedItem, auditLog };
    updateActiveProject((p) => ({
      ...p,
      takeoffItems: p.takeoffItems.map((i) => (i.id === finalItem.id ? finalItem : i)),
    }));
    if (focusedItem?.id === finalItem.id) {
      setFocusedItem(finalItem);
    }
  };

  const handleUpdateItemStatus = (item: TakeoffItem, status: ReviewStatus, reason?: string) => {
    pushUndoSnapshot();
    const now = new Date().toISOString();
    const updated: TakeoffItem = {
      ...item,
      reviewStatus: status,
      isVerified: status === "approved",
      reviewedAt: now,
      lastModifiedReason: reason,
      auditLog: [
        ...(item.auditLog || []),
        {
          timestamp: now,
          action: `تغيير الحالة إلى (${status})`,
          reason,
          status,
        },
      ],
    };
    updateActiveProject((p) => ({
      ...p,
      takeoffItems: p.takeoffItems.map((i) => (i.id === updated.id ? updated : i)),
    }));
    if (focusedItem?.id === updated.id) {
      setFocusedItem(updated);
    }
  };

  const handleDeleteItem = (itemId: string) => {
    pushUndoSnapshot();
    updateActiveProject((p) => ({
      ...p,
      takeoffItems: p.takeoffItems.filter((i) => i.id !== itemId),
    }));
    if (focusedItem?.id === itemId) setFocusedItem(null);
  };

  const handleApplyExtractedItems = (newItems: TakeoffItem[]) => {
    const dedupedRestores = newItems.filter((item) => {
      if (!item.restoredDeduplicatedId) return true;
      return !takeoffItems.some(
        (existing) =>
          existing.sheetId === item.sheetId &&
          existing.restoredDeduplicatedId === item.restoredDeduplicatedId
      );
    });
    if (dedupedRestores.length === 0) return;
    newItems = dedupedRestores;
    pushUndoSnapshot();
    const now = new Date().toISOString();
    const stamped = newItems.map((item) => ({
      ...item,
      reviewStatus: item.reviewStatus || ("extracted" as ReviewStatus),
      auditLog: item.auditLog || [
        {
          timestamp: now,
          action: "استخراج/استيراد مجمع",
          newQty: item.quantity,
          status: item.reviewStatus || ("extracted" as ReviewStatus),
        },
      ],
    }));
    updateActiveProject((p) => ({
      ...p,
      takeoffItems: [...stamped, ...p.takeoffItems],
    }));
  };

  // Reverse Link: Inspect a takeoff item on its blueprint
  const handleInspectItemOnSheet = (item: TakeoffItem) => {
    const targetSheet = sheets.find((s) => s.id === item.sheetId) || currentSheet;
    if (targetSheet && targetSheet.id !== activeSheetId) {
      setActiveSheetId(targetSheet.id);
    }
    setFocusedItem(item);

    // Highlight matching visual tokens on blueprint if found
    if (targetSheet) {
      const tokens = getSheetVisualTokens(targetSheet);
      const searchKey = item.sourceDetails?.blockName || item.itemCode || "";
      if (searchKey && tokens.length > 0) {
        const matches = searchSheetTokens(tokens, searchKey);
        if (matches.length > 0) {
          setHighlightedTokens(matches);
          setHighlightLabel(searchKey);
        }
      }
    }

    viewerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Sheet handlers
  const handleSheetCreated = (newSheet: BlueprintSheet) => {
    pushUndoSnapshot();
    updateActiveProject((p) => ({ ...p, sheets: [...p.sheets, newSheet] }));
    setActiveSheetId(newSheet.id);
  };

  const handleMultipleSheetsCreated = (newSheets: BlueprintSheet[]) => {
    if (newSheets.length === 0) return;
    pushUndoSnapshot();
    updateActiveProject((p) => ({ ...p, sheets: [...p.sheets, ...newSheets] }));
    setActiveSheetId(newSheets[0].id);
  };

  const handleDeleteSheet = (sheetId: string) => {
    if (sheets.length <= 1) return;
    const target = sheets.find((s) => s.id === sheetId);
    const linkedCount = takeoffItems.filter((i) => i.sheetId === sheetId).length;
    const ok = window.confirm(
      `هل أنت متأكد من حذف اللوحة "${target?.code || ""}"؟ سيتم حذف (${linkedCount}) بند مرتبط بها (يمكنك التراجع لاحقاً من زر تراجع).`
    );
    if (!ok) return;

    pushUndoSnapshot();
    const remaining = sheets.filter((s) => s.id !== sheetId);
    updateActiveProject((p) => ({
      ...p,
      sheets: remaining,
      takeoffItems: p.takeoffItems.filter((i) => i.sheetId !== sheetId),
    }));
    if (activeSheetId === sheetId) setActiveSheetId(remaining[0].id);
  };

  const handleCalibrateSheet = (calibration: SheetCalibration) => {
    if (!currentSheet) return;
    pushUndoSnapshot();
    updateActiveProject((p) => ({
      ...p,
      sheets: p.sheets.map((s) => (s.id === currentSheet.id ? { ...s, calibration } : s)),
    }));
  };

  const handleAddMeasurementPin = (newPin: MeasurementPin) => {
    if (!currentSheet) return;
    pushUndoSnapshot();
    updateActiveProject((p) => ({
      ...p,
      sheets: p.sheets.map((s) =>
        s.id === currentSheet.id
          ? { ...s, measurementPins: [...(s.measurementPins || []), newPin] }
          : s
      ),
    }));
  };

  const handleRemoveMeasurementPin = (pinId: string) => {
    if (!currentSheet) return;
    pushUndoSnapshot();
    updateActiveProject((p) => ({
      ...p,
      sheets: p.sheets.map((s) =>
        s.id === currentSheet.id
          ? { ...s, measurementPins: (s.measurementPins || []).filter((pin) => pin.id !== pinId) }
          : s
      ),
    }));
  };

  const handleConvertPinToItem = (pin: MeasurementPin) => {
    if (!currentSheet) return;
    const dimType = pin.type === "area" ? "area" : pin.type === "length" ? "linear" : "count";
    handleAddItem({
      id: `item-pin-${Date.now()}`,
      sheetId: currentSheet.id,
      sheetCode: currentSheet.code,
      sheetTitle: currentSheet.title,
      itemCode: `PIN-${(currentSheetItems.length + 1).toString().padStart(2, "0")}`,
      description: `${pin.label} — قياس مباشر من اللوحة ${currentSheet.code}`,
      category: "أعمال متنوعة أخرى",
      dimensionType: dimType,
      location: currentSheet.title,
      count: 1,
      quantity: pin.calculatedValue,
      unit: pin.unit,
      unitPrice: 0,
      totalPrice: 0,
      extractionSource: "manual_pin",
      reviewStatus: "needs_review",
      sourceEvidence: currentSheet.calibration
        ? `قياس مباشر بمقياس معاير (${currentSheet.calibration.referenceMeters} م)`
        : "قياس مباشر على المخطط",
      notes: currentSheet.calibration
        ? `مقاس بمقياس معاير (${currentSheet.calibration.referenceMeters} م مرجعي)`
        : "مقاس مباشرة على المخطط (يفضل معايرة المقياس للتحقق)",
    });
  };

  // Project Manager handlers
  const handleCreateProject = (prj: ProjectRecord) => {
    if (!prj.metadata.contractorName && company.name) {
      prj = { ...prj, metadata: { ...prj.metadata, contractorName: company.name } };
    }
    setProjects((prev) => [prj, ...prev]);
    setActiveProjectId(prj.id);
    setActiveSheetId(prj.sheets[0]?.id || "");
    setHistoryStack([]);
  };

  const handleDuplicateProject = (prjId: string) => {
    const src = projects.find((p) => p.id === prjId);
    if (!src) return;
    // Immutable data can be shared by reference between the original and the copy.
    const copy: ProjectRecord = {
      ...src,
      id: `prj-copy-${Date.now()}`,
      metadata: { ...src.metadata, projectName: `${src.metadata.projectName} (نسخة)` },
      updatedAt: new Date().toISOString(),
      schemaVersion: PROJECT_SCHEMA_VERSION,
    };
    setProjects((prev) => [copy, ...prev]);
    setActiveProjectId(copy.id);
  };

  const handleDeleteProject = (prjId: string) => {
    if (projects.length <= 1) return;
    const ok = window.confirm("هل أنت متأكد من حذف هذا المشروع بالكامل؟");
    if (!ok) return;
    const remaining = projects.filter((p) => p.id !== prjId);
    setProjects(remaining);
    if (activeProjectId === prjId) setActiveProjectId(remaining[0].id);
  };

  if (!storageReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300" dir="rtl" role="status">
        <div className="flex flex-col items-center gap-4 qto-fade-in">
          <div className="qto-spinner" aria-hidden="true" />
          <span className="text-sm">جارٍ فتح مشاريعك…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans" dir="rtl">
      <Navbar
        metadata={metadata}
        setMetadata={setMetadata}
        activeView={activeView}
        setActiveView={setActiveView}
        sheets={sheets}
        takeoffItems={takeoffItems}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenVisualSearch={() => setIsVisualSearchOpen(true)}
        onOpenExtractionModal={() => setIsExtractionModalOpen(true)}
        onOpenApkModal={() => setIsApkModalOpen(true)}
        onOpenProjectsModal={() => setIsProjectsOpen(true)}
        onOpenSteelCalc={() => setIsSteelCalcOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenQuotation={() => setIsQuotationOpen(true)}
        canUndo={historyStack.length > 0}
        onUndo={handleUndo}
      />

      <main key={activeView} className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6 qto-view-in">
        {activeView === "workspace" ? (
          <>
            <BlueprintTabs
              sheets={sheets}
              activeSheetId={activeSheetId}
              onSelectSheet={(id) => setActiveSheetId(id)}
              takeoffItems={takeoffItems}
              onOpenUpload={() => setIsUploadOpen(true)}
              onDeleteSheet={handleDeleteSheet}
            />

            <div ref={viewerSectionRef}>
              {currentSheet && (
                <BlueprintViewer
                  sheet={currentSheet}
                  onAddMeasurementPin={handleAddMeasurementPin}
                  onRemoveMeasurementPin={handleRemoveMeasurementPin}
                  onConvertPinToItem={handleConvertPinToItem}
                  onCalibrateSheet={handleCalibrateSheet}
                  onOpenVisualSearch={() => setIsVisualSearchOpen(true)}
                  onOpenExtractionModal={() => setIsExtractionModalOpen(true)}
                  onOpenSteelCalc={() => setIsSteelCalcOpen(true)}
                  highlightedTokens={highlightedTokens}
                  highlightLabel={highlightLabel}
                  onClearHighlights={() => {
                    setHighlightedTokens([]);
                    setHighlightLabel("");
                  }}
                  focusedItem={focusedItem}
                  onCloseFocusedItem={() => setFocusedItem(null)}
                  onUpdateFocusedItemStatus={handleUpdateItemStatus}
                />
              )}
            </div>

            {currentSheet && (
              <TakeoffTable
                sheet={currentSheet}
                items={currentSheetItems}
                onAddItem={handleAddItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                currencySymbol={metadata.currencySymbol}
                onOpenVisualSearch={() => setIsVisualSearchOpen(true)}
                onOpenExtractionModal={() => setIsExtractionModalOpen(true)}
                onInspectItemOnSheet={handleInspectItemOnSheet}
                onImportExcelItems={handleApplyExtractedItems}
                onUpdateStatus={handleUpdateItemStatus}
              />
            )}
          </>
        ) : (
          <BOQView
            metadata={metadata}
            setMetadata={setMetadata}
            sheets={sheets}
            takeoffItems={takeoffItems}
            onUpdateItem={handleUpdateItem}
            company={company}
            onOpenQuotation={() => setIsQuotationOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}
      </main>

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSheetCreated={handleSheetCreated}
        onMultipleSheetsCreated={handleMultipleSheetsCreated}
      />

      {currentSheet && (
        <VisualSearchModal
          isOpen={isVisualSearchOpen}
          onClose={() => setIsVisualSearchOpen(false)}
          activeSheet={currentSheet}
          onAddTakeoffItem={handleAddItem}
          onHighlightTokens={(tokens, label) => {
            setHighlightedTokens(tokens);
            setHighlightLabel(label);
          }}
        />
      )}

      {currentSheet && currentSheet.fileType === "pdf" && (
        <PdfVectorModal
          isOpen={isExtractionModalOpen}
          onClose={() => setIsExtractionModalOpen(false)}
          sheet={currentSheet}
          onAddItems={handleApplyExtractedItems}
        />
      )}

      {currentSheet && currentSheet.fileType !== "pdf" && (
        <QuantityExtractionModal
          isOpen={isExtractionModalOpen}
          onClose={() => setIsExtractionModalOpen(false)}
          activeSheet={currentSheet}
          existingTakeoffItems={takeoffItems}
          onAddExtractedItems={handleApplyExtractedItems}
        />
      )}

      {currentSheet && (
        <SteelCalculatorModal
          isOpen={isSteelCalcOpen}
          onClose={() => setIsSteelCalcOpen(false)}
          activeSheet={currentSheet}
          onAddItem={handleAddItem}
        />
      )}

      <ProjectManagerModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        projects={projects}
        activeProjectId={activeProject.id}
        onSelectProject={(id) => {
          setActiveProjectId(id);
          setHistoryStack([]);
        }}
        onCreateProject={handleCreateProject}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={handleDeleteProject}
        onImportProject={handleCreateProject}
      />

      <ApkInstallModal isOpen={isApkModalOpen} onClose={() => setIsApkModalOpen(false)} />
      <CompanySettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        profile={company}
        onSave={handleSaveCompany}
        appVersion={APP_VERSION}
      />
      <QuotationModal
        isOpen={isQuotationOpen}
        onClose={() => setIsQuotationOpen(false)}
        metadata={metadata}
        company={company}
        items={takeoffItems}
        onOpenSettings={() => {
          setIsQuotationOpen(false);
          setIsSettingsOpen(true);
        }}
      />
      <SaveStatusBar
        notice={storageNotice && `${storageNotice.kind}` !== noticeDismissed ? storageNotice : null}
        onBackup={handleBackupActive}
        onDismiss={() => storageNotice && setNoticeDismissed(storageNotice.kind)}
      />
      <OfflineIndicator />
    </div>
  );
}
