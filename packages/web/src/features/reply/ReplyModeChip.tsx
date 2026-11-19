import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ComposePopover } from "../compose/ComposePopover";
import type { ReplyMode } from "../compose/composeSession";
import { ReplyModeIcon } from "./ReplyModeIcon";
import { ReplyModeMenuItem } from "./ReplyModeMenuItem";
import type { ReplyModeOption } from "./replyModeSwitch";

interface Props {
  mode: ReplyMode;
  options: readonly ReplyModeOption[];
  onPick: (mode: ReplyMode) => void;
  disabled: boolean;
}

const LABEL: Record<ReplyMode, string> = {
  reply: "Reply",
  replyAll: "Reply all",
  forward: "Forward",
};

/** Arrow keys, Home and End walk the menu's items, the way a native menu's do. */
const walk = (e: KeyboardEvent<HTMLDivElement>) => {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const target =
    e.key === "ArrowDown"
      ? items[(at + 1) % items.length]
      : e.key === "ArrowUp"
        ? items[(at - 1 + items.length) % items.length]
        : e.key === "Home"
          ? items[0]
          : e.key === "End"
            ? items.at(-1)
            : undefined;
  if (!target) return;
  e.preventDefault();
  target.focus();
};

/**
 * The compose title bar's mode chip (Compose & Reply › "Switching mode inside
 * the window"): what the window is — Reply, Reply all or Forward — and a menu
 * that answers the same message another way. What a switch keeps is
 * `switchReplyMode`'s rule; this is only the control.
 *
 * Its menu is a `ComposePopover`, not the vendored dropdown, whose positioner
 * sits under the dock and would open behind its own window.
 */
export const ReplyModeChip = ({ mode, options, onPick, disabled }: Props) => {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${LABEL[mode]} — change how this answers`}
        title="Reply, reply all or forward"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          requestAnimationFrame(() =>
            panel.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus(),
          );
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" || open) return;
          e.preventDefault();
          setOpen(true);
          requestAnimationFrame(() =>
            panel.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus(),
          );
        }}
        className="mr-2.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-gousse-border-strong bg-gousse-panel px-2 text-xs font-semibold text-gousse-primary transition-[background-color,transform] outline-none hover:bg-gousse-hover focus-visible:ring-2 focus-visible:ring-gousse-primary/20 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-60 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-gousse-ink"
      >
        <ReplyModeIcon mode={mode} />
        {LABEL[mode]}
        <Chevron aria-hidden />
      </button>
      <ComposePopover
        open={open}
        anchorRef={trigger}
        panelRef={panel}
        onEscape={close}
        className="w-[min(17.5rem,calc(100vw-2rem))]"
      >
        {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the items take focus, not the menu */}
        <div
          role="menu"
          aria-label="Reply mode"
          onKeyDown={walk}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (!e.currentTarget.contains(next) && next !== trigger.current) setOpen(false);
          }}
          className="flex flex-col gap-0.5"
        >
          {options.map((option) => (
            <ReplyModeMenuItem
              key={option.mode}
              option={option}
              selected={option.mode === mode}
              onPick={() => {
                close();
                if (option.mode !== mode) onPick(option.mode);
              }}
            />
          ))}
        </div>
      </ComposePopover>
    </>
  );
};
