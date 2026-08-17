import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { APP_BASE_PATH } from "@miel/core/appBasePath";
import { PAGE_CONTRACTS, pageFileCandidates } from "../build/verifyPrerendered";
import {
  copiesIn,
  type DockerStage,
  parseCopy,
  parseInstructions,
  parseStages,
} from "./dockerfile";
import { locationFor, parseServer, valueOf } from "./nginx";
import {
  API_PROXY_PATH,
  backendForPath,
  DEFAULT_SITE_HOST,
  GATED_PREFIXES,
  LANDING_CONTAINER,
  PATH_ROUTES,
  WEB_CONTAINER,
} from "./topology";

/**
 * The landing pages ship as their own image, and the app's image must stay free
 * of them: a self-hoster builds the app, not the owner's public site. Both halves
 * of that are properties of files nothing else in the suite reads.
 */
const packageRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(packageRoot, "../..");

const landingDockerfile = readFileSync(join(packageRoot, "Dockerfile"), "utf8");
const nginxConf = readFileSync(join(packageRoot, "nginx.conf"), "utf8");
const webDockerfile = readFileSync(join(repoRoot, "packages/web/Dockerfile"), "utf8");
const webNginx = readFileSync(join(repoRoot, "packages/web/nginx.conf.template"), "utf8");
const deployDoc = readFileSync(join(repoRoot, "DEPLOY.md"), "utf8");

/** Where the nginx image serves from. The Dockerfile and the config must agree. */
const DOCUMENT_ROOT = "/usr/share/nginx/html";

const landingStages = parseStages(landingDockerfile);
const webStages = parseStages(webDockerfile);

function stage(stages: DockerStage[], alias: string): DockerStage {
  const found = stages.find((candidate) => candidate.alias === alias);
  if (!found) throw new Error(`no stage aliased ${alias}`);
  return found;
}

/** The install line, and everything copied in before it runs. */
function installStep(builder: DockerStage) {
  const index = builder.instructions.findIndex(
    (instruction) => instruction.name === "RUN" && instruction.value.includes("bun install"),
  );
  expect(index).toBeGreaterThan(0);
  return {
    command: builder.instructions[index]!.value,
    copies: builder.instructions
      .slice(0, index)
      .filter((instruction) => instruction.name === "COPY")
      .map((instruction) => parseCopy(instruction.value)),
  };
}

