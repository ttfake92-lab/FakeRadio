export type ShowNotesTrack = {
  title: string;
  artist: string;
  album?: string;
  djStory: string;
  userMemory?: string;
  storyType: "background" | "lyric-theme" | "mood-reading";
};

export type ShowNotesInput = {
  date: string;
  tracks: ShowNotesTrack[];
};

const STORY_TYPE_LABELS: Record<ShowNotesTrack["storyType"], string> = {
  background: "background",
  "lyric-theme": "lyric-theme",
  "mood-reading": "mood-reading"
};

export function generateShowNotes(input: ShowNotesInput): string {
  const { date, tracks } = input;

  if (tracks.length === 0) {
    return `# FakeRadio · ${date}\n\n今天没有互动内容。\n`;
  }

  const lines: string[] = [];

  lines.push(`# FakeRadio · ${date}`);
  lines.push("");

  // Track index
  lines.push("## 节目索引");
  lines.push("");
  tracks.forEach((t, i) => {
    lines.push(`${i + 1}. 《${t.title}》— ${t.artist}`);
  });
  lines.push("");

  // Track sections
  tracks.forEach((t) => {
    lines.push(`## 《${t.title}》— ${t.artist}`);
    lines.push("");
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

  return lines.join("\n");
}
