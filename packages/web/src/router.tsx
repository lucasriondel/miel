import { createBrowserRouter } from "react-router-dom";
import { App } from "./App";
import { InboxPage } from "./pages/InboxPage";
import { MessageDetailPage } from "./pages/MessageDetailPage";
import { SettingsPage } from "./pages/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <InboxPage /> },
      {
        path: "messages/:accountId/:gmailMessageId",
        element: <MessageDetailPage />,
      },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
