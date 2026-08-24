import { renameSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "action-bundle");

renameSync(join(dir, "index.js"), join(dir, "index.mjs"));

const bloat = join(dir, "codesentinel_ai");
rmSync(bloat, { recursive: true, force: true });

console.log("postbundle: index.js -> index.mjs, bloat pruned");