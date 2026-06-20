import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// 自动探测本机局域网 IP，允许这些来源访问 dev server（HMR 等）
function getLanDevOrigins(): string[] {
  const origins = ["127.0.0.1", "localhost"];
  try {
    const nets = networkInterfaces();
    for (const interfaces of Object.values(nets)) {
      for (const net of interfaces ?? []) {
        if (net.family === "IPv4" && !net.internal) {
          origins.push(net.address);
          origins.push(`${net.address}:3302`);
        }
      }
    }
  } catch {
    // 探测失败时回退到 localhost
  }
  return origins;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getLanDevOrigins(),
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      "@fakeradio/shared": "../../packages/shared/dist/index.js"
    }
  }
};

export default nextConfig;
