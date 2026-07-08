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
    projects: [
      {
        test: {
          include: ["tests/**/*.test.ts", "packages/**/*.test.ts", "server/**/*.test.ts"],
          environment: "node",
          env: {
            TZ: "Asia/Shanghai",
            FAKERADIO_BRAVE_API_KEY: "",
            FAKERADIO_DEEPSEEK_API_KEY: "",
            FAKERADIO_MIMO_API_KEY: "",
            // 单测不打真实天气网络请求(Open-Meteo 是无 key 默认 provider)
            FAKERADIO_WEATHER_PROVIDER: "disabled"
          },
        }
      },
      {
        test: {
          include: ["apps/web/**/*.test.ts", "apps/web/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: "./apps/web/vitest.setup.ts",
          env: {
            TZ: "Asia/Shanghai",
          },
        }
      }
    ]
  }
});
