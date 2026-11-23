import { CompanyProfile, EMPTY_COMPANY_PROFILE, PROJECT_SCHEMA_VERSION, ProjectRecord, BlueprintSheet } from "../types";

/**
 * Local-first storage (IndexedDB).
 *
 * Layout (all in one object store "kv_store"):
 *   meta                          -> { version, ids: string[], activeId }
 *   project:<id>                  -> ProjectRecord with heavy sheet fields stripped
 *   asset:<projectId>:<sheetId>   -> heavy sheet fields (image, parsed DXF, tokens ...)
 *   company_profile_v1            -> CompanyProfile
 *
 * Heavy assets are written only when their reference changed, so editing a quantity or
 * adding a measurement pin no longer re-serialises every drawing of every project.
 */

const DB_NAME = "qto_takeoff_db";
const STORE_NAME = "kv_store";

const KEY_META = "meta";
const KEY_COMPANY = "company_profile_v1";
const LEGACY_LS_PROJECTS = "qto_projects_v4";
const LEGACY_LS_ACTIVE = "qto_active_project_id_v4";

type HeavyKey = "imageUrl" | "dxfData" | "dxfRawSummary" | "visualTokens" | "pdfTextContent" | "pdfVector";
const HEAVY_KEYS: HeavyKey[] = ["imageUrl", "dxfData", "dxfRawSummary", "visualTokens", "pdfTextContent", "pdfVector"];

interface MetaRecord {
  version: number;
  ids: string[];
  activeId: string;
}

export type SaveResult =
  | { status: "ok"; engine: "indexeddb" }
  | { status: "fallback"; engine: "localstorage" }
  | { status: "failed"; error: string; quotaExceeded: boolean };

export interface LoadedProjectsState {
  projects: ProjectRecord[] | null;
  activeProjectId: string | null;
  storageEngine: "indexeddb" | "localstorage";
}

function openDb(name: string = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function idbGetMany<T = unknown>(keys: string[], dbName?: string): Promise<(T | null)[]> {
  const db = dbName ? await openDb(dbName) : await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const out: (T | null)[] = new Array(keys.length).fill(null);
    keys.forEach((k, i) => {
      const req = store.get(k);
      req.onsuccess = () => {
        out[i] = (req.result as T) ?? null;
      };
    });
    tx.oncomplete = () => {
      if (dbName) db.close();
      resolve(out);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbGet<T = unknown>(key: string, dbName?: string): Promise<T | null> {
  return (await idbGetMany<T>([key], dbName))[0];
}

async function idbWriteBatch(puts: [string, unknown][], deletes: string[]): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const [k, v] of puts) store.put(v, k);
    for (const k of deletes) store.delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"));
  });
}

async function idbListKeys(prefix: string): Promise<string[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve((req.result as string[]).filter((k) => typeof k === "string" && k.startsWith(prefix)));
    req.onerror = () => reject(req.error);
  });
}

/* ------------------------------------------------------------------ */
/* Strip / rehydrate                                                   */
/* ------------------------------------------------------------------ */

type AssetBundle = Partial<Pick<BlueprintSheet, HeavyKey>>;

function assetKey(projectId: string, sheetId: string) {
  return `asset:${projectId}:${sheetId}`;
}

function splitSheet(sheet: BlueprintSheet): { light: BlueprintSheet; heavy: AssetBundle } {
  const light: any = { ...sheet };
  const heavy: AssetBundle = {};
  for (const k of HEAVY_KEYS) {
    if (light[k] !== undefined) {
      (heavy as any)[k] = light[k];
      delete light[k];
    }
  }
  return { light, heavy };
}

/** Last successfully written references — used to skip unchanged work. */
const savedProjectRefs = new Map<string, ProjectRecord>();
const savedAssetRefs = new Map<string, AssetBundle>();
let savedMetaSignature = "";

function sameAssets(a: AssetBundle | undefined, b: AssetBundle): boolean {
  if (!a) return false;
  return HEAVY_KEYS.every((k) => (a as any)[k] === (b as any)[k]);
}

/* ------------------------------------------------------------------ */
/* Project validation / migration (used by load and by JSON import)     */
/* ------------------------------------------------------------------ */

