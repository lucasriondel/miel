const KB = 1024;
const MB = 1024 * 1024;

export function formatSize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) {
    const kb = bytes / KB;
    return `${trimZero(kb, kb < 10 ? 1 : 0)} KB`;
  }
  const mb = bytes / MB;
  return `${trimZero(mb, 1)} MB`;
}

function trimZero(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, "");
}

export function truncateFilename(name: string, max: number): string {
  if (!name) return "(no name)";
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot >= name.length - 1) {
    return `${name.slice(0, Math.max(1, max - 1))}…`;
  }
  const ext = name.slice(dot);
  const base = name.slice(0, dot);
  const keep = Math.max(1, max - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}
