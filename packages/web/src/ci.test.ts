import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Issue #103. The gate #98 added ran lint, format:check and typecheck and said
// so in its header comment, with the reason tests were left out: @miel/core and
// @miel/api talk to a real Postgres. Once the repo is public that gap means an
// outside contributor's pull request can go green while breaking tests nobody
// ran, so the workflow now provisions a Postgres service container and runs the
// suite against it.
//
// The assertions below read the workflow rather than restating it: the Postgres
// major is compared against the one docker-compose.dev.yml runs locally, and the
// connection string against the service's own credentials, so moving either
// half without the other fails here.
//
// This file also owns the #98 gate assertions, which used to sit in
// linting.test.ts — the workflow covers more than linting now.
const repoRoot = resolve(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const workflow = read(".github/workflows/ci.yml");
const compose = read("docker-compose.dev.yml");
const rootManifest = JSON.parse(read("package.json")) as {
  packageManager: string;
};

/** Everything above `name:`, i.e. the comment block explaining what the gate is. */
const header = workflow.slice(0, workflow.search(/^name:/m));

/**
 * One `jobs:` entry's body — its lines up to the next key at the same indent.
 * Enough structure for these checks without a YAML parser, which the Bun the
 * workflow pins may not ship.
 */
const job = (name: string) => {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) return "";
  const after = lines.slice(start + 1);
  const end = after.findIndex((line) => /^ {2}\S/.test(line));
  return (end === -1 ? after : after.slice(0, end)).join("\n");
};

const testsJob = job("tests");

/** `postgres:16` in docker-compose.dev.yml -> `16`. */
const localPostgresMajor = compose.match(/image:\s*postgres:(\d+)/)?.[1];

/** The one connection string the test job hands the suite. */
const ciDatabaseUrl = testsJob.match(/DATABASE_URL:\s*(\S+)/)?.[1];

describe("the CI gate", () => {
  test("runs on pull requests", () => {
    expect(workflow).toMatch(/^on:/m);
    expect(workflow).toContain("pull_request");
  });

  test.each(["bun run lint", "bun run format:check", "bun run typecheck", "bun run test"])(
    "runs `%s`",
    (command) => {
      expect(workflow).toContain(command);
    },
  );

  // Each check is its own step, so a failure fails the job rather than being
  // swallowed by whatever runs after it on the same line.
  test("gives each check its own step", () => {
    const steps = workflow.match(/^\s*- run: bun run /gm) ?? [];
    expect(steps.length).toBe(4);
  });

  test.each(["checks", "tests"])("job `%s` installs the Bun the repo pins", (name) => {
    const pinned = rootManifest.packageManager.replace("bun@", "");
    expect(job(name)).toContain("oven-sh/setup-bun");
    expect(job(name)).toContain(`bun-version: ${pinned}`);
    expect(pinned.startsWith("1.3.")).toBe(true);
  });

  test.each(["checks", "tests"])(
    "job `%s` installs from the lockfile, so CI cannot resolve a different tree",
    (name) => {
      expect(job(name)).toContain("bun install --frozen-lockfile");
    },
  );

  // The static checks answer in under a minute; the suite has a database to
  // wait on. Separate jobs mean the fast feedback is not held behind the slow.
  test("keeps the static checks in a job of their own", () => {
    expect(job("checks")).toContain("bun run lint");
    expect(job("checks")).not.toContain("bun run test");
    expect(testsJob).toContain("bun run test");
  });
});

