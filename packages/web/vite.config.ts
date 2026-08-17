import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { APP_BASE_URL } from "@miel/core/appBasePath";

const rootEnvDir = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootEnvDir, "");
  const apiPort = env.API_PORT ?? "3001";
  const webPort = Number(env.WEB_PORT ?? "3000");
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
      port: webPort,
      proxy: {
        // Not under the base: the app calls its API same-origin at /api in
        // every environment, so the dev proxy matches the deployed nginx.
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
          ws: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ""),
        },
      },
    },
  };
});
