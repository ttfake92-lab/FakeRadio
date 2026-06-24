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

  // 衔接策略 (用户要求): 口播全程全音量, 不淡出; 音乐从 0 渐入到全音量,
  // 渐入持续 FADE_DURATION_S (3 秒), 起点是口播结束后 OVERLAP_S (1 秒) 处 --
  // 也就是音乐头部小幅度叠在口播尾部, 避免衔接处出现死寂。
  //
  // 之前用 acrossfade 的 bug: 它强制把第一路 (口播) 尾部也淡出, 用户听到的是
  // "口播最后一句越说越轻直到听不清"。acrossfade 是给两段对等音轨用的, 不适合
  // "主播声音 + 后置 BGM" 这种非对称场景。
  //
  // 改为手工 filter 链:
  //   [1:a] adelay=DELAY|DELAY,afade=t=in:st=DELAY:d=FADE  -> [music]
  //   [0:a][music] amix=inputs=2:duration=longest:dropout_transition=0:normalize=0
  //
  // - adelay 把音乐推迟到口播尾部附近开始 (双通道都 delay, ms 单位)
  // - afade=t=in:st=...:d=... 从 delay 起点开始线性渐入, FADE 秒达到全音量
  // - amix normalize=0 防止 ffmpeg 自动按通道数把音量整体砍半
  // - dropout_transition=0 防止"某路结束时另一路突然变响"的副作用
  const OVERLAP_S = 1;
  const musicStartS = Math.max(0, ttsDuration - OVERLAP_S);
  const musicStartMs = Math.round(musicStartS * 1000);

  const filterComplex = [
    `[1:a]adelay=${musicStartMs}|${musicStartMs},afade=t=in:st=${musicStartS}:d=${FADE_DURATION_S}[music]`,
    `[0:a][music]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[out]`
  ].join(";");

  // amix duration=longest 让输出延伸到最长那路结束。
  // 总长度 = max(ttsDuration, musicStartS + musicDuration)。
  // 现实中 musicDuration (180s) 远大于 ttsDuration (10-30s), 所以就是 musicStartS + musicDuration。
  const totalDuration = Math.max(ttsDuration, musicStartS + musicDuration);

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
