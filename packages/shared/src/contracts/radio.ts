import { z } from "zod";

export const TrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().min(1).optional(),
  durationMs: z.number().int().positive().optional(),
  artworkUrl: z.string().url().optional(),
  audioUrl: z.string().url().optional(),
  source: z.enum(["mock", "netease", "local"])
});

export const ContextFragmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  content: z.string(),
  priority: z.number().int(),
  source: z.enum(["system", "user", "environment", "memory", "request", "execution"])
});

export const DjDecisionSchema = z.object({
  say: z.string().min(1),
  play: z
    .object({
      query: z.string().min(1).optional(),
      trackId: z.string().min(1).optional(),
      reason: z.string().min(1)
    })
    .refine((play) => Boolean(play.query ?? play.trackId), {
      message: "play.query or play.trackId is required"
    }),
  reason: z.string().min(1),
  segue: z.string().min(1)
});

export type DjDecision = z.infer<typeof DjDecisionSchema>;

export const TtsResultSchema = z.object({
  text: z.string().min(1),
  audioUrl: z.string().min(1),
  cacheKey: z.string().min(1)
});

export const NowResponseSchema = z.object({
  playback: z.enum(["idle", "playing", "paused", "buffering"]),
  track: TrackSchema.nullable(),
  dj: z.object({
    say: z.string(),
    audioUrl: z.string().optional(),
    segue: z.string().optional()
  }),
  queue: z.array(TrackSchema),
  updatedAt: z.string().datetime()
});

export const RecommendationDiagnosticsSchema = z.object({
  candidateSource: z.enum(["favorites", "search", "queue", "mock"]),
  rerankSource: z.enum(["llm-pick", "fallback"]),
  favoritesAvailable: z.number().int().nonnegative(),
  candidatesCount: z.number().int().nonnegative(),
  isFallback: z.boolean(),
  musicProvider: z.string()
});

export const NextResponseSchema = z.object({
  decision: DjDecisionSchema,
  track: TrackSchema,
  queue: z.array(TrackSchema),
  tts: TtsResultSchema,
  diagnostics: RecommendationDiagnosticsSchema.optional()
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1)
});

export const ChatResponseSchema = z.object({
  message: z.string().min(1),
  decision: DjDecisionSchema,
  action: z.object({
    type: z.enum(["next-track", "add-favorite"]),
    trackId: z.string().optional(),
    title: z.string().optional(),
    artist: z.string().optional()
  }).optional()
});

export const TasteResponseSchema = z.object({
  taste: z.string(),
  routines: z.string(),
  playlists: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      seeds: z.array(z.string())
    })
  ),
  moodRules: z.string()
});

export const TodayPlanResponseSchema = z.object({
  date: z.string().min(1),
  blocks: z.array(
    z.object({
      at: z.string().min(1),
      label: z.string().min(1),
      moodHint: z.string().min(1)
    })
  )
});

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal("FakeRadio"),
  adapters: z.record(
    z.string(),
    z.union([
      z.enum(["mock", "ready", "disabled"]),
      z.record(z.string(), z.enum(["mock", "ready", "disabled"]))
    ])
  ),
  checkedAt: z.string().datetime()
});

export const StoryTypeSchema = z.enum(["background", "lyric-theme", "mood-reading"]);

export const StorySourceNoteSchema = z.object({
  kind: z.enum(["lyric", "metadata", "web", "mock"]),
  title: z.string().min(1),
  content: z.string().min(1),
  url: z.string().url().optional(),
  confidence: z.number().min(0).max(1).optional()
});

export const StorySchema = z.object({
  text: z.string().min(1),
  audioUrl: z.string().min(1),
  type: StoryTypeSchema,
  estimatedDurationMs: z.number().int().positive().optional()
});

export const PlaybackPlanSchema = z.object({
  crossfadeStartOffsetMs: z.number().int().nonnegative(),
  musicStartVolume: z.number().min(0).max(1)
});

export const RadioEpisodeSchema = z.object({
  track: TrackSchema,
  story: StorySchema,
  sources: z.array(StorySourceNoteSchema),
  playback: PlaybackPlanSchema,
  fallbackReason: z.string().optional()
});

export const EpisodeNextResponseSchema = z.object({
  episode: RadioEpisodeSchema,
  source: z.enum(["prepared", "live"]).default("live")
});

export const PreparedEpisodeRecordSchema = z.object({
  id: z.string().min(1),
  radioDate: z.string().min(1),
  blockAt: z.string().min(1),
  status: z.enum(["ready", "consumed", "failed", "preparing"]),
  episodeJson: z.string().optional(),
  audioDownloaded: z.boolean().optional().default(false),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const PrewarmStatusSchema = z.object({
  enabled: z.boolean(),
  targetDate: z.string().min(1),
  lastRun: z.string().datetime().nullable(),
  nextRunAt: z.string().datetime().nullable(),
  blocks: z.array(
    z.object({
      at: z.string().min(1),
      label: z.string().min(1),
      ready: z.number().int().nonnegative(),
      consumed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative()
    })
  )
});

export const FavoriteTrackSchema = z.object({
  trackId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().optional(),
  favoritedAt: z.string().datetime()
});

export const FavoriteRequestSchema = z.object({
  trackId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().optional()
});

export const FavoritesResponseSchema = z.object({
  favorites: z.array(FavoriteTrackSchema)
});

export const NeteaseLoginStatusSchema = z.object({
  loggedIn: z.boolean(),
  cookieStored: z.boolean(),
  nickname: z.string().optional(),
  userId: z.number().int().optional(),
  message: z.string().optional()
});

export const NeteaseQrLoginChallengeSchema = z.object({
  key: z.string().min(1),
  qrImageUrl: z.string().min(1),
  qrUrl: z.string().optional()
});

export const NeteaseQrLoginCheckSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  loggedIn: z.boolean(),
  cookieSaved: z.boolean()
});

