import { apiErrorMessage } from "../../api/apiErrorMessage";

/** A card-shaped failure in place of a card whose settings would not load. */
export const SettingsLoadError = ({ what, error }: { what: string; error: unknown }) => (
  <div
    role="alert"
    className="rounded-xl border border-gousse-high-border bg-gousse-high-bg px-4 py-3.5 text-[13px] text-gousse-high-text"
  >
    <span className="font-semibold">Failed to load {what}.</span> {apiErrorMessage(error)}
  </div>
);
