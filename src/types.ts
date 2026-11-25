export type DisciplineType =
  | "إنشائي"
  | "معماري"
  | "صحي وتغذية"
  | "كهرباء وإنارة"
  | "ميكانيك وتكييف"
  | "تشطيبات وديكور"
  | "أعمال الموقع العام";

export type TradeCategory =
  | "أعمال الحفر والردم والأساسات"
  | "أعمال خرسانية مسلحة وعادية"
  | "أعمال حديد التسليح"
  | "أعمال الهياكل المعدنية والهناجر"
  | "أعمال الساندوتش بانل والكلادينج"
  | "أعمال المباني والبلوك"
  | "أعمال العزل المائي والحراري"
  | "أعمال البياض والتشطيبات الداخلية"
  | "أعمال الأرضيات والرخام والبورسلين"
  | "أعمال الدهانات والديكورات"
  | "أعمال الأبواب والشبابيك والألمنيوم"
  | "أعمال التغذية والصرف الصحي"
  | "أعمال التمديدات الكهربائية والإنارة"
  | "أعمال التكييف والتهوية"
  | "أعمال متنوعة أخرى";

export type ReviewStatus =
  | "draft"
  | "extracted"
  | "needs_review"
  | "reviewed"
  | "approved"
  | "rejected";

export interface AuditEntry {
  timestamp: string;
  action: string;
  by?: string;
  reason?: string;
  previousQty?: number;
  newQty?: number;
  status?: ReviewStatus;
}

export type DimensionType = "volume" | "area" | "linear" | "count";

export interface VisualSearchToken {
  id: string;
  text: string;
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  w: number; // Normalized 0-1
  h: number; // Normalized 0-1
  source: "pdf_text" | "dxf_text" | "dxf_block" | "svg_text";
  layer?: string;
}

export interface TakeoffItem {
  id: string;
  sheetId: string; // Crucial for non-mixing segregation
  sheetCode?: string;
  sheetTitle?: string;
  itemCode: string;
  description: string;
  category: TradeCategory | string;
  dimensionType?: DimensionType; // volume (م³), area (م²), linear (م.ط), count (عدد)
  location: string;
  count: number;
  length?: number;
  width?: number;
  height?: number; // or depth
  formula?: string;
  deduction?: number; // خصم فتحات
  wastagePercent?: number; // نسبة الهالك %
  quantity: number; // الصافي
  unit: string; // م³، م²، م.ط، عدد، طن، كجم، نقطة
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  isVerified?: boolean;
  reviewStatus?: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  lastModifiedReason?: string;
  auditLog?: AuditEntry[];
  extractionSource?: "cad_geometry" | "pdf_vector" | "visual_search" | "manual_pin" | "manual_input" | "excel_import" | "ai_vision" | "structural_model";
  sourceEvidence?: string;
  restoredDeduplicatedId?: string;
  reviewFlags?: string[];
  sourceDetails?: {
    layer?: string;
    blockName?: string;
    entityType?: string;
    pageNumber?: number;
    rawDimensionText?: string;
  };
}

export interface ExtractedCadQuantity {
  id: string;
  type: DimensionType;
  layer: string;
  name: string;
  value: number;
  unit: string;
  formula: string;
  count: number;
  length?: number;
  width?: number;
  height?: number;
  suggestedCategory: TradeCategory | string;
  entityCount: number;
  description: string;
  selected?: boolean;
}

export interface MeasurementPin {
  id: string;
  sheetId: string;
  type: "count" | "length" | "area";
  label: string;
  color: string;
  points: { x: number; y: number }[]; // Normalized coordinates 0-1
  calculatedValue: number;
  unit: string;
  linkedItemId?: string;
  /** BOQ section chosen when the measurement was named. */
  category?: string;
}

export interface SheetCalibration {
  metersPerPixel: number; // Real meters per 1px on the 1000x700 stage
  referenceMeters: number;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  calibratedAt: string;
}

export interface DxfLayerInfo {
  name: string;
  color?: string;
  entityCount: number;
  visible: boolean;
  lineLength?: number;
  areaSum?: number;
  closedPolylinesCount?: number;
  closedPerimeterSum?: number;
  /** Share (0..1) of this layer's line length that has a parallel partner a wall-thickness away (double-line walls). */
  pairedLineFraction?: number;
}

