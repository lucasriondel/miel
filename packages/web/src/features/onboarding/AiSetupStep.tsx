import { SettingsCard } from "@/components/ui/setting-row";
import { ModelRow } from "../settings/ModelRow";
import { CredentialsCard } from "../settings/CredentialsCard";
import type { ModelSettings } from "../../api/types";

interface Props {
  titleId: string;
  descriptionId: string;
  /** The settled settings — the gate only shows this step once they are known. */
  settings: ModelSettings;
}

/**
 * Step two of the gate (#111): which provider triages, its credential, and the
 * model it runs.
 *
 * The credential grid and the row are the settings page's own —
 * `CredentialsCard` and `ModelRow` — rather than an onboarding-shaped copy of
 * either. That is the point: a second implementation of "pick a provider and
 * give it a key" is a second thing to keep in step with the catalogue and with
 * the route that validates the pair.
 *
 * They are in that order for the reason the settings page now is: the provider
 * select offers only providers that have a credential, so the grid is what
 * fills it. A fresh install arrives here with a token row for the local
 * provider and three empty vendor tiles; whichever one is filled in is what the
 * row below can then be pointed at.
 *
 * Triage only. Filters and replies keep their defaults: they are not what a
 * first sync needs, and three model choices before the user has seen a single
 * message is a worse first run than one.
 *
 * There is no finish button because there is nothing to confirm — the step's
 * work *is* storing the credential, and the gate reopens on the same question
 * it answers, so it lets go by itself the moment the answer changes.
 */
export const AiSetupStep = ({ titleId, descriptionId, settings }: Props) => (
  <>
    <h1 id={titleId} className="mt-5 text-lg font-bold tracking-tight text-gousse-ink">
      Set up AI triage
    </h1>
    <p id={descriptionId} className="mt-2 text-sm font-medium leading-relaxed text-gousse-muted">
      miel classifies every message it syncs and suggests labels for it, and that runs through an AI
      provider of your choosing. Give a provider its credential, then point triage at it.
    </p>
    <div className="mt-5 flex flex-col gap-4">
      <CredentialsCard />
      <SettingsCard>
        <ModelRow
          task="triage"
          title="Triage"
          description="Classifies priority and suggests labels in each sync batch."
          value={settings.triageModel}
          provider={settings.triageProvider}
        />
      </SettingsCard>
    </div>
    <p className="mt-4 text-xs leading-relaxed text-gousse-muted">
      Replies and filter suggestions keep their defaults — all three are yours to change in
      Settings.
    </p>
  </>
);
