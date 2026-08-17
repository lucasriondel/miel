/**
 * The three guide sections the side menu navigates between: why Miel exists,
 * how to run it, and how to contribute.
 *
 * Copy is derived from the repository README, kept here as plain data for the
 * same reason as `site.ts` — it can be asserted on without rendering, and the
 * prerendered-output check compares the same strings against the built HTML.
 *
 * Installation carries real commands, so it is modelled as steps with an
 * optional code block rather than as prose: the page renders them as a `<pre>`
 * a reader can copy, and the shell text stays out of the prose assertions.
 */

import { GOOGLE_OAUTH_SETUP_STEPS } from "@miel/core/googleOAuthSetup";

export type GuideStep = {
  /** What the step accomplishes, in one line. */
  label: string;
  /** Prose shown under the label. Optional: a command can speak for itself. */
  body?: string;
  /**
   * An ordered walkthrough shown under the body, for a step whose work is a
   * sequence somewhere else — Google's console, in the one case there is
   * (#138). A paragraph is the wrong shape for six numbered actions, and the
   * step's own number is the only thing a nested list needs to stay clear of.
   */
  substeps?: readonly string[];
  /** Shell to run, rendered verbatim in a code block. */
  code?: string;
  /**
   * Which install path this step belongs to. Steps without a variant are
   * shared between both paths; a step with a variant only renders under its
   * matching tab. `installation`'s CSS-only tabs (see styles.ts) rely on this
   * to show/hide the right steps with no JavaScript.
   */
  variant?: "docker" | "bun";
};

export type GuideSection = {
  /** Anchor id — the side menu's href target, and the React key. */
  id: string;
  /** The side menu's label, kept shorter than the heading. */
  navLabel: string;
  heading: string;
  /** Prose paragraphs shown under the heading. */
  body: string[];
  /** Numbered steps, rendered as an ordered list. */
  steps?: GuideStep[];
};

export const MOTIVATION: GuideSection = {
  id: "motivation",
  navLabel: "Motivation",
  heading: "Motivation",
  body: [
    "A busy Gmail inbox is mostly noise, and the work of deciding what matters is the part no filter rule ever got right. Rules match senders and subjects; they cannot read a message and tell you it is the one thing worth answering today.",
    "Miel hands that judgement to an AI. It pulls in your recent mail, asks the AI to rank each message by priority and suggest labels, and shows you the result grouped high to low — so the triage pass you were doing by hand is already done when you sit down to it.",
    "Nothing it proposes is applied behind your back. Priorities, label suggestions and new labels worth creating are all proposals; Gmail is not touched until you apply them. The tool does the reading, you keep the decision.",
    /* Every provider a reader can actually pick belongs in this sentence, not
       the hosted three (#114): the default is the local Claude Code CLI, so the
       reader who changes nothing was being told their mail goes to one of three
       companies, none of which is the one running it. `vendors.ts` is where the
       copy tests read that list from. */
    "It is built to be self-hosted because mail is the last thing worth handing to someone else's server. You run it against your own Google OAuth client, your own AI credential and your own Postgres, on hardware you control. There is no hosted version and no account with me. The only thing that ever leaves your machine is what goes to the AI provider running your triage, and you pick which one that is: the local Claude Code CLI, which is what a fresh install uses, or Anthropic, Google or OpenAI over their APIs. What each of them is sent is spelled out further down this page.",
  ],
};

