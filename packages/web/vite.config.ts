import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { APP_BASE_URL } from "@miel/core/appBasePath";

const rootEnvDir = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootEnvDir, "");
  // Registry rows (~/dev/PORTS.md), not framework defaults: 3000/3001 are in
  // the reserved 3000-3099 band, which is kept free so a stray default never
  // collides with a registered app.
  const apiPort = env.API_PORT ?? "5531";
  const webPort = Number(env.WEB_PORT ?? "5230");
  // The app calls its API same-origin at /api in every environment, so both
  // the dev server and `vite preview` need the same hop in front of it — the
  // deployed nginx is what they are standing in for. Vite does not share
  // `server` config with `preview`, so the one rule is written here and spread
  // into both rather than typed twice.
  const apiProxy = {
    // Not under the base: the app calls its API same-origin at /api in
    // every environment, so the dev proxy matches the deployed nginx.
    "/api": {
      // Behind portless the API's port is ephemeral, so its hostname is the
      // only stable address; run directly, the registry's row is.
      // `PORTLESS_URL` is set in every child portless spawns, which makes it
      // the signal for which of the two is in play.
      target: process.env.PORTLESS_URL
        ? "https://api.miel.localhost"
        : `http://localhost:${apiPort}`,
      // Required, not cosmetic: without it the forwarded `Host` header still
      // says `miel.localhost`, portless routes the request back here, and
      // answers the loop with `508 Loop Detected`.
      changeOrigin: true,
      ws: true,
      rewrite: (requestPath: string) => requestPath.replace(/^\/api/, ""),
    },
  };
  return {
    // The app is served under /app; the site root belongs to the public
    // landing pages. Emitted asset URLs carry the prefix, and the value shows
    // up at runtime as import.meta.env.BASE_URL (see src/lib/basePath.ts).
    base: APP_BASE_URL,
    plugins: [react(), tailwindcss()],
    envDir: rootEnvDir,
    resolve: {
      // The shadcn CLI rewrites relative imports in vendored source to this
      // alias (see components.json), so it has to resolve here and in
      // tsconfig.json's `paths` alike.
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      // Portless (`portless.json` at the root) hands each child an ephemeral
      // port in `PORT`; WEB_PORT / the registry's row is what the package binds
      // when run directly (`PORTLESS=0 bun dev:app`). Taking `PORT` first serves
      // both spellings off one config, and strictPort still holds for the pinned
      // case — a taken row fails the boot instead of drifting to the next one.
      port: Number(process.env.PORT ?? webPort),
      strictPort: true,
      proxy: apiProxy,
    },
    // `bun start` serves the built bundle rather than rebuilding it, so the
    // same port rule and the same API hop apply — a preview without the proxy
    // would load the app and fail every request it makes.
    preview: {
      port: Number(process.env.PORT ?? webPort),
      strictPort: true,
      proxy: apiProxy,
    },
  };
});
