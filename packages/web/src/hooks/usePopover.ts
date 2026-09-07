import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Open/close state for a popover with click-outside and Escape-to-close.
 * Attach `ref` to the wrapper that contains the trigger. When the panel is
 * portalled out of that wrapper (e.g. to escape `overflow-hidden`), also attach
 * `panelRef` to it so clicks inside the panel don't count as "outside".
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  const panelRef = useRef<HTMLElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = ref.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, close, toggle, ref, panelRef };
}