export const NeteaseCookieSubmitRequestSchema = z.object({
  cookie: z.string().min(1)
});

export const NeteaseCookieSubmitResponseSchema = z.object({
  success: z.boolean(),
  message: z.string()
});

export const LikedSongsDiagnosticsSchema = z.object({
  loaded: z.boolean(),
  totalCount: z.number().int().nonnegative(),
  validCount: z.number().int().nonnegative(),
  invalidCount: z.number().int().nonnegative(),
  samples: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      artist: z.string().min(1),
      album: z.string().min(1)
    })
  ).max(3)
});

export const ProgramBriefTypeSchema = z.enum(["theme-show", "block-theme", "daily-show"]);
export const ProgramBriefScopeSchema = z.enum(["full-show", "block"]);
export const ProgramBriefPrioritySchema = z.enum(["user-requested", "daily-default"]);
export const ProgramBriefStatusSchema = z.enum(["draft", "confirmed", "scheduled", "generating", "completed", "cancelled"]);

export const ProgramBriefConstraintsSchema = z.object({
  durationMinutes: z.number().int().positive().optional(),
  avoidExplicit: z.boolean().optional(),
  includeEra: z.string().optional(),
  excludeTracks: z.array(z.string()).optional(),
  includeTracks: z.array(z.string()).optional(),
  moodHint: z.string().optional()
});

export const ProgramBriefSchema = z.object({
  id: z.string().min(1),
  type: ProgramBriefTypeSchema,
  topic: z.string().min(1).optional(),
  scope: ProgramBriefScopeSchema.optional(),
  targetDate: z.string().min(1),
  targetBlockAt: z.string().datetime().optional(),
  priority: ProgramBriefPrioritySchema,
  constraints: ProgramBriefConstraintsSchema.optional(),
  status: ProgramBriefStatusSchema,
  createdFromMessageId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Track = z.infer<typeof TrackSchema>;
export type ContextFragment = z.infer<typeof ContextFragmentSchema>;
export type TtsResult = z.infer<typeof TtsResultSchema>;
export type NowResponse = z.infer<typeof NowResponseSchema>;
export type NextResponse = z.infer<typeof NextResponseSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type TasteResponse = z.infer<typeof TasteResponseSchema>;
export type TodayPlanResponse = z.infer<typeof TodayPlanResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type StoryType = z.infer<typeof StoryTypeSchema>;
export type StorySourceNote = z.infer<typeof StorySourceNoteSchema>;
export type Story = z.infer<typeof StorySchema>;
export type PlaybackPlan = z.infer<typeof PlaybackPlanSchema>;
export type RadioEpisode = z.infer<typeof RadioEpisodeSchema>;
export type EpisodeNextResponse = z.infer<typeof EpisodeNextResponseSchema>;
export type PreparedEpisodeRecord = z.infer<typeof PreparedEpisodeRecordSchema>;
export type PrewarmStatus = z.infer<typeof PrewarmStatusSchema>;
export type FavoriteTrack = z.infer<typeof FavoriteTrackSchema>;
export type FavoriteRequest = z.infer<typeof FavoriteRequestSchema>;
export type FavoritesResponse = z.infer<typeof FavoritesResponseSchema>;
export type NeteaseLoginStatus = z.infer<typeof NeteaseLoginStatusSchema>;
export type NeteaseQrLoginChallenge = z.infer<typeof NeteaseQrLoginChallengeSchema>;
export type NeteaseQrLoginCheck = z.infer<typeof NeteaseQrLoginCheckSchema>;
export type NeteaseCookieSubmitRequest = z.infer<typeof NeteaseCookieSubmitRequestSchema>;
export type NeteaseCookieSubmitResponse = z.infer<typeof NeteaseCookieSubmitResponseSchema>;
export type LikedSongsDiagnostics = z.infer<typeof LikedSongsDiagnosticsSchema>;
export type RecommendationDiagnostics = z.infer<typeof RecommendationDiagnosticsSchema>;
export type ProgramBriefType = z.infer<typeof ProgramBriefTypeSchema>;
export type ProgramBriefScope = z.infer<typeof ProgramBriefScopeSchema>;
export type ProgramBriefPriority = z.infer<typeof ProgramBriefPrioritySchema>;
export type ProgramBriefStatus = z.infer<typeof ProgramBriefStatusSchema>;
export type ProgramBriefConstraints = z.infer<typeof ProgramBriefConstraintsSchema>;
export type ProgramBrief = z.infer<typeof ProgramBriefSchema>;
