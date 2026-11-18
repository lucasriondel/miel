import { ModelRow } from "../settings/ModelRow";
import { CredentialsCard } from "../settings/CredentialsCard";
import { SettingsPanel } from "../settings/SettingsPanel";
import { TasksColumnLabels } from "../settings/TasksColumnLabels";
import { GateIntro } from "./GateIntro";
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
 * Triage only. Every other task keeps its default: none of them is what a first
 * sync needs, and a card of model choices before the user has seen a single
 * message is a worse first run than one choice.
 *
 * There is no finish button because there is nothing to confirm — the step's
 * work *is* storing the credential, and the gate reopens on the same question
 * it answers, so it lets go by itself the moment the answer changes.
 */
export const AiSetupStep = ({ titleId, descriptionId, settings }: Props) => (
  <>
    <GateIntro titleId={titleId} descriptionId={descriptionId} title="Set up AI triage">
      miel classifies every message it syncs, through an AI provider of your choosing. Add a
      credential for a provider, then pick the one that triages your mail.
    </GateIntro>
    <div className="mt-5 flex w-full flex-col gap-4 text-left">
      <CredentialsCard />
      <SettingsPanel title="Tasks" header={<TasksColumnLabels />}>
        <ModelRow
          task="triage"
          title="Triage"
          description="Classifies priority in each sync batch."
          value={settings.triageModel}
          provider={settings.triageProvider}
        />
      </SettingsPanel>
    </div>
    <p className="mt-4 w-full text-left text-xs leading-[18px] text-gousse-muted">
      Replies and promo codes keep their defaults — change them anytime in Settings.
    </p>
  </>
);
