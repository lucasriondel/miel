import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { detailSurfaceClass, type SurfaceElevation } from "./detailSurface";

interface Props {
  children: ReactNode;
  /** `sm` rests, `md` reads as lifted at rest (DESIGN.md §2). */
  elevation?: SurfaceElevation;
  className?: string;
}

/**
 * A block of the message-detail page as a card. `overflow-hidden` is part of the
 * shape: at `rounded-3xl` a full-bleed divider or header rule would otherwise
 * run straight through the corner arc.
 */
export const DetailCard = ({ children, elevation = "sm", className }: Props) => (
  <section className={cn(detailSurfaceClass(elevation), "overflow-hidden", className)}>
    {children}
  </section>
);
