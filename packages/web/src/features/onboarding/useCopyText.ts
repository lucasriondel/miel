import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Copies a string and says so for two seconds. A browser that refuses the
 * clipboard raises a toast, so the click that did nothing does not read as one
 * that worked.
 */
export function useCopyText() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  };
  return { copied, copy };
}
