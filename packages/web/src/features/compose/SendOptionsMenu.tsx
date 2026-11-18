import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Archive, Clock, Send } from "lucide-react";
import { presetTimeLabel, schedulePresets } from "../time/timePresets";
import { ComposePopover } from "./ComposePopover";

interface Props {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSend: () => void;
  onSendAndArchive?: () => void;
  onSchedule?: (at: Date) => void;
  onPickScheduleTime?: () => void;
}

const Item = ({
  icon,
  label,
  trailing,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  trailing?: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className="flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-gousse-ink outline-none hover:bg-gousse-hover focus-visible:bg-gousse-hover"
  >
    <span className="flex w-3.5 shrink-0 justify-center text-gousse-muted">{icon}</span>
    <span className="flex-1 truncate">{label}</span>
    {trailing ? (
      <span className="shrink-0 font-sans text-[11px] text-gousse-subtle tabular-nums">
        {trailing}
      </span>
    ) : null}
  </button>
);

/** Arrow keys walk the items, as a native menu's do. */
const walk = (e: KeyboardEvent<HTMLDivElement>) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "ArrowDown" ? at + 1 : at - 1;
  items[(next + items.length) % items.length]?.focus();
};

/**
 * What Send's caret opens (Compose & Reply › Send options): Send, Send &
 * archive for a reply, then Schedule send… with Tomorrow morning and Monday
 * morning one click away and the time each resolves to beside it.
 *
 * A `ComposePopover` rather than the vendored dropdown: that one's positioner
 * sits at `z-[70]`, under the dock, so it opened behind its own window.
 */
export const SendOptionsMenu = ({
  open,
  anchorRef,
  onClose,
  onSend,
  onSendAndArchive,
  onSchedule,
  onPickScheduleTime,
}: Props) => {
  const panel = useRef<HTMLDivElement>(null);
  // Read when the menu renders, so "Tue 08:00" is about the day it is opened on.
  const now = new Date();
  const choose = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <ComposePopover
      open={open}
      anchorRef={anchorRef}
      panelRef={panel}
      onEscape={onClose}
      className="w-[min(16.5rem,calc(100vw-2rem))]"
    >
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the items take focus, not the menu */}
      <div
        role="menu"
        aria-label="Send options"
        onKeyDown={walk}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (!e.currentTarget.contains(next) && !anchorRef.current?.contains(next)) onClose();
        }}
      >
        <Item
          icon={<Send className="h-3.5 w-3.5" />}
          label="Send"
          trailing="⌘↵"
          onClick={choose(onSend)}
        />
        {onSendAndArchive ? (
          <Item
            icon={<Archive className="h-3.5 w-3.5" />}
            label="Send & archive"
            trailing="⌘⇧↵"
            onClick={choose(onSendAndArchive)}
          />
        ) : null}
        {onSchedule ? (
          <>
            <Item
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Schedule send…"
              onClick={choose(() => onPickScheduleTime?.())}
            />
            {schedulePresets(now).map((preset) => (
              <Item
                key={preset.id}
                icon={null}
                label={preset.label}
                trailing={presetTimeLabel(preset.at, now)}
                onClick={choose(() => onSchedule(preset.at))}
              />
            ))}
          </>
        ) : null}
      </div>
    </ComposePopover>
  );
};
