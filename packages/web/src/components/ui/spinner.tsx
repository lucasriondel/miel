export const Spinner = ({ size = 16 }: { size?: number }) => (
  <span
    role="status"
    aria-label="Loading"
    className="inline-block animate-spin rounded-full border-2 border-gousse-line border-t-gousse-accent"
    style={{ width: size, height: size }}
  />
);
