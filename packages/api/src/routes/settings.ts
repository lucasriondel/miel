import { Hono } from "hono";
import { apiSchemas, getModelSettings, updateModelSettings } from "@miel/core";

export const settingsRoutes = new Hono();

settingsRoutes.get("/", async (c) => {
  const settings = await getModelSettings();
  return c.json(settings);
});

settingsRoutes.put("/", async (c) => {
  const body = apiSchemas.UpdateSettingsRequest.parse(await c.req.json());
  const settings = await updateModelSettings(body);
  return c.json(settings);
});