export const INSTALLATION: GuideSection = {
  id: "installation",
  navLabel: "Installation",
  heading: "Installation",
  body: [
    "Miel runs on Bun, with Postgres in Docker. You will also need a Google Cloud project with the Gmail API enabled and an OAuth client of type Web application — the second step below walks through making one, since nothing installs it for you.",
    "You will need a credential for one AI provider, and one is already picked for you: claude-code, the local Claude Code CLI, is the default, and a fresh install runs triage, replies and filter suggestions through it. So the last prerequisite is that CLI on your PATH with a token from claude setup-token. Change the provider in settings to Anthropic, Google or OpenAI and the prerequisite becomes an API key from that vendor instead, with no CLI at all.",
    "Two ways to run it: with Bun for development, or entirely in Docker if you would rather not install Bun at all.",
  ],
  steps: [
    {
      label: "Clone the repository and install dependencies",
      body: "Every dependency comes from a public registry, so the install needs no token and no per-scope configuration.",
      code: "git clone git@github.com:lucasriondel/miel.git\ncd miel\nbun install",
    },
    /* No command: this one happens in Google's console, and it is the step a
       reader with nothing set up hits first — the app cannot even offer a
       sign-in button without its output. The walkthrough itself is core's
       (#138), rendered here and in the app's own setup dialog from the same
       list, since console labels and a redirect URI are exactly the facts that
       get fixed in one document out of three. */
    {
      label: "Create a Google OAuth client",
      body: "Miel signs into Gmail with an OAuth client of your own, so this is the one prerequisite that cannot be installed — it is made once in the Google Cloud console and produces the two values the next step asks for.",
      substeps: GOOGLE_OAUTH_SETUP_STEPS.map((step) => `${step.title}. ${step.detail}`),
    },
    {
      label: "Fill in your environment",
      /* Plain prose, no backticks: this renders as HTML, not as Markdown, so a
         backtick would reach the reader as a backtick. Commands belong in the
         block below, where they are formatted as code. */
      body: "Copy the example file and supply three things: your Google OAuth client ID and secret, a random API secret that must match between API_SECRET and VITE_API_SECRET, and in production a TOKEN_ENCRYPTION_KEY. No AI credential goes in this file — nothing miel runs reads one from the environment. Every provider's credential is pasted in the app instead and stored encrypted in Postgres. Run claude setup-token now anyway: its token is required as shipped, since claude-code is the provider a fresh install triages with, and the next step is where you paste it. It is optional only if you switch every task to Anthropic, Google or OpenAI before your first sync. The rest of the file already has working localhost defaults.",
      code: "cp .env.example .env\nopenssl rand -base64 32      # TOKEN_ENCRYPTION_KEY\nclaude setup-token           # paste the result in Settings, not in .env",
    },
    {
      label: "Start Postgres",
      body: "The dev compose file starts the database on port 5435 and nothing else. Migrations apply themselves the next time the API boots, so there is no separate step for them.",
      code: "docker compose -f docker-compose.dev.yml up -d",
      variant: "bun",
    },
    {
      label: "Run the app",
      body: "The root compose file builds and runs Postgres, the API and the web app together — the fastest way to self-host without installing Bun. The API applies any pending migrations itself on start, so nothing else is needed. Rebuild with --build after changing either VITE_API_BASE or VITE_API_SECRET, because both are baked into the bundle at image-build time.",
      code: "docker compose up -d --build",
      variant: "docker",
    },
    {
      label: "Run the app",
      body: "The API comes up on port 3001 and the web app on port 3000. Open http://localhost:3000/app and click Connect with Google.",
      code: "bun dev",
      variant: "bun",
    },
    /* No command: this one happens in the browser. It is a step rather than a
       footnote because it is where a reader finds out that a provider is
       already running their mail, and how to make it a different one — the
       hosted providers' credentials are database rows, so there is nothing to
       preseed and no file to edit. */
    {
      label: "Check which AI provider runs each task, and change it if you want",
      body: "Open Settings, then AI and Triage. All three tasks — triage, replies and filter suggestions — start on claude-code, the local Claude Code CLI, so a fresh install triages from its very first sync once that provider has its credential. Every provider's credential lives under Credentials in that same panel, one row each, stored encrypted in Postgres rather than in a file or an environment variable: an API key for Anthropic, Google or OpenAI, and for Claude Code the token from claude setup-token. Nothing is read from the environment, so a credential exists only once it is pasted here. Point any task at Anthropic, Google or OpenAI instead and that vendor's key is what it needs.",
    },
  ],
};

export const CONTRIBUTING: GuideSection = {
  id: "contributing",
  navLabel: "How to contribute",
  heading: "How to contribute",
  body: [
    "Issues and pull requests are welcome. The repository is the whole product — there is no private fork and no hosted variant with extra code in it.",
    "CONTRIBUTING.md at the repository root is the place to start: how to get the stack running, the checks every pull request is gated on, and the conventions the codebase follows — one component per file, business logic in core services rather than in API routes, external systems reached only through the Effect services in packages/core/src/google and the Claude service beside them. CLAUDE.md beside it has the same ground in full detail, addressed to the coding agents that work on this repository.",
    "Before opening a pull request, keep the checks green. Type checking is the one that matters most, since the codebase is strict TypeScript throughout.",
    "Good first contributions: a Gmail feature the triage flow does not cover yet, a rough edge in the review UI, or documentation that was wrong or missing when you tried to follow it.",
  ],
  steps: [
    {
      label: "Run the checks before opening a pull request",
      code: "bun run typecheck\nbun run lint\nbun run format:check\nbun run test",
    },
  ],
};

export const GUIDE_SECTIONS: readonly GuideSection[] = [MOTIVATION, INSTALLATION, CONTRIBUTING];

/** Every string the guide sections render, joined — the seam the copy tests assert on. */
export function allGuideText(): string {
  return GUIDE_SECTIONS.flatMap((section) => [
    section.navLabel,
    section.heading,
    ...section.body,
    ...(section.steps ?? []).flatMap((step) => [
      step.label,
      ...(step.body ? [step.body] : []),
      ...(step.substeps ?? []),
    ]),
  ]).join("\n");
}
