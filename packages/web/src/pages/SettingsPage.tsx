import { Link } from "react-router-dom";
import { useSettings } from "../api/queries";
import { Spinner } from "../components/Spinner";

export const SettingsPage = () => {
  const { data, isLoading, error } = useSettings();
  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="text-sm text-miel-muted underline">
        ← Back to inbox
      </Link>
      <h1 className="text-lg font-semibold">Settings</h1>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-miel-muted">
          <Spinner /> Loading…
        </div>
      ) : error ? (
        <p className="text-sm text-miel-high">
          Failed to load settings: {(error as Error).message}
        </p>
      ) : (
        <div className="rounded border border-miel-line bg-white p-4 text-sm">
          <p>
            Triage model: <code>{data?.triageModel}</code>
          </p>
          <p>
            Reply model: <code>{data?.replyModel}</code>
          </p>
          <p className="mt-2 text-xs text-miel-muted">
            Editable controls land in the Settings step.
          </p>
        </div>
      )}
    </div>
  );
};
