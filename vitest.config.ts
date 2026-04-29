import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sharedEntry = fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url));
const sharedRoot = fileURLToPath(new URL("./packages/shared/src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@fakeradio/shared": sharedEntry,
      "@fakeradio/shared/": `${sharedRoot}/`
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "server/**/*.test.ts", "apps/**/*.test.ts"]
  }
});
