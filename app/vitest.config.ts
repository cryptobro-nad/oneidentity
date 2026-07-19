import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Logic tests run in Node; component tests opt into jsdom per file via
    // `// @vitest-environment jsdom`. Keeping Node as the default avoids
    // paying jsdom's startup cost on the majority of the suite.
    environment: "node",
  },
});
