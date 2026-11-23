import { strict as assert } from "node:assert";
import { dwgDatabaseToDxfObject } from "../src/utils/dwgConvert";
import { analyzeParsedDxfObject } from "../src/utils/dxfParser";

// Fake libredwg-web style database: 10x6 m closed room + 2 m wall line + circle r=1 (units: metres)
const db = {
  header: { INSUNITS: 6 },
  tables: {
    LAYER: { entries: [{ name: "WALLS", colorIndex: 1 }, { name: "COL", colorIndex: 3 }] },
    BLOCK_RECORD: { entries: [{ name: "*Model_Space", entities: [] }, { name: "DOOR", entities: [] }] },
  },
  entities: [
    {
      type: "LWPOLYLINE",
      layer: "WALLS",
      flag: 1,
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }],
    },
    { type: "LINE", layer: "WALLS", startPoint: { x: 20, y: 0, z: 0 }, endPoint: { x: 22, y: 0, z: 0 } },
    { type: "CIRCLE", layer: "COL", center: { x: 5, y: 3, z: 0 }, radius: 1 },
    { type: "INSERT", layer: "COL", name: "DOOR", insertionPoint: { x: 1, y: 1, z: 0 } },
    { type: "WIPEOUT", layer: "COL" },
  ],
};

const { parsed, stats } = dwgDatabaseToDxfObject(db);
assert.equal(parsed.entities.length, 5);
assert.equal(stats.total, 5);
assert.ok(parsed.blocks["DOOR"] && !parsed.blocks["*Model_Space"]);

const res: any = analyzeParsedDxfObject(parsed);
const walls = res.layers.find((l: any) => l.name === "WALLS");
const col = res.layers.find((l: any) => l.name === "COL");
assert.ok(walls && col);
// closed polyline -> area 60 (counted as a closed shape); open line -> 2 m
assert.equal(walls.closedPolylinesCount, 1);
assert.ok(Math.abs(walls.lineLength - 2) < 1e-6, "wall length " + walls.lineLength);
assert.ok(Math.abs(walls.areaSum - 60) < 1e-6, "wall area " + walls.areaSum);
assert.ok(Math.abs(col.areaSum - Math.PI) < 1e-6, "circle area " + col.areaSum);

// degrees fallback for ARC
const { parsed: p2 } = dwgDatabaseToDxfObject({ entities: [{ type: "ARC", layer: "A", center: { x: 0, y: 0 }, radius: 1, startAngle: 0, endAngle: 180 }] });
assert.ok(Math.abs(p2.entities[0].endAngle - Math.PI) < 1e-9);
console.log("   dwg_convert ok");
