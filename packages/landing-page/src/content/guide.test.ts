import { describe, expect, test } from "bun:test";
// The provider a fresh install runs on, read from the catalogue rather than
// spelled out here: the guide's claims about it are checked against the code.
import { DEFAULT_PROVIDER } from "@miel/core/providerModels";
// The OAuth setup walkthrough all three surfaces render (#138), read from core
// rather than restated: the page mirrors those steps, it does not own them.
import { DEV_GOOGLE_REDIRECT_URI, GOOGLE_OAUTH_SETUP_STEPS } from "@miel/core/googleOAuthSetup";
import { CONTRIBUTING, GUIDE_SECTIONS, INSTALLATION, MOTIVATION, allGuideText } from "./guide";
// The vendors a reader can point Miel at, derived from core's catalogue (#114)
// rather than listed here — a fourth one has to reach the copy to pass.
import { HOSTED_VENDOR_NAMES, LOCAL_PROVIDER_NAME } from "./vendors";

/**
 * The three sections the side menu navigates between. The facts asserted here
 * are the ones a reader acts on — the commands above all: a wrong clone URL or
 * a stale migrate path sends someone to a shell that fails.
 */
describe("guide sections", () => {
  test("are the three the side menu offers, in order", () => {
    expect(GUIDE_SECTIONS.map((section) => section.id)).toEqual([
      "motivation",
      "installation",
      "contributing",
    ]);
  });

  test("every section has a stable unique id, a nav label, a heading and body copy", () => {
    const ids = GUIDE_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of GUIDE_SECTIONS) {
      expect(section.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(section.navLabel.length).toBeGreaterThan(0);
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.body.length).toBeGreaterThan(0);
    }
  });

  test("every step is labelled, so the ordered list reads without its commands", () => {
    for (const section of GUIDE_SECTIONS) {
      for (const step of section.steps ?? []) {
        expect(step.label.length).toBeGreaterThan(0);
      }
    }
  });

  /* The prose is rendered as HTML, never through a Markdown pass, so a backtick
     someone typed out of habit reaches the reader as a backtick. Commands go in
     a step's `code` block, which is formatted as code. */
  test("prose carries no Markdown, since nothing renders it", () => {
    const prose = GUIDE_SECTIONS.flatMap((section) => [
      ...section.body,
      ...(section.steps ?? []).flatMap((step) => [
        step.label,
        ...(step.body ? [step.body] : []),
        ...(step.substeps ?? []),
      ]),
    ]);
    for (const paragraph of prose) {
      expect(paragraph).not.toContain("`");
      expect(paragraph).not.toMatch(/\*\*|\[.+\]\(.+\)/);
    }
  });
});

describe("motivation", () => {
  const text = MOTIVATION.body.join("\n");

  test("says what the tool decides and what the reader still decides", () => {
    expect(text).toMatch(/priorit/i);
    expect(text).toMatch(/proposals/i);
    expect(text).toMatch(/until you apply/i);
  });

  test("repeats that it is self-hosted with no hosted version", () => {
    expect(text).toMatch(/self-hosted/i);
    expect(text).toMatch(/no hosted version/i);
  });

  /* Issue #106: the point of this assertion is that the section admits mail
     leaves the machine — so it checks the disclosure, not one vendor's name,
     which is no longer the only one that can receive it. */
  test("does not claim the whole thing is local, since triage is not", () => {
    expect(text).toMatch(/leaves your machine/i);
    expect(text).toMatch(/AI provider/i);
  });

  /* Issue #114: the sentence that admits mail leaves the machine has to offer
     the same choice the installation steps do. Enumerating the hosted vendors
     alone tells the reader who takes the default — the local Claude Code CLI,
     which the next section hands them — that their mail goes to one of three
     companies, none of which is the one running it. The vendor half is read
     from the catalogue, so a fourth vendor fails here rather than going
     unmentioned. */
  test("offers the whole provider choice, the local one included", () => {
    const sentence = text
      .split(/(?<=\.)\s+/)
      .find((candidate) => /leaves your machine/i.test(candidate));
    expect(sentence).toBeDefined();
    expect(sentence).toContain(LOCAL_PROVIDER_NAME);
    for (const vendor of HOSTED_VENDOR_NAMES) {
      expect(sentence).toContain(vendor);
    }
  });
});

