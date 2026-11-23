import { BlueprintSheet, TakeoffItem, ProjectMetadata } from "../types";

export const initialProjectMetadata: ProjectMetadata = {
  projectName: "مشروع تجريبي — فيلا سكنية (يمكن حذفه)",
  projectCode: "DEMO-01",
  clientName: "العميل (مثال)",
  contractorName: "",
  consultantName: "",
  currency: "SAR",
  currencySymbol: "ر.س",
  date: "2026-09-16",
  taxRate: 15,
  notes: "تم إعداد الحصر الهندسي بدقة متناهية وفقاً لمخططات التصميم المعتمدة مع الالتزام بالعزل الكامل لكميات كل لوحة.",
};

// Vector SVG Drawings for the blueprints to enable high-clarity zooming & interactive takeoff
export const sampleDrawingsSvg: Record<string, string> = {
  "sheet-s01": `<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg" class="w-full h-full select-none bg-slate-900 text-slate-100 font-mono">
    <!-- Grid & Background -->
    <defs>
      <pattern id="grid-s01" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="1000" height="700" fill="#0f172a" />
    <rect width="1000" height="700" fill="url(#grid-s01)" />

    <!-- Drawing Title Block (الخرطوشة) -->
    <rect x="740" y="520" width="240" height="160" fill="#1e293b" stroke="#38bdf8" stroke-width="2" rx="4" />
    <text x="860" y="550" fill="#38bdf8" font-size="14" font-weight="bold" text-anchor="middle">مخطط القواعد والأساسات</text>
    <text x="860" y="575" fill="#94a3b8" font-size="11" text-anchor="middle">اللوحة: S-01 | مقياس 1:100</text>
    <text x="860" y="600" fill="#e2e8f0" font-size="11" text-anchor="middle">المشروع: فيلا النرجس السكنية</text>
    <text x="860" y="625" fill="#34d399" font-size="11" text-anchor="middle">التخصص: إنشائي - خرسانة مسلحة</text>
    <text x="860" y="655" fill="#f59e0b" font-size="10" text-anchor="middle">معتمد للتنفيذ والتسعير</text>

    <!-- Axes / المحاور -->
    <!-- Vertical Axes 1, 2, 3, 4 -->
    <line x1="180" y1="60" x2="180" y2="500" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="8 4" />
    <circle cx="180" cy="45" r="16" fill="#ef4444" />
    <text x="180" y="50" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">1</text>

    <line x1="360" y1="60" x2="360" y2="500" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="8 4" />
    <circle cx="360" cy="45" r="16" fill="#ef4444" />
    <text x="360" y="50" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">2</text>

    <line x1="540" y1="60" x2="540" y2="500" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="8 4" />
    <circle cx="540" cy="45" r="16" fill="#ef4444" />
    <text x="540" y="50" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">3</text>

    <line x1="720" y1="60" x2="720" y2="500" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="8 4" />
    <circle cx="720" cy="45" r="16" fill="#ef4444" />
    <text x="720" y="50" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">4</text>

    <!-- Horizontal Axes A, B, C -->
    <line x1="120" y1="130" x2="780" y2="130" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="8 4" />
    <circle cx="95" cy="130" r="16" fill="#3b82f6" />
    <text x="95" y="135" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">A</text>

    <line x1="120" y1="280" x2="780" y2="280" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="8 4" />
    <circle cx="95" cy="280" r="16" fill="#3b82f6" />
    <text x="95" y="285" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">B</text>

    <line x1="120" y1="430" x2="780" y2="430" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="8 4" />
    <circle cx="95" cy="430" r="16" fill="#3b82f6" />
    <text x="95" y="435" fill="#ffffff" font-size="13" font-weight="bold" text-anchor="middle">C</text>

    <!-- Plain Concrete Blinding (فرشة النظافة عادية) -->
    <!-- Tie Beams / الميدات الرابطة -->
    <rect x="180" y="122" width="540" height="16" fill="#475569" stroke="#64748b" opacity="0.6" />
    <rect x="180" y="272" width="540" height="16" fill="#475569" stroke="#64748b" opacity="0.6" />
    <rect x="180" y="422" width="540" height="16" fill="#475569" stroke="#64748b" opacity="0.6" />
    <rect x="172" y="130" width="16" height="300" fill="#475569" stroke="#64748b" opacity="0.6" />
    <rect x="352" y="130" width="16" height="300" fill="#475569" stroke="#64748b" opacity="0.6" />
    <rect x="532" y="130" width="16" height="300" fill="#475569" stroke="#64748b" opacity="0.6" />
    <rect x="712" y="130" width="16" height="300" fill="#475569" stroke="#64748b" opacity="0.6" />

    <!-- Footings ق1 (2.2m x 2.0m) & Columns C1 (0.6 x 0.25) -->
    <!-- Footing 1 (A-1) -->
    <rect x="135" y="90" width="90" height="80" fill="#0284c7" stroke="#38bdf8" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="170" y="120" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="180" y="105" fill="#bae6fd" font-size="10" text-anchor="middle">ق1 (2.2×2.0)</text>

    <!-- Footing 2 (A-2) -->
    <rect x="315" y="90" width="90" height="80" fill="#0284c7" stroke="#38bdf8" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="350" y="120" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="360" y="105" fill="#bae6fd" font-size="10" text-anchor="middle">ق1 (2.2×2.0)</text>

    <!-- Footing 3 (A-3) -->
    <rect x="495" y="90" width="90" height="80" fill="#0284c7" stroke="#38bdf8" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="530" y="120" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="540" y="105" fill="#bae6fd" font-size="10" text-anchor="middle">ق1 (2.2×2.0)</text>

    <!-- Footing 4 (A-4) -->
    <rect x="675" y="90" width="90" height="80" fill="#0284c7" stroke="#38bdf8" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="710" y="120" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="720" y="105" fill="#bae6fd" font-size="10" text-anchor="middle">ق1 (2.2×2.0)</text>

    <!-- Row B Footings ق2 (2.6m x 2.4m) -->
    <!-- Footing 5 (B-1) -->
    <rect x="130" y="235" width="100" height="90" fill="#0d9488" stroke="#2dd4bf" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="170" y="270" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="180" y="250" fill="#99f6e4" font-size="10" text-anchor="middle">ق2 (2.6×2.4)</text>

    <!-- Footing 6 (B-2) Combined / مشتركة -->
    <rect x="305" y="230" width="110" height="100" fill="#e11d48" stroke="#fb7185" stroke-width="2" rx="2" fill-opacity="0.3" />
    <rect x="350" y="270" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="360" y="250" fill="#fecdd3" font-size="10" text-anchor="middle">ق.مشتركة</text>

    <!-- Footing 7 (B-3) -->
    <rect x="490" y="235" width="100" height="90" fill="#0d9488" stroke="#2dd4bf" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="530" y="270" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="540" y="250" fill="#99f6e4" font-size="10" text-anchor="middle">ق2 (2.6×2.4)</text>

    <!-- Footing 8 (B-4) -->
    <rect x="670" y="235" width="100" height="90" fill="#0d9488" stroke="#2dd4bf" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="710" y="270" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="720" y="250" fill="#99f6e4" font-size="10" text-anchor="middle">ق2 (2.6×2.4)</text>

    <!-- Row C Footings -->
    <rect x="135" y="390" width="90" height="80" fill="#0284c7" stroke="#38bdf8" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="170" y="420" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="180" y="405" fill="#bae6fd" font-size="10" text-anchor="middle">ق1 (2.2×2.0)</text>

    <rect x="315" y="390" width="90" height="80" fill="#0284c7" stroke="#38bdf8" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="350" y="420" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="360" y="405" fill="#bae6fd" font-size="10" text-anchor="middle">ق1 (2.2×2.0)</text>

    <rect x="495" y="390" width="90" height="80" fill="#0284c7" stroke="#38bdf8" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="530" y="420" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="540" y="405" fill="#bae6fd" font-size="10" text-anchor="middle">ق1 (2.2×2.0)</text>

    <rect x="675" y="390" width="90" height="80" fill="#0284c7" stroke="#38bdf8" stroke-width="2" rx="2" fill-opacity="0.25" />
    <rect x="710" y="420" width="20" height="20" fill="#f87171" stroke="#ffffff" stroke-width="1" />
    <text x="720" y="405" fill="#bae6fd" font-size="10" text-anchor="middle">ق1 (2.2×2.0)</text>

    <!-- Dimension labels -->
    <text x="270" y="27" fill="#fbbf24" font-size="12" text-anchor="middle">&lt;-- 4.50 m --&gt;</text>
    <text x="450" y="27" fill="#fbbf24" font-size="12" text-anchor="middle">&lt;-- 4.50 m --&gt;</text>
    <text x="630" y="27" fill="#fbbf24" font-size="12" text-anchor="middle">&lt;-- 4.50 m --&gt;</text>

    <text x="65" y="210" fill="#fbbf24" font-size="12" text-anchor="middle">5.00 m</text>
    <text x="65" y="360" fill="#fbbf24" font-size="12" text-anchor="middle">5.00 m</text>

    <!-- Legend -->
    <rect x="140" y="520" width="360" height="150" fill="#1e293b" stroke="#475569" rx="4" />
    <text x="155" y="545" fill="#f8fafc" font-size="12" font-weight="bold">دليل مصطلحات اللوحة S-01:</text>
    <rect x="155" y="560" width="16" height="16" fill="#0284c7" />
    <text x="180" y="573" fill="#cbd5e1" font-size="11">ق1: قواعد منفصلة (2.2×2.0×0.60 م) - عدد 8</text>
    <rect x="155" y="585" width="16" height="16" fill="#0d9488" />
    <text x="180" y="598" fill="#cbd5e1" font-size="11">ق2: قواعد وسطية (2.6×2.4×0.60 م) - عدد 3</text>
    <rect x="155" y="610" width="16" height="16" fill="#e11d48" />
    <text x="180" y="623" fill="#cbd5e1" font-size="11">ق.مشتركة: قاعدة مزدوجة (4.2×2.2×0.70 م) - عدد 1</text>
    <line x1="155" y1="642" x2="175" y2="642" stroke="#64748b" stroke-width="4" />
    <text x="180" y="646" fill="#cbd5e1" font-size="11">م1، م2: ميد رابطة أرضية (0.25×0.60 م)</text>
  </svg>`,

  "sheet-a01": `<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg" class="w-full h-full select-none bg-slate-900 text-slate-100 font-mono">
    <!-- Grid & Background -->
    <defs>
      <pattern id="grid-a01" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="1000" height="700" fill="#0b1329" />
    <rect width="1000" height="700" fill="url(#grid-a01)" />

    <!-- Drawing Title Block (الخرطوشة) -->
    <rect x="740" y="520" width="240" height="160" fill="#1e293b" stroke="#10b981" stroke-width="2" rx="4" />
    <text x="860" y="550" fill="#10b981" font-size="14" font-weight="bold" text-anchor="middle">المسقط الأفقي - الدور الأرضي</text>
    <text x="860" y="575" fill="#94a3b8" font-size="11" text-anchor="middle">اللوحة: A-01 | مقياس 1:50</text>
    <text x="860" y="600" fill="#e2e8f0" font-size="11" text-anchor="middle">المشروع: فيلا النرجس السكنية</text>
    <text x="860" y="625" fill="#38bdf8" font-size="11" text-anchor="middle">التخصص: معماري وتكسيات</text>
    <text x="860" y="655" fill="#fbbf24" font-size="10" text-anchor="middle">اعتماد نهائي للأعمال المعمارية</text>

    <!-- Outer Building Walls (سماكة 25 سم عازل) -->
    <rect x="140" y="100" width="600" height="400" fill="none" stroke="#f1f5f9" stroke-width="12" />

    <!-- Interior Partition Walls (سماكة 15 سم و 20 سم) -->
    <!-- Living Room & Majlis Wall -->
    <line x1="440" y1="100" x2="440" y2="350" stroke="#f1f5f9" stroke-width="8" />
    <!-- Kitchen & Bath Wall -->
    <line x1="440" y1="350" x2="740" y2="350" stroke="#f1f5f9" stroke-width="8" />
    <line x1="580" y1="350" x2="580" y2="500" stroke="#f1f5f9" stroke-width="8" />

    <!-- Rooms Shading & Labels -->
    <!-- Majlis مجلس الرجال -->
    <rect x="146" y="106" width="288" height="240" fill="#38bdf8" fill-opacity="0.08" />
    <text x="290" y="210" fill="#38bdf8" font-size="16" font-weight="bold" text-anchor="middle">مجلس الرجال الضيوف</text>
    <text x="290" y="235" fill="#94a3b8" font-size="12" text-anchor="middle">6.50 × 5.00 م (32.50 م²)</text>
    <text x="290" y="255" fill="#f59e0b" font-size="11" text-anchor="middle">أرضيات رخام ترافنتينو</text>

    <!-- Family Living صالة المعيشة العائلية -->
    <rect x="146" y="352" width="288" height="142" fill="#a855f7" fill-opacity="0.08" />
    <text x="290" y="420" fill="#c084fc" font-size="16" font-weight="bold" text-anchor="middle">صالة المعيشة والطعام</text>
    <text x="290" y="445" fill="#94a3b8" font-size="12" text-anchor="middle">6.50 × 3.50 م (22.75 م²)</text>

    <!-- Kitchen المطبخ الرئيسي -->
    <rect x="446" y="106" width="288" height="238" fill="#f97316" fill-opacity="0.08" />
    <text x="590" y="210" fill="#fb923c" font-size="16" font-weight="bold" text-anchor="middle">المطبخ الرئيسي</text>
    <text x="590" y="235" fill="#94a3b8" font-size="12" text-anchor="middle">5.50 × 4.50 م (24.75 م²)</text>
    <text x="590" y="255" fill="#f59e0b" font-size="11" text-anchor="middle">سيراميك جدران كامل للسقف</text>

    <!-- Master Suite جناح النوم الأرضي -->
    <rect x="446" y="356" width="128" height="138" fill="#10b981" fill-opacity="0.08" />
    <text x="510" y="420" fill="#34d399" font-size="13" font-weight="bold" text-anchor="middle">غرفة نوم</text>
    <text x="510" y="440" fill="#94a3b8" font-size="11" text-anchor="middle">16.5 م²</text>

    <!-- Bathrooms دورات المياه -->
    <rect x="586" y="356" width="148" height="138" fill="#06b6d4" fill-opacity="0.08" />
    <text x="660" y="420" fill="#22d3ee" font-size="13" font-weight="bold" text-anchor="middle">دورة مياه ومغاسل</text>
    <text x="660" y="440" fill="#94a3b8" font-size="11" text-anchor="middle">عزل مائي مدمج</text>

    <!-- Doors (D1, D2, D3) with Swing Arcs -->
    <!-- Entrance Door D1 (1.8m double leaf) -->
    <rect x="250" y="494" width="80" height="12" fill="#0f172a" />
    <path d="M 250 500 A 40 40 0 0 1 290 460" stroke="#f43f5e" stroke-width="2" fill="none" stroke-dasharray="3 3" />
    <line x1="250" y1="500" x2="250" y2="460" stroke="#f43f5e" stroke-width="3" />
    <text x="290" y="525" fill="#f43f5e" font-size="11" font-weight="bold">باب مدخل رئيسي D1 (1.8×2.3)</text>

    <!-- Interior Doors -->
    <rect x="434" y="220" width="12" height="50" fill="#0f172a" />
    <text x="420" y="250" fill="#fb7185" font-size="10">D2 (1.0×2.2)</text>

    <rect x="574" y="400" width="12" height="45" fill="#0f172a" />
    <text x="560" y="390" fill="#fb7185" font-size="10">D3 (0.9×2.2)</text>

    <!-- Windows (W1, W2, W3) -->
    <!-- Window W1 in Majlis -->
    <line x1="220" y1="94" x2="360" y2="94" stroke="#38bdf8" stroke-width="8" />
    <line x1="220" y1="106" x2="360" y2="106" stroke="#38bdf8" stroke-width="8" />
    <text x="290" y="80" fill="#38bdf8" font-size="11" font-weight="bold" text-anchor="middle">شباك W1 (2.0×1.50)</text>

    <!-- Window W2 in Kitchen -->
    <line x1="520" y1="94" x2="660" y2="94" stroke="#38bdf8" stroke-width="8" />
    <text x="590" y="80" fill="#38bdf8" font-size="11" font-weight="bold" text-anchor="middle">شباك W2 (1.8×1.20)</text>

    <!-- Legend & Schedule of Finishes -->
    <rect x="140" y="520" width="460" height="150" fill="#1e293b" stroke="#475569" rx="4" />
    <text x="155" y="545" fill="#f8fafc" font-size="12" font-weight="bold">جدول تشطيبات اللوحة المعمارية A-01:</text>
    <text x="155" y="570" fill="#cbd5e1" font-size="11">• مباني حوائط خارجية: بلوك أسمنتي مفرغ 20 سم معزول صوف صخري</text>
    <text x="155" y="590" fill="#cbd5e1" font-size="11">• مباني قواطع داخلية: بلوك أسمنتي 15 سم و 20 سم</text>
    <text x="155" y="610" fill="#cbd5e1" font-size="11">• بياض محارة أسمنتية داخلية (أوجه حوائط وأسقف) مع دهان بريمر و3 أوجه بلاستيك</text>
    <text x="155" y="630" fill="#cbd5e1" font-size="11">• أرضيات: رخام ترافنتينو بالاستقبال + بورسلين نخب أول للغرف والممرات</text>
    <text x="155" y="650" fill="#cbd5e1" font-size="11">• خصم فتحات الأبواب والشبابيك محسوب وموثق بالكامل</text>
  </svg>`,

  "sheet-s02": `<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg" class="w-full h-full select-none bg-slate-900 text-slate-100 font-mono">
    <defs>
      <pattern id="grid-s02" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="1000" height="700" fill="#0f172a" />
    <rect width="1000" height="700" fill="url(#grid-s02)" />

    <!-- Drawing Title Block -->
    <rect x="740" y="520" width="240" height="160" fill="#1e293b" stroke="#eab308" stroke-width="2" rx="4" />
    <text x="860" y="550" fill="#eab308" font-size="14" font-weight="bold" text-anchor="middle">تسليح بلاطة سقف الأرضي</text>
    <text x="860" y="575" fill="#94a3b8" font-size="11" text-anchor="middle">اللوحة: S-02 | مقياس 1:100</text>
    <text x="860" y="600" fill="#e2e8f0" font-size="11" text-anchor="middle">المشروع: فيلا النرجس السكنية</text>
    <text x="860" y="625" fill="#38bdf8" font-size="11" text-anchor="middle">التخصص: إنشائي - أسقف وكمرات</text>
    <text x="860" y="655" fill="#10b981" font-size="10" text-anchor="middle">سمك البلاطة Ts = 16 cm</text>

    <!-- Slab Slab Boundary -->
    <rect x="150" y="100" width="580" height="380" fill="#334155" fill-opacity="0.3" stroke="#94a3b8" stroke-width="3" />

    <!-- Drop Beams ك1, ك2, ك3 -->
    <rect x="150" y="100" width="580" height="20" fill="#475569" stroke="#cbd5e1" />
    <text x="440" y="115" fill="#ffffff" font-size="11" text-anchor="middle">كمرة ك1 (0.25×0.60 م)</text>

    <rect x="150" y="280" width="580" height="20" fill="#475569" stroke="#cbd5e1" />
    <text x="440" y="295" fill="#ffffff" font-size="11" text-anchor="middle">كمرة رئيسية ك2 (0.30×0.70 م)</text>

    <rect x="150" y="460" width="580" height="20" fill="#475569" stroke="#cbd5e1" />
    <text x="440" y="475" fill="#ffffff" font-size="11" text-anchor="middle">كمرة ك1 (0.25×0.60 م)</text>

    <!-- Columns Locations -->
    <rect x="160" y="102" width="16" height="16" fill="#f43f5e" />
    <rect x="432" y="102" width="16" height="16" fill="#f43f5e" />
    <rect x="704" y="102" width="16" height="16" fill="#f43f5e" />

    <rect x="160" y="282" width="16" height="16" fill="#f43f5e" />
    <rect x="432" y="282" width="16" height="16" fill="#f43f5e" />
    <rect x="704" y="282" width="16" height="16" fill="#f43f5e" />

    <!-- Rebar mesh representation -->
    <line x1="180" y1="180" x2="380" y2="180" stroke="#f59e0b" stroke-width="2" />
    <path d="M 180 170 L 180 190 M 380 170 L 380 190" stroke="#f59e0b" stroke-width="2" />
    <text x="280" y="165" fill="#f59e0b" font-size="11" text-anchor="middle">تسليح سفلي: 6 فاي 12 مم / م.ط</text>

    <line x1="280" y1="130" x2="280" y2="250" stroke="#f59e0b" stroke-width="2" />
    <text x="300" y="220" fill="#f59e0b" font-size="11">رقة علوية: 5 فاي 10 مم</text>

    <!-- Cantilever / كابولي المدخل -->
    <rect x="350" y="480" width="180" height="60" fill="#3b82f6" fill-opacity="0.2" stroke="#60a5fa" stroke-dasharray="4 4" />
    <text x="440" y="515" fill="#93c5fd" font-size="11" text-anchor="middle">كابولي المدخل (سماكة 18 سم)</text>
  </svg>`,

  "sheet-m01": `<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg" class="w-full h-full select-none bg-slate-900 text-slate-100 font-mono">
    <defs>
      <pattern id="grid-m01" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="1000" height="700" fill="#081528" />
    <rect width="1000" height="700" fill="url(#grid-m01)" />

    <!-- Drawing Title Block -->
    <rect x="740" y="520" width="240" height="160" fill="#1e293b" stroke="#06b6d4" stroke-width="2" rx="4" />
    <text x="860" y="550" fill="#06b6d4" font-size="14" font-weight="bold" text-anchor="middle">مخطط شبكة الصرف والتغذية</text>
    <text x="860" y="575" fill="#94a3b8" font-size="11" text-anchor="middle">اللوحة: M-01 | مقياس 1:100</text>
    <text x="860" y="600" fill="#e2e8f0" font-size="11" text-anchor="middle">المشروع: فيلا النرجس السكنية</text>
    <text x="860" y="625" fill="#34d399" font-size="11" text-anchor="middle">التخصص: صحي وميكانيك (MEP)</text>
    <text x="860" y="655" fill="#38bdf8" font-size="10" text-anchor="middle">مواصفات كود السباكة السعودي</text>

    <!-- Building Outline -->
    <rect x="160" y="120" width="540" height="360" fill="none" stroke="#334155" stroke-width="4" />

    <!-- Drainage Lines (خط الصرف الرئيسي 4 بوصة UPVC) -->
    <polyline points="200,200 200,440 640,440 640,580" fill="none" stroke="#f97316" stroke-width="5" />
    <text x="360" y="430" fill="#fb923c" font-size="12" font-weight="bold">خط صرف رئيسي 4" UPVC كلاس 5</text>

    <!-- Inspection Chambers / Manholes غرف تفتيش -->
    <rect x="180" y="180" width="40" height="40" fill="#ea580c" stroke="#ffffff" stroke-width="2" />
    <text x="200" y="205" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">MH-1</text>

    <rect x="180" y="420" width="40" height="40" fill="#ea580c" stroke="#ffffff" stroke-width="2" />
    <text x="200" y="445" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">MH-2</text>

    <rect x="620" y="420" width="40" height="40" fill="#ea580c" stroke="#ffffff" stroke-width="2" />
    <text x="640" y="445" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">MH-3</text>

    <circle cx="640" cy="580" r="24" fill="#c2410c" stroke="#ffffff" stroke-width="2" />
    <text x="640" y="585" fill="#ffffff" font-size="9" text-anchor="middle">المطابق العمومية</text>

    <!-- Water Supply PPR lines (خط تغذية مياه خضراء) -->
    <polyline points="280,140 280,360 520,360" fill="none" stroke="#10b981" stroke-width="4" stroke-dasharray="6 3" />
    <text x="380" y="350" fill="#34d399" font-size="11" font-weight="bold">خط تغذية مياه باردة PPR 1"</text>

    <!-- Fixture Points -->
    <circle cx="280" cy="140" r="10" fill="#38bdf8" />
    <text x="300" y="145" fill="#7dd3fc" font-size="11">مغاسل ضيوف</text>

    <circle cx="520" cy="360" r="10" fill="#38bdf8" />
    <text x="540" y="365" fill="#7dd3fc" font-size="11">مطبخ وحوض غسيل</text>
  </svg>`,
};

