import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronsUpDown } from "lucide-react";
import { ComposeFieldRow } from "./ComposeFieldRow";
import { ComposePopover } from "./ComposePopover";
import { FromMenuItem } from "./FromMenuItem";
import type { FromOption } from "./fromOptions";

interface Props {
  options: readonly FromOption[];
  selected: FromOption | undefined;
  /** Shown while the options are not known yet. */
  fallbackName: string | null;
  fallbackEmail: string;
  onPick: (option: FromOption) => void;
  disabled: boolean;
}

const FromLine = ({ name, email }: { name: string | null; email: string }) => (
  <span className="flex min-w-0 items-baseline gap-2 truncate">
    {name ? <span className="text-gousse-ink">{name}</span> : null}
    <span className={name ? "truncate text-gousse-muted" : "truncate text-gousse-ink"}>
      {email}
    </span>
  </span>
);

/** Arrow keys walk the menu's items, the way a native menu's do. */
const walk = (e: KeyboardEvent<HTMLDivElement>) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitemradio]")];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "ArrowDown" ? at + 1 : at - 1;
  items[(next + items.length) % items.length]?.focus();
};

/**
 * The address the message goes from. A reply leaves from the mailbox the
 * message arrived in and a new mail from the one on screen; when there is more
 * than one way to send — a verified send-as alias, another connected mailbox —
 * the row opens a menu of them, and with one it is plain text.
 */
export const ComposeFromRow = ({
  options,
  selected,
  fallbackName,
  fallbackEmail,
  onPick,
  disabled,
}: Props) => {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const name = selected?.name ?? fallbackName;
  const email = selected?.email ?? fallbackEmail;

  if (options.length <= 1) {
    return (
      <ComposeFieldRow label="From">
        <FromLine name={name} email={email} />
      </ComposeFieldRow>
    );
  }

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <ComposeFieldRow label="From">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`From ${name ? `${name} ` : ""}${email}`}
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          requestAnimationFrame(() =>
            panel.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus(),
          );
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        <FromLine name={name} email={email} />
        <span className="flex-1" />
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gousse-muted" aria-hidden />
      </button>
      <ComposePopover
        open={open}
        anchorRef={trigger}
        panelRef={panel}
        onEscape={close}
        className="w-[min(20rem,calc(100vw-2rem))]"
      >
        {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the items take focus, not the menu */}
        <div
          role="menu"
          aria-label="Send from"
          onKeyDown={walk}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (!e.currentTarget.contains(next) && next !== trigger.current) setOpen(false);
          }}
        >
          {options.map((option) => (
            <FromMenuItem
              key={option.key}
              option={option}
              selected={option.key === selected?.key}
              onPick={() => {
                onPick(option);
                close();
              }}
            />
          ))}
        </div>
      </ComposePopover>
    </ComposeFieldRow>
  );
};
