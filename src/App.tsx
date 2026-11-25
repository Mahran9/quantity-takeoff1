import React, { useState, useEffect, useRef } from "react";
import { BlueprintViewer } from "./components/BlueprintViewer";
import { TakeoffTable } from "./components/TakeoffTable";
import { BOQView } from "./components/BOQView";
import { BottomNav, SideNav, Tab } from "./components/Nav";
import { HomeScreen } from "./screens/HomeScreen";
import { SheetsScreen } from "./screens/SheetsScreen";
import { DrawingScreen } from "./screens/DrawingScreen";
import { ItemsScreen } from "./screens/ItemsScreen";
import { UploadModal } from "./components/UploadModal";
import { VisualSearchModal } from "./components/VisualSearchModal";
import { QuantityExtractionModal } from "./components/QuantityExtractionModal";
import { PdfVectorModal } from "./components/PdfVectorModal";
import { AiTakeoffModal } from "./components/AiTakeoffModal";
import { AnalyzeSheetModal } from "./components/AnalyzeSheetModal";
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
import { initialProjectMetadata, LEGACY_DEMO_SHEET_IDS } from "./data/sampleBlueprints";
import { exportBoqToExcel } from "./utils/boqExporter";
import { fromOcr, readCad, readPdf } from "./engine/readers";
import { readMarks } from "./engine/marks";
import { readPrintedLabels } from "./utils/ocrLabels";
import { importWithRecovery } from "./utils/lazyImport";
import { reconcile } from "./engine/reconcile";
import { Candidate, candidatesToTakeoff, mergeRepeatedMarks } from "./engine/candidate";
import { scheduleVolumes } from "./engine/schedules";
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

export const APP_VERSION = "8.18.0";

// Persistent high-capacity storage powered by IndexedDB (src/utils/projectStorage.ts)

const DEFAULT_PROJECT_ID = "prj-default-sample"; // id kept so browsers that saved the old demo project upgrade in place

