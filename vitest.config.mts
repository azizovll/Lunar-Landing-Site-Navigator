import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// On Windows a lowercase drive letter in cwd ("c:\") makes Vitest load itself twice
// ("failed to find the current suite"). Normalise the root to an uppercase drive letter.
const here = fileURLToPath(new URL(".", import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());

export default defineConfig({
  root: here,
  resolve: { alias: { "@": here } },
  test: { include: ["tests/**/*.test.ts"] },
});
