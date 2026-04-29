import { config } from "dotenv";
import { z } from "zod";

config();

const EnvSchema = z.object({
  FAKERADIO_SERVER_PORT: z.coerce.number().int().positive().default(3001),
  FAKERADIO_PROVIDER_MODE: z.enum(["mock"]).default("mock")
});

export const env = EnvSchema.parse(process.env);
