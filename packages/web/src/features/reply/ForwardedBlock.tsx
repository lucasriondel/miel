import type { QuoteBlock } from "../../api/composeReads.hooks";

interface Props {
  /** The block the server puts under a forward; null while it loads. */
  block: QuoteBlock | null;
  loading: boolean;
}

/**
 * The forwarded message, shown expanded under what the user writes — it is the
 * content of a forward, so nothing folds it. Read-only: the server builds it
 * from the stored original when the forward is sent.
 */
export const ForwardedBlock = ({ block, loading }: Props) => {
  if (!block) {
    return loading ? (
      <div className="mx-5 mb-3 h-24 shrink-0 animate-pulse rounded-xl bg-gousse-fill motion-reduce:animate-none" />
    ) : null;
  }
  const lines = block.text.split(/\r?\n/);
  const body = lines[0] === block.attribution ? lines.slice(1) : lines;
  const blank = body.indexOf("");
  const header = blank === -1 ? body : body.slice(0, blank);
  const original =
    blank === -1
      ? ""
      : body
          .slice(blank + 1)
          .join("\n")
          .trim();
  return (
    <section
      aria-label="Forwarded message"
      className="mx-5 mb-3 shrink-0 rounded-xl bg-gousse-hover px-3.5 py-3 text-xs leading-[18px]"
    >
      <p className="font-semibold text-gousse-muted">Forwarded message</p>
      <div className="text-gousse-ink">
        {header.map((line) => (
          <p key={line} className="truncate" title={line}>
            {line}
          </p>
        ))}
      </div>
      {original ? (
        <p className="mt-1 line-clamp-6 whitespace-pre-line text-gousse-muted">{original}</p>
      ) : null}
    </section>
  );
};
