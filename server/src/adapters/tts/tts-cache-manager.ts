import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type TtsCacheManager = {
  resolvePath(cacheKey: string, ext?: string): string;
  exists(cacheKey: string, ext?: string): Promise<boolean>;
  save(cacheKey: string, buffer: Buffer, ext?: string): Promise<void>;
};

export function createTtsCacheManager(cacheDir: string): TtsCacheManager {
  const ext = (cacheKey: string, override?: string) => `${cacheDir}/${cacheKey}.${override ?? "mp3"}`;

  return {
    resolvePath(cacheKey, override) {
      return ext(cacheKey, override);
    },
    async exists(cacheKey, override) {
      try {
        await access(ext(cacheKey, override));
        return true;
      } catch {
        return false;
      }
    },
    async save(cacheKey, buffer, override) {
      const path = ext(cacheKey, override);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, buffer);
    }
  };
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
