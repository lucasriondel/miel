import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

/**
 * TanStack Start, prerendered rather than served: `vite build` writes plain HTML
 * for every page in `pages` into `dist/client`, and `scripts/staticize.ts` then
 * strips the hydration scripts so the output needs no JavaScript at runtime.
 *
 * Dev takes port 5200 from the shared registry (~/dev/PORTS.md) with strict-port,
 * so a clash fails loudly instead of drifting.
 */
export default defineConfig({
  // Pinned here rather than only in the `dev` script so the port holds however the
  // server is started — `vite dev` straight from the package directory included.
  server: { port: 5200, strictPort: true },
  // The prerenderer boots a throwaway preview server and fetches every page from
  // it. Pin the loopback address so the URL it resolves is one `fetch` can reach
  // regardless of how `localhost` happens to resolve on the build machine. No
  // port pin here: that server is transient and must take whatever is free.
  preview: { host: "127.0.0.1" },
  plugins: [
    tanstackStart({
      // Every route, listed rather than left to link-crawling alone, so a page
      // that lost its inbound link would still be prerendered.
      pages: [{ path: "/" }, { path: "/privacy" }, { path: "/terms" }],
      prerender: { enabled: true, crawlLinks: true, failOnError: true },
    }),
    viteReact(),
  ],
});
