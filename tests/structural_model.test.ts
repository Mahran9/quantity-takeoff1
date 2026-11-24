import { strict as assert } from "node:assert";
import { readStructuralModel, modelToTakeoffItems } from "../src/utils/csiModel";
import { mainClusterBounds } from "../src/utils/dxfParser";

const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

// ETABS: 2 stories of 3 m, a 6×4 m flat slab 0.2 thick, 4 columns 0.3×0.5, 2 beams 0.3×0.6 of 6 m, one 0.25 wall 4 m long,
// a 1×1 opening on Story1, and a "stiff" patch that must be left out.
const e2k = `$ File x.e2k
$ PROGRAM INFORMATION
  PROGRAM  "ETABS"  VERSION "21.2.0"
$ CONTROLS
  UNITS  "TONF"  "M"  "C"
$ STORIES - IN SEQUENCE FROM TOP
  STORY "Story2"  HEIGHT 3 MASTERSTORY "Yes"
  STORY "Story1"  HEIGHT 3 SIMILARTO "Story2"
  STORY "Base"  ELEV 0
$ MATERIAL PROPERTIES
  MATERIAL  "C30"    TYPE "Concrete"    WEIGHTPERVOLUME 2.4
$ FRAME SECTIONS
  FRAMESECTION  "C30X50"  MATERIAL "C30"  SHAPE "Concrete Rectangular"  D 0.5 B 0.3
  FRAMESECTION  "B30X70"  MATERIAL "C30"  SHAPE "Concrete Rectangular"  D 0.6 B 0.3
$ SLAB PROPERTIES
  SHELLPROP  "S20"  PROPTYPE  "Slab"  MATERIAL "C30"  MODELINGTYPE "ShellThin"  SLABTYPE "Slab"  SLABTHICKNESS 0.2
  SHELLPROP  "STF"  PROPTYPE  "Slab"  MATERIAL "C30"  MODELINGTYPE "ShellThin"  SLABTYPE "Stiff"  SLABTHICKNESS 0.35
$ WALL PROPERTIES
  SHELLPROP  "W25"  PROPTYPE  "Wall"  MATERIAL "C30"  MODELINGTYPE "ShellThin"  WALLTHICKNESS 0.25
$ POINT COORDINATES
  POINT "1"  0 0
  POINT "2"  6 0
  POINT "3"  6 4
  POINT "4"  0 4
  POINT "5"  2 1
  POINT "6"  3 1
  POINT "7"  3 2
  POINT "8"  2 2
$ LINE CONNECTIVITIES
  LINE  "C1"  COLUMN  "1"  "1"  1
  LINE  "C2"  COLUMN  "2"  "2"  1
  LINE  "C3"  COLUMN  "3"  "3"  1
  LINE  "C4"  COLUMN  "4"  "4"  1
  LINE  "B1"  BEAM  "1"  "2"  0
  LINE  "B2"  BEAM  "4"  "3"  0
$ AREA CONNECTIVITIES
  AREA "F1"  FLOOR  4  "1"  "2"  "3"  "4"  0  0  0  0
  AREA "F2"  FLOOR  4  "5"  "6"  "7"  "8"  0  0  0  0
  AREA "F3"  FLOOR  4  "5"  "6"  "7"  "8"  0  0  0  0
  AREA "W1"  PANEL  4  "2"  "3"  "3"  "2"  1  1  0  0
$ LINE ASSIGNS
  LINEASSIGN  "C1"  "Story1"  SECTION "C30X50"
  LINEASSIGN  "C2"  "Story1"  SECTION "C30X50"
  LINEASSIGN  "C3"  "Story1"  SECTION "C30X50"
  LINEASSIGN  "C4"  "Story1"  SECTION "C30X50"
  LINEASSIGN  "B1"  "Story1"  SECTION "B30X70"
  LINEASSIGN  "B2"  "Story1"  SECTION "B30X70"
$ AREA ASSIGNS
  AREAASSIGN  "F1"  "Story1"  SECTION "S20"
  AREAASSIGN  "F2"  "Story1"  SECTION "None"  OPENING "Yes"
  AREAASSIGN  "F3"  "Story2"  SECTION "STF"
  AREAASSIGN  "W1"  "Story1"  SECTION "W25"
$ END OF MODEL FILE
`;

