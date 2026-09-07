import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onClick: () => void;
}

/**
 * Leading control on every bar but the inbox's: a ghost button, the shape the
 * app shell gives a back action. The label drops out below `sm`, where the
 * arrow is the whole affordance.
 */
export const BackToInboxButton = ({ onClick }: Props) => (
  <Button variant="ghost" onClick={onClick} className="-ml-2 px-2.5" aria-label="Back to inbox">
    <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
    <span className="hidden sm:inline">Back to inbox</span>
  </Button>
);