function createInitialProject(): ProjectRecord {
  return {
    id: DEFAULT_PROJECT_ID,
    metadata: { ...initialProjectMetadata, date: new Date().toISOString().slice(0, 10) },
    sheets: [],
    takeoffItems: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Removes the demo drawings/items that older versions saved into the browser. */
function stripLegacyDemo(p: ProjectRecord): ProjectRecord {
  const demo = new Set(LEGACY_DEMO_SHEET_IDS);
  if (!p.sheets.some((s) => demo.has(s.id))) return p;
  const isDemoName = /تجريبي|DEMO-01/.test(`${p.metadata.projectName} ${p.metadata.projectCode}`);
  return {
    ...p,
    sheets: p.sheets.filter((s) => !demo.has(s.id)),
    takeoffItems: p.takeoffItems.filter((i) => !demo.has(i.sheetId)),
    metadata: isDemoName
      ? { ...p.metadata, projectName: "مشروع جديد", projectCode: "", clientName: p.metadata.clientName === "العميل (مثال)" ? "" : p.metadata.clientName, notes: "" }
      : p.metadata,
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
  const [activeProjectId, setActiveProjectId] = useState<string>(DEFAULT_PROJECT_ID);
  const [storageReady, setStorageReady] = useState<boolean>(false);
  const [company, setCompany] = useState<CompanyProfile>(EMPTY_COMPANY_PROFILE);
  const [storageNotice, setStorageNotice] = useState<StorageNotice | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState<string>(() => {
    // a dismissed backup/storage reminder stays quiet for 3 days instead of coming back on every launch
    try {
      for (const k of ["backup", "quota"]) {
        if (Number(localStorage.getItem(`qto-snooze-${k}`) || 0) > Date.now()) return k;
      }
    } catch { /* storage unavailable */ }
    return "";
  });

  // Hydrate projects asynchronously from IndexedDB (migrates legacy localStorage automatically)
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProjectsFromStorage(), loadCompanyProfile()])
      .then(([{ projects: loadedRaw, activeProjectId: loadedId }, profile]) => {
        let loaded = loadedRaw;
        if (cancelled) return;
        setCompany(profile);
        if (loaded && loaded.length > 0) {
          loaded = loaded.map(stripLegacyDemo);
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
  const [tab, setTab] = useState<Tab>("home");
  const [drawingOpen, setDrawingOpen] = useState(false);

  // Undo history stack (up to 20 snapshots for current session)
  const [historyStack, setHistoryStack] = useState<HistorySnapshot[]>([]);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isVisualSearchOpen, setIsVisualSearchOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isAnalyzeOpen, setIsAnalyzeOpen] = useState(false);
  const [isExtractionModalOpen, setIsExtractionModalOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isSteelCalcOpen, setIsSteelCalcOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Quantities screen: one table for every sheet (default) or a single sheet the person picked. */
  const [itemsAllSheets, setItemsAllSheets] = useState(true);
  /** Result of the automatic read after an upload, shown above the quantities table. */
  const [readMsg, setReadMsg] = useState("");
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
    setHistoryStack((prev) => {
      // A batch action (select all, merge prices) calls this once per line with the same state: keep one step,
      // so each press of «تراجع» visibly undoes something.
      const top = prev[prev.length - 1];
      if (top && top.sheets === sheets && top.takeoffItems === takeoffItems && top.metadata === metadata) return prev;
      return [...prev.slice(-(HISTORY_LIMIT - 1)), { sheets, takeoffItems, metadata }];
    });
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
    setNotice("تم التراجع عن آخر تعديل.");
    window.setTimeout(() => setNotice((n) => (n === "تم التراجع عن آخر تعديل." ? null : n)), 2500);
  };

  // Ctrl+Z / ⌘Z undoes the last change, except while typing in a field (the field keeps its own undo).
  const undoRef = useRef(handleUndo);
  undoRef.current = handleUndo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      undoRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // These tools add items to a drawing, so with no drawing yet we send the user to "add drawing" instead of doing nothing.
  const needSheet = (open: () => void, what: string) => () => {
    if (!currentSheet) {
      setNotice(`أضف مخططاً أولاً لتستخدم ${what}`);
      setIsUploadOpen(true);
      window.setTimeout(() => setNotice(null), 4000);
      return;
    }
    open();
  };
  const openExtraction = needSheet(() => setIsExtractionModalOpen(true), "حصر الكميات");
  const openAnalyze = needSheet(() => setIsAnalyzeOpen(true), "تحليل اللوحة");
  const openSteelCalc = needSheet(() => setIsSteelCalcOpen(true), "حاسبة الحديد");
  const openVisualSearch = needSheet(() => setIsVisualSearchOpen(true), "البحث البصري");
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

  const handleDeleteMany = (ids: string[]) => {
    if (!ids.length) return;
    const gone = new Set(ids);
    pushUndoSnapshot();
    updateActiveProject((p) => ({ ...p, takeoffItems: p.takeoffItems.filter((i) => !gone.has(i.id)) }));
    if (focusedItem && gone.has(focusedItem.id)) setFocusedItem(null);
  };

  const handleApplyExtractedItems = (newItems: TakeoffItem[], opts?: { replaceSheetId?: string }) => {
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
      takeoffItems: [
        ...stamped,
        ...p.takeoffItems.filter(
          (it) => !(opts?.replaceSheetId && it.sheetId === opts.replaceSheetId && (it.extractionSource === "cad_geometry" || it.extractionSource === "pdf_vector"))
        ),
      ],
    }));
  };

  /** Read CAD geometry, vector hints, marked quantities, and printed quantity labels. */
  const autoTakeoffAll = async (onlySheetId?: string, sheetList: BlueprintSheet[] = sheets): Promise<string> => {
    const fresh: TakeoffItem[] = [];
    const replaced = new Set<string>();
    const base = takeoffItems.length;
    let readSheets = 0;
    let toReview = 0;
    let ocrLabels = 0;
    let ocrFailures = 0;
    const scope = onlySheetId ? sheetList.filter((x) => x.id === onlySheetId) : sheetList;
    const perSheet: { sheetId: string; code: string; cands: Candidate[] }[] = [];
    for (const sh of scope) {
      let cands: ReturnType<typeof readMarks> = [];
      try {
        if (sh.dxfData) cands = readCad(sh, {});
        else {
          cands = [...(sh.pdfVector ? readPdf(sh) : []), ...readMarks(sh)];
          // OCR only where the page has (almost) no text layer — scans or text exported as outlines. A page that
          // already carries its text is read directly; running OCR on it only costs time (16 pages ≈ minutes).
          if (sh.imageUrl && (sh.visualTokens?.length ?? 0) < 20) {
            try {
              const labels = await readPrintedLabels(
                sh.imageUrl,
                () => importWithRecovery(() => import("tesseract.js"))
              );
              ocrLabels += labels.quantities.length;
              cands.push(...fromOcr(labels.quantities));
            } catch {
              ocrFailures++;
            }
          }
        }
      } catch { cands = []; }
      const all = reconcile(cands).filter((c) => c.quantity > 0);
      // One tap adds only what the readers marked certain (selected): CAD geometry, written marks, PDF layers the drawing
      // named, and repeated identical shapes at a verified scale. Unnamed colour/thickness lengths and areas are never
      // selected by readPdf, so they wait for the person in «راجع».
      const chosen = all.filter((c) => c.selected);
      toReview += all.length - chosen.length;
      perSheet.push({ sheetId: sh.id, code: sh.code, cands: chosen });
      // A re-read replaces this sheet's earlier automatic lines even if the merge below moves its marks elsewhere.
      if (chosen.length) replaced.add(sh.id);
    }
    // Plan, sections and schedules repeat the same marks: one line per family, never the sum of the sheets.
    // Schedules (footing L×W×H, column b×h) on any sheet of the file × the counted marks = m³ of concrete.
    // Volume lines replace the bare counts they were built from; the counts stay available in «راجع».
    const merged = mergeRepeatedMarks(perSheet);
    const vol = scheduleVolumes(sheetList, merged);
    const finalPerSheet = merged.map(({ sheetId, cands }) => ({
      sheetId,
      cands: [
        ...vol.lines.filter((l) => l.sheetId === sheetId).map((l) => l.cand),
        ...cands.filter((c) => !vol.replaced.some((r) => r.sheetId === sheetId && r.id === c.id)),
      ],
    }));
    toReview += vol.replaced.length;
    for (const { sheetId, cands } of finalPerSheet) {
      if (!cands.length) continue;
      const sh = scope.find((x) => x.id === sheetId)!;
      readSheets++;
      fresh.push(...candidatesToTakeoff(cands, sh, base + fresh.length));
    }
    // From the drawing screen the button reads only the open sheet: say so, and where the whole file is read.
    if (!fresh.length && onlySheetId && sheetList.length > 1)
      return "هذه اللوحة وحدها لا تحوي كمية مؤكدة (الكميات تأتي من جمع علامات المخططات مع جداول المقاسات في لوحات أخرى). لقراءة الملف كله اضغط «اقرأ واحصر» في شاشة «الكميات» مع اختيار «كل اللوحات».";
    if (!fresh.length) return toReview
      ? `لم أجد كمية مؤكدة أضيفها وحدي. في «راجع» قراءات غير مؤكدة (أطوال خطوط وعلامات) يمكنك أن تختار منها ما تعرف أنه صحيح.${ocrFailures ? ` تعذرت قراءة النص آلياً في ${ocrFailures} لوحة.` : ""}`
      : `لم أجد كميات يمكن قراءتها آلياً في هذا الملف (غالباً صورة أو بلا أبعاد مكتوبة). ${ocrLabels ? `قُرئ ${ocrLabels} رقم، لكن لم ينتج بنداً صالحاً. ` : ""}يمكنك إضافة بند يدوياً، أو فتح اللوحة من «اللوحات» والقياس عليها.${ocrFailures ? ` تعذرت قراءة النص آلياً في ${ocrFailures} لوحة.` : ""}`;
    pushUndoSnapshot();
    const now = new Date().toISOString();
    const stamped = fresh.map((it, i) => {
      const status: ReviewStatus = it.reviewStatus || "extracted"; // lines built on an assumption arrive as «needs_review»
      return { ...it, id: `${it.id}-${i}`, reviewStatus: status, auditLog: [{ timestamp: now, action: "حصر تلقائي لكل اللوحات", newQty: it.quantity, status }] };
    });
    updateActiveProject((p) => ({
      ...p,
      takeoffItems: [
        ...stamped,
        ...p.takeoffItems.filter((it) => !(replaced.has(it.sheetId) && (
          it.extractionSource === "cad_geometry" || it.extractionSource === "pdf_vector" ||
          (it.extractionSource === "visual_search" && it.sourceEvidence?.startsWith("السطر المقروء:"))
        ))),
      ],
    }));
    // The raw number of unconfirmed readings (often 100+ line totals and labels) only alarms; say what to do instead.
    const flagged = fresh.filter((i) => i.reviewStatus === "needs_review").length;
    const n = fresh.length === 1 ? "بند واحد" : fresh.length === 2 ? "بندان" : `${fresh.length} بنود`;
    return `أُضيف ${n} مؤكدة من الجداول والمخططات.${flagged ? ` ${flagged} منها «يحتاج مراجعة» لأنه مبني على افتراض مذكور في البند.` : ""}${ocrLabels ? ` تم التقاط ${ocrLabels} رقم مطبوع.` : ""}${ocrFailures ? ` تعذرت قراءة النص في ${ocrFailures} لوحة.` : ""} ما لم يُضف (أطوال خطوط وعلامات غير مؤكدة) تجده في «راجع» إن احتجته.`;
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

    setDrawingOpen(true);
  };

  // Sheet handlers
  /**
   * After an upload the person wants quantities, not a drawing and a tool bar: read the new sheets at once and land on
   * the quantities table (all sheets together). The drawing stays one tap away from any row.
   */
  const readNewSheetsIntoTable = async (newSheets: BlueprintSheet[]) => {
    setActiveSheetId(newSheets[0].id);
    setItemsAllSheets(true);
    setDrawingOpen(false);
    setTab("items");
    setNotice(newSheets.length > 1 ? `جارٍ قراءة ${newSheets.length} لوحات وحصر الكميات…` : "جارٍ قراءة المخطط وحصر الكميات…");
    setReadMsg("");
    let msg: string;
    try { msg = await autoTakeoffAll(undefined, newSheets); }
    catch { msg = "تعذرت قراءة المخطط آلياً. اضغط «راجع» لاختيار الكميات بنفسك."; }
    setNotice(null);
    setReadMsg(msg); // stays above the table until the next read
  };

  /**
   * The same file uploaded twice doubled every count (two sets of identical sheets with identical codes).
   * Ask once: replace the old copy (its sheets and lines go) or skip the upload. Returns the old sheet ids to drop,
   * or null when the person chose not to add the file again. Also gives every incoming sheet a code no other sheet uses.
   */
  const settleIncoming = (incoming: BlueprintSheet[]): { drop: Set<string>; sheets: BlueprintSheet[] } | null => {
    const same = sheets.filter((s) => incoming.some((n) => n.fileName === s.fileName && n.fileSize === s.fileSize));
    const drop = new Set(same.map((s) => s.id));
    if (same.length) {
      const lines = takeoffItems.filter((i) => drop.has(i.sheetId));
      const priced = lines.filter((i) => i.unitPrice > 0).length;
      const ok = window.confirm(
        `الملف «${same[0].fileName}» مرفوع من قبل في هذا المشروع (${same.length} لوحة، ${lines.length} بند${priced ? `، منها ${priced} مسعّر` : ""}).\n\n` +
        `موافق: استبدال النسخة القديمة وبنودها بهذه وإعادة القراءة.\nإلغاء: عدم إضافة الملف مرة ثانية.`
      );
      if (!ok) return null;
    }
    const used = new Set(sheets.filter((s) => !drop.has(s.id)).map((s) => s.code));
    const renamed = incoming.map((s) => {
      let code = s.code;
      for (let k = 2; used.has(code); k++) code = `${s.code}-${k}`;
      used.add(code);
      return code === s.code ? s : { ...s, code };
    });
    return { drop, sheets: renamed };
  };

  const handleSheetCreated = (newSheet: BlueprintSheet) => {
    const settled = settleIncoming([newSheet]);
    if (!settled) return;
    pushUndoSnapshot();
    updateActiveProject((p) => ({
      ...p,
      sheets: [...p.sheets.filter((s) => !settled.drop.has(s.id)), ...settled.sheets],
      takeoffItems: p.takeoffItems.filter((i) => !settled.drop.has(i.sheetId)),
    }));
    void readNewSheetsIntoTable(settled.sheets);
  };

  /** ETABS / SAFE model: adds the model sheet and its concrete quantities in one step, then shows the table. */
  const handleModelImported = (incomingSheet: BlueprintSheet, items: TakeoffItem[], message: string) => {
    const settled = settleIncoming([incomingSheet]);
    if (!settled) return;
    const newSheet = settled.sheets[0];
    pushUndoSnapshot();
    const now = new Date().toISOString();
    const stamped = items.map((it) => {
      const status: ReviewStatus = it.reviewStatus || "extracted";
      return { ...it, sheetCode: newSheet.code, reviewStatus: status, auditLog: [{ timestamp: now, action: "قراءة نموذج إنشائي", newQty: it.quantity, status }] };
    });
    updateActiveProject((p) => ({
      ...p,
      sheets: [...p.sheets.filter((s) => !settled.drop.has(s.id)), newSheet],
      takeoffItems: [...stamped, ...p.takeoffItems.filter((i) => !settled.drop.has(i.sheetId))],
    }));
    setActiveSheetId(newSheet.id);
    setItemsAllSheets(true);
    setDrawingOpen(false);
    setTab("items");
    setNotice(message);
    window.setTimeout(() => setNotice(null), 7000);
  };

  const handleMultipleSheetsCreated = (newSheets: BlueprintSheet[]) => {
    if (newSheets.length === 0) return;
    const settled = settleIncoming(newSheets);
    if (!settled) return;
    pushUndoSnapshot();
    updateActiveProject((p) => ({
      ...p,
      sheets: [...p.sheets.filter((s) => !settled.drop.has(s.id)), ...settled.sheets],
      takeoffItems: p.takeoffItems.filter((i) => !settled.drop.has(i.sheetId)),
    }));
    void readNewSheetsIntoTable(settled.sheets);
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
      description: pin.label,
      category: (pin.category as any) || "أعمال متنوعة أخرى",
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
    setDrawingOpen(false);
    setTab(prj.sheets.length ? "home" : "sheets");
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
      <div className="min-h-screen flex items-center justify-center text-slate-600" style={{ background: "var(--paper)" }} dir="rtl" role="status">
        <div className="flex flex-col items-center gap-4 qto-fade-in">
          <div className="qto-spinner" aria-hidden="true" />
          <span className="text-sm">جارٍ فتح مشاريعك…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen text-slate-900 flex flex-col font-sans" dir="rtl">
      <SideNav
        tab={tab}
        onTab={(t) => {
          setDrawingOpen(false);
          setTab(t);
        }}
        counts={{ sheets: sheets.length, items: takeoffItems.filter((i) => i.reviewStatus !== "rejected").length }}
        projectName={metadata.projectName}
        onProjects={() => setIsProjectsOpen(true)}
      />

      <main key={tab} className="flex-1 w-full md:pr-64 pt-4 pb-28 md:pb-10 qto-view-in print:p-0">
        <div className={`mx-auto w-full px-4 md:px-8 md:pt-4 ${tab === "home" || tab === "sheets" ? "max-w-3xl" : "max-w-3xl md:max-w-6xl"}`}>
          {tab === "home" && (
            <HomeScreen
              metadata={metadata}
              setMetadata={setMetadata}
              sheets={sheets.filter((x) => x.fileName !== "لم يتم رفع ملف بعد")}
              items={takeoffItems}
              onTab={setTab}
              onUpload={() => setIsUploadOpen(true)}
              onQuotation={() => setIsQuotationOpen(true)}
              onExcel={() => exportBoqToExcel(metadata, sheets, takeoffItems, company)}
              onAutoAll={autoTakeoffAll}
              onProjects={() => setIsProjectsOpen(true)}
              onVisualSearch={openVisualSearch}
              onSteelCalc={openSteelCalc}
              onSettings={() => setIsSettingsOpen(true)}
            />
          )}

          {tab === "sheets" && (
            <SheetsScreen
              sheets={sheets.filter((x) => x.fileName !== "لم يتم رفع ملف بعد")}
              items={takeoffItems}
              currencySymbol={metadata.currencySymbol}
              onOpen={(id) => {
                setActiveSheetId(id);
                setDrawingOpen(true);
              }}
              onDelete={handleDeleteSheet}
              onUpload={() => setIsUploadOpen(true)}
              onProjects={() => setIsProjectsOpen(true)}
            />
          )}

          {tab === "items" && (
            <ItemsScreen
              sheets={sheets}
              items={takeoffItems}
              activeSheetId={itemsAllSheets ? "" : currentSheet?.id || ""}
              onSelectSheet={(id) => { if (id) { setActiveSheetId(id); setItemsAllSheets(false); } else setItemsAllSheets(true); }}
              onAnalyze={openAnalyze}
              onAuto={() => autoTakeoffAll(itemsAllSheets ? undefined : currentSheet?.id)}
              onGoSheets={() => setTab("sheets")}
              readMsg={readMsg}
              onExcel={() => exportBoqToExcel(metadata, sheets, takeoffItems, company)}
              onUndo={historyStack.length ? handleUndo : undefined}
            >
              {currentSheet && (
                <TakeoffTable
                  sheet={itemsAllSheets && sheets.length > 1
                    ? { ...currentSheet, code: "الكل", title: metadata.projectName || "كل اللوحات", fileName: `${sheets.length} لوحة` }
                    : currentSheet}
                  combined={itemsAllSheets && sheets.length > 1}
                  items={itemsAllSheets ? takeoffItems : currentSheetItems}
                  onAddItem={handleAddItem}
                  onUpdateItem={handleUpdateItem}
                  onDeleteItem={handleDeleteItem}
                  onDeleteMany={handleDeleteMany}
                  currencySymbol={metadata.currencySymbol}
                  onOpenVisualSearch={openVisualSearch}
                  onOpenExtractionModal={openExtraction}
                  onInspectItemOnSheet={handleInspectItemOnSheet}
                  onImportExcelItems={handleApplyExtractedItems}
                  onUpdateStatus={handleUpdateItemStatus}
                />
              )}
            </ItemsScreen>
          )}

          {tab === "price" && (
            <div className="flex flex-col gap-4">
              <header className="pt-1">
                <h1 className="text-[26px] leading-tight font-extrabold text-slate-900">التسعير</h1>
                <p className="mt-0.5 text-[13px] text-slate-500 font-semibold">أسعار الوحدات والإجماليات وعرض السعر</p>
              </header>
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
            </div>
          )}
        </div>
      </main>

      <BottomNav
        tab={tab}
        onTab={setTab}
        counts={{ sheets: sheets.length, items: takeoffItems.filter((i) => i.reviewStatus !== "rejected").length }}
      />

      {drawingOpen && currentSheet && (
        <DrawingScreen
          sheet={currentSheet}
          sheets={sheets}
          itemCount={currentSheetItems.length}
          onBack={() => setDrawingOpen(false)}
          onSelectSheet={setActiveSheetId}
          onAnalyze={() => setIsAnalyzeOpen(true)}
          onAuto={() => autoTakeoffAll(currentSheet.id)}
          onOpenItems={() => {
            setDrawingOpen(false);
            setTab("items");
          }}
        >
          <BlueprintViewer
            sheet={currentSheet}
            onAddMeasurementPin={handleAddMeasurementPin}
            onRemoveMeasurementPin={handleRemoveMeasurementPin}
            onConvertPinToItem={handleConvertPinToItem}
            onCalibrateSheet={handleCalibrateSheet}
            onOpenVisualSearch={openVisualSearch}
            onOpenExtractionModal={openExtraction}
            onOpenSteelCalc={openSteelCalc}
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
        </DrawingScreen>
      )}

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSheetCreated={handleSheetCreated}
        onMultipleSheetsCreated={handleMultipleSheetsCreated}
        onModelImported={handleModelImported}
        existingItemCount={takeoffItems.length}
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

      {currentSheet && (
        <AnalyzeSheetModal
          isOpen={isAnalyzeOpen}
          onClose={() => setIsAnalyzeOpen(false)}
          sheet={currentSheet}
          existingItemsCount={takeoffItems.length}
          previousCadCount={takeoffItems.filter((it) => it.sheetId === currentSheet.id && (it.extractionSource === "cad_geometry" || it.extractionSource === "pdf_vector")).length}
          onAddItems={handleApplyExtractedItems}
          onOpenAdvanced={openExtraction}
          onOpenAi={() => setIsAiOpen(true)}
        />
      )}

      {currentSheet && (
        <AiTakeoffModal
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
          sheet={currentSheet}
          existingItemsCount={takeoffItems.length}
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

      {notice && (
        <div className="fixed inset-x-3 bottom-24 sm:bottom-6 z-[60] mx-auto max-w-sm rounded-xl bg-slate-900 text-white text-sm font-semibold px-4 py-3 shadow-2xl text-center qto-fade-in print:hidden" role="status">
          {notice}
        </div>
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
      {!drawingOpen && <SaveStatusBar
        notice={storageNotice && `${storageNotice.kind}` !== noticeDismissed ? storageNotice : null}
        onBackup={handleBackupActive}
        onDismiss={() => {
          if (!storageNotice) return;
          setNoticeDismissed(storageNotice.kind);
          try { localStorage.setItem(`qto-snooze-${storageNotice.kind}`, String(Date.now() + 3 * 24 * 3600 * 1000)); } catch { /* ignore */ }
        }}
      />}
      <OfflineIndicator />
    </div>
  );
}
