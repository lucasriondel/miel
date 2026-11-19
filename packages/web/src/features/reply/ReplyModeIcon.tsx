import { Forward, Reply, ReplyAll } from "lucide-react";
import type { ReplyMode } from "../compose/composeSession";

/** The glyph each way of answering carries, in the chip and in its menu. */
export const ReplyModeIcon = ({ mode }: { mode: ReplyMode }) =>
  mode === "replyAll" ? (
    <ReplyAll aria-hidden />
  ) : mode === "forward" ? (
    <Forward aria-hidden />
  ) : (
    <Reply aria-hidden />
  );
