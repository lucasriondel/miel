import type { ReactNode } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface Props {
  icon: ReactNode;
  label: string;
  kbd: string;
  onClick: () => void;
}

/** A row of the Reply split button's menu: glyph, words, and the key that does the same. */
export const ReplyMenuItem = ({ icon, label, kbd, onClick }: Props) => (
  <DropdownMenuItem onClick={onClick} className="h-8 gap-2.5 rounded-lg px-2.5 py-0 text-[13px]">
    <span className="text-gousse-muted [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
    <span className="flex-1 truncate">{label}</span>
    <kbd className="font-sans text-[11px] font-medium text-gousse-subtle">{kbd}</kbd>
  </DropdownMenuItem>
);