describe("installation", () => {
  const commands = (INSTALLATION.steps ?? []).flatMap((step) => (step.code ? [step.code] : []));
  const all = commands.join("\n");

  /* Issue #106: picking a provider and pasting its key happens in the settings
     UI, so that step has prose and no shell. Issue #115: the exception is now
     anchored on that step's own label, because "one fewer command than steps"
     was an allowance no particular step held — let the provider step gain a
     command and the budget silently moves to whichever other step lost one, and
     the guide ships an install path with a shell line missing. Issue #138 adds
     the second and, one hopes, last of them: the OAuth client is made in
     Google's console, which no command reaches either. Each is named, so a
     third has to be argued for here rather than absorbed. */
  const OUTSIDE_A_SHELL = [/provider/i, /Google OAuth client/i];
  const outsideAShell = (step: { label: string }) =>
    OUTSIDE_A_SHELL.some((pattern) => pattern.test(step.label));

  test.each(OUTSIDE_A_SHELL)("%s is exactly one step, and it explains itself in prose", (label) => {
    const matched = (INSTALLATION.steps ?? []).filter((step) => label.test(step.label));
    expect(matched).toHaveLength(1);
    // Prose is what replaces the command, so it cannot be empty either — as a
    // paragraph, as an ordered walkthrough, or as both.
    const step = matched[0]!;
    expect((step.body ?? "").length + (step.substeps ?? []).length).toBeGreaterThan(0);
  });

  test("gives every other step the command the reader has to run", () => {
    for (const step of INSTALLATION.steps ?? []) {
      if (outsideAShell(step)) continue;
      expect((step.code ?? "").length).toBeGreaterThan(0);
    }
  });

  /* The clone line is the SSH form the README uses, so match the repository
     rather than the https URL the call to action links to. */
  test("clones the repository the call to action points at", () => {
    expect(all).toMatch(/github\.com[:/]lucasriondel\/miel/);
  });

  test("installs with bun rather than npm or pnpm", () => {
    expect(all).toMatch(/bun install/);
    expect(all).not.toMatch(/\b(npm|pnpm|yarn) install\b/);
  });

  /* The API runs runMigrations() on boot (packages/api/src/index.ts), so a
     manual migrate command in the guide is a step the reader does not need. */
  test("does not ask the reader to run migrations by hand", () => {
    expect(all).not.toContain("db/migrate.ts");
  });

  test("starts Postgres from the dev compose file, not the full stack one", () => {
    expect(all).toContain("docker compose -f docker-compose.dev.yml up -d");
  });

  test("offers the Docker-only route as well as the Bun one", () => {
    expect(all).toContain("docker compose up -d --build");
  });

  test("tells the reader the two secrets that must match", () => {
    const prose = (INSTALLATION.steps ?? []).map((step) => step.body ?? "").join("\n");
    expect(prose).toContain("API_SECRET");
    expect(prose).toContain("VITE_API_SECRET");
    expect(prose).toMatch(/match/i);
  });

  /* Issue #106. Three facts a fresh reader now acts on, each one wrong in the
     pre-#105 copy. */
  describe("the provider a reader has to choose", () => {
    const prose = (INSTALLATION.steps ?? []).map((step) => step.body ?? "").join("\n");

    /* #106 made this prerequisite conditional; #112 says which way round the
       condition runs. The CLI is what a fresh install needs — the API key is
       what the reader who changes provider needs instead. */
    test("makes the Claude Code CLI the default's prerequisite and the API key the alternative", () => {
      const body = INSTALLATION.body.join("\n");
      expect(body).toMatch(/Claude Code CLI/);
      expect(body).toMatch(/change the provider|instead/i);
      for (const vendor of HOSTED_VENDOR_NAMES) {
        expect(body).toContain(vendor);
      }
    });

    /* After #104 a hosted provider's key is a row in Postgres, not a line in
       .env, so the environment step must stop implying otherwise. */
    test("keeps the hosted provider key out of the environment step", () => {
      const envStep = (INSTALLATION.steps ?? []).find((step) =>
        step.code?.includes(".env.example"),
      );
      expect(envStep).toBeDefined();
      expect(envStep?.body ?? "").not.toMatch(/API key/i);
      expect(prose).not.toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY|GOOGLE_API_KEY/);
    });

    /* The Claude Code token stopped being an env var too, so the environment
       step must not send a reader to fill one in. It may still name the
       variable to say it is not read — what it may not do is present it as
       something to set. */
    test("does not tell the reader to put the Claude Code token in .env", () => {
      const envStep = (INSTALLATION.steps ?? []).find((step) =>
        step.code?.includes(".env.example"),
      );
      const body = envStep?.body ?? "";
      const code = envStep?.code ?? "";
      expect(code).not.toMatch(/CLAUDE_CODE_OAUTH_TOKEN\s*=/);
      if (body.includes("CLAUDE_CODE_OAUTH_TOKEN")) {
        expect(body).toMatch(/no|not|nothing/i);
      }
    });

    /* The install path has to reach the point where the reader knows which
       provider is running their mail through what, and how to change it. */
    test("ends with the settings step where the provider is chosen", () => {
      const labels = (INSTALLATION.steps ?? []).map((step) => step.label);
      expect(labels.some((label) => /provider/i.test(label))).toBe(true);
      expect(prose).toMatch(/settings/i);
      expect(prose).toMatch(/API key/i);
      expect(prose).toMatch(/encrypted/i);
    });
  });

  /* Issue #138. "You will also need a Google Cloud project with the Gmail API
     enabled and an OAuth client of type Web application" is a prerequisite a
     reader cannot act on: it names the destination and none of the six things
     that have to happen in someone else's console to get there. The steps are
     core's — the README and the onboarding dialog render the same list — so
     what is checked here is that this page renders them, in order, and where a
     reader meets them before they are needed. */
  describe("the Google OAuth client a reader has to create", () => {
    const step = (INSTALLATION.steps ?? []).find((candidate) =>
      /Google OAuth client/i.test(candidate.label),
    );

    test("is a step of its own, not a clause in the prerequisites", () => {
      expect(step).toBeDefined();
      expect(step?.variant).toBeUndefined(); // Both install paths need it.
    });

    test("walks through core's steps, in the order the console imposes", () => {
      expect(step?.substeps).toHaveLength(GOOGLE_OAUTH_SETUP_STEPS.length);
      for (const [index, setup] of GOOGLE_OAUTH_SETUP_STEPS.entries()) {
        expect(step?.substeps?.[index]).toContain(setup.title);
        expect(step?.substeps?.[index]).toContain(setup.detail);
      }
    });

    // The values are what the environment step asks the reader to paste, so
    // meeting them afterwards is meeting them too late.
    test("comes before the step that asks for the values it produces", () => {
      const labels = (INSTALLATION.steps ?? []).map((candidate) => candidate.label);
      const envStep = (INSTALLATION.steps ?? []).findIndex((candidate) =>
        candidate.code?.includes(".env.example"),
      );
      expect(labels.findIndex((label) => /Google OAuth client/i.test(label))).toBeLessThan(envStep);
    });

    test("reaches the built page, which is what the prerender check compares", () => {
      const text = allGuideText();
      for (const setup of GOOGLE_OAUTH_SETUP_STEPS) expect(text).toContain(setup.title);
      // The one value a reader copies rather than reads.
      expect(text).toContain(DEV_GOOGLE_REDIRECT_URI);
    });
  });

  /* Issue #112. SETTING_DEFAULTS ships a provider, so a fresh install triages
     from its first sync — through the local CLI, which means mail has already
     left the machine by the time anyone opens Settings. The guide said the
     opposite, and the homepage disclosure points here for the name of the
     default, so these three assertions are what keeps that pointer honest. */
  describe("the provider a fresh install already runs on", () => {
    const text = allGuideText();

    /* Both halves in one sentence, not two independent facts: "claude-code
       appears somewhere" and "the word default appears somewhere" were both
       satisfied by copy that named the provider in one paragraph and said
       "working localhost defaults" in another, which is not what the homepage
       promises a reader will find here. */
    test("says in one breath that the id the settings row holds is the default", () => {
      expect(text).toContain(DEFAULT_PROVIDER);
      expect(text).toMatch(
        new RegExp(
          `${DEFAULT_PROVIDER}[^.]*\\bdefault\\b|\\bdefault\\b[^.]*${DEFAULT_PROVIDER}`,
          "i",
        ),
      );
    });

    test("makes the default provider's token required, not an if-you-fancy-it extra", () => {
      const envStep = (INSTALLATION.steps ?? []).find((step) =>
        step.code?.includes(".env.example"),
      );
      const body = envStep?.body ?? "";
      expect(body).toContain("claude setup-token");
      expect(body).toMatch(/required/i);
      // It is optional only for the reader who has gone and picked a vendor
      // instead — so the exemption has to be stated as a condition, not as the
      // default reading.
      expect(body).toMatch(/optional|unless/i);
      expect(body).not.toMatch(/only if you intend to triage through the local CLI/i);
    });

    test("claims nowhere that a fresh install triages nothing", () => {
      expect(text).not.toMatch(/nothing gets triaged/i);
      expect(text).not.toMatch(/until (one|a) provider is configured/i);
    });
  });
});