export function normalizeProjectRecord(raw: any, forceNewId?: string): ProjectRecord {
  if (!raw || typeof raw !== "object") throw new Error("ملف المشروع غير صالح.");
  if (!raw.metadata || typeof raw.metadata !== "object") throw new Error("ملف المشروع لا يحتوي بيانات المشروع.");
  if (!Array.isArray(raw.sheets) || !Array.isArray(raw.takeoffItems)) {
    throw new Error("ملف المشروع لا يحتوي مخططات أو بنود صالحة.");
  }
  const version = Number(raw.schemaVersion || 1);
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new Error("هذا الملف أُنشئ بإصدار أحدث من التطبيق. حدّث التطبيق أولاً.");
  }

  const md = raw.metadata;
  const metadata = {
    projectName: String(md.projectName ?? "مشروع بدون اسم"),
    projectCode: String(md.projectCode ?? ""),
    clientName: String(md.clientName ?? ""),
    contractorName: String(md.contractorName ?? ""),
    consultantName: String(md.consultantName ?? ""),
    currency: (["SAR", "AED", "USD", "EGP", "QAR", "KWD"].includes(md.currency) ? md.currency : "SAR") as any,
    currencySymbol: String(md.currencySymbol ?? "ر.س"),
    date: String(md.date ?? new Date().toISOString().slice(0, 10)),
    taxRate: Number.isFinite(Number(md.taxRate)) ? Math.max(0, Number(md.taxRate)) : 15,
    notes: md.notes ? String(md.notes) : undefined,
  };

  const sheets: BlueprintSheet[] = raw.sheets
    .filter((s: any) => s && typeof s.id === "string")
    .map((s: any) => ({ ...s, measurementPins: Array.isArray(s.measurementPins) ? s.measurementPins : [] }));
  const sheetIds = new Set(sheets.map((s) => s.id));

  const takeoffItems = raw.takeoffItems
    .filter((i: any) => i && typeof i.id === "string")
    .map((i: any) => {
      const quantity = Number.isFinite(Number(i.quantity)) ? Number(i.quantity) : 0;
      const unitPrice = Number.isFinite(Number(i.unitPrice)) ? Math.max(0, Number(i.unitPrice)) : 0;
      return {
        ...i,
        description: String(i.description ?? ""),
        itemCode: String(i.itemCode ?? ""),
        category: String(i.category ?? "أعمال متنوعة أخرى"),
        unit: String(i.unit ?? "عدد"),
        quantity,
        unitPrice,
        totalPrice: Number((quantity * unitPrice).toFixed(2)),
      };
    })
    // Items pointing at a missing sheet would be invisible in the workspace but still counted in totals.
    .filter((i: any) => sheetIds.has(i.sheetId));

  return {
    id: forceNewId || String(raw.id || `prj-${Date.now()}`),
    metadata,
    sheets,
    takeoffItems,
    updatedAt: new Date().toISOString(),
    schemaVersion: PROJECT_SCHEMA_VERSION,
  };
}

