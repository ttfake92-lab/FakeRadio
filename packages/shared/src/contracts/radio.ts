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

export const ProgramBriefTypeSchema = z.enum(["theme-show", "block-theme", "daily-show"]);
export const ProgramBriefScopeSchema = z.enum(["full-show", "block"]);
export const ProgramBriefPrioritySchema = z.enum(["user-requested", "daily-default"]);
export const ProgramBriefStatusSchema = z.enum(["draft", "confirmed", "scheduled", "generating", "completed", "cancelled", "failed"]);

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

export const ChatResponseSchema = z.object({
  message: z.string().min(1),
  decision: DjDecisionSchema,
  action: z.object({
    type: z.enum(["next-track", "add-favorite"]),
    trackId: z.string().optional(),
    title: z.string().optional(),
    artist: z.string().optional()
  }).optional(),
  brief: ProgramBriefSchema.optional()
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

export const BriefsListResponseSchema = z.object({
  briefs: z.array(ProgramBriefSchema)
});

export const BriefResponseSchema = z.object({
  brief: ProgramBriefSchema
});

export type BriefsListResponse = z.infer<typeof BriefsListResponseSchema>;
export type BriefResponse = z.infer<typeof BriefResponseSchema>;

export const ShowPlanBlockRoleSchema = z.enum([
  "opening",
  "origin",
  "turning-point",
  "signature-era",
  "relationship",
  "influence",
  "contrast",
  "personal-anchor",
  "closing",
  "morning",
  "afternoon",
  "evening"
]);
export type ShowPlanBlockRole = z.infer<typeof ShowPlanBlockRoleSchema>;

export const ShowPlanBlockConstraintsSchema = z.object({
  preferEra: z.string().optional(),
  avoidExplicit: z.boolean().optional(),
  moodHint: z.string().optional()
});
export type ShowPlanBlockConstraints = z.infer<typeof ShowPlanBlockConstraintsSchema>;

export const ShowPlanBlockEpisodeTargetSchema = z.object({
  role: z.enum(["opening-music", "closing-music", "bridge", "solo"]).optional(),
  durationMinutes: z.number().int().positive().optional()
});
export type ShowPlanBlockEpisodeTarget = z.infer<typeof ShowPlanBlockEpisodeTargetSchema>;

export const ShowPlanBlockSourceNeedSchema = z.object({
  kind: z.enum(["artist-bio", "album-history", "song-meaning", "era-context", "relationship-story", "influence-link", "cover-version", "personal-memory"]),
  description: z.string().min(1)
});
export type ShowPlanBlockSourceNeed = z.infer<typeof ShowPlanBlockSourceNeedSchema>;

export const ShowPlanBlockSchema = z.object({
  role: ShowPlanBlockRoleSchema,
  title: z.string().min(1),
  storyGoal: z.string().min(1),
  selectionGoal: z.string().min(1),
  sourceNeeds: z.array(ShowPlanBlockSourceNeedSchema).default([]),
  constraints: ShowPlanBlockConstraintsSchema.default({}),
  episodeTargets: z.array(ShowPlanBlockEpisodeTargetSchema).default([])
});
export type ShowPlanBlock = z.infer<typeof ShowPlanBlockSchema>;

export const ShowPlanSchema = z.object({
  id: z.string().min(1),
  briefId: z.string().min(1),
  version: z.number().int().positive(),
  active: z.boolean(),
  briefSnapshot: ProgramBriefSchema,
  blocks: z.array(ShowPlanBlockSchema).min(1),
  totalDurationMinutes: z.number().int().positive().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type ShowPlan = z.infer<typeof ShowPlanSchema>;

export const ShowPlansListResponseSchema = z.object({
  plans: z.array(ShowPlanSchema)
});

export const ShowPlanResponseSchema = z.object({
  plan: ShowPlanSchema
});

export type ShowPlansListResponse = z.infer<typeof ShowPlansListResponseSchema>;
export type ShowPlanResponse = z.infer<typeof ShowPlanResponseSchema>;

export const AddConstraintsRequestSchema = z.object({
  planId: z.string().min(1),
  constraints: ShowPlanBlockConstraintsSchema
});
export type AddConstraintsRequest = z.infer<typeof AddConstraintsRequestSchema>;

export const AddConstraintsResponseSchema = z.object({
  plan: ShowPlanSchema
});
export type AddConstraintsResponse = z.infer<typeof AddConstraintsResponseSchema>;

export const ShowJobStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "needs-replan",
  "cancelled",
  "failed",
  "completed"
]);
export type ShowJobStatus = z.infer<typeof ShowJobStatusSchema>;

export const ProductionLogLevelSchema = z.enum(["info", "warn", "error"]);
export type ProductionLogLevel = z.infer<typeof ProductionLogLevelSchema>;

export const ProductionLogSchema = z.object({
  level: ProductionLogLevelSchema,
  message: z.string().min(1),
  timestamp: z.string().datetime(),
  phase: z.string().optional()
});
export type ProductionLog = z.infer<typeof ProductionLogSchema>;

export const TechTraceEntrySchema = z.object({
  timestamp: z.string().datetime(),
  type: z.enum(["adapter", "llm", "cache", "tts", "audio", "export", "fallback", "error"]),
  provider: z.string().optional(),
  operation: z.string().min(1),
  durationMs: z.number().int().nonnegative().optional(),
  summary: z.string().min(1),
  success: z.boolean().default(true),
  errorSummary: z.string().optional()
});
export type TechTraceEntry = z.infer<typeof TechTraceEntrySchema>;

export const ShowJobSchema = z.object({
  id: z.string().min(1),
  briefId: z.string().min(1),
  planId: z.string().min(1),
  status: ShowJobStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  reason: z.string().optional(),
  logs: z.array(ProductionLogSchema).default([]),
  trace: z.array(TechTraceEntrySchema).default([])
});
export type ShowJob = z.infer<typeof ShowJobSchema>;

export const ShowJobsListResponseSchema = z.object({
  jobs: z.array(ShowJobSchema)
});

export const ShowJobResponseSchema = z.object({
  job: ShowJobSchema.nullable()
});

export type ShowJobsListResponse = z.infer<typeof ShowJobsListResponseSchema>;
export type ShowJobResponse = z.infer<typeof ShowJobResponseSchema>;

export const StartJobRequestSchema = z.object({
  briefId: z.string().min(1),
  planId: z.string().min(1)
});

export type StartJobRequest = z.infer<typeof StartJobRequestSchema>;

export const ShowProjectStatusSchema = z.enum([
  "draft",
  "generating",
  "ready",
  "failed",
  "exported",
  "archived"
]);
export type ShowProjectStatus = z.infer<typeof ShowProjectStatusSchema>;

export const ShowProjectSchema = z.object({
  id: z.string().min(1),
  briefId: z.string().min(1),
  slug: z.string().min(1),
  status: ShowProjectStatusSchema,
  activePlanId: z.string().min(1).optional(),
  activeJobId: z.string().min(1).optional(),
  directoryPath: z.string().min(1),
  showPlanPath: z.string().optional(),
  productionTracePath: z.string().optional(),
  showNotesPath: z.string().optional(),
  showAudioPath: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional()
});
export type ShowProject = z.infer<typeof ShowProjectSchema>;

export const ShowProjectsListResponseSchema = z.object({
  projects: z.array(ShowProjectSchema)
});
export type ShowProjectsListResponse = z.infer<typeof ShowProjectsListResponseSchema>;

export const ShowProjectResponseSchema = z.object({
  project: ShowProjectSchema
});
export type ShowProjectResponse = z.infer<typeof ShowProjectResponseSchema>;

// Generate Now and Schedule Tonight
export const GenerateNowRequestSchema = z.object({
  briefId: z.string().min(1)
});
export type GenerateNowRequest = z.infer<typeof GenerateNowRequestSchema>;

export const GenerateNowResponseSchema = z.object({
  project: ShowProjectSchema,
  job: ShowJobSchema
});
export type GenerateNowResponse = z.infer<typeof GenerateNowResponseSchema>;

export const ScheduleTonightRequestSchema = z.object({
  briefId: z.string().min(1)
});
export type ScheduleTonightRequest = z.infer<typeof ScheduleTonightRequestSchema>;

export const ScheduleTonightResponseSchema = z.object({
  project: ShowProjectSchema,
  brief: ProgramBriefSchema,
  scheduledAt: z.string().datetime()
});
export type ScheduleTonightResponse = z.infer<typeof ScheduleTonightResponseSchema>;

export const SettingsSchema = z.object({
  researchEnabled: z.boolean().default(true),
  providerMode: z.enum(["auto", "mock", "netease"]).default("auto"),
  ttsProvider: z.enum(["edge", "mimo"]).default("edge"),
  ttsVoice: z.string().min(1).default("zh-CN-XiaoxiaoNeural"),
  mimoVoice: z.string().min(1).default("茉莉"),
  tracePrivacy: z.enum(["full", "summary", "off"]).default("summary"),
  externalTrackLimit: z.number().int().min(0).max(100).default(60),
  dailyShowAvoidRecentPlay: z.boolean().default(true),
  themeShowAvoidRecentPlay: z.boolean().default(false)
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsResponseSchema = z.object({
  settings: SettingsSchema
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

export const UpdateSettingsRequestSchema = z.object({
  researchEnabled: z.boolean().optional(),
  providerMode: z.enum(["auto", "mock", "netease"]).optional(),
  ttsProvider: z.enum(["edge", "mimo"]).optional(),
  ttsVoice: z.string().min(1).optional(),
  mimoVoice: z.string().min(1).optional(),
  tracePrivacy: z.enum(["full", "summary", "off"]).optional(),
  externalTrackLimit: z.number().int().min(0).max(100).optional(),
  dailyShowAvoidRecentPlay: z.boolean().optional(),
  themeShowAvoidRecentPlay: z.boolean().optional()
});
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;
