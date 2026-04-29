import { z } from "zod";
import { NowResponseSchema, TrackSchema } from "../contracts/radio";

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("now-playing"),
    payload: NowResponseSchema
  }),
  z.object({
    type: z.literal("queue-updated"),
    payload: z.object({
      queue: z.array(TrackSchema)
    })
  }),
  z.object({
    type: z.literal("dj-speech"),
    payload: z.object({
      text: z.string().min(1),
      audioUrl: z.string().optional()
    })
  }),
  z.object({
    type: z.literal("diagnostic"),
    payload: z.object({
      level: z.enum(["info", "warn", "error"]),
      message: z.string().min(1),
      at: z.string().datetime()
    })
  })
]);

export type StreamEvent = z.infer<typeof StreamEventSchema>;
