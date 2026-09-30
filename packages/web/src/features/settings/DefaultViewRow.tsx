import { Select } from "@/components/ui/select";
import { SettingRow } from "@/components/ui/setting-row";
import { useAccounts } from "../../api/queries";
import {
  pinnedAccountId,
  pinnedAccountPreference,
  useDefaultViewPreference,
  type DefaultViewPreference,
} from "../preferences/defaultView";

/**
 * Which mailbox the app opens on: the one last looked at, or always one named
 * account. Browser-local like the rows above it, so it saves on change with no
 * request and no saved flash.
 *
 * A pinned account that was since disconnected stays selectable as what is
 * stored, the way `SinceRow` keeps an out-of-preset value: a select with no
 * matching option would show its first option and misreport the setting.
 */
export const DefaultViewRow = () => {
  const accounts = useAccounts();
  const { preference, setPreference } = useDefaultViewPreference();
  const pinned = pinnedAccountId(preference);
  const pinnedMissing =
    pinned !== null && accounts.data !== undefined && !accounts.data.some((a) => a.id === pinned);

  return (
    <SettingRow
      title="Default view"
      description="Which mailbox the app opens on."
      control={
        <Select
          aria-label="Default view"
          disabled={!accounts.data}
          value={preference}
          className="w-56 disabled:opacity-60"
          onChange={(e) => setPreference(e.target.value as DefaultViewPreference)}
        >
          <option value="last">Last opened account</option>
          {accounts.data?.map((a) => (
            <option key={a.id} value={pinnedAccountPreference(a.id)}>
              {a.email}
            </option>
          ))}
          {pinnedMissing ? <option value={preference}>Disconnected account</option> : null}
        </Select>
      }
    />
  );
};
