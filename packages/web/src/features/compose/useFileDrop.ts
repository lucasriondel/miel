import { useRef, useState, type DragEvent } from "react";

const carriesFiles = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");

/**
 * Files dragged onto the compose window: whether some are over it now (the
 * overlay), and the handlers that attach them on drop. A text selection dragged
 * across the window is not a file and is left to the fields.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  // Enter and leave fire for every child crossed; only the outermost pair counts.
  const depth = useRef(0);
  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = [...e.dataTransfer.files];
      if (files.length > 0) onFiles(files);
    },
  };
  return { over, handlers };
}
