// Runs every tests/*.test.ts with tsx; exits non-zero if any fails.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(path.join(root, "tests")).filter((f) => f.endsWith(".test.ts")).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync("npx", ["tsx", path.join("tests", f)], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
  const ok = r.status === 0;
  console.log(`${ok ? "✔" : "✘"} ${f}`);
  if (!ok) {
    failed++;
    console.log((r.stdout || "") + (r.stderr || ""));
  } else if (r.stdout) {
    console.log("   " + r.stdout.trim().split("\n").pop());
  }
}
console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
