import { Spinner } from "@/components/ui/spinner";
import { AppButton } from "../../components/AppButton";
import { GateButton } from "../onboarding/GateButton";
import type { GoogleClientForm } from "./useGoogleClientForm";

interface Props {
  variant: "gate" | "settings";
  form: GoogleClientForm;
  onCancel?: () => void;
}

/**
 * The form's buttons. Both submit the form, so Enter in any box is the same
 * press; once a change of client has been warned about, the press reads
 * "Save anyway".
 */
export const GoogleClientFormActions = ({ variant, form, onCancel }: Props) => {
  if (variant === "gate") {
    return (
      <GateButton
        type="submit"
        className="mt-6 w-full"
        disabled={!form.savable}
        pending={form.pending}
        pendingLabel="Saving…"
      >
        {form.confirming ? "Save anyway" : "Save and continue"}
      </GateButton>
    );
  }
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <AppButton tone="ghost" disabled={form.pending} onClick={onCancel}>
        Cancel
      </AppButton>
      <AppButton type="submit" tone="primary" disabled={!form.savable || form.pending}>
        {form.pending ? <Spinner size={12} /> : null}
        {form.confirming ? "Save anyway" : "Save"}
      </AppButton>
    </div>
  );
};
