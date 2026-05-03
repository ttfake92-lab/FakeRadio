import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type TtsCacheManager = {
  resolvePath(cacheKey: string, ext?: string): string;
  exists(cacheKey: string, ext?: string): boolean;
  save(cacheKey: string, buffer: Buffer, ext?: string): void;
};

export function createTtsCacheManager(cacheDir: string): TtsCacheManager {
  const ext = (cacheKey: string, override?: string) => `${cacheDir}/${cacheKey}.${override ?? "mp3"}`;

  return {
    resolvePath(cacheKey, override) {
      return ext(cacheKey, override);
    },
    exists(cacheKey, override) {
      return existsSync(ext(cacheKey, override));
    },
    save(cacheKey, buffer, override) {
      const path = ext(cacheKey, override);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, buffer);
    }
  };
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
