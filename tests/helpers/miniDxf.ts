/**
 * miniDxf — TEST-ONLY minimal ASCII DXF reader.
 *
 * It APPROXIMATES the object shape produced by the real `dxf-parser` package
 * (header.$INSUNITS, tables.layer.layers, entities, blocks, ...) so that the full
 * decode → analyze → extract → audit chain can be tested where the npm package cannot be installed.
 *
 * It is NOT a substitute for the real parser: `scripts/verify-dxf.ts` (which uses the real
 * `dxf-parser`) is authoritative. Known divergences:
 *   - HATCH: only polyline-type boundary paths (group 72 = 1/2 "has bulge/closed" form) are read into
 *     `boundaryPaths[].vertices`; edge-type paths (lines/arcs/ellipses) are read as polylines of their
 *     start points only, and circle paths via {center, radius}. The real parser may expose edge paths differently.
 *   - Colours: `color` is a plain ACI index here (real parser converts to RGB int); `colorIndex` is the ACI.
 *   - Rare group codes, extended data, OBJECTS section, viewports and layouts are ignored.
 *   - ELLIPSE/SPLINE field names follow what `src/utils/dxfParser.ts` reads (axisRatio, majorAxisEndPoint,
 *     degreeOfSplineCurve, knotValues, controlPoints, fitPoints).
 */

type Pair = [number, string];

const DEG = Math.PI / 180;

function pairsOf(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) { i -= 1; continue; } // resync on stray line
    out.push([code, lines[i + 1].replace(/\s+$/, "")]);
  }
  return out;
}

function splitRecords(pairs: Pair[]): Pair[][] {
  const recs: Pair[][] = [];
  let cur: Pair[] | null = null;
  for (const p of pairs) {
    if (p[0] === 0) { cur = [p]; recs.push(cur); } else if (cur) cur.push(p);
  }
  return recs;
}

function buildEntity(rec: Pair[], vertexRecs: Pair[][]): any {
  const type = rec[0][1].trim();
  const e: any = { type, layer: "0" };
  const num = (v: string) => parseFloat(v);
  let lastVertex: any = null;
  let lastFit: any = null;
  let lastCtrl: any = null;
  // HATCH state
  let hatchPath: any = null;
  let hatchPathKind: "poly" | "edge" | null = null;
  let hatchRemaining = 0;
  let hatchEdgeType = 0;

  for (const [code, raw] of rec.slice(1)) {
    const v = raw.trim();
    if (code === 8) { e.layer = raw; continue; }
    if (code === 67 && v === "1") { e.inPaperSpace = true; continue; }

    switch (type) {
      case "LINE":
        e.vertices ??= [{ x: 0, y: 0 }, { x: 0, y: 0 }];
        if (code === 10) e.vertices[0].x = num(v);
        else if (code === 20) e.vertices[0].y = num(v);
        else if (code === 11) e.vertices[1].x = num(v);
        else if (code === 21) e.vertices[1].y = num(v);
        break;
      case "LWPOLYLINE":
        e.vertices ??= [];
        if (code === 70) e.shape = (Number(v) & 1) === 1;
        else if (code === 10) { lastVertex = { x: num(v), y: 0 }; e.vertices.push(lastVertex); }
        else if (code === 20 && lastVertex) lastVertex.y = num(v);
        else if (code === 42 && lastVertex) lastVertex.bulge = num(v);
        break;
      case "POLYLINE":
        if (code === 70) { e.shape = (Number(v) & 1) === 1; e.flags = Number(v); }
        break;
      case "CIRCLE":
      case "ARC":
        e.center ??= { x: 0, y: 0 };
        if (code === 10) e.center.x = num(v);
        else if (code === 20) e.center.y = num(v);
        else if (code === 40) e.radius = num(v);
        else if (code === 50) e.startAngle = num(v) * DEG;
        else if (code === 51) e.endAngle = num(v) * DEG;
        break;
      case "ELLIPSE":
        e.center ??= { x: 0, y: 0 };
        e.majorAxisEndPoint ??= { x: 0, y: 0 };
        if (code === 10) e.center.x = num(v);
        else if (code === 20) e.center.y = num(v);
        else if (code === 11) e.majorAxisEndPoint.x = num(v);
        else if (code === 21) e.majorAxisEndPoint.y = num(v);
        else if (code === 40) e.axisRatio = num(v);
        else if (code === 41) e.startAngle = num(v);
        else if (code === 42) e.endAngle = num(v);
        break;
      case "SPLINE":
        e.controlPoints ??= [];
        e.fitPoints ??= [];
        e.knotValues ??= [];
        if (code === 71) e.degreeOfSplineCurve = Number(v);
        else if (code === 40) e.knotValues.push(num(v));
        else if (code === 10) { lastCtrl = { x: num(v), y: 0 }; e.controlPoints.push(lastCtrl); }
        else if (code === 20 && lastCtrl) lastCtrl.y = num(v);
        else if (code === 11) { lastFit = { x: num(v), y: 0 }; e.fitPoints.push(lastFit); }
        else if (code === 21 && lastFit) lastFit.y = num(v);
        break;
      case "INSERT":
        e.position ??= { x: 0, y: 0 };
        if (code === 2) e.name = raw;
        else if (code === 10) e.position.x = num(v);
        else if (code === 20) e.position.y = num(v);
        else if (code === 41) e.xScale = num(v);
        else if (code === 42) e.yScale = num(v);
        else if (code === 50) e.rotation = num(v);
        else if (code === 70) e.columnCount = Number(v);
        else if (code === 71) e.rowCount = Number(v);
        break;
      case "TEXT":
      case "MTEXT":
        if (code === 1 || code === 3) e.text = (e.text || "") + raw;
        else if (code === 10) (e.startPoint ??= { x: 0, y: 0 }).x = num(v);
        else if (code === 20) (e.startPoint ??= { x: 0, y: 0 }).y = num(v);
        break;
      case "DIMENSION":
        if (code === 1) e.text = raw;
        else if (code === 42) e.actualMeasurement = num(v);
        break;
      case "HATCH":
        e.boundaryPaths ??= [];
        if (code === 92) {
          hatchPath = { vertices: [] as any[] };
          hatchPathKind = (Number(v) & 2) === 2 ? "poly" : "edge";
          e.boundaryPaths.push(hatchPath);
          hatchRemaining = 0;
        } else if (hatchPath && hatchPathKind === "poly") {
          if (code === 93) hatchRemaining = Number(v);
          else if (code === 10) hatchPath.vertices.push({ x: num(v), y: 0 });
          else if (code === 20) hatchPath.vertices[hatchPath.vertices.length - 1].y = num(v);
          else if (code === 42) hatchPath.vertices[hatchPath.vertices.length - 1].bulge = num(v);
        } else if (hatchPath && hatchPathKind === "edge") {
          if (code === 72) hatchEdgeType = Number(v);
          else if (code === 10) {
            if (hatchEdgeType === 3) { hatchPath.center = { x: num(v), y: 0 }; }
            else hatchPath.vertices.push({ x: num(v), y: 0 });
          } else if (code === 20) {
            if (hatchEdgeType === 3 && hatchPath.center) hatchPath.center.y = num(v);
            else if (hatchPath.vertices.length) hatchPath.vertices[hatchPath.vertices.length - 1].y = num(v);
          } else if (code === 40 && hatchEdgeType === 3) hatchPath.radius = num(v);
        }
        void hatchRemaining;
        break;
      default:
        break;
    }
  }

  if (type === "POLYLINE") {
    e.vertices = vertexRecs.map((vr) => {
      const vx: any = { x: 0, y: 0 };
      for (const [c, r] of vr) {
        if (c === 10) vx.x = parseFloat(r);
        else if (c === 20) vx.y = parseFloat(r);
        else if (c === 42) vx.bulge = parseFloat(r);
      }
      return vx;
    });
  }
  return e;
}

