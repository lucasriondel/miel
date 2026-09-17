import { useNavigate } from "react-router-dom";
import { useSavedPromos, useSuggestedPromos } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { TopBarStart, TopBarTitle } from "@/components/ui/app-shell";
import { PageTopBar } from "../features/shell/PageTopBar";
import { BackToInboxButton } from "../components/topbar/BackToInboxButton";
import { SavedPromosSection } from "../features/promos/SavedPromosSection";
import { SuggestedPromosSection } from "../features/promos/SuggestedPromosSection";

/**
 * Where promo codes live (#162, #154).
 *
 * A **global** route, beside logs and settings rather than under
 * `/account/:id`, and the layout's default-account redirect leaves it alone
 * because it is neither `/` nor an `/account` path. The reason is the use: a
 * promo code is a thing you use at a checkout, and which mailbox it arrived in
 * is trivia. So every account's codes are here at once and the account is a
 * column on the row — available as information, never as a gate.
 *
 * Three sections, in the order the questions are asked: what is still only
 * suggested, what is about to lapse, and what already has. The first is the
 * page's share of the inbox section's cap (#154) — six cards above the message
 * list so a heavy newsletter week cannot push it off the screen, and the rest
 * reachable here, uncapped, or the cap would quietly lose them. The other two
 * are the saved promos, and every order and split among the three is the
 * server's; the page reads them out.
 *
 * Nothing here deletes by itself: an expired promo is greyed and kept, because
 * the record of what a shop offered is worth having and removing one is always
 * the user's own act.
 *
 * Two reads rather than one, because the two halves are invalidated by
 * different acts — a mail leaving the inbox moves the suggestions and not the
 * saved rows, and an edit moves the saved rows and not the suggestions. The
 * save is the one act that moves both.
 */
export const PromoCodesPage = () => {
  const { data, isLoading, error } = useSavedPromos();
  const suggestions = useSuggestedPromos();
  const navigate = useNavigate();

  const suggested = suggestions.data?.items ?? [];
  const active = data?.active ?? [];
  const expired = data?.expired ?? [];

  return (
    <>
      <PageTopBar>
        <TopBarStart>
          <BackToInboxButton onClick={() => navigate("/")} />
        </TopBarStart>
        <TopBarTitle centered>Promo codes</TopBarTitle>
      </PageTopBar>
      <div className="flex flex-col gap-6">
        <p className="text-sm text-gousse-muted">
          Codes from every account — everything the sync found, and everything you kept.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gousse-muted">
            <Spinner /> Loading promo codes…
          </div>
        ) : error ? (
          <Empty title="Failed to load promo codes" description={apiErrorMessage(error)} />
        ) : suggested.length === 0 && active.length === 0 && expired.length === 0 ? (
          // Only when there is nothing at all. A page carrying suggestions and
          // no saved rows is not empty — it is a page with something to do.
          <Empty
            title="No saved promo codes"
            description="Codes the sync finds in your marketing mail appear here, and above your inbox."
          />
        ) : (
          <>
            <SuggestedPromosSection promos={suggested} />
            <SavedPromosSection title="Active" promos={active} />
            <SavedPromosSection title="Expired" promos={expired} faded />
          </>
        )}
      </div>
    </>
  );
};
