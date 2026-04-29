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

export type DjDecision = {
  say: string;
  play: {
    query?: string;
    trackId?: string;
    reason: string;
  };
  reason: string;
  segue: string;
};

const DjDecisionBaseSchema = z.object({
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

export const DjDecisionSchema = DjDecisionBaseSchema.transform((decision): DjDecision => {
  const play: DjDecision["play"] = {
    reason: decision.play.reason
  };

  if (decision.play.query !== undefined) {
    play.query = decision.play.query;
  }

  if (decision.play.trackId !== undefined) {
    play.trackId = decision.play.trackId;
  }

  return {
    say: decision.say,
    play,
    reason: decision.reason,
    segue: decision.segue
  };
});

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

export const NextResponseSchema = z.object({
  decision: DjDecisionSchema,
  track: TrackSchema,
  queue: z.array(TrackSchema),
  tts: TtsResultSchema
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1)
});

export const ChatResponseSchema = z.object({
  message: z.string().min(1),
  decision: DjDecisionSchema
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
  adapters: z.record(z.string(), z.enum(["mock", "ready", "disabled"])),
  checkedAt: z.string().datetime()
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