/** Compact result of reading a PDF page's vector drawing (no raw paths, safe to persist). */
export interface PdfVectorGroupSummary {
  id: string;
  label: string;
  layer?: string;
  color: string;
  lineWidthMm: number;
  pathCount: number;
  lengthPt: number;
  closedCount: number;
  areaPt2: number;
  rectCount: number;
  filledCount: number;
  sizeClusters: { wPt: number; hPt: number; count: number }[];
  maxPathPt: number;
  /** Sampled segments [x1,y1,x2,y2,...] normalised 0..1 of the page width (y measured from top), for the visual check. */
  preview?: number[];
}

export interface PdfVectorSummary {
  pageWidthPt: number;
  pageHeightPt: number;
  userUnit: number;
  groups: PdfVectorGroupSummary[];
  excluded: { frame: number; duplicates: number; background: number; hairline: number };
  warnings: string[];
  truncated: boolean;
  textScale?: number;
  /** Best scale found by matching dimension text to drawn lengths. */
  detectedDenominator?: number;
  scaleConfidence: "high" | "medium" | "low";
  scaleMessage: string;
  /** Numeric dimension strings found on the page (for later re-calibration). */
  dimensionNumbers: number[];
}

export interface BlueprintSheet {
  id: string;
  code: string;
  title: string;
  discipline: DisciplineType;
  fileType: "pdf" | "dxf" | "image";
  fileName: string;
  fileSize?: string;
  scale: string;
  imageUrl?: string;
  pdfPageNumber?: number;
  pdfTotalPages?: number;
  pdfTextContent?: string;
  pdfVector?: PdfVectorSummary;
  visualTokens?: VisualSearchToken[];
  dxfLayers?: DxfLayerInfo[];
  dxfRawSummary?: any;
  dxfData?: any;
  calibration?: SheetCalibration;
  status: "new" | "analyzing" | "completed" | "review";
  summary?: string;
  measurementPins: MeasurementPin[];
  createdAt: string;
}

export interface ProjectMetadata {
  projectName: string;
  projectCode: string;
  clientName: string;
  contractorName: string;
  consultantName: string;
  currency: "SAR" | "AED" | "USD" | "EGP" | "QAR" | "KWD";
  currencySymbol: string;
  date: string;
  taxRate: number;
  notes?: string;
  /** Structural assumptions the drawings don't carry, entered once per project (metres). */
  structural?: { storeyHeight?: number; slabThickness?: number };
}

export interface ProjectRecord {
  id: string;
  metadata: ProjectMetadata;
  sheets: BlueprintSheet[];
  takeoffItems: TakeoffItem[];
  updatedAt: string;
  schemaVersion?: number;
}

export const PROJECT_SCHEMA_VERSION = 2;

/** Company profile entered by each user (never hard-coded). Used on quotations & print. */
export interface CompanyProfile {
  name: string;
  nameEn: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  crNumber: string;
  logoDataUrl?: string;
  letterheadDataUrl?: string;
  stampDataUrl?: string;
  signatoryName: string;
  signatoryTitle: string;
  quotationPrefix: string;
  termsText: string;
  termsTextEn: string;
  letterheadTopCm: number;
  letterheadBottomCm: number;
  quotationLanguage: "ar" | "en";
}

export const EMPTY_COMPANY_PROFILE: CompanyProfile = {
  name: "",
  nameEn: "",
  address: "",
  phone: "",
  email: "",
  taxNumber: "",
  crNumber: "",
  signatoryName: "",
  signatoryTitle: "",
  quotationPrefix: "QT",
  termsText: "",
  termsTextEn: "",
  letterheadTopCm: 4,
  letterheadBottomCm: 2,
  quotationLanguage: "ar",
};

export interface LetterheadPrintSettings {
  topMarginCm: number;
  bottomMarginCm: number;
  showTerms: boolean;
  termsText: string;
}

export interface BOQSummaryItem {
  category: string;
  itemCount: number;
  totalCost: number;
  sheetsInvolved: string[];
}
