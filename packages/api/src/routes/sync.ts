import { Hono } from "hono";
import { apiSchemas, syncAll } from "@miel/core";

export const syncRoutes = new Hono();

syncRoutes.post("/", async (c) => {
  const raw = c.req.header("content-length") === "0" ? {} : await c.req.json().catch(() => ({}));
  const body = apiSchemas.SyncRequest.parse(raw);
  const runs = await syncAll({
    accountEmail: body.account,
    since: body.since,
    range: body.range,
    max: body.max,
  });
  return c.json({ runs });
});
