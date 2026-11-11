import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./lib", import.meta.url)),
      "@": fileURLToPath(new URL("./apps/web", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts", "apps/web/lib/**/*.test.ts"],
    passWithNoTests: true,
  },
});
