import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { checkFfmpegAvailable, mixEpisodeAudio } from "./audio-mixer.js";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "audio-mixer-test-"));
}

function generateSilentWav(filePath: string, durationSeconds: number) {
  execFileSync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`,
    "-t", String(durationSeconds),
    "-codec:a", "pcm_s16le",
    filePath
  ], { stdio: "ignore" });
}

describe("audio-mixer", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("checkFfmpegAvailable returns true when ffmpeg exists", async () => {
    const available = await checkFfmpegAvailable();
    expect(available).toBe(true);
  });

  it("checkFfmpegAvailable returns false for invalid path", async () => {
    const available = await checkFfmpegAvailable({ ffmpegPath: "/nonexistent/ffmpeg" });
    expect(available).toBe(false);
  });

  it("mixes TTS and music into output MP3", async () => {
    const ttsPath = join(dir, "tts.wav");
    const musicPath = join(dir, "music.wav");
    const outputPath = join(dir, "output.mp3");

    generateSilentWav(ttsPath, 2);
    generateSilentWav(musicPath, 8);

    const progressLog: { phase: string; percent?: number }[] = [];
    const result = await mixEpisodeAudio(
      { ttsPath, musicPath, outputPath },
      (p) => progressLog.push(p)
    );

    expect(result).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);
    expect(progressLog.some((p) => p.phase === "probing")).toBe(true);
    expect(progressLog.some((p) => p.phase === "mixing")).toBe(true);
    expect(progressLog.at(-1)?.percent).toBe(100);
  }, 30_000);

  it("output MP3 duration matches music duration", async () => {
    const ttsPath = join(dir, "tts.wav");
    const musicPath = join(dir, "music.wav");
    const outputPath = join(dir, "output.mp3");

    generateSilentWav(ttsPath, 1);
    generateSilentWav(musicPath, 5);

    await mixEpisodeAudio({ ttsPath, musicPath, outputPath });

    const duration = execFileSync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      outputPath
    ]).toString().trim();

    const seconds = parseFloat(duration);
    expect(seconds).toBeGreaterThanOrEqual(4.9);
    expect(seconds).toBeLessThanOrEqual(5.2);
  }, 30_000);

  it("throws when TTS file is missing", async () => {
    const musicPath = join(dir, "music.wav");
    generateSilentWav(musicPath, 3);

    await expect(
      mixEpisodeAudio({ ttsPath: "/nonexistent/tts.wav", musicPath, outputPath: join(dir, "out.mp3") })
    ).rejects.toThrow("TTS file not found");
  });

  it("throws when music file is missing", async () => {
    const ttsPath = join(dir, "tts.wav");
    generateSilentWav(ttsPath, 3);

    await expect(
      mixEpisodeAudio({ ttsPath, musicPath: "/nonexistent/music.wav", outputPath: join(dir, "out.mp3") })
    ).rejects.toThrow("Music file not found");
  });
});
