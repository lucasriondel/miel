import { SettingsCard } from "@/components/ui/setting-row";
import { DefaultViewRow } from "./DefaultViewRow";
import { RemoteImagesRow } from "./RemoteImagesRow";
import { ThemeRow } from "./ThemeRow";

/**
 * The viewing preferences: how the app looks, and what a message body is
 * allowed to fetch. Both are this browser's rather than the install's — stored
 * locally, no endpoint behind either — which is why they share a card (#149).
 * Which mailbox the app opens on is the same kind of preference, so it joins them.
 */
export const GeneralCard = () => (
  <SettingsCard>
    <ThemeRow />
    <RemoteImagesRow />
    <DefaultViewRow />
  </SettingsCard>
);
