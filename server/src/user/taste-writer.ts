import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_USER_TASTE } from "./load-user-preference.js";

export async function readTaste(baseDir: string): Promise<string> {
  const path = resolve(baseDir, "user/taste.md");
  try {
    return (await readFile(path, "utf-8")).trim();
  } catch {
    return DEFAULT_USER_TASTE;
  }
}

export async function writeTaste(baseDir: string, content: string): Promise<void> {
  const path = resolve(baseDir, "user/taste.md");
  const backupPath = path + ".bak";

  if (existsSync(path)) {
    await copyFile(path, backupPath);
  }

  await writeFile(path, content.trim() + "\n", "utf-8");
}
