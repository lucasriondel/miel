import { useRef } from "react";
import { Paperclip } from "lucide-react";

interface Props {
  onFiles: (files: File[]) => void;
  disabled: boolean;
}

/**
 * The paperclip beside Send. A hidden file input does the picking; dropping
 * files anywhere on the window does the same thing (`DropOverlay`).
 */
export const AttachButton = ({ onFiles, disabled }: Props) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label="Attach files"
        title="Attach files — up to 25 MB in total"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gousse-muted transition-[background-color,color,transform] hover:bg-gousse-hover hover:text-gousse-ink active:scale-[0.96] disabled:opacity-40"
      >
        <Paperclip className="h-3.5 w-3.5" aria-hidden />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
};
