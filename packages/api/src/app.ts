import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { requestLog } from "./middleware/requestLog";
import { accountsRoutes } from "./routes/accounts";
import { authRoutes } from "./routes/auth";
import { googleOAuthCallbackRoutes, googleOAuthStartRoutes } from "./routes/googleOAuth";
import { filtersRoutes } from "./routes/filters";
import { labelsRoutes } from "./routes/labels";
import { logsRoutes } from "./routes/logs";
import { messagesRoutes } from "./routes/messages";
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
  app.use("*", requestLog());

  app.get("/health", (c) => c.json({ ok: true }));

  // Public OAuth callback: Google redirects the browser here with no bearer
  // token, so it must be mounted before the bearer middleware.
  app.route("/", googleOAuthCallbackRoutes);

  app.use("*", bearerAuth());

  app.route("/accounts", accountsRoutes);
  app.route("/auth", authRoutes);
  app.route("/auth", googleOAuthStartRoutes);
  app.route("/labels", labelsRoutes);
  app.route("/messages", messagesRoutes);
  app.route("/filters", filtersRoutes);
  app.route("/logs", logsRoutes);
  app.route("/settings", settingsRoutes);

  app.onError(errorHandler);
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
