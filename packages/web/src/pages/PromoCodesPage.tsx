import { useNavigate } from "react-router-dom";
import { useSavedPromos } from "../api/queries";
import { apiErrorMessage } from "../api/apiErrorMessage";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { TopBarStart, TopBarTitle } from "@/components/ui/app-shell";
import { PageTopBar } from "../features/shell/PageTopBar";
import { BackToInboxButton } from "../components/topbar/BackToInboxButton";
import { SavedPromosSection } from "../features/promos/SavedPromosSection";

/**
 * Where saved promo codes live (#162).
 *
 * A **global** route, beside logs and settings rather than under
 * `/account/:id`, and the layout's default-account redirect leaves it alone
 * because it is neither `/` nor an `/account` path. The reason is the use: a
 * promo code is a thing you use at a checkout, and which mailbox it arrived in
 * is trivia. So every account's codes are here at once and the account is a
 * column on the row — available as information, never as a gate.
 *
 * Two sections, in the order the question is asked: what is about to lapse,
 * then what already has. Both orders are the server's, and so is the split; the
 * page reads them out. Nothing here deletes: an expired promo is greyed and
 * kept, because the record of what a shop offered is worth having and removing
 * one is always the user's own act.
 */
export const PromoCodesPage = () => {
  const { data, isLoading, error } = useSavedPromos();
  const navigate = useNavigate();

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
          Codes saved from every account, soonest to lapse first.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gousse-muted">
            <Spinner /> Loading promo codes…
          </div>
        ) : error ? (
          <Empty title="Failed to load promo codes" description={apiErrorMessage(error)} />
        ) : active.length === 0 && expired.length === 0 ? (
          <Empty
            title="No saved promo codes"
            description="Save a code from the suggestions above your inbox and it will appear here."
          />
        ) : (
          <>
            <SavedPromosSection title="Active" promos={active} />
            <SavedPromosSection title="Expired" promos={expired} faded />
          </>
        )}
      </div>
    </>
  );
};
