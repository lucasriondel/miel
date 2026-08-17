import { Notice } from "@/components/ui/notice";

interface Props {
  id: string;
  /** Already-humanised copy — see `describeConnectFailure`. */
  message: string;
}

/**
 * Why the last connect attempt didn't take, shown inside the onboarding gate.
 *
 * Persistent by design: the gate reopens the moment a failed connect returns
 * with zero accounts, so this has to still be there when the user looks at it —
 * no timer, no dismiss. It goes away when the connect is retried, or with the
 * gate itself once an account exists.
 *
 * `w-full` because the gate centres its children, and a message this long reads
 * badly shrink-wrapped and centred. The `danger` variant carries `role="alert"`
 * on its own, which is what this needs.
 */
export const ConnectFailureNotice = ({ id, message }: Props) => (
  <Notice id={id} variant="danger" className="mt-5 w-full">
    {message}
  </Notice>
);
