import { Link } from "react-router-dom";
import { useSettings } from "../api/queries";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { ApiError } from "../api/client";
import { ModelPicker } from "../features/settings/ModelPicker";
import { AccountsManager } from "../features/settings/AccountsManager";
import { LabelsManager } from "../features/settings/LabelsManager";
import { SettingsSyncTrigger } from "../features/settings/SettingsSyncTrigger";

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const SettingsPage = () => {
  const { data, isLoading, error } = useSettings();

  return (
    <div className="flex flex-col gap-6 px-6 pb-6 pt-4">
      <div className="flex flex-col gap-1">
        <Link to="/" className="text-sm text-miel-muted underline">
          ← Back to inbox
        </Link>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-miel-muted">
          Pick the Claude model used for each task, manage accounts and labels,
          and trigger a fresh sync.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-miel-muted">
          Claude models
        </h2>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-miel-muted">
            <Spinner /> Loading settings…
          </div>
        ) : error ? (
          <EmptyState
            title="Failed to load settings"
            description={describeError(error)}
          />
        ) : data ? (
          <div className="flex flex-col gap-3">
            <ModelPicker
              task="triage"
              label="Triage model"
              description="Used to classify priority and suggest labels in each sync batch."
              value={data.triageModel}
            />
            <ModelPicker
              task="reply"
              label="Reply model"
              description="Used when you click Generate in the reply composer."
              value={data.replyModel}
            />
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-miel-muted">
          Sync
        </h2>
        <SettingsSyncTrigger />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-miel-muted">
          Accounts
        </h2>
        <AccountsManager />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-miel-muted">
          Labels
        </h2>
        <LabelsManager />
      </section>
    </div>
  );
};
