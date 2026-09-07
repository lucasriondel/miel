import { Hono } from "hono";
import { listRuns } from "@miel/core";

export const logsRoutes = new Hono();

logsRoutes.get("/", async (c) => {
  const parsed = Number.parseInt(c.req.query("limit") ?? "", 10);
  const limit = Number.isFinite(parsed) ? parsed : undefined;
  const entries = await listRuns({ limit });
  return c.json({ entries });
});