const r = readStructuralModel(e2k);
assert.equal(r.program, "ETABS");
const get = (g: string, story = "Story1") => r.items.find((i) => i.group === g && i.story === story)!;
// columns: 4 × 0.3×0.5 × (3 − 0.2)
near(get("columns").volume, Math.round(4 * 0.15 * 2.8 * 1000) / 1000, "columns");
assert.equal(get("columns").count, 4);
// beams below slab: 2 × 0.3 × (0.6 − 0.2) × 6
near(get("beams").volume, Math.round(2 * 0.3 * 0.4 * 6 * 1000) / 1000, "beams");
// slab 24 m² minus 1 m² opening × 0.2
near(get("slabs").area!, 23, "slab area");
near(get("slabs").volume, 4.6, "slab volume");
// wall 4 m × 2.8 × 0.25
near(get("walls").volume, 2.8, "wall");
// stiff → review, kept out of the table
assert.ok(get("other", "Story2").review, "stiff flagged");
assert.ok(r.warnings.some((w) => /B30X70/.test(w) && /0\.3×0\.6/.test(w)), "name/size mismatch warned");

const { items, skipped } = modelToTakeoffItems(r, { id: "s1", code: "ETABS-01", title: "t" }, 0);
assert.equal(items.length, 4);
assert.equal(skipped.length, 1);
assert.ok(items.every((i) => i.unit === "م³" && i.extractionSource === "structural_model" && i.quantity > 0));

// SAFE: two footings 2×2 and 3×1 m, 0.6 thick, with a continued line.
const sf = `File x.$sf was saved
TABLE:  "PROGRAM CONTROL"
   ProgramName=SAFE   Version=21.1.0   CurrUnits="tonf, m, C"

TABLE:  "SLAB PROPERTY DEFINITIONS"
   Name=FT   "Modeling Type"=Shell-Thick   "Property Type"=Footing   Material=C40   "Slab Thickness"=0.6   "f11 Modifier"=1 _
        "m22 Modifier"=1   Color=Magenta

TABLE:  "POINT OBJECT CONNECTIVITY"
   UniqueName=1   X=0   Y=0   Z=0
   UniqueName=2   X=2   Y=0   Z=0
   UniqueName=3   X=2   Y=2   Z=0
   UniqueName=4   X=0   Y=2   Z=0
   UniqueName=5   X=10   Y=0   Z=0
   UniqueName=6   X=13   Y=0   Z=0
   UniqueName=7   X=13   Y=1   Z=0
   UniqueName=8   X=10   Y=1   Z=0

TABLE:  "FLOOR OBJECT CONNECTIVITY"
   "Unique Name"=1   UniquePt1=1   UniquePt2=2   UniquePt3=3   UniquePt4=4
   "Unique Name"=2   UniquePt1=5   UniquePt2=6   UniquePt3=7   UniquePt4=8

TABLE:  "AREA ASSIGNMENTS - SECTION PROPERTIES"
   UniqueName=1   "Section Property"=FT   "Property Type"=Slab
   UniqueName=2   "Section Property"=FT   "Property Type"=Slab
`;
const s = readStructuralModel(sf);
assert.equal(s.program, "SAFE");
assert.equal(s.items.length, 1);
assert.equal(s.items[0].group, "footings");
near(s.items[0].area!, 7, "footing area");
near(s.items[0].volume, 4.2, "footing volume");
// blinding: each footing grown 0.1 m all round → (2.2×2.2 + π·0.01 − 0.04·... ) ≈ A + P·0.1 + π·0.01
near(s.blinding!.area, Math.round((4 + 8 * 0.1 + Math.PI * 0.01 + 3 + 8 * 0.1 + Math.PI * 0.01) * 100) / 100, "blinding area");
const sfItems = modelToTakeoffItems(s, { id: "s2", code: "SAFE-01", title: "f" }, 0).items;
const bl = sfItems.find((i) => /نظافة/.test(i.description))!;
assert.equal(bl.reviewStatus, "needs_review", "blinding is an assumption → review");
assert.equal(bl.quantity, Math.round(s.blinding!.area * 0.1 * 1000) / 1000);

