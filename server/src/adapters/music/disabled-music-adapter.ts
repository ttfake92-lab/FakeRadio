import type { MusicAdapter } from "../types.js";

export function createDisabledMusicAdapter(reason: string): MusicAdapter {
  async function fail(): Promise<never> {
    throw new Error(reason);
  }

  return {
    search: fail,
    recommend: fail,
    resolve: fail
  };
}
