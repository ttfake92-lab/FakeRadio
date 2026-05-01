import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type TtsCacheManager = {
  resolvePath(cacheKey: string): string;
  exists(cacheKey: string): boolean;
  save(cacheKey: string, buffer: Buffer): void;
};

export function createTtsCacheManager(cacheDir: string): TtsCacheManager {
  return {
    resolvePath(cacheKey) {
      return `${cacheDir}/${cacheKey}.mp3`;
    },
    exists(cacheKey) {
      return existsSync(`${cacheDir}/${cacheKey}.mp3`);
    },
    save(cacheKey, buffer) {
      const path = `${cacheDir}/${cacheKey}.mp3`;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, buffer);
    }
  };
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
