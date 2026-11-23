import { ParsedDxfResult, DxfUnitInfo } from "../src/utils/dxfParser";
import { DxfLayerInfo } from "../src/types";

export function makeMockParsedDxf(partial: {
  unitInfo?: DxfUnitInfo;
  layers: Partial<DxfLayerInfo>[];
  detectedBlocks?: { name: string; count: number }[];
  textNotes?: string[];
}): ParsedDxfResult {
  const layers: DxfLayerInfo[] = partial.layers.map((l) => ({
    name: l.name || "0",
    color: l.color || "#38bdf8",
    entityCount: l.entityCount ?? 1,
    visible: l.visible ?? true,
    lineLength: l.lineLength ?? 0,
    areaSum: l.areaSum ?? 0,
    closedPolylinesCount: l.closedPolylinesCount ?? 0,
    closedPerimeterSum: l.closedPerimeterSum ?? 0,
  }));

  const totalEntities = layers.reduce((sum, l) => sum + l.entityCount, 0);

  return {
    unitInfo: partial.unitInfo,
    layers,
    entityCounts: { LWPOLYLINE: totalEntities },
    totalEntities,
    bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    parsedData: { entities: [] },
    summaryText: "Mock DXF fixture for automated unit testing",
    detectedBlocks: partial.detectedBlocks || [],
    textNotes: partial.textNotes || [],
    warnings: [],
  };
}
