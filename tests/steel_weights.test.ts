import { strict as assert } from "node:assert";
import { kgPerMetre } from "../src/utils/steelWeights";
assert.equal(kgPerMetre("IPE600"), 122);
assert.equal(kgPerMetre("HEA240"), 60.3);
assert.equal(kgPerMetre("UPN200"), 25.3);
assert.ok(Math.abs(kgPerMetre("SHS120x3")! - 11.0) < 0.1);
assert.ok(Math.abs(kgPerMetre("SHS 80x5")! - 11.8) < 0.1, String(kgPerMetre("SHS 80x5")));
assert.equal(kgPerMetre("IPE777"), null);
console.log("OK [steel_weights]");
