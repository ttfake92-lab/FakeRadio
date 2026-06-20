import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const DUCK_VOLUME = 0.3;
const FADE_DURATION_S = 3;
const OUTPUT_BITRATE = "192k";

export type MixProgress = {
  phase: "probing" | "mixing";
  percent?: number;
};

export type MixInput = {
  ttsPath: string;
  musicPath: string;
  outputPath: string;
};

export type MixerDeps = {
  ffmpegPath?: string;
  ffprobePath?: string;
};

function probeDuration(filePath: string, ffprobePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath, [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath
    ], (error, stdout) => {
      if (error) return reject(new Error(`ffprobe failed: ${error.message}`));
      const seconds = parseFloat(stdout.trim());
      if (Number.isNaN(seconds)) return reject(new Error(`ffprobe returned invalid duration: ${stdout}`));
      resolve(seconds);
    });
  });
}

export async function checkFfmpegAvailable(deps: MixerDeps = {}): Promise<boolean> {
  const ffmpegPath = deps.ffmpegPath ?? "ffmpeg";
  return new Promise((resolve) => {
    execFile(ffmpegPath, ["-version"], (error) => {
      resolve(!error);
    });
  });
}

export async function mixEpisodeAudio(
  input: MixInput,
  onProgress?: (progress: MixProgress) => void,
  deps: MixerDeps = {}
): Promise<string> {
  const { ttsPath, musicPath, outputPath } = input;
  const ffmpegPath = deps.ffmpegPath ?? "ffmpeg";
  const ffprobePath = deps.ffprobePath ?? "ffprobe";

  if (!existsSync(ttsPath)) throw new Error(`TTS file not found: ${ttsPath}`);
  if (!existsSync(musicPath)) throw new Error(`Music file not found: ${musicPath}`);

  onProgress?.({ phase: "probing" });

  const [ttsDuration, musicDuration] = await Promise.all([
    probeDuration(ttsPath, ffprobePath),
    probeDuration(musicPath, ffprobePath)
  ]);

  // 电台感垫乐：歌曲从 0 秒起以 DUCK_VOLUME 垫在整段口播下面，
  // 口播结束后用 FADE_DURATION_S 秒渐入全音量，歌曲继续播到结尾。
  // 叠加（amix）而非串联（concat），口播是"压"在歌曲前奏上的
  const fadeStart = ttsDuration;
  const duckExpr = `if(lt(t\\,${fadeStart})\\,${DUCK_VOLUME}\\,if(lt(t\\,${fadeStart + FADE_DURATION_S})\\,${DUCK_VOLUME}+(1-${DUCK_VOLUME})*(t-${fadeStart})/${FADE_DURATION_S}\\,1))`;
  const totalDuration = Math.max(ttsDuration, musicDuration);

  const filterComplex = [
    `[1:a]volume='${duckExpr}'[bed]`,
    `[0:a][bed]amix=inputs=2:duration=longest:normalize=0[mixed]`,
    `[mixed]atrim=0:${totalDuration}[out]`
  ].join(";");

  onProgress?.({ phase: "mixing", percent: 0 });

  return new Promise<string>((resolve, reject) => {
    const args = [
      "-y",
      "-i", ttsPath,
      "-i", musicPath,
      "-filter_complex", filterComplex,
      "-map", "[out]",
      "-codec:a", "libmp3lame",
      "-b:a", OUTPUT_BITRATE,
      // 与导出拼接的归一化参数一致，concat -c copy 才能直接拼
      "-ar", "44100",
      "-ac", "2",
      "-progress", "pipe:1",
      "-nostats",
      outputPath
    ];

    const proc = spawn(ffmpegPath, args);
    let stderr = "";

    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      const outTimeMatch = text.match(/out_time_ms=(\d+)/);
      if (outTimeMatch) {
        const outTimeMs = parseInt(outTimeMatch[1]!, 10);
        const totalMs = totalDuration * 1_000_000;
        const percent = Math.min(100, Math.round((outTimeMs / totalMs) * 100));
        onProgress?.({ phase: "mixing", percent });
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        onProgress?.({ phase: "mixing", percent: 100 });
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}
