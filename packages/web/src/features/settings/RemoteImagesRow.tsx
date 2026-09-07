import { SettingRow } from "@/components/ui/setting-row";
import { useRemoteImagesPreference } from "../preferences/remoteImages";
import { Segmented } from "./Segmented";

const OPTIONS = [
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
] as const;

/**
 * Remote-images picker row. Applies to messages opened afterwards; persisted
 * browser-side by `useRemoteImagesPreference`, like the theme above it.
 *
 * The description says what loading one costs rather than describing the
 * mechanism: a remote image is how senders learn a message was opened, and a
 * user choosing between two words deserves the reason the choice exists.
 */
export const RemoteImagesRow = () => {
  const { preference, setPreference } = useRemoteImagesPreference();
  return (
    <SettingRow
      title="Remote images"
      description="Images hosted by the sender load with the message. Hiding them keeps senders from learning when you opened it."
      control={
        <Segmented
          ariaLabel="Remote images"
          options={OPTIONS}
          value={preference}
          onChange={setPreference}
        />
      }
    />
  );
};
