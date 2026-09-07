/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * The api client under a specifier no module mock is registered against.
 *
 * A bun module mock is process-global and outlives the file that registered
 * one, so a suite whose seam is `fetch` would otherwise inherit whichever client
 * stub ran last. `?real` resolves to the same source under a different
 * specifier, which is how a test puts the genuine module back
 * (`features/promos/promoSuggestionsWiring.test.tsx`). Test-only: nothing that
 * ships imports it, and Vite never sees it.
 */
declare module "*/api/client.ts?real" {
  export * from "./api/client";
}
