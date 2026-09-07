import { Download } from "lucide-react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { assetUrl } from "../lib/basePath";
import type { MessageAttachment } from "../api/types";
import type { AttachmentActions } from "./useAttachmentActions";
import type { WorpFlow } from "../api/sendAttachmentToWorp";

interface Props {
  attachment: MessageAttachment;
  actions: AttachmentActions;
}

const WorpIcon = () => (
  <img src={assetUrl("/worp-favicon.png")} alt="" aria-hidden="true" className="h-4 w-4" />
);

const FLOWS: readonly WorpFlow[] = ["personal", "pro"];

/**
 * The menu an attachment opens, wherever it is shown from. Both triggers — the
 * inbox row's pill and the detail page's row — mount this one, so what an
 * attachment can do is written once and only its face differs (#143).
 */
export const AttachmentMenuContent = ({ attachment, actions }: Props) => (
  <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
    <DropdownMenuLabel className="truncate normal-case tracking-normal">
      {actions.downloadName}
    </DropdownMenuLabel>
    <div className="px-2.5 pb-1 text-[11px] text-gousse-muted">
      {attachment.mimeType || "application/octet-stream"}
      {actions.sizeLabel ? ` · ${actions.sizeLabel}` : ""}
    </div>
    <DropdownMenuItem className="rounded-full" onClick={actions.download}>
      <Download className="h-4 w-4" aria-hidden />
      Download
    </DropdownMenuItem>
    {actions.worpEligible && (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="rounded-full">
          <WorpIcon />
          Send to worp
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {FLOWS.map((flow) => (
            <DropdownMenuItem
              key={flow}
              className="rounded-full capitalize"
              onClick={() => actions.sendToWorp(flow)}
            >
              {flow}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )}
  </DropdownMenuContent>
);
