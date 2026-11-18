import { GateFootnote } from "./GateFootnote";

interface Props {
  checking: boolean;
  onCheckAgain: () => void;
}

/**
 * The other way to give the server a client: the three `GOOGLE_*` variables in
 * its `.env`, read when nothing was saved in the app. Only a restart picks
 * them up, so this is where the re-check lives.
 */
export const EnvAlternativeFootnote = ({ checking, onCheckAgain }: Props) => (
  <GateFootnote>
    Keeping the client in the server's <code className="font-mono">.env</code> instead? Restart the
    API, then{" "}
    <button
      type="button"
      onClick={onCheckAgain}
      disabled={checking}
      className="font-semibold text-gousse-ink underline-offset-2 hover:underline disabled:text-gousse-muted"
    >
      {checking ? "checking…" : "check again"}
    </button>
    .
  </GateFootnote>
);
