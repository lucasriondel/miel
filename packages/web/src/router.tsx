import { createBrowserRouter } from "react-router-dom";
import { appBasename } from "./lib/basePath";
import { App } from "./App";
import { InboxPage } from "./pages/InboxPage";
import { LogsPage } from "./pages/LogsPage";
import { MessageDetailPage } from "./pages/MessageDetailPage";
import { PromoCodesPage } from "./pages/PromoCodesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { FiltersPage } from "./pages/FiltersPage";
import { ScheduledPage } from "./pages/ScheduledPage";

// Routes are declared relative to the app's base path (/app), which the router
// strips off incoming URLs and prepends to the ones it builds. Keeping the
// prefix here rather than in every route means links, redirects and deep-link
// reloads all resolve under it without any per-route awareness.
export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        { index: true, element: <InboxPage /> },
        {
          // The list and the reader are one screen: an open message is the
          // inbox's child route, drawn in the reader column beside the list
          // (`InboxPage` renders the `Outlet`), so the list stays mounted —
          // and keeps its scroll — while messages are read one after another.
          path: "account/:accountId",
          element: <InboxPage />,
          children: [{ path: "messages/:gmailMessageId", element: <MessageDetailPage /> }],
        },
        { path: "account/:accountId/filters", element: <FiltersPage /> },
        // Beside filters, not under the inbox: a scheduled send is not a message
        // yet, so there is no list beside it and no reader to open.
        { path: "account/:accountId/scheduled", element: <ScheduledPage /> },
        // Top-level, beside logs and settings: a saved promo belongs to no
        // account in particular, and a route outside `/account` is one the
        // layout's default-account redirect leaves where it is.
        { path: "promo-codes", element: <PromoCodesPage /> },
        { path: "logs", element: <LogsPage /> },
        { path: "settings", element: <SettingsPage /> },
      ],
    },
  ],
  { basename: appBasename },
);
