import { SettingsRow } from "./SettingsRow";

interface Props {
  configured: boolean;
  hasBaseUrl: boolean;
  hasApiKey: boolean;
}

/**
 * Whether the relay is on, and what is missing when it is not.
 *
 * `configured` comes from the server rather than being recomputed from the two
 * halves, so this cannot disagree with the gate `sendToWorp` actually applies.
 * The missing-piece text is derived locally because it is presentation, not a
 * second opinion about the state.
 */
export const WorpStatusRow = ({ configured, hasBaseUrl, hasApiKey }: Props) => {
  const missing = [!hasBaseUrl && "a base URL", !hasApiKey && "an API key"].filter(Boolean);

  return (
    <SettingsRow
      title="Status"
      description={
        configured
          ? "On — attachments can be relayed to worp."
          : `Off — worp needs ${missing.join(" and ")}. Sending an attachment answers with worp_not_configured until then.`
      }
      control={
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            configured
              ? "bg-gousse-tint-green text-gousse-tint-green-ink"
              : "bg-gousse-fill text-gousse-muted"
          }`}
        >
          {configured ? "Configured" : "Not configured"}
        </span>
      }
    />
  );
};
