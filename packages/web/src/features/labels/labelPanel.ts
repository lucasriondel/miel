/**
 * The label panel's chassis, shared by the two ways one is put on screen: the
 * picker's own absolutely-positioned panel (`LabelPicker`) and the inbox list's
 * single portalled one (`RowLabelPickerPanel`).
 *
 * Only the positioning differs between them, so only the positioning is each
 * one's own — the width, the border, the padding and the shadow are what make
 * the two read as the same object, and a class string copied into a second file
 * is how they stop being.
 */
export const labelPanelClass =
  "flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1.5 rounded-xl border border-gousse-line bg-gousse-panel p-1.5 shadow-gousse-lg";
