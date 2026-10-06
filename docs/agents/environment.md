# Environment and deployment config

`.env` at repo root is the single source of truth — loaded by `bun run --env-file=../../.env` (api/cli) and by Vite via `envDir: '../..'`. See `.env.example`; parsed once via `getEnv()` in `packages/core/src/env.ts`. `VITE_API_SECRET` must match `API_SECRET` (web sends it as a bearer token).

The three Google OAuth values have one walkthrough (#138): `packages/core/src/googleOAuthSetup.ts` is a leaf module with the ordered steps as data, plus the callback path the API route mounts and the dev redirect URI `env.ts` defaults to. Two surfaces render that list: the onboarding gate's first step (`GoogleOAuthSteps.tsx`) and the landing page's installation guide (`GuideStep.substeps`). The README restates them in its own Markdown, and `contributorDocs.test.ts` checks its section against the same list.

`SITE_HOST` sits outside that schema: the public hostname the landing container (`/`), the app (`/app`) and the API proxy (`/api`) share. It is read by `packages/landing-page/src/deploy/topology.ts` and defaults to the reference deployment's host, so hosting miel elsewhere means setting it rather than editing source.

`CLAUDE_BIN` (default `claude`) is the Claude Code CLI `claude/Claude.ts` invokes headlessly, with the stored Claude Code token injected into the subprocess env. Gmail I/O is in-process via `googleapis` and needs no binary.

The API is not public-facing: it auths every non-`/health` route with `API_SECRET`, and CORS is locked to `http://localhost:5230` and `https://miel.localhost` by default.

The landing page ships as its own nginx image (`packages/landing-page/Dockerfile`); `packages/landing-page/src/deploy/topology.ts` holds the path split between it and `@miel/web`. `DEPLOY.md` covers the rest of deployment.
