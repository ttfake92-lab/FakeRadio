import { resolve } from "node:path";

export function getAudioFilePath(audioDir: string, trackId: string): string {
  return resolve(audioDir, `${trackId}.mp3`);
}

export function createWriteLock(): <T>(fn: () => Promise<T>) => Promise<T> {
  let writeLock: Promise<void> = Promise.resolve();
  return async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = writeLock;
    let resolveLock!: () => void;
    writeLock = new Promise<void>((resolve) => { resolveLock = resolve; });
    await previous;
    try {
      return await fn();
    } finally {
      resolveLock();
    }
  };
}