describe("the landing image", () => {
  test("builds on Bun and runs on nginx, and nothing else", () => {
    expect(landingStages.map((s) => s.alias)).toEqual(["builder", "runner"]);
    expect(stage(landingStages, "builder").image).toStartWith("oven/bun:");
    expect(stage(landingStages, "runner").image).toStartWith("nginx:");
  });

  /**
   * This image was buildable by a cloner before the app was: it never copied the
   * root `.npmrc` that pointed `@lucasriondel/*` at GitHub Packages, and never
   * took the token that file read. #74 removed both, and the app's images now
   * match this shape — but the property is this image's own, and it holds
   * whatever the app takes on later.
   */
  test("needs no registry credential — no .npmrc, no token, no private scope", () => {
    // Instructions, not the whole file: the comments say why these are absent,
    // and a Dockerfile that explains itself is worth more than one that can't
    // spell the thing it avoids.
    for (const instruction of parseInstructions(landingDockerfile)) {
      expect(instruction.value).not.toContain(".npmrc");
      expect(instruction.value).not.toContain("NODE_AUTH_TOKEN");
      expect(instruction.value).not.toContain("@lucasriondel");
    }
  });

  test("installs only this package's dependencies, so the app's private ones are never fetched", () => {
    const { command } = installStep(stage(landingStages, "builder"));
    expect(command).toContain("--filter=@miel/landing-page");
    expect(command).toContain("--frozen-lockfile");
  });

  /**
   * `--frozen-lockfile` compares the lockfile against every workspace member's
   * manifest, so all of them have to be in the image even though only two are
   * built. A package added to the workspace and forgotten here fails the install,
   * which is why the list is read off the repository rather than restated.
   */
  test("copies every workspace manifest before installing", () => {
    const { copies } = installStep(stage(landingStages, "builder"));
    const copied = copies
      .flatMap((copy) => copy.sources)
      .filter((source) => source.startsWith("packages/") && source.endsWith("package.json"));
    const manifests = [...new Glob("packages/*/package.json").scanSync(repoRoot)];
    expect(copied.toSorted()).toEqual(manifests.toSorted());
  });

  test("copies only core and its own source into the build", () => {
    const trees = copiesIn(stage(landingStages, "builder"))
      .flatMap((copy) => copy.sources)
      .filter((source) => source.startsWith("packages/") && !source.endsWith(".json"));
    expect(trees.toSorted()).toEqual(["packages/core", "packages/landing-page"]);
  });

  /**
   * Running the package's own `build` script rather than `vite build` means the
   * staticize step and the prerendered-output check run inside the image: a page
   * that stopped carrying its text as raw HTML fails the image build.
   */
  test("runs the package's build script, so the prerender check gates the image", () => {
    const runs = stage(landingStages, "builder")
      .instructions.filter((instruction) => instruction.name === "RUN")
      .map((instruction) => instruction.value);
    const build = runs.find((run) => run.includes("bun run build"));
    expect(build).toBeDefined();
    expect(build).toContain("packages/landing-page");
    expect(runs.some((run) => run.includes("vite build"))).toBe(false);
  });

  test("serves the staticized output, not the hydrating client build", () => {
    const copies = copiesIn(stage(landingStages, "runner"));
    const pages = copies.find((copy) => copy.from === "builder");
    expect(pages?.sources).toEqual(["/repo/packages/landing-page/dist/public"]);
    expect(pages?.dest).toBe(DOCUMENT_ROOT);
  });

  test("ships this package's nginx config as the server config", () => {
    const copies = copiesIn(stage(landingStages, "runner"));
    const conf = copies.find((copy) => copy.dest.startsWith("/etc/nginx/"));
    expect(conf?.sources).toEqual(["packages/landing-page/nginx.conf"]);
    expect(conf?.dest).toBe("/etc/nginx/conf.d/default.conf");
  });

  test("listens on 80, the port the reverse proxy sends the site root to", () => {
    const runner = stage(landingStages, "runner");
    expect(runner.instructions).toContainEqual({ name: "EXPOSE", value: "80" });
  });

  /**
   * The web image substitutes `API_UPSTREAM` into its config at boot. This one
   * proxies nothing and needs no runtime configuration at all, so there is no
   * template and nothing to forget to set in the dashboard.
   */
  test("needs no runtime environment", () => {
    const runner = stage(landingStages, "runner");
    expect(runner.instructions.filter((instruction) => instruction.name === "ENV")).toEqual([]);
    expect(nginxConf).not.toContain("${");
  });
});

