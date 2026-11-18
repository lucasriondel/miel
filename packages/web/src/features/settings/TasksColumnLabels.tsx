/**
 * The Tasks table's heading band — Task, Provider, Model — on the canvas tint
 * between two hairlines. The two right-hand labels are the width of the selects
 * under them, so each heading sits over its column.
 */
export const TasksColumnLabels = () => (
  <div
    aria-hidden
    className="hidden h-[30px] items-center gap-3 border-y border-gousse-line bg-gousse-bg px-4 text-[11px] font-medium tracking-[0.04em] text-gousse-muted uppercase sm:flex"
  >
    <span className="flex-1">Task</span>
    <span className="w-[150px]">Provider</span>
    <span className="w-[200px]">Model</span>
  </div>
);