export const sampleSheets: BlueprintSheet[] = [
  {
    id: "sheet-s01",
    code: "S-01",
    title: "مخطط القواعد والأساسات والميد المسلحة",
    discipline: "إنشائي",
    fileType: "pdf",
    fileName: "Villa_Structural_Foundations_S01.pdf",
    fileSize: "4.8 MB",
    scale: "1:100",
    status: "completed",
    summary:
      "تم حصر كميات الأساسات بالكامل: خرسانة نظافة عادية 10 سم، خرسانة مسلحة للقواعد المنفصلة والمشتركة والميدات الرابطة، وحديد التسليح بالأوزان، ودهان العزل البيتوميني.",
    measurementPins: [
      {
        id: "pin-1",
        sheetId: "sheet-s01",
        type: "area",
        label: "فرشة النظافة العادية",
        color: "#38bdf8",
        points: [
          { x: 0.12, y: 0.1 },
          { x: 0.78, y: 0.1 },
          { x: 0.78, y: 0.68 },
          { x: 0.12, y: 0.68 },
        ],
        calculatedValue: 240,
        unit: "م²",
      },
      {
        id: "pin-2",
        sheetId: "sheet-s01",
        type: "count",
        label: "قواعد ق1 منفصلة",
        color: "#0284c7",
        points: [
          { x: 0.18, y: 0.19 },
          { x: 0.36, y: 0.19 },
          { x: 0.54, y: 0.19 },
          { x: 0.72, y: 0.19 },
          { x: 0.18, y: 0.61 },
          { x: 0.36, y: 0.61 },
          { x: 0.54, y: 0.61 },
          { x: 0.72, y: 0.61 },
        ],
        calculatedValue: 8,
        unit: "عدد",
      },
    ],
    createdAt: "2026-09-16T10:00:00Z",
  },
  {
    id: "sheet-a01",
    code: "A-01",
    title: "المسقط الأفقي المعماري والتشطيبات - الدور الأرضي",
    discipline: "معماري",
    fileType: "pdf",
    fileName: "Villa_Architectural_GroundFloor_A01.pdf",
    fileSize: "6.2 MB",
    scale: "1:50",
    status: "completed",
    summary:
      "حصر معماري شامل: مباني بلوك أسمنتي 20 سم خارجي و 15 سم داخلي، أعمال بياض المحارة مع خصم فتحات الأبواب والشبابيك، أرضيات البورسلين والرخام، وأعمال الأبواب والشبابيك بالأعداد.",
    measurementPins: [
      {
        id: "pin-3",
        sheetId: "sheet-a01",
        type: "area",
        label: "أرضية مجلس الضيوف",
        color: "#10b981",
        points: [
          { x: 0.15, y: 0.15 },
          { x: 0.43, y: 0.15 },
          { x: 0.43, y: 0.49 },
          { x: 0.15, y: 0.49 },
        ],
        calculatedValue: 32.5,
        unit: "م²",
      },
    ],
    createdAt: "2026-09-16T10:15:00Z",
  },
  {
    id: "sheet-s02",
    code: "S-02",
    title: "مخطط تسليح بلاطة سقف الأرضي والكمرات الساقطة",
    discipline: "إنشائي",
    fileType: "dxf",
    fileName: "Villa_FirstSlab_Reinforcement_S02.dxf",
    fileSize: "2.1 MB",
    scale: "1:100",
    status: "completed",
    summary:
      "حصر خرسانة بلاطة السقف المصمتة سُمك 16 سم، خرسانة الكمرات الساقطة ك1 و ك2، مع حصر أطنان حديد التسليح عالي المقاومة فاي 10 و 12 و 16 مم.",
    measurementPins: [],
    dxfLayers: [
      { name: "SLAB_CONCRETE", color: "#38bdf8", entityCount: 24, visible: true },
      { name: "BEAMS_DROP", color: "#f59e0b", entityCount: 18, visible: true },
      { name: "REBAR_BOTTOM", color: "#10b981", entityCount: 96, visible: true },
      { name: "COLUMNS", color: "#ef4444", entityCount: 12, visible: true },
      { name: "DIMENSIONS", color: "#94a3b8", entityCount: 42, visible: true },
    ],
    createdAt: "2026-09-16T11:00:00Z",
  },
  {
    id: "sheet-m01",
    code: "M-01",
    title: "مخطط شبكة الصرف الصحي والتغذية بالمياه (MEP)",
    discipline: "صحي وتغذية",
    fileType: "pdf",
    fileName: "Villa_Plumbing_Drainage_M01.pdf",
    fileSize: "3.5 MB",
    scale: "1:100",
    status: "completed",
    summary:
      "حصر شبكة الصرف الصحي الخارجية والداخلية: مواسير UPVC مقاس 4 بوصة و 3 بوصة، غرف تفتيش مع أغطية دكتايل، مواسير تغذية مياه خضراء PPR، وجوالي تفتيش.",
    measurementPins: [],
    createdAt: "2026-09-16T11:30:00Z",
  },
];

