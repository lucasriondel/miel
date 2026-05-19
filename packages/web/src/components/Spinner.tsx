export const Spinner = ({ size = 16 }: { size?: number }) => (
  <span
    role="status"
    aria-label="Loading"
    className="inline-block animate-spin rounded-full border-2 border-miel-line border-t-miel-accent"
    style={{ width: size, height: size }}
  />
);
