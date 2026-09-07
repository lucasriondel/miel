import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "../components/LegalPageView";
import { PRIVACY } from "../content/privacy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: PRIVACY.title }, { name: "description", content: PRIVACY.description }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalPageView page={PRIVACY} />;
}
