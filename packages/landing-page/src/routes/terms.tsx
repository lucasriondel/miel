import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "../components/LegalPageView";
import { TERMS } from "../content/terms";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: TERMS.title }, { name: "description", content: TERMS.description }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return <LegalPageView page={TERMS} />;
}
