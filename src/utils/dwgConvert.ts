/**
 * Converts a LibreDWG (libredwg-web) database object into the shape produced by `dxf-parser`,
 * so DWG files go through exactly the same analyzer (`analyzeParsedDxfObject`) as DXF files.
 * Pure and defensive: field aliases are accepted because DWG readers differ slightly in naming.
 */

type P = { x: number; y: number; z?: number };

const num = (v: any, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const pt = (v: any): P | undefined =>
  v && (typeof v.x === "number" || typeof v[0] === "number")
    ? { x: num(v.x ?? v[0]), y: num(v.y ?? v[1]), z: num(v.z ?? v[2]) }
    : undefined;

const layerOf = (e: any): string => String(e?.layer ?? e?.layerName ?? "0");

function toRadiansMaybe(a: number, b: number): [number, number] {
  // Angles from DWG are radians; accept degrees if a value clearly exceeds 2π.
  const big = Math.abs(a) > Math.PI * 2 + 0.01 || Math.abs(b) > Math.PI * 2 + 0.01;
  return big ? [(a * Math.PI) / 180, (b * Math.PI) / 180] : [a, b];
}

export function convertDwgEntity(e: any): any | null {
  if (!e || typeof e !== "object") return null;
  const type = String(e.type ?? e.entityType ?? "").toUpperCase();
  const base: any = { type, layer: layerOf(e), handle: e.handle };
  if (e.inPaperSpace === true || e.isPaperSpace === true) base.inPaperSpace = true;

  switch (type) {
    case "LINE": {
      const a = pt(e.startPoint ?? e.start ?? e.vertices?.[0]);
      const b = pt(e.endPoint ?? e.end ?? e.vertices?.[1]);
      if (!a || !b) return null;
      return { ...base, vertices: [a, b] };
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      const vs = (e.vertices || e.points || [])
        .map((v: any) => {
          const p = pt(v.position ?? v);
          return p ? { x: p.x, y: p.y, bulge: num(v.bulge) } : null;
        })
        .filter(Boolean);
      if (vs.length < 2) return null;
      const closed = Boolean(e.closed ?? e.shape ?? ((num(e.flag ?? e.flags) & 1) === 1));
      return { ...base, type: type === "POLYLINE" ? "POLYLINE" : "LWPOLYLINE", vertices: vs, shape: closed };
    }
    case "CIRCLE": {
      const c = pt(e.center);
      if (!c || !(num(e.radius) > 0)) return null;
      return { ...base, center: c, radius: num(e.radius) };
    }
    case "ARC": {
      const c = pt(e.center);
      if (!c || !(num(e.radius) > 0)) return null;
      const [s, en] = toRadiansMaybe(num(e.startAngle), num(e.endAngle));
      return { ...base, center: c, radius: num(e.radius), startAngle: s, endAngle: en, angleLength: undefined };
    }
    case "ELLIPSE": {
      const c = pt(e.center);
      const m = pt(e.majorAxisEndPoint ?? e.majorAxis);
      if (!c || !m) return null;
      return {
        ...base,
        center: c,
        majorAxisEndPoint: m,
        axisRatio: num(e.axisRatio ?? e.minorToMajorRatio, 1),
        startAngle: num(e.startAngle, 0),
        endAngle: num(e.endAngle, Math.PI * 2),
      };
    }
    case "SPLINE": {
      return {
        ...base,
        controlPoints: (e.controlPoints || []).map(pt).filter(Boolean),
        fitPoints: (e.fitPoints || []).map(pt).filter(Boolean),
        closed: Boolean(e.closed),
      };
    }
    case "TEXT":
    case "MTEXT": {
      const p = pt(e.insertionPoint ?? e.startPoint ?? e.position);
      const text = String(e.text ?? e.string ?? "");
      if (!text) return null;
      return { ...base, text, startPoint: p, position: p };
    }
    case "INSERT": {
      const p = pt(e.insertionPoint ?? e.position);
      if (!e.name || !p) return null;
      return {
        ...base,
        name: String(e.name),
        position: p,
        xScale: num(e.xScale, 1),
        yScale: num(e.yScale, 1),
        rotation: num(e.rotation),
        rowCount: num(e.rowCount, 1) || 1,
        columnCount: num(e.columnCount, 1) || 1,
      };
    }
    case "HATCH": {
      return { ...base, boundaryPaths: e.boundaryPaths ?? e.paths ?? [] };
    }
    default:
      return { ...base };
  }
}

export interface DwgConversionStats {
  total: number;
  converted: number;
  skippedTypes: Record<string, number>;
}

export function dwgDatabaseToDxfObject(db: any): { parsed: any; stats: DwgConversionStats } {
  const stats: DwgConversionStats = { total: 0, converted: 0, skippedTypes: {} };
  const run = (list: any[]): any[] => {
    const out: any[] = [];
    for (const raw of list || []) {
      stats.total++;
      const c = convertDwgEntity(raw);
      if (c) {
        out.push(c);
        stats.converted++;
      } else {
        const t = String(raw?.type ?? "؟");
        stats.skippedTypes[t] = (stats.skippedTypes[t] || 0) + 1;
      }
    }
    return out;
  };

  // layers
  const layers: Record<string, any> = {};
  const layerEntries = db?.tables?.LAYER?.entries ?? db?.tables?.layer?.entries ?? [];
  for (const l of layerEntries) {
    const name = String(l?.name ?? "0");
    const ci = num(l?.colorIndex ?? l?.color, 7);
    layers[name] = {
      name,
      color: ci,
      colorIndex: ci,
      frozen: Boolean(l?.frozen ?? (num(l?.standardFlag) & 1) === 1),
      visible: l?.off === true ? false : true,
    };
  }

  // blocks (skip model/paper space pseudo-blocks)
  const blocks: Record<string, any> = {};
  const brs = db?.tables?.BLOCK_RECORD?.entries ?? [];
  for (const br of brs) {
    const name = String(br?.name ?? "");
    if (!name || /^\*(model_space|paper_space)/i.test(name)) continue;
    blocks[name] = { name, entities: run(br?.entities || []) };
  }

  const entities = run(db?.entities || []);

  const insunits = num(db?.header?.INSUNITS ?? db?.header?.$INSUNITS, 0);
  const parsed = {
    header: { $INSUNITS: insunits },
    tables: { layer: { layers } },
    blocks,
    entities,
  };
  return { parsed, stats };
}
