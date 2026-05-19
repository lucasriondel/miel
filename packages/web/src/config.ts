const env = import.meta.env;

export const apiBase = (env.VITE_API_BASE ?? "/api").replace(/\/$/, "");
export const apiSecret = env.VITE_API_SECRET ?? "";

if (!apiSecret) {
  console.warn(
    "VITE_API_SECRET is not set — requests will be sent without a bearer token and will 401.",
  );
}
