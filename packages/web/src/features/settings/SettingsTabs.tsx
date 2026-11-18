import type { ComponentType, SVGProps } from "react";
import { Inbox, RefreshCw, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SETTINGS_TABS, type SettingsTabId } from "./settingsTabIds";

const ICONS: Record<SettingsTabId, ComponentType<SVGProps<SVGSVGElement>>> = {
  general: Settings,
  mailboxes: Inbox,
  ai: Sparkles,
  sync: RefreshCw,
};

interface Props {
  value: SettingsTabId;
  onChange: (tab: SettingsTabId) => void;
}

/**
 * The tab strip under the Settings title: an icon and a word per tab, the open
 * one in the ink with a 2px underline sitting on the header's own hairline.
 */
export const SettingsTabs = ({ value, onChange }: Props) => (
  <div role="tablist" aria-label="Settings sections" className="-mb-px flex gap-6 overflow-x-auto">
    {SETTINGS_TABS.map((tab) => {
      const Icon = ICONS[tab.id];
      const on = tab.id === value;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`settings-tab-${tab.id}`}
          aria-selected={on}
          aria-controls={`settings-panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex shrink-0 items-center gap-[7px] border-b-2 px-0.5 pb-3 text-[13px] transition-colors",
            on
              ? "border-gousse-primary font-semibold text-gousse-ink"
              : "border-transparent font-medium text-gousse-muted hover:text-gousse-ink",
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {tab.label}
        </button>
      );
    })}
  </div>
);
