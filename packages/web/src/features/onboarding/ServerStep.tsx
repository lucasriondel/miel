import { apiBase } from "../../config";
import { GateButton } from "./GateButton";
import { GateFootnote } from "./GateFootnote";
import { GateIntro } from "./GateIntro";

interface Props {
  titleId: string;
  descriptionId: string;
  /** Why the last check failed. */
  status: "unauthorized" | "unreachable";
  /** A check is in flight — the redesign's "Checking your server" state. */
  checking: boolean;
  onCheckAgain: () => void;
}

const COPY = {
  unauthorized: {
    title: "This server turned the app away",
    body: (
      <>
        The API answered, but refused the secret this app was built with. Set{" "}
        <Code>VITE_API_SECRET</Code> to the same value as the server's <Code>API_SECRET</Code>,
        rebuild the web app, then check again.
      </>
    ),
  },
  unreachable: {
    title: "Can't reach your server",
    body: (
      <>
        Nothing answered at this app's API address. Make sure the API is running and reachable from
        this page, then check again.
      </>
    ),
  },
} as const;

/**
 * The gate's first step: this page cannot talk to its API.
 *
 * There is nothing to type — the address and the secret are the web build's
 * environment (`VITE_API_BASE`, `VITE_API_SECRET`), not something a browser can
 * set — so the step names which of the two is wrong and offers to look again.
 * While it looks, the heading is the redesign's "Checking your server".
 */
export const ServerStep = ({ titleId, descriptionId, status, checking, onCheckAgain }: Props) => (
  <>
    <GateIntro
      titleId={titleId}
      descriptionId={descriptionId}
      centered
      title={checking ? "Checking your server" : COPY[status].title}
    >
      {checking
        ? "Looking for the API this app was built against. This only takes a second."
        : COPY[status].body}
    </GateIntro>
    <GateButton className="mt-6" onClick={onCheckAgain} pending={checking} pendingLabel="Checking…">
      Check again
    </GateButton>
    <GateFootnote>
      This app talks to <Code>{apiBase || "/"}</Code>
    </GateFootnote>
  </>
);

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-gousse-fill px-1 py-px font-mono text-[0.85em] text-gousse-ink">
      {children}
    </code>
  );
}