function entitiesFrom(recs: Pair[][]): any[] {
  const out: any[] = [];
  for (let i = 0; i < recs.length; i++) {
    const t = recs[i][0][1].trim();
    if (t === "VERTEX" || t === "SEQEND" || t === "ATTRIB") continue;
    if (t === "POLYLINE") {
      const verts: Pair[][] = [];
      let j = i + 1;
      while (j < recs.length && recs[j][0][1].trim() === "VERTEX") { verts.push(recs[j]); j++; }
      out.push(buildEntity(recs[i], verts));
      i = j - 1;
      continue;
    }
    out.push(buildEntity(recs[i], []));
  }
  return out;
}

/** Parse ASCII DXF text into a dxf-parser-shaped object. */
export function parseMiniDxf(text: string): any {
  const pairs = pairsOf(text);
  const result: any = { header: {}, tables: { layer: { layers: {} } }, blocks: {}, entities: [] };

  let i = 0;
  while (i < pairs.length) {
    if (!(pairs[i][0] === 0 && pairs[i][1].trim() === "SECTION")) { i++; continue; }
    const secName = (pairs[i + 1]?.[1] || "").trim();
    let j = i + 2;
    const body: Pair[] = [];
    while (j < pairs.length && !(pairs[j][0] === 0 && pairs[j][1].trim() === "ENDSEC")) { body.push(pairs[j]); j++; }
    i = j + 1;

    if (secName === "HEADER") {
      let cur: string | null = null;
      for (const [c, v] of body) {
        if (c === 9) { cur = v.trim(); continue; }
        if (!cur) continue;
        if (c === 10) result.header[cur] = { x: parseFloat(v), y: 0 };
        else if (c === 20 && result.header[cur] && typeof result.header[cur] === "object") result.header[cur].y = parseFloat(v);
        else if (c === 70 || c === 40) { if (result.header[cur] === undefined) result.header[cur] = parseFloat(v); }
        else if (c === 1 || c === 3) { if (result.header[cur] === undefined) result.header[cur] = v; }
      }
    } else if (secName === "TABLES") {
      for (const rec of splitRecords(body)) {
        if (rec[0][1].trim() !== "LAYER") continue;
        let name = "0", flags = 0, colorIndex = 7;
        for (const [c, v] of rec.slice(1)) {
          if (c === 2) name = v;
          else if (c === 70) flags = Number(v);
          else if (c === 62) colorIndex = Number(v);
        }
        result.tables.layer.layers[name] = {
          name, frozen: (flags & 1) === 1 || (flags & 2) === 2, visible: colorIndex >= 0, colorIndex, color: Math.abs(colorIndex),
        };
      }
    } else if (secName === "BLOCKS") {
      const recs = splitRecords(body);
      let k = 0;
      while (k < recs.length) {
        if (recs[k][0][1].trim() === "BLOCK") {
          const name = recs[k].find((p) => p[0] === 2)?.[1] ?? "";
          const inner: Pair[][] = [];
          k++;
          while (k < recs.length && recs[k][0][1].trim() !== "ENDBLK") { inner.push(recs[k]); k++; }
          result.blocks[name] = { name, entities: entitiesFrom(inner) };
        }
        k++;
      }
    } else if (secName === "ENTITIES") {
      result.entities = entitiesFrom(splitRecords(body));
    }
  }
  return result;
}
