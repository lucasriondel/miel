import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "../../api/client";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { LabelBadge } from "../../components/LabelBadge";
import type { FilterLedgerItem } from "./ledgerItem";
import { LedgerRow } from "./LedgerRow";
import { LedgerIconButton } from "./LedgerIconButton";

interface Props {
  item: FilterLedgerItem;
}

/**
 * A proposed filter, as one ledger row.
 *
 * Its value is a *rule* rather than a literal, and a rule needs both halves
 * shown — so this is the one kind that does not use the dashed value chip: the
 * FROM pill, an arrow, and the label it would apply, which is how the filters
 * page draws the same rule. Reading the two halves is the whole decision, so
 * neither may be truncated.
 *
 * The two acts are a tick and an X, and they are not the same act as the code
 * and promo rows' X: dismissing a proposal refuses a rule, and there is no mail
 * to trash — the mail this was inferred from is one of many.
 */
export const FilterLedgerRow = ({ item }: Props) => {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<null | "accept" | "dismiss">(null);
  const { suggestion } = item;

  const run = async (kind: "accept" | "dismiss") => {
    setPending(kind);
    try {
      await apiFetch({ path: `/filters/suggestions/${suggestion.id}/${kind}`, method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["filters"] });
    } catch (err) {
      // The row stays where it is on a refusal — nothing was written — so the
      // toast is the whole of the explanation. It replaces the inline error the
      // card had room for and a row does not.
      toast.error(
        `${kind === "accept" ? "Could not create the filter" : "Could not dismiss the proposal"}: ${apiErrorMessage(err)}`,
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <LedgerRow
      kind="filter"
      issuer={item.issuer}
      when={item.when}
      context={item.context}
      value={
        <span className="flex shrink-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-baseline gap-2 rounded-full border border-gousse-line px-3 py-[3px] text-[13px]">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-gousse-muted">
              {CRITERION_LABEL[criterionOf(suggestion)]}
            </span>
            <span className="max-w-[16rem] truncate font-medium text-gousse-ink">
              {item.issuer}
            </span>
          </span>
          <ArrowRight className="h-[15px] w-[15px] shrink-0 text-gousse-muted" aria-hidden />
          <LabelBadge
            name={suggestion.addLabelName}
            colorBg={item.matchedLabel?.colorBg ?? null}
            colorFg={item.matchedLabel?.colorFg ?? null}
          />
        </span>
      }
      act={
        <>
          <LedgerIconButton
            label="Create filter"
            onClick={() => run("accept")}
            disabled={pending !== null}
          >
            {pending === "accept" ? (
              <Spinner size={16} />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
          </LedgerIconButton>
          <LedgerIconButton
            label="Dismiss"
            onClick={() => run("dismiss")}
            disabled={pending !== null}
          >
            {pending === "dismiss" ? <Spinner size={16} /> : <X className="h-4 w-4" aria-hidden />}
          </LedgerIconButton>
        </>
      }
    />
  );
};

/** Which of the three criteria the row is naming, so the pill labels it right. */
function criterionOf(suggestion: FilterLedgerItem["suggestion"]): "from" | "subject" | "query" {
  if (suggestion.criteriaFrom) return "from";
  if (suggestion.criteriaSubject) return "subject";
  return "query";
}

const CRITERION_LABEL = { from: "FROM", subject: "SUBJ", query: "QUERY" } as const;
