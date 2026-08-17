/**
 * Post-build step: turn `dist/client` (TanStack Start's prerendered output plus
 * its client bundle) into `dist/public`, which holds nothing but self-contained
 * HTML — no scripts, no stylesheets, no fonts, no images.
 *
 * `dist/public` is what gets copied into the nginx document root.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Glob } from "bun";
import { findExternalReferences, staticizeHtml } from "../src/build/staticize";

const packageRoot = resolve(import.meta.dirname, "..");
const clientDir = join(packageRoot, "dist", "client");
const publicDir = join(packageRoot, "dist", "public");

if (!existsSync(clientDir)) {
  throw new Error(`staticize: ${clientDir} does not exist — run \`vite build\` first`);
}

const pages = [...new Glob("**/*.html").scanSync(clientDir)].toSorted();
if (pages.length === 0) {
  throw new Error(`staticize: no prerendered HTML found in ${clientDir}`);
}

rmSync(publicDir, { recursive: true, force: true });

for (const page of pages) {
  const source = readFileSync(join(clientDir, page), "utf8");

  const html = staticizeHtml(source, (url) => {
    const assetPath = join(clientDir, url.replace(/^\//, "").split("?")[0]!);
    if (!relative(clientDir, assetPath).startsWith("..") && existsSync(assetPath)) {
      return readFileSync(assetPath, "utf8");
    }
    return null;
  });

  const leftovers = findExternalReferences(html);
  if (leftovers.length > 0) {
    throw new Error(`staticize: ${page} still references external assets: ${leftovers.join(", ")}`);
  }

  const target = join(publicDir, page);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
  console.log(`staticize: ${page} (${html.length} bytes)`);
}
