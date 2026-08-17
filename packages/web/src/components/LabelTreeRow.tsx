import { ChevronDown } from "lucide-react";
import type { LabelNode } from "./buildLabelTree";
import { hueFromColor } from "./hueFromColor";
import { LabelListRow } from "./LabelListRow";
import { SidebarGlyph } from "@/components/ui/sidebar";

interface Props {
  node: LabelNode;
  selectedLabelId: string | undefined;
  onSelect: (labelId: string | undefined) => void;
  isCollapsed: (name: string) => boolean;
  onToggleCollapse: (name: string) => void;
}

/**
 * One node in the label tree. Leaf nodes are a plain selectable row; parent
 * nodes get a chevron and an animated `.sidebar-children` wrapper. A synthetic
 * parent (no backing label) isn't selectable — clicking its body just toggles
 * the branch, same as the chevron.
 */
export const LabelTreeRow = ({
  node,
  selectedLabelId,
  onSelect,
  isCollapsed,
  onToggleCollapse,
}: Props) => {
  const hasChildren = node.children.length > 0;
  const collapsed = hasChildren && isCollapsed(node.name);
  const selectable = node.label !== null;
  const active = selectable && selectedLabelId === node.label!.id;
  const swatchColor = node.label?.colorBg ?? "#d1d5db";
  // Same source as the swatch, so the row's left bar / bg / glyph always match
  // the dot rather than falling back to the generic accent.
  const hue = hueFromColor(swatchColor);

  const handleClick = () => {
    if (selectable) onSelect(node.label!.id);
    else if (hasChildren) onToggleCollapse(node.name);
  };

  return (
    <>
      <LabelListRow
        active={active}
        onClick={handleClick}
        depth={node.depth}
        title={node.name}
        hue={hue}
        collapsed={collapsed}
        trailing={
          hasChildren ? (
            <span
              // A real `<button>` here would nest inside LabelListRow's button,
              // which the HTML parser is entitled to unnest. The span carries
              // the role, the tab stop and the Enter/Space handler instead.
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- see above
              role="button"
              tabIndex={0}
              aria-label={collapsed ? "Expand" : "Collapse"}
              aria-expanded={!collapsed}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(node.name);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleCollapse(node.name);
                }
              }}
              className="sidebar-chevron ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full text-gousse-muted transition-colors hover:bg-gousse-line/50 hover:text-gousse-ink"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </span>
          ) : undefined
        }
      >
        <SidebarGlyph>
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: swatchColor }}
          />
        </SidebarGlyph>
        <span className="truncate">{node.leaf}</span>
      </LabelListRow>

      {hasChildren ? (
        <div className="sidebar-children" data-collapsed={collapsed}>
          <div className="sidebar-children-inner">
            <div className="flex flex-col gap-0.5">
              {node.children.map((child) => (
                <LabelTreeRow
                  key={child.name}
                  node={child}
                  selectedLabelId={selectedLabelId}
                  onSelect={onSelect}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={onToggleCollapse}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
