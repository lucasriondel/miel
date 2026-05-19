import type { Config } from "drizzle-kit";

export default {
  schema: "./packages/core/src/db/schema.ts",
  out: "./packages/core/drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
