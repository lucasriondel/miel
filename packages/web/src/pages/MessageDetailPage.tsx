import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";

export const MessageDetailPage = () => {
  const { accountId, gmailMessageId } = useParams();
  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="text-sm text-miel-muted underline">
        ← Back to inbox
      </Link>
      <EmptyState
        title="Message detail not yet implemented"
        description={`Route loaded for ${accountId}:${gmailMessageId}. Detail view is built in a later step.`}
      />
    </div>
  );
};
