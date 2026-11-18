import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { queryKeys } from "./queries";
import type { Account } from "./types";

/** The longest nickname the server keeps; it trims and caps at the same length. */
export const NICKNAME_MAX_LENGTH = 60;

export interface RenameAccountInput {
  accountId: string;
  /** `null` (or an empty string) clears it, and the Google name shows again. */
  nickname: string | null;
}

/**
 * Names a mailbox in miel (`PATCH /accounts/:id`). Gmail is not told. Not
 * optimistic: the server trims and caps the value, so the accounts list is
 * re-read for what it kept.
 */
export function useRenameAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, nickname }: RenameAccountInput) =>
      apiFetch<{ account: Account }>({
        path: `/accounts/${accountId}`,
        method: "PATCH",
        body: { nickname: nickname?.trim() ? nickname.trim() : null },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
  });
}
