import { strict as assert } from "node:assert";
import { analyzeParsedDxfObject, extractEngineeringQuantitiesFromDxf } from "../src/utils/dxfParser";

// 300 anonymous / unknown blocks must not flood the quantity list or be pre-selected.
const entities: any[] = [];
const blocks: Record<string, any> = {};
for (let i = 0; i < 300; i++) {
  const name = i < 40 ? `A$C${i}` : `BLK_${i}`;
  blocks[name] = { entities: [] };
  for (let k = 0; k < 5; k++) entities.push({ type: "INSERT", layer: "0", name, position: { x: i, y: k, z: 0 } });
}
blocks["DOOR_D1"] = { entities: [] };
for (let k = 0; k < 8; k++) entities.push({ type: "INSERT", layer: "0", name: "DOOR_D1", position: { x: k, y: 0, z: 0 } });

const parsed = analyzeParsedDxfObject({ header: { $INSUNITS: 6 }, tables: { layer: { layers: {} } }, blocks, entities } as any);
const q: any[] = extractEngineeringQuantitiesFromDxf(parsed as any, {} as any) as any;
const blockItems = q.filter((i) => i.layer === "BLOCK_INSERTS");
assert.ok(blockItems.length <= 13, `block items capped, got ${blockItems.length}`);
assert.ok(!blockItems.some((i) => /^A\$C/.test(i.name)), "anonymous blocks skipped");
const door = blockItems.find((i) => i.name === "DOOR_D1");
assert.ok(door && door.selected === true && door.value === 8, "recognised block kept and selected");
assert.equal(blockItems.filter((i) => i.name !== "DOOR_D1" && i.selected).length, 0, "unknown blocks start unselected");
console.log("dxf_block_noise ok");
