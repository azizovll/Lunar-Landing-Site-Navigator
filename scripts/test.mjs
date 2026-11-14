// Runs Vitest with a normalised working directory. On Windows, a lowercase drive letter
// in cwd ("c:\...") makes Vitest load two module copies and fail with
// "Vitest failed to find the current suite".
import { spawnSync } from "node:child_process";
const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const r = spawnSync("npx", ["vitest", "run", ...process.argv.slice(2)], { cwd, stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
