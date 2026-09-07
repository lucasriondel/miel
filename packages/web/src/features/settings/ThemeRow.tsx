import { useTheme } from "../theme/useTheme";
import { SettingRow } from "@/components/ui/setting-row";
import { Segmented } from "./Segmented";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

/** Theme picker row. Applies instantly (persisted by useTheme). */
export const ThemeRow = () => {
  const { theme, setTheme } = useTheme();
  return (
    <SettingRow
      title="Theme"
      description="Switch between light and dark."
      control={<Segmented ariaLabel="Theme" options={OPTIONS} value={theme} onChange={setTheme} />}
    />
  );
};
