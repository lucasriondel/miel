import type { Label } from "../api/types";

export interface LabelNode {
  /** Full Gmail label name, e.g. "Immobilier/JOIA/Cuisine". */
  name: string;
  /** Last path segment, e.g. "Cuisine". */
  leaf: string;
  /** Nesting depth (0 = top level). */
  depth: number;
  /** The backing label, if a real label exists at this path. */
  label: Label | null;
  children: LabelNode[];
}

/** Order siblings case-insensitively, at every level, in place. */
function sortRec(nodes: LabelNode[]): void {
  nodes.sort((a, b) => a.leaf.localeCompare(b.leaf, undefined, { sensitivity: "base" }));
  for (const n of nodes) sortRec(n.children);
}

/**
 * Turn the flat, slash-delimited Gmail label list into a nested tree.
 *
 * Gmail encodes hierarchy purely in the name ("A/B/C"), and a parent path may
 * have no label of its own (a label "A/B" can exist without "A"). We synthesize
 * those intermediate nodes (`label: null`) so the tree is always well-formed.
 * Children are sorted case-insensitively at every level.
 */
export function buildLabelTree(labels: Label[]): LabelNode[] {
  const roots: LabelNode[] = [];
  const byPath = new Map<string, LabelNode>();

  const ensure = (segments: string[]): LabelNode => {
    const path = segments.join("/");
    const existing = byPath.get(path);
    if (existing) return existing;

    const depth = segments.length - 1;
    const node: LabelNode = {
      name: path,
      leaf: segments[segments.length - 1],
      depth,
      label: null,
      children: [],
    };
    byPath.set(path, node);

    if (depth === 0) {
      roots.push(node);
    } else {
      const parent = ensure(segments.slice(0, -1));
      parent.children.push(node);
    }
    return node;
  };

  for (const label of labels) {
    const node = ensure(label.name.split("/"));
    node.label = label;
  }

  sortRec(roots);

  return roots;
}
