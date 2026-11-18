import type { ReactNode } from "react";

interface Props {
  titleId: string;
  descriptionId: string;
  title: ReactNode;
  children: ReactNode;
  /** The pitch-shaped steps centre their text; the form-shaped ones do not. */
  centered?: boolean;
}

/** A step's heading and the one paragraph under it — the dialog's name and description. */
export const GateIntro = ({ titleId, descriptionId, title, children, centered }: Props) => (
  <div className={`mt-5 w-full ${centered ? "text-center" : "text-left"}`}>
    <h1 id={titleId} className="text-lg font-bold text-gousse-ink">
      {title}
    </h1>
    <p id={descriptionId} className="mt-2 text-sm leading-[22px] font-medium text-gousse-muted">
      {children}
    </p>
  </div>
);
