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
import { promoCodesRoutes } from "./routes/promoCodes";
import { settingsRoutes } from "./routes/settings";

export function createApp(opts: { webOrigin?: string } = {}) {
  const app = new Hono();
  // The registry's row for the web dev server (~/dev/PORTS.md), matching
  // env.ts's WEB_PORT default.
  const origin = opts.webOrigin ?? "http://localhost:5230";

  app.use(
    "*",
    cors({
      // Both spellings the SPA is reachable by in dev: WEB_ORIGIN is the port it
      // binds when run directly (`PORTLESS=0 bun dev`), `miel.localhost` the
      // hostname portless fronts it at (`portless.json`), where the port is
      // ephemeral. Allowing only one makes the other's requests fail preflight,
      // which reads as a broken API rather than a missing variable.
      origin: [origin, "https://miel.localhost"],
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
  app.route("/promo-codes", promoCodesRoutes);
  app.route("/logs", logsRoutes);
  app.route("/settings", settingsRoutes);

  app.onError(errorHandler);
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
