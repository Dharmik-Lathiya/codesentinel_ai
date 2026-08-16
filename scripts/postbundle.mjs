import { renameSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../dist/action-bundle/", import.meta.url).pathname;

renameSync(join(dir, "index.js"), join(dir, "index.mjs"));

const bloat = join(dir, "codesentinel_ai");
rmSync(bloat, { recursive: true, force: true });

console.log("postbundle: index.js -> index.mjs, bloat pruned");