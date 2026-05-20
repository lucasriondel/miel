import { z } from "zod";
import { createDebug } from "./util/debug";

const debug = createDebug("env");

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  GOG_BIN: z.string().default("/opt/homebrew/bin/gog"),
  CLAUDE_BIN: z.string().default("claude"),
  API_SECRET: z.string().min(1).default("change-me-to-a-random-string"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  cached = EnvSchema.parse(process.env);
  debug("loaded", {
    GOG_BIN: cached.GOG_BIN,
    CLAUDE_BIN: cached.CLAUDE_BIN,
    API_PORT: cached.API_PORT,
    WEB_PORT: cached.WEB_PORT,
  });
  return cached;
}
