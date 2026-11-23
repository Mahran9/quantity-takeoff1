import { ProjectMetadata } from "../types";

/** A new project starts completely empty: no demo drawings, no demo items. */
export const initialProjectMetadata: ProjectMetadata = {
  projectName: "مشروع جديد",
  projectCode: "",
  clientName: "",
  contractorName: "",
  consultantName: "",
  currency: "SAR",
  currencySymbol: "ر.س",
  date: new Date().toISOString().slice(0, 10),
  taxRate: 15,
  notes: "",
};

/** Only used by the legacy built-in demo sheets, which no longer exist. Kept so older imports resolve. */
export const sampleDrawingsSvg: Record<string, string> = {};

/** Ids of the demo sheets shipped before v6.2 (removed from saved projects on load). */
export const LEGACY_DEMO_SHEET_IDS = ["sheet-s01", "sheet-a01", "sheet-s02", "sheet-m01"];