// Segregated Takeoff Items strictly separated by sheetId
export const sampleTakeoffItems: TakeoffItem[] = [
  // -------------------------------------------------------------
  // Sheet S-01: أساسات وقواعد وميدات (إنشائي)
  // -------------------------------------------------------------
  {
    id: "item-s01-1",
    sheetId: "sheet-s01",
    sheetCode: "S-01",
    itemCode: "01.01",
    description: "حفر في جميع أنواع التربة للأساسات والقواعد حتى منسوب التأسيس المطلوب طبقاً لتقرير فحص التربة والمخططات",
    category: "أعمال الحفر والردم والأساسات",
    location: "الموقع العام للأساسات - محاور A-C و 1-4",
    count: 1,
    length: 22.0,
    width: 14.0,
    height: 1.8,
    formula: "1 × 22.00 × 14.00 × 1.80",
    deduction: 0,
    quantity: 554.4,
    unit: "م³",
    unitPrice: 28,
    totalPrice: 15523.2,
    notes: "شامل نقل نواتج الحفر للمقالب العمومية المعتمدة والتسوية",
    isVerified: true,
  },
  {
    id: "item-s01-2",
    sheetId: "sheet-s01",
    sheetCode: "S-01",
    itemCode: "01.02",
    description: "خرسانة عادية (فرشة نظافة) سُمك 10 سم أسفل جميع القواعد المسلحة والميدات بمحتوى 250 كجم أسمنت مقاوم",
    category: "أعمال خرسانية مسلحة وعادية",
    location: "أسفل كافة القواعد والميدات - لوحة S-01",
    count: 1,
    length: 20.0,
    width: 12.0,
    height: 0.1,
    formula: "1 × 20.00 × 12.00 × 0.10",
    deduction: 0,
    quantity: 24.0,
    unit: "م³",
    unitPrice: 240,
    totalPrice: 5760.0,
    notes: "صب خرسانة عادية مدموكة جيداً لضبط مناسيب القواعد",
    isVerified: true,
  },
  {
    id: "item-s01-3",
    sheetId: "sheet-s01",
    sheetCode: "S-01",
    itemCode: "01.03",
    description: "خرسانة مسلحة عيار 350 كجم/م³ للقواعد المنفصلة ق1 (أبعاد 2.20 × 2.00 × 0.60 م)",
    category: "أعمال خرسانية مسلحة وعادية",
    location: "قواعد منفصلة ق1 بالأركان والمحيط (عدد 8 قواعد)",
    count: 8,
    length: 2.2,
    width: 2.0,
    height: 0.6,
    formula: "8 × 2.20 × 2.00 × 0.60",
    deduction: 0,
    quantity: 21.12,
    unit: "م³",
    unitPrice: 380,
    totalPrice: 8025.6,
    notes: "أسمنت بورتلاندي مقاوم للأملاح والكبريتات SRC",
    isVerified: true,
  },
  {
    id: "item-s01-4",
    sheetId: "sheet-s01",
    sheetCode: "S-01",
    itemCode: "01.04",
    description: "خرسانة مسلحة للقواعد الوسطية ق2 (أبعاد 2.60 × 2.40 × 0.60 م) عيار 350 كجم",
    category: "أعمال خرسانية مسلحة وعادية",
    location: "محاور داخلية B-1, B-3, B-4 (عدد 3 قواعد)",
    count: 3,
    length: 2.6,
    width: 2.4,
    height: 0.6,
    formula: "3 × 2.60 × 2.40 × 0.60",
    deduction: 0,
    quantity: 11.23,
    unit: "م³",
    unitPrice: 380,
    totalPrice: 4267.4,
    notes: "خرسانة جاهزة معالجة بالمياه لمدة 7 أيام",
    isVerified: true,
  },
  {
    id: "item-s01-5",
    sheetId: "sheet-s01",
    sheetCode: "S-01",
    itemCode: "01.05",
    description: "خرسانة مسلحة للقاعدة المزدوجة المشتركة (4.20 × 2.20 × 0.70 م) بمحور B-2",
    category: "أعمال خرسانية مسلحة وعادية",
    location: "محور B-2 قاعدة مشتركة لعمودين",
    count: 1,
    length: 4.2,
    width: 2.2,
    height: 0.7,
    formula: "1 × 4.20 × 2.20 × 0.70",
    deduction: 0,
    quantity: 6.47,
    unit: "م³",
    unitPrice: 390,
    totalPrice: 2523.3,
    notes: "تسليح سفلي وعلوي مزدوج",
    isVerified: true,
  },
  {
    id: "item-s01-6",
    sheetId: "sheet-s01",
    sheetCode: "S-01",
    itemCode: "01.06",
    description: "خرسانة مسلحة للميدات الرابطة الأرضية م1 و م2 مقاس (0.25 × 0.60 م)",
    category: "أعمال خرسانية مسلحة وعادية",
    location: "كامل شبكة الميدات الرابطة بين القواعد",
    count: 1,
    length: 126.0,
    width: 0.25,
    height: 0.6,
    formula: "1 × 126.00 × 0.25 × 0.60",
    deduction: 0,
    quantity: 18.9,
    unit: "م³",
    unitPrice: 380,
    totalPrice: 7182.0,
    notes: "ميدات مشدودة عند منسوب ظهر القواعد",
    isVerified: true,
  },
  {
    id: "item-s01-7",
    sheetId: "sheet-s01",
    sheetCode: "S-01",
    itemCode: "01.07",
    description: "حديد تسليح عالي المقاومة مشوه (High Tensile Rebar) إجهاد 4200 كجم/سم² لقواعد وميدات لوحة S-01",
    category: "أعمال حديد التسليح",
    location: "قواعد وميدات وأشاير أعمدة لوحة S-01",
    count: 1,
    length: 0,
    width: 0,
    height: 0,
    formula: "معدل 110 كجم/م³ خرسانة مسلحة × 57.72 م³",
    deduction: 0,
    quantity: 6.35,
    unit: "طن",
    unitPrice: 3100,
    totalPrice: 19685.0,
    notes: "أقطار 12 مم، 14 مم، 16 مم مع أسلاك الربط والكانات 8 مم",
    isVerified: true,
  },
  {
    id: "item-s01-8",
    sheetId: "sheet-s01",
    sheetCode: "S-01",
    itemCode: "01.08",
    description: "عزل مائي دهان بيتومين مطاطي عازل على البارد وجهين متعامدين لجميع أسطح القواعد والميدات الملامسة للتربة",
    category: "أعمال العزل المائي والحراري",
    location: "رقاب الأعمدة والقواعد والميدات السفلية",
    count: 1,
    length: 0,
    width: 0,
    height: 0,
    formula: "محيط الأسطح الملامسة = 320 م²",
    deduction: 0,
    quantity: 320.0,
    unit: "م²",
    unitPrice: 18,
    totalPrice: 5760.0,
    notes: "دهان بعد تنظيف الأسطح الخرسانية وإزالة الزوائد",
    isVerified: true,
  },

  // -------------------------------------------------------------
  // Sheet A-01: معماري وتشطيبات الدور الأرضي (معماري)
  // -------------------------------------------------------------
  {
    id: "item-a01-1",
    sheetId: "sheet-a01",
    sheetCode: "A-01",
    itemCode: "02.01",
    description: "أعمال مباني حوائط خارجية من البلوك الأسمنتي المعزول سُمك 20 سم بالصوف الصخري ومونة أسمنتية مقاومة",
    category: "أعمال المباني والبلوك",
    location: "المحيط الخارجي للدور الأرضي - لوحة A-01",
    count: 1,
    length: 58.0,
    width: 0.2,
    height: 3.4,
    formula: "1 × 58.00 × 3.40 - خصم فتحات (22.5 م²)",
    deduction: 22.5,
    quantity: 174.7,
    unit: "م²",
    unitPrice: 75,
    totalPrice: 13102.5,
    notes: "تم خصم فتحات شبابيك W1 و W2 وباب المدخل الرئيسي D1",
    isVerified: true,
  },
  {
    id: "item-a01-2",
    sheetId: "sheet-a01",
    sheetCode: "A-01",
    itemCode: "02.02",
    description: "أعمال مباني قواطع داخلية من البلوك الأسمنتي المفرغ سُمك 15 سم و 20 سم بين الغرف والصالات",
    category: "أعمال المباني والبلوك",
    location: "قواطع المجلس والصالة والمطبخ ودورات المياه",
    count: 1,
    length: 46.0,
    width: 0.15,
    height: 3.4,
    formula: "1 × 46.00 × 3.40 - خصم أبواب داخلية (14.2 م²)",
    deduction: 14.2,
    quantity: 142.2,
    unit: "م²",
    unitPrice: 55,
    totalPrice: 7821.0,
    notes: "تم خصم فتحات أبواب الغرف والمطبخ والحمام",
    isVerified: true,
  },
  {
    id: "item-a01-3",
    sheetId: "sheet-a01",
    sheetCode: "A-01",
    itemCode: "02.03",
    description: "بياض محارة أسمنتية داخلية (طرطشة مسمارية + بؤج وأوتار + بطانة وضهارة) لكافة حوائط الغرف والصالات",
    category: "أعمال البياض والتشطيبات الداخلية",
    location: "الحوائط الداخلية للدور الأرضي",
    count: 2,
    length: 92.0,
    width: 0,
    height: 3.4,
    formula: "2 وجه × 92.00 × 3.40 - خصم فتحات (36.7 م²)",
    deduction: 36.7,
    quantity: 588.9,
    unit: "م²",
    unitPrice: 22,
    totalPrice: 12955.8,
    notes: "استخدام زوايا وشبك فيبر جلاس عند فواصل الخرسانة والمباني",
    isVerified: true,
  },
  {
    id: "item-a01-4",
    sheetId: "sheet-a01",
    sheetCode: "A-01",
    itemCode: "02.04",
    description: "توريد وتركيب أرضيات رخام ترافنتينو / كرارة طبيعي نخب أول سُمك 2 سم شامل الجلي والتلميع",
    category: "أعمال الأرضيات والرخام والبورسلين",
    location: "مجلس الرجال ومدخل الضيوف والموزع الرئيسي",
    count: 1,
    length: 6.5,
    width: 5.0,
    height: 0,
    formula: "مجلس (32.50 م²) + مدخل (14.20 م²)",
    deduction: 0,
    quantity: 46.7,
    unit: "م²",
    unitPrice: 220,
    totalPrice: 10274.0,
    notes: "شامل طبقة الدفان الرملي النظيف والوزرة بارتفاع 10 سم",
    isVerified: true,
  },
  {
    id: "item-a01-5",
    sheetId: "sheet-a01",
    sheetCode: "A-01",
    itemCode: "02.05",
    description: "توريد وتركيب أرضيات بورسلين إسباني نخب أول مقاس 60×60 سم مقاوم للانزلاق",
    category: "أعمال الأرضيات والرخام والبورسلين",
    location: "صالة المعيشة وغرفة النوم والمطبخ",
    count: 1,
    length: 0,
    width: 0,
    height: 0,
    formula: "صالة (22.75) + نوم (16.50) + مطبخ (24.75)",
    deduction: 0,
    quantity: 64.0,
    unit: "م²",
    unitPrice: 95,
    totalPrice: 6080.0,
    notes: "شامل الغراء والفواصل والترويبة الإيبوكسية",
    isVerified: true,
  },
  {
    id: "item-a01-6",
    sheetId: "sheet-a01",
    sheetCode: "A-01",
    itemCode: "02.06",
    description: "توريد وتركيب باب المدخل الرئيسي D1 من الألمنيوم الحراري مع زجاج سيكوريت مزدوج دبل جلاس (1.80 × 2.30 م)",
    category: "أعمال الأبواب والشبابيك والألمنيوم",
    location: "المدخل الرئيسي للفيلا - لوحة A-01",
    count: 1,
    length: 1.8,
    width: 0,
    height: 2.3,
    formula: "1 باب فردتين كامل بالمفصلات والمقابض الذكية",
    deduction: 0,
    quantity: 1,
    unit: "عدد",
    unitPrice: 4200,
    totalPrice: 4200.0,
    notes: "مقاوم للحرارة وعازل للصوت مع كالون ذكي",
    isVerified: true,
  },
  {
    id: "item-a01-7",
    sheetId: "sheet-a01",
    sheetCode: "A-01",
    itemCode: "02.07",
    description: "توريد وتركيب أبواب خشب قشرة جوز طبيعي WPC مقاومة للرطوبة للغرف والمكاتب (1.00 × 2.20 م)",
    category: "أعمال الأبواب والشبابيك والألمنيوم",
    location: "أبواب الغرف الداخلية نموذج D2",
    count: 4,
    length: 1.0,
    width: 0,
    height: 2.2,
    formula: "4 أبواب كاملة بالحلوق والبرور والكوالين",
    deduction: 0,
    quantity: 4,
    unit: "عدد",
    unitPrice: 950,
    totalPrice: 3800.0,
    notes: "شامل الكوالين والمفصلات الإيطالية استانلس",
    isVerified: true,
  },
  {
    id: "item-a01-8",
    sheetId: "sheet-a01",
    sheetCode: "A-01",
    itemCode: "02.08",
    description: "توريد وتركيب شبابيك ألمنيوم مقطع قطاع خاص مع زجاج دبل جلاس عازل للصوت والحرارة نموذج W1 و W2",
    category: "أعمال الأبواب والشبابيك والألمنيوم",
    location: "شبابيك الواجهات الخارجية للدور الأرضي",
    count: 6,
    length: 2.0,
    width: 0,
    height: 1.5,
    formula: "4 شبابيك W1 (2.0×1.5) + 2 شبابيك W2 (1.8×1.2)",
    deduction: 0,
    quantity: 16.32,
    unit: "م²",
    unitPrice: 550,
    totalPrice: 8976.0,
    notes: "شامل الشبك المانع للحشرات وسيليكون التثبيت المقاوم للطقس",
    isVerified: true,
  },

  // -------------------------------------------------------------
  // Sheet S-02: سقف الأرضي والكمرات الساقطة (إنشائي)
  // -------------------------------------------------------------
  {
    id: "item-s02-1",
    sheetId: "sheet-s02",
    sheetCode: "S-02",
    itemCode: "03.01",
    description: "خرسانة مسلحة عيار 350 كجم/م³ لبلاطة سقف الدور الأرضي المصمتة سُمك 16 سم مع الكوابيل",
    category: "أعمال خرسانية مسلحة وعادية",
    location: "كامل مسطح سقف الدور الأرضي وكابولي المدخل",
    count: 1,
    length: 20.0,
    width: 12.0,
    height: 0.16,
    formula: "1 × 20.00 × 12.00 × 0.16 + كابولي (1.8×4.0×0.18)",
    deduction: 0,
    quantity: 39.7,
    unit: "م³",
    unitPrice: 390,
    totalPrice: 15483.0,
    notes: "خرسانة مضخة مضاف إليها مائع ومقلل للمياه",
    isVerified: true,
  },
  {
    id: "item-s02-2",
    sheetId: "sheet-s02",
    sheetCode: "S-02",
    itemCode: "03.02",
    description: "خرسانة مسلحة للكمرات الساقطة ك1 (0.25 × 0.60 م) والكمرات الرئيسية ك2 (0.30 × 0.70 م)",
    category: "أعمال خرسانية مسلحة وعادية",
    location: "كمرات سقف الأرضي المتقاطعة بين الأعمدة",
    count: 1,
    length: 98.0,
    width: 0.25,
    height: 0.44, // سقوط أسفل البلاطة 60 - 16 = 44 سم
    formula: "1 × 98.00 × 0.25 × 0.44 (صافي سقوط أسفل البلاطة)",
    deduction: 0,
    quantity: 10.78,
    unit: "م³",
    unitPrice: 390,
    totalPrice: 4204.2,
    notes: "محسوب بالصافي دون ازدواج لحجم البلاطة",
    isVerified: true,
  },
  {
    id: "item-s02-3",
    sheetId: "sheet-s02",
    sheetCode: "S-02",
    itemCode: "03.03",
    description: "حديد تسليح عالي المقاومة لبلاطة السقف والكمرات الساقطة لوحة S-02 بالأقطار 10 و 12 و 16 مم",
    category: "أعمال حديد التسليح",
    location: "تسليح رقة سفلية وعلوية وكمرات لوحة S-02",
    count: 1,
    length: 0,
    width: 0,
    height: 0,
    formula: "معدل 125 كجم/م³ × (39.70 + 10.78 م³ خرسانة)",
    deduction: 0,
    quantity: 6.31,
    unit: "طن",
    unitPrice: 3100,
    totalPrice: 19561.0,
    notes: "شامل حديد تسليح الكوابيل والكانات المفتوحة والمغلقة",
    isVerified: true,
  },

  // -------------------------------------------------------------
  // Sheet M-01: شبكة الصرف والتغذية MEP (صحي وميكانيك)
  // -------------------------------------------------------------
  {
    id: "item-m01-1",
    sheetId: "sheet-m01",
    sheetCode: "M-01",
    itemCode: "04.01",
    description: "توريد وتركيب مواسير صرف صحي UPVC كلاس 5 مقاس 4 بوصة للمسارات الرئيسية والمدفونة مع التركيبات",
    category: "أعمال التغذية والصرف الصحي",
    location: "خط الصرف الرئيسي الخارجي حول المبنى - لوحة M-01",
    count: 1,
    length: 48.0,
    width: 0,
    height: 0,
    formula: "أطوال المسار بين المطابق MH-1 و MH-2 و MH-3",
    deduction: 0,
    quantity: 48.0,
    unit: "م.ط",
    unitPrice: 65,
    totalPrice: 3120.0,
    notes: "شامل حفر الخندق والفرشة الرملية واختبار المياه بضغط 1.5 بار",
    isVerified: true,
  },
  {
    id: "item-m01-2",
    sheetId: "sheet-m01",
    sheetCode: "M-01",
    itemCode: "04.02",
    description: "إنشاء غرف تفتيش خرسانية مسلحة معزولة مقاس 60×60 سم مع أغطية حديد دكتايل مانعة للروائح حمولة 25 طن",
    category: "أعمال التغذية والصرف الصحي",
    location: "غرف تفتيش خارجية MH-1 و MH-2 و MH-3",
    count: 3,
    length: 0.6,
    width: 0.6,
    height: 0.8,
    formula: "3 غرف تفتيش كاملة بالخرسانة والمجاري والمصائد",
    deduction: 0,
    quantity: 3,
    unit: "عدد",
    unitPrice: 850,
    totalPrice: 2550.0,
    notes: "دهان إيبوكسي داخلي مقاوم للغازات الكبريتية",
    isVerified: true,
  },
  {
    id: "item-m01-3",
    sheetId: "sheet-m01",
    sheetCode: "M-01",
    itemCode: "04.03",
    description: "توريد وتركيب شبكة مواسير تغذية مياه خضراء بولي بروبلين PPR قطر 1 بوصة و 3/4 بوصة للحمامات والمطبخ",
    category: "أعمال التغذية والصرف الصحي",
    location: "تغذية المياه الصاعدة والفرعية للدور الأرضي",
    count: 1,
    length: 62.0,
    width: 0,
    height: 0,
    formula: "خطوط التغذية الرئيسية والفرعية باللوحة",
    deduction: 0,
    quantity: 62.0,
    unit: "م.ط",
    unitPrice: 42,
    totalPrice: 2604.0,
    notes: "شامل اللحام الحراري والعزل الحراري للخطوط الساخنة واختبار الضغط",
    isVerified: true,
  },
];
