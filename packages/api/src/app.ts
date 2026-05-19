import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { accountsRoutes } from "./routes/accounts";
import { labelsRoutes } from "./routes/labels";
import { messagesRoutes } from "./routes/messages";
import { syncRoutes } from "./routes/sync";
import { settingsRoutes } from "./routes/settings";

export function createApp(opts: { webOrigin?: string } = {}) {
  const app = new Hono();
  const origin = opts.webOrigin ?? "http://localhost:3000";

  app.use(
    "*",
    cors({
      origin,
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.use("*", bearerAuth());

  app.route("/accounts", accountsRoutes);
  app.route("/labels", labelsRoutes);
  app.route("/messages", messagesRoutes);
  app.route("/sync", syncRoutes);
  app.route("/settings", settingsRoutes);

  app.onError(errorHandler);
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