describe("the landing image's nginx config", () => {
  const landing = parseServer(nginxConf);
  /** What answers a page request, i.e. the block the whole site is served by. */
  const pages = locationFor(landing, "/");

  test("serves from the directory the Dockerfile copies the pages into", () => {
    expect(valueOf(landing, "root")).toBe(DOCUMENT_ROOT);
    expect(valueOf(landing, "listen")).toBe("80");
  });

  /** The copy is full of em dashes and arrows, and nginx ships `charset off`. */
  test("names the encoding, so the pages cannot arrive as mojibake", () => {
    expect(valueOf(landing, "charset")).toBe("utf-8");
  });

  /**
   * The legal pages are emitted as directory indexes (`privacy/index.html`) while
   * every link to them is extensionless (`/privacy`), so the fallback has to try
   * the directory as well as the file.
   */
  test("resolves the extensionless page links to their directory indexes", () => {
    const asDirectoryIndex = PAGE_CONTRACTS.filter((contract) =>
      pageFileCandidates(contract.route)[0]?.endsWith("/index.html"),
    );
    expect(asDirectoryIndex.length).toBeGreaterThan(0);
    expect(valueOf(landing, "index")).toBe("index.html");
    for (const contract of asDirectoryIndex) {
      expect(valueOf(locationFor(landing, contract.route)!, "try_files")).toContain("$uri/");
    }
  });

  /**
   * nginx adds the trailing slash on a directory with a redirect built from its
   * own idea of the scheme and port. Behind the tunnel that would point at
   * `http://…`, which Traefik answers with a 308 back — a loop. Relative
   * redirects keep the browser's scheme.
   */
  test("keeps redirects relative, so one cannot downgrade the scheme", () => {
    expect(valueOf(landing, "absolute_redirect")).toBe("off");
  });

  test("answers a miss with 404 rather than a landing page", () => {
    expect(valueOf(pages!, "try_files")).toContain("=404");
  });

  test("gates nothing: the pages are public and that is the point", () => {
    for (const directiveName of ["auth_basic", "auth_request", "satisfy"]) {
      expect(nginxConf).not.toContain(directiveName);
    }
  });

  test("proxies nothing: this container talks to no other service", () => {
    expect(nginxConf).not.toContain("proxy_pass");
  });
});

describe("the app's image", () => {
  test("has no landing-page build stage", () => {
    expect(webStages.map((s) => s.alias)).toEqual(["builder", "runner"]);
  });

  /**
   * One mention is allowed, and required: `--frozen-lockfile` compares the
   * lockfile against *every* workspace member's manifest (the same reason this
   * image copies them all), so the app's images have to copy this package's
   * manifest in or their install fails. Its source and its build must not
   * follow — that is what "no landing content in the app's image" means.
   */
  test("takes this package's manifest, which the frozen install needs, and nothing else", () => {
    const mentions = webStages.flatMap((built) =>
      built.instructions.filter((instruction) =>
        instruction.value.toLowerCase().includes("landing"),
      ),
    );
    expect(mentions).not.toEqual([]);
    for (const instruction of mentions) {
      expect(instruction.name).toBe("COPY");
      expect(parseCopy(instruction.value).sources).toEqual(["packages/landing-page/package.json"]);
    }
  });

  test("copies only core and its own source into the build", () => {
    const trees = copiesIn(stage(webStages, "builder"))
      .flatMap((copy) => copy.sources)
      .filter((source) => source.startsWith("packages/") && !source.endsWith(".json"));
    expect(trees.toSorted()).toEqual(["packages/core", "packages/web"]);
  });

  test("copies nothing into its nginx root but its own bundle", () => {
    const fromBuild = copiesIn(stage(webStages, "runner")).filter((copy) => copy.from);
    expect(fromBuild).toHaveLength(1);
    expect(fromBuild[0]?.sources).toEqual(["/repo/packages/web/dist"]);
    expect(fromBuild[0]?.dest).toBe(`${DOCUMENT_ROOT}${APP_BASE_PATH}`);
  });
});

/**
 * The other half of the split. The app's own image is the landing page's
 * business here for one reason: the two configs together decide whether a
 * reader ever meets a login prompt, and whether the app still answers under its
 * new prefix. Neither can be run in CI — no nginx, no Docker daemon — so the
 * config is read the way nginx would read it (see ./nginx.ts) and asked which
 * location answers a request.
 */
