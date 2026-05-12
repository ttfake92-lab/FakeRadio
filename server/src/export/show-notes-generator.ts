import type { ShowPlan } from "@fakeradio/shared";

export type ShowNotesTrack = {
  title: string;
  artist: string;
  album?: string;
  djStory: string;
  userMemory?: string;
  storyType: "background" | "lyric-theme" | "mood-reading";
  externalTrack?: boolean;
  externalReason?: string;
};

export type ShowNotesInput = {
  date: string;
  tracks: ShowNotesTrack[];
  showPlan?: ShowPlan;
};

const STORY_TYPE_LABELS: Record<ShowNotesTrack["storyType"], string> = {
  background: "background",
  "lyric-theme": "lyric-theme",
  "mood-reading": "mood-reading"
};

export function generateShowNotes(input: ShowNotesInput): string {
  const { date, tracks, showPlan } = input;

  const hasContent = tracks.length > 0 || showPlan !== undefined;

  if (!hasContent) {
    return `# FakeRadio · ${date}\n\n今天没有互动内容。\n`;
  }

  const lines: string[] = [];

  lines.push(`# FakeRadio · ${date}`);
  lines.push("");

  if (showPlan) {
    const brief = showPlan.briefSnapshot;
    if (brief.topic) {
      lines.push(`**主题：** ${brief.topic}`);
      lines.push("");
    }
    lines.push("## 节目纲要");
    lines.push("");
    if (showPlan.totalDurationMinutes) {
      lines.push(`计划时长：约 ${showPlan.totalDurationMinutes} 分钟`);
      lines.push("");
    }
    lines.push(`共 ${showPlan.blocks.length} 个段落：`);
    lines.push("");
    showPlan.blocks.forEach((block, i) => {
      lines.push(`${i + 1}. **${block.role}** · ${block.title}`);
      lines.push(`   ${block.storyGoal}`);
    });
    lines.push("");
  }

  if (tracks.length > 0) {
    lines.push("## 节目索引");
    lines.push("");
    tracks.forEach((t, i) => {
      const prefix = t.externalTrack ? "🔗 " : "";
      lines.push(`${i + 1}. ${prefix}《${t.title}》— ${t.artist}`);
    });
    lines.push("");

    tracks.forEach((t) => {
      lines.push(`## 《${t.title}》— ${t.artist}`);
      lines.push("");

      if (t.externalTrack) {
        lines.push("**🔗 库外曲目**");
        if (t.externalReason) {
          lines.push(`原因：${t.externalReason}`);
        }
        lines.push("");
      }

      lines.push("**DJ 故事**");
      lines.push(t.djStory);
      lines.push("");

      if (t.userMemory) {
        lines.push("**你的回忆**");
        lines.push(t.userMemory);
        lines.push("");
      }

      lines.push(`来源：${STORY_TYPE_LABELS[t.storyType]}`);
      lines.push("");
    });
  }

  return lines.join("\n");
}
