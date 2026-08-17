import { createBrowserRouter } from "react-router-dom";
import { appBasename } from "./lib/basePath";
import { App } from "./App";
import { InboxPage } from "./pages/InboxPage";
import { LogsPage } from "./pages/LogsPage";
import { MessageDetailPage } from "./pages/MessageDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { FiltersPage } from "./pages/FiltersPage";

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
          path: "account/:accountId",
          element: <InboxPage />,
        },
        {
          path: "account/:accountId/messages/:gmailMessageId",
          element: <MessageDetailPage />,
        },
        { path: "account/:accountId/filters", element: <FiltersPage /> },
        { path: "logs", element: <LogsPage /> },
        { path: "settings", element: <SettingsPage /> },
      ],
    },
  ],
  { basename: appBasename },
);