describe("the app's nginx config", () => {
  const app = parseServer(webNginx);

  test("serves out of the document root the image copies the bundle into", () => {
    expect(valueOf(app, "root")).toBe(DOCUMENT_ROOT);
  });

  test("sends the bare app URL to the directory form, so a bookmark without the slash works", () => {
    const bare = locationFor(app, APP_BASE_PATH);
    expect(bare?.modifier).toBe("=");
    expect(valueOf(bare!, "return")).toBe(`301 ${APP_BASE_PATH}/`);
  });

  /**
   * Same reason the landing image sets it, and it bites harder here: `return
   * 301 /app/` is a Location starting with `/`, which nginx makes absolute from
   * its own scheme — `http://` behind the tunnel. The browser would be sent off
   * the secure hop it was on, and Traefik's HTTP->HTTPS 308 would bounce it
   * back. Relative keeps the scheme the visitor already has.
   */
  test("keeps that redirect relative, so entering the app cannot downgrade the scheme", () => {
    expect(valueOf(app, "absolute_redirect")).toBe("off");
  });

  test("answers a deep link inside the app with the app's own index, so a reload lands", () => {
    const deepLink = locationFor(app, `${APP_BASE_PATH}/settings`);
    const fallback = valueOf(deepLink!, "try_files")?.split(/\s+/).at(-1);
    expect(fallback).toBe(`${APP_BASE_PATH}/index.html`);
  });

  test("404s a missing asset instead of handing back the index as JavaScript", () => {
    const asset = locationFor(app, `${APP_BASE_PATH}/assets/index-a1b2c3.js`);
    expect(asset?.modifier).toStartWith("~");
    expect(valueOf(asset!, "try_files")).toBe("$uri =404");
  });

  /**
   * The bundle calls its API same-origin at `/api`, outside the app prefix, and
   * nginx strips the prefix on the way through because the API mounts its routes
   * at root. A cross-origin arrangement failed here before: Cloudflare Access
   * rejected the credential-less preflight with no CORS headers.
   */
  test("proxies the API at the path the bundle calls, prefix stripped", () => {
    const api = locationFor(app, `${API_PROXY_PATH}/accounts`);
    expect(api?.pattern).toStartWith(API_PROXY_PATH);
    expect(APP_BASE_PATH.startsWith(API_PROXY_PATH)).toBe(false);
    expect(valueOf(api!, "rewrite")).toBe(`^${API_PROXY_PATH}/(.*)$ /$1 break`);
    expect(valueOf(api!, "proxy_pass")).toBeDefined();
  });

  /**
   * The routing property, from this side. Every path the landing container owns
   * is refused here rather than answered with the app: a single-page fallback at
   * the root would hide a misrouted `/` by serving the app to a reader who came
   * for the homepage — and that app is behind Access.
   */
  test("refuses the paths the landing container owns rather than answering them", () => {
    const landingPaths = ["/", ...PAGE_CONTRACTS.map((contract) => contract.route)];
    for (const path of landingPaths) {
      expect(backendForPath(path)).toBe(LANDING_CONTAINER);
      expect(valueOf(locationFor(app, path)!, "return")).toBe("404");
    }
  });
});

describe("the deployment documentation", () => {
  test("names the landing container and the Dockerfile that builds it", () => {
    expect(deployDoc).toContain(LANDING_CONTAINER);
    expect(deployDoc).toContain("packages/landing-page/Dockerfile");
  });

  test("states which container answers each path prefix", () => {
    const lines = deployDoc.split("\n");
    for (const route of PATH_ROUTES) {
      const documented = lines.some(
        (line) => line.includes(route.prefix) && line.includes(route.backend),
      );
      expect(documented).toBe(true);
    }
  });

  test("still names the web container, which keeps the app and the API proxy", () => {
    expect(deployDoc).toContain(WEB_CONTAINER);
  });

  test("spells out the Access policy change the owner has to apply, prefix by prefix", () => {
    const lines = deployDoc.split("\n");
    for (const prefix of GATED_PREFIXES) {
      const documented = lines.some(
        (line) => line.includes(prefix) && /access/i.test(line) && /polic|application/i.test(line),
      );
      expect(documented).toBe(true);
    }
  });

  /**
   * The default host, not `SITE_HOST`: this document is one worked deployment,
   * so its curl lines stay written against the host it was worked against even
   * when a self-hoster has configured their own.
   */
  test("gives a way to check each public page loads without logging in", () => {
    for (const contract of PAGE_CONTRACTS) {
      expect(deployDoc).toContain(`https://${DEFAULT_SITE_HOST}${contract.route}`);
    }
  });
});
