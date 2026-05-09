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
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts", "server/**/*.test.ts", "apps/**/*.test.ts"],
    env: {
      TZ: "Asia/Shanghai",
      FAKERADIO_BRAVE_API_KEY: "",
      FAKERADIO_DEEPSEEK_API_KEY: "",
      FAKERADIO_MIMO_API_KEY: ""
    }
  }
});
