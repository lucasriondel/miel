import { useQuery } from "@tanstack/react-query";
import { claudeCodeTokenQueryOptions } from "../../api/claudeCodeToken.hooks";
import { useProviderCredentials } from "../../api/providerCredential.hooks";
import type { ModelSettings } from "../../api/types";
import { missingCredentials } from "./missingCredentials";
import { NoCredentialCallout } from "./NoCredentialCallout";

/**
 * Reads what is stored and shows the callout when a task cannot run. Says
 * nothing until both reads have settled: a callout that flashed while the token
 * status was in flight would claim a credential missing that is not.
 */
export const AiCredentialNotice = ({ settings }: { settings: ModelSettings }) => {
  const token = useQuery(claudeCodeTokenQueryOptions());
  const vendors = useProviderCredentials();
  if (!token.data || vendors.pending) return null;
  const missing = missingCredentials(settings, token.data.configured, vendors.configured);
  return missing ? <NoCredentialCallout missing={missing} /> : null;
};
