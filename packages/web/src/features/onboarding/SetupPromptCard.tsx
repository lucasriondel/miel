import { Copy, Sparkles } from "lucide-react";
import { AppButton } from "../../components/AppButton";
import { useCopyText } from "./useCopyText";

const GOOGLE_CLOUD_CREDENTIALS = "https://console.cloud.google.com/apis/credentials";

/**
 * The redesign's "Setup prompt" card: the walkthrough as a request to paste into
 * any AI assistant, previewed and faded, with the copy and the console one click
 * away. The full steps are listed below it for a reader who would rather not.
 */
export const SetupPromptCard = ({ prompt }: { prompt: string }) => {
  const { copied, copy } = useCopyText();
  return (
    <section
      aria-label="Setup prompt"
      className="mt-5 w-full rounded-xl border border-gousse-line bg-gousse-bg text-left"
    >
      <div className="flex items-center gap-1.5 px-3.5 pt-3 pb-2 text-xs">
        <Sparkles aria-hidden className="h-3.5 w-3.5 text-gousse-medium" />
        <span className="font-semibold text-gousse-ink">Setup prompt</span>
        <span className="text-gousse-muted">· paste it into any AI assistant</span>
      </div>
      <div className="relative h-[92px] overflow-hidden px-3.5">
        <pre className="font-mono text-[11px] leading-[18px] whitespace-pre-wrap text-gousse-quiet">
          {prompt}
        </pre>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-gousse-bg" />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-1 pb-3.5">
        <AppButton tone="primary" size="lg" onClick={() => void copy(prompt)}>
          <Copy aria-hidden />
          {copied ? "Copied" : "Copy prompt"}
        </AppButton>
        <a
          href={GOOGLE_CLOUD_CREDENTIALS}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-lg border border-gousse-border bg-gousse-panel px-3 text-[13px] font-medium text-gousse-ink hover:bg-gousse-hover"
        >
          Open Google Cloud ↗
        </a>
      </div>
    </section>
  );
};