/** Portable backup (everything embedded in one JSON). */
export function serializeProjectForBackup(project: ProjectRecord): string {
  return JSON.stringify({ ...project, schemaVersion: PROJECT_SCHEMA_VERSION, exportedAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/* Load                                                                */
/* ------------------------------------------------------------------ */

async function loadSplitProjects(): Promise<LoadedProjectsState | null> {
  const meta = await idbGet<MetaRecord>(KEY_META);
  if (!meta || !Array.isArray(meta.ids) || meta.ids.length === 0) return null;

  const records = await idbGetMany<ProjectRecord>(meta.ids.map((id) => `project:${id}`));
  const projects: ProjectRecord[] = [];
  for (let i = 0; i < meta.ids.length; i++) {
    const rec = records[i];
    if (!rec) continue;
    const assetKeys = rec.sheets.map((s) => assetKey(rec.id, s.id));
    const assets = await idbGetMany<AssetBundle>(assetKeys);
    const sheets = rec.sheets.map((s, idx) => ({ ...s, ...(assets[idx] || {}) }));
    const full: ProjectRecord = { ...rec, sheets };
    projects.push(full);
    savedProjectRefs.set(full.id, full);
    rec.sheets.forEach((s, idx) => savedAssetRefs.set(assetKey(rec.id, s.id), assets[idx] || {}));
  }
  if (projects.length === 0) return null;
  savedMetaSignature = JSON.stringify(meta);
  return { projects, activeProjectId: meta.activeId, storageEngine: "indexeddb" };
}

/** Pre-v5 builds kept everything in localStorage; carry that forward once. */
async function loadLegacy(): Promise<LoadedProjectsState | null> {
  try {
    const raw = localStorage.getItem(LEGACY_LS_PROJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { projects: parsed, activeProjectId: localStorage.getItem(LEGACY_LS_ACTIVE), storageEngine: "indexeddb" };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function loadProjectsFromStorage(): Promise<LoadedProjectsState> {
  try {
    const split = await loadSplitProjects();
    if (split) return split;
    const legacy = await loadLegacy();
    if (legacy) {
      // Migrate forward; legacy copies are left untouched as a safety net.
      return legacy;
    }
    return { projects: null, activeProjectId: null, storageEngine: "indexeddb" };
  } catch (err) {
    console.warn("IndexedDB unavailable, falling back to localStorage:", err);
    try {
      const raw = localStorage.getItem(LEGACY_LS_PROJECTS);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        projects: Array.isArray(parsed) && parsed.length > 0 ? parsed : null,
        activeProjectId: localStorage.getItem(LEGACY_LS_ACTIVE),
        storageEngine: "localstorage",
      };
    } catch {
      return { projects: null, activeProjectId: null, storageEngine: "localstorage" };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

let saveChain: Promise<unknown> = Promise.resolve();

/**
 * Persist projects. Only changed projects/assets are written, in one atomic transaction.
 * Calls are serialised so a slow write can never overwrite a newer one.
 */
export function saveProjectsToStorage(projects: ProjectRecord[], activeProjectId: string): Promise<SaveResult> {
  const run = async (): Promise<SaveResult> => {
    try {
      const puts: [string, unknown][] = [];
      const deletes: string[] = [];
      const nextProjectRefs = new Map<string, ProjectRecord>();
      const nextAssetRefs = new Map<string, AssetBundle>();

      for (const project of projects) {
        nextProjectRefs.set(project.id, project);
        const unchanged = savedProjectRefs.get(project.id) === project;
        const lightSheets: BlueprintSheet[] = [];
        for (const sheet of project.sheets) {
          const { light, heavy } = splitSheet(sheet);
          lightSheets.push(light);
          const k = assetKey(project.id, sheet.id);
          nextAssetRefs.set(k, heavy);
          if (!sameAssets(savedAssetRefs.get(k), heavy)) puts.push([k, heavy]);
        }
        if (!unchanged) {
          puts.push([`project:${project.id}`, { ...project, sheets: lightSheets, schemaVersion: PROJECT_SCHEMA_VERSION }]);
        }
      }

      for (const id of savedProjectRefs.keys()) {
        if (!nextProjectRefs.has(id)) deletes.push(`project:${id}`);
      }
      for (const k of savedAssetRefs.keys()) {
        if (!nextAssetRefs.has(k)) deletes.push(k);
      }

      const meta: MetaRecord = { version: PROJECT_SCHEMA_VERSION, ids: projects.map((p) => p.id), activeId: activeProjectId };
      const metaSig = JSON.stringify(meta);
      if (metaSig !== savedMetaSignature) puts.push([KEY_META, meta]);

      if (puts.length > 0 || deletes.length > 0) await idbWriteBatch(puts, deletes);

      savedProjectRefs.clear();
      nextProjectRefs.forEach((v, k) => savedProjectRefs.set(k, v));
      savedAssetRefs.clear();
      nextAssetRefs.forEach((v, k) => savedAssetRefs.set(k, v));
      savedMetaSignature = metaSig;
      return { status: "ok", engine: "indexeddb" };
    } catch (err: any) {
      const message = String(err?.message || err || "unknown");
      const quotaExceeded = err?.name === "QuotaExceededError" || /quota/i.test(message);
      console.warn("IndexedDB write failed:", err);
      try {
        localStorage.setItem(LEGACY_LS_PROJECTS, JSON.stringify(projects));
        localStorage.setItem(LEGACY_LS_ACTIVE, activeProjectId);
        return { status: "fallback", engine: "localstorage" };
      } catch {
        return { status: "failed", error: message, quotaExceeded };
      }
    }
  };
  const next = saveChain.then(run, run);
  saveChain = next.catch(() => undefined);
  return next;
}

/* ------------------------------------------------------------------ */
/* Persistence & quota                                                 */
/* ------------------------------------------------------------------ */

/** Ask the browser not to evict our data under storage pressure. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}

export async function getStorageUsage(): Promise<{ usage: number; quota: number; ratio: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, ratio: quota > 0 ? usage / quota : 0 };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Company profile                                                     */
/* ------------------------------------------------------------------ */

export async function loadCompanyProfile(): Promise<CompanyProfile> {
  try {
    const saved = await idbGet<Partial<CompanyProfile>>(KEY_COMPANY);
    return { ...EMPTY_COMPANY_PROFILE, ...(saved || {}) };
  } catch {
    return { ...EMPTY_COMPANY_PROFILE };
  }
}

export async function saveCompanyProfile(profile: CompanyProfile): Promise<boolean> {
  try {
    await idbWriteBatch([[KEY_COMPANY, profile]], []);
    return true;
  } catch (err) {
    console.warn("Company profile save failed:", err);
    return false;
  }
}

/** Housekeeping: remove orphaned assets (e.g. after a crash mid-delete). */
export async function pruneOrphanAssets(projects: ProjectRecord[]): Promise<void> {
  try {
    const valid = new Set<string>();
    projects.forEach((p) => p.sheets.forEach((s) => valid.add(assetKey(p.id, s.id))));
    const keys = await idbListKeys("asset:");
    const orphans = keys.filter((k) => !valid.has(k));
    if (orphans.length) await idbWriteBatch([], orphans);
  } catch {
    /* best effort */
  }
}

/* ------------------------------------------------------------------ */
/* Backup bookkeeping (localStorage; losing it only re-shows a reminder) */
/* ------------------------------------------------------------------ */

const BACKUP_KEY = "qto_last_backup_v1";

function readBackupMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function getLastBackup(projectId: string): number | null {
  const v = readBackupMap()[projectId];
  return typeof v === "number" ? v : null;
}

export function markBackupDone(projectId: string): void {
  try {
    const map = readBackupMap();
    map[projectId] = Date.now();
    localStorage.setItem(BACKUP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