describe("contributing", () => {
  test("points at the conventions document rather than restating it", () => {
    expect(CONTRIBUTING.body.join("\n")).toContain("CLAUDE.md");
  });

  // Issue #102: CLAUDE.md is written for the agents that work on this repo.
  // CONTRIBUTING.md is the same ground addressed to a person, and it is the one
  // a reader arriving from this page should be sent to first.
  test("names the contributor guide, not only the agent instructions", () => {
    expect(CONTRIBUTING.body.join("\n")).toContain("CONTRIBUTING.md");
  });

  test("names the checks to run before opening a pull request", () => {
    const code = (CONTRIBUTING.steps ?? []).map((step) => step.code ?? "").join("\n");
    expect(code).toContain("bun run typecheck");
    expect(code).toContain("bun run test");
    // Issue #97: oxfmt is repo-wide, so an unformatted branch is a failing
    // check like the other three. `format:check`, not `format` — the reader is
    // being told how to verify, not how to rewrite their tree.
    expect(code).toContain("bun run format:check");
    expect(code).not.toMatch(/bun run format$/m);
  });
});

describe("the joined text", () => {
  test("carries every heading and nav label, so the built-page check sees them", () => {
    for (const section of GUIDE_SECTIONS) {
      expect(allGuideText()).toContain(section.heading);
      expect(allGuideText()).toContain(section.navLabel);
    }
  });

  test("carries the step prose, which is where the environment facts live", () => {
    expect(allGuideText()).toContain("TOKEN_ENCRYPTION_KEY");
  });
});