// Quotation merges the same work across floors into one line; the price edit reaches every merged row.
import { buildQuotation } from "../src/utils/quotation";
const qt = buildQuotation([...items, ...items.map((i) => ({ ...i, id: i.id + "-b", location: "Story2" }))], 15);
const cols = qt.sections[0].rows.find((r) => /أعمدة/.test(r.description))!;
assert.equal(cols.ids.length, 2);
near(cols.quantity, Math.round(2 * get("columns").volume * 100) / 100, "merged qty");

assert.throws(() => readStructuralModel("hello"), /ETABS/);

// Stray objects far from the drawing do not stretch the view.
const ents: any[] = [];
for (let i = 0; i < 200; i++) ents.push({ type: "LINE", vertices: [{ x: -5000 + i, y: -113000 }, { x: -5000 + i, y: -112950 }] });
for (let i = 0; i < 5; i++) ents.push({ type: "LINE", vertices: [{ x: i, y: 0 }, { x: i + 1, y: 0 }] });
const m = mainClusterBounds(ents, { minX: -5000, minY: -113000, maxX: 6, maxY: 0 });
assert.equal(m.stray, 5);
assert.ok(m.bounds.maxY <= -112950 && m.bounds.minX === -5000, JSON.stringify(m.bounds));
// "M-Cold Water Supply" is plumbing, not columns; "colum2" and "S-COL" are columns.
{
  const { analyzeParsedDxfObject, extractEngineeringQuantitiesFromDxf } = await import("../src/utils/dxfParser");
  const sq = (layer: string, x: number) => ({ type: "LWPOLYLINE", layer, shape: true, vertices: [{ x, y: 0 }, { x: x + 0.3, y: 0 }, { x: x + 0.3, y: 0.3 }, { x, y: 0.3 }] });
  const ents = ["M-Cold Water Supply", "colum2", "S-COL"].flatMap((l, k) => [sq(l, k * 10), sq(l, k * 10 + 2), sq(l, k * 10 + 4)]);
  const p = analyzeParsedDxfObject({ header: { $INSUNITS: 6 }, tables: { layer: { layers: {} } }, blocks: {}, entities: ents } as any);
  const q: any[] = extractEngineeringQuantitiesFromDxf(p as any, {} as any) as any;
  const colCounts = q.filter((i) => /عدد الأعمدة/.test(i.description)).map((i) => i.layer).sort();
  assert.deepEqual(colCounts, ["S-COL", "colum2"].sort(), JSON.stringify(colCounts));
}
// PDF layer names: same word rule as DXF.
{
  const { suggestRole } = await import("../src/utils/pdfPlan");
  const g = (layer?: string): any => ({ id: "g", label: "لون #000000", layer, color: "000000", lineWidthMm: 0.25, pathCount: 10, lengthPt: 1000, closedCount: 0, areaPt2: 0, rectCount: 0, filledCount: 0, sizeClusters: [], maxPathPt: 100 });
  const hint = (l?: string) => suggestRole(g(l), 100).hint;
  assert.ok(/أعمدة/.test(hint("S-COL")) && /أعمدة/.test(hint("COLUMNS")) && /أعمدة/.test(hint("col2")), "column layers");
  assert.ok(!/أعمدة/.test(hint("M-Cold Water")) && !/أعمدة/.test(hint("COLOR FILL")), "cold/color are not columns");
  assert.ok(!/اسم الطبقة/.test(hint(undefined)), "no layer → geometry rules, not name rules");
}
console.log("structural_model ok");
