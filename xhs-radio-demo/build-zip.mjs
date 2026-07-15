#!/usr/bin/env node
/*
 * 小工具 zip 构建脚本
 * ------------------------------------------------------------------
 * 从本目录(母版)按曲目号挑子集,产出符合小红书小工具规范的 zip:
 *   - index.html 在 zip 根(压缩的是目录"内容",不是目录本身)
 *   - 只打包白名单类型(html/js/图片/音频),排除 README.md 与本脚本
 *
 * 用法:
 *   node xhs-radio-demo/build-zip.mjs --out build/full.zip
 *   node xhs-radio-demo/build-zip.mjs --tracks 1,2,3 --out build/3songs.zip
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import vm from "node:vm";

const SRC = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SRC, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outArg = arg("out", "build/fakeradio-minitool.zip");
const outPath = resolve(REPO, outArg);
const wanted = arg("tracks", null);

// 用 vm 读母版数据,拿 episode-data.js 本身当唯一真相,避免另存一份会腐烂的副本
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(SRC, "episode-data.js"), "utf8"), ctx);
const data = ctx.window.__EPISODE__;

const picked = wanted
  ? wanted.split(",").map((n) => Number(n.trim()))
  : data.tracks.map((t) => t.no);

const tracks = picked.map((no) => {
  const t = data.tracks.find((x) => x.no === no);
  if (!t) throw new Error(`曲目 no=${no} 不存在(母版有 ${data.tracks.map((x) => x.no).join(",")})`);
  return t;
});

// 重新编号,让子集的文件名连续(track-1..N)
const staged = tracks.map((t, i) => ({ ...t, no: i + 1, file: `./assets/audio/track-${i + 1}.mp3` }));

const tmp = mkdtempSync(join(tmpdir(), "minitool-"));
mkdirSync(join(tmp, "assets/audio"), { recursive: true });
mkdirSync(join(tmp, "assets/img"), { recursive: true });

for (const f of ["index.html", "app.js", "favicon.png"]) copyFileSync(join(SRC, f), join(tmp, f));
for (const f of ["dj.jpg", "logo.jpg"]) copyFileSync(join(SRC, "assets/img", f), join(tmp, "assets/img", f));
tracks.forEach((t, i) => {
  copyFileSync(join(SRC, t.file.replace("./", "")), join(tmp, `assets/audio/track-${i + 1}.mp3`));
});

const js = `/*
 * FakeRadio 离线 Demo · 节目数据(由 build-zip.mjs 生成,勿手改)
 * 本期:${data.title} · ${staged.length} 首
 */
window.__EPISODE__ = ${JSON.stringify({ ...data, tracks: staged }, null, 2)};
`;
writeFileSync(join(tmp, "episode-data.js"), js);

mkdirSync(dirname(outPath), { recursive: true });
rmSync(outPath, { force: true });
// 规范 §1:进入目录压缩"内容",index.html 才在 zip 根
execFileSync("zip", ["-r", "-q", outPath, ".", "-x", "*.DS_Store", "-x", "__MACOSX/*"], { cwd: tmp });
rmSync(tmp, { recursive: true, force: true });

const mb = (statSync(outPath).size / 1024 / 1024).toFixed(1);
console.log(`✓ ${outArg}  ${mb}MB  ${staged.length} 首`);
staged.forEach((t) => console.log(`   ${t.no}. ${t.artist} — ${t.title}`));
if (Number(mb) > 2) console.log(`⚠ 官方推荐总包 < 2MB,当前 ${mb}MB`);