describe("the Postgres the test job runs against", () => {
  test("is a service container, not something the suite has to start itself", () => {
    expect(testsJob).toMatch(/^\s{4}services:/m);
    expect(testsJob).toMatch(/image:\s*postgres:/);
  });

  test("is the major docker-compose.dev.yml runs locally", () => {
    expect(localPostgresMajor).toBeDefined();
    expect(testsJob).toContain(`image: postgres:${localPostgresMajor}`);
  });

  // Actions starts the service alongside the job; without a health check the
  // first step can reach it before it accepts connections.
  test("is health-checked, so the suite cannot race the server's first boot", () => {
    expect(testsJob).toContain("--health-cmd");
    expect(testsJob).toContain("pg_isready");
  });

  test("is what DATABASE_URL points at, credentials included", () => {
    expect(ciDatabaseUrl).toBeDefined();
    const url = new URL(ciDatabaseUrl!);
    expect(url.protocol).toBe("postgres:");
    expect(["localhost", "127.0.0.1"]).toContain(url.hostname);

    const serviceEnv = (key: string) => testsJob.match(new RegExp(`${key}:\\s*(\\S+)`))?.[1];
    expect(url.username).toBe(serviceEnv("POSTGRES_USER")!);
    expect(url.password).toBe(serviceEnv("POSTGRES_PASSWORD")!);
    expect(url.pathname.slice(1)).toBe(serviceEnv("POSTGRES_DB")!);

    // The host side of the published mapping, which is the only port the job's
    // own steps can reach.
    const published = testsJob.match(/- (\d+):(\d+)/);
    expect(published).not.toBeNull();
    expect(url.port).toBe(published![1]!);
  });

  test("is thrown away with the runner, so no test can leave residue behind", () => {
    // A service container lives and dies with the job; the only way this stops
    // being true is a volume being mounted into it.
    expect(testsJob).not.toContain("volumes:");
  });
});

describe("migrations", () => {
  test("are applied by a step of their own", () => {
    expect(testsJob).toContain("packages/core/src/db/migrate.ts");
  });

  // turbo runs the packages' test tasks concurrently, so leaving the schema to
  // whichever suite reaches the migrator first is ordering by luck.
  test("run before the suite does", () => {
    const migrate = testsJob.indexOf("migrate.ts");
    const suite = testsJob.indexOf("bun run test");
    expect(migrate).toBeGreaterThan(-1);
    expect(suite).toBeGreaterThan(migrate);
  });
});

describe("the header comment", () => {
  test("no longer claims the suite is excluded from the gate", () => {
    expect(header).not.toMatch(/tests[\s\S]{0,40}(deliberately absent|absent|excluded)/i);
  });

  test("says what the second job is for", () => {
    expect(header.toLowerCase()).toContain("postgres");
  });
});

describe("the per-package test scripts", () => {
  const SCRIPTS = ["packages/core/scripts/test-with-db.sh", "packages/api/scripts/test-with-db.sh"];

  /**
   * Run the script with a DATABASE_URL already set, as the workflow does. The
   * run itself fails — the address is deliberately dead — but what it printed
   * before failing says which path it took.
   */
  const runWithExternalDb = (script: string) =>
    Bun.spawnSync(["bash", script], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: "postgres://miel:miel@127.0.0.1:1/miel_test" },
    });

  test.each(SCRIPTS)("%s starts no container when DATABASE_URL is already set", (script) => {
    const result = runWithExternalDb(script);
    const output =
      new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    expect(output).not.toContain("starting ephemeral Postgres");
    expect(output).not.toContain("no healthy Docker daemon");
  });

  test.each(SCRIPTS)("%s still applies migrations against that database", (script) => {
    const output = new TextDecoder().decode(runWithExternalDb(script).stdout);
    expect(output).toContain("applying migrations");
  });

  test.each(SCRIPTS)("%s still provisions its own Postgres when none is named", (script) => {
    // The unset branch is the local one — it has to keep starting a container,
    // and the docker call is what proves it is still there.
    expect(read(script)).toContain("docker run --rm -d");
  });
});

describe("the documentation", () => {
  test("CLAUDE.md does not still say the suite is out of the gate", () => {
    const claudeMd = read("CLAUDE.md");
    const paragraph = claudeMd
      .split("\n\n")
      .find((block) => block.includes(".github/workflows") && block.includes("pull request"));
    expect(paragraph).toBeDefined();
    expect(paragraph).toContain("bun run test");
    expect(paragraph).not.toMatch(/tests[\s\S]{0,40}not in the gate/i);
  });

  // The gate's commands live in CONTRIBUTING.md, not the README — #102 moved
  // them there so there is one copy to keep current, and the README now links to
  // it. This asserts against that copy.
  test("CONTRIBUTING.md lists the suite among the checks a pull request is gated on", () => {
    const contributing = read("CONTRIBUTING.md");
    const gate = contributing.split("\n").find((line) => line.includes("gated on"));
    expect(gate).toBeDefined();
    expect(gate).not.toContain("three checks");

    // The block right after that sentence — CONTRIBUTING.md opens with a setup
    // block, so the first one in the file is the wrong one.
    const commands = contributing
      .slice(contributing.indexOf(gate!))
      .split("```bash")[1]
      ?.split("```")[0];
    expect(commands).toContain("bun run test");
  });
});
