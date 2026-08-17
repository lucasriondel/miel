/**
 * Terms of service.
 *
 * There is no hosted product and no user account, so these terms cover the two
 * things that actually exist: the software you may run yourself, and the single
 * instance I run for my own mail. They say what is not promised — which is
 * nearly everything — rather than pretending to a service level nobody offers.
 *
 * The licensing section deliberately does not name a licence: the repository
 * does not carry one yet, and asserting a grant that has not been made would be
 * worse than saying plainly that the code's terms are whatever the repository
 * states.
 */
import { LEGAL_LAST_UPDATED, type LegalPage } from "./legal";
import { SITE_NAME } from "./site";

export const TERMS: LegalPage = {
  path: "/terms",
  navLabel: "Terms of service",
  title: `Terms of service — ${SITE_NAME}`,
  description: `The terms ${SITE_NAME} is offered under: provided as-is, no warranty, self-hosters run and are responsible for their own instance.`,
  heading: "Terms of service",
  lastUpdated: LEGAL_LAST_UPDATED,
  intro: [
    `${SITE_NAME} is a personal project I made public so other people could run it. There is no hosted product, no subscription, and no account with me. These terms cover the two things that exist: the software itself, and the one instance I run for my own mail.`,
  ],
  sections: [
    {
      id: "as-is",
      heading: "Provided as-is, with no warranty",
      body: [
        `${SITE_NAME} is provided as-is and as-available, without warranty of any kind, express or implied — including any implied warranty of merchantability, fitness for a particular purpose, or non-infringement. Nobody has certified that it works, and nobody is on call if it does not.`,
        "It is software that holds a live key to a mailbox and hands mail to a language model. It can mislabel a message, archive something you wanted, draft a reply you would not have written, or stop working after a Gmail API change. Run it on the understanding that those outcomes are yours to absorb.",
        "To the maximum extent the law allows, I am not liable for any loss or damage arising from your use of the software or of anything it does to your mailbox.",
      ],
    },
    {
      id: "self-hosting",
      heading: "If you self-host, the instance is yours",
      body: [
        "A self-hoster runs their own instance, on their own infrastructure, with their own Google Cloud OAuth client and their own credentials for the AI provider they picked. You are the operator of that instance and you are responsible for it: for securing it, for the mail it fetches, for anyone else you let near it, and for the bills it runs up with Google and with that provider.",
        "That responsibility includes compliance. Your use of the Gmail API is governed by your agreement with Google, and your use of the AI provider — Anthropic, Google or OpenAI, whichever you configured — by your agreement with that vendor. Running Miel does not put me between you and any of them, and it does not transfer any of their obligations to me.",
        "I do not operate, monitor, back up, or have any access to your instance. If it breaks, loses data, or exposes something, that is not something I can see or fix.",
      ],
    },
    {
      id: "licensing",
      heading: "The software's licence is separate",
      body: [
        "These terms are not the software's licence. Your right to use, copy, modify or redistribute the code is governed solely by whatever licence the repository states — read it there before you build on the code, and note that where a repository carries no licence file, no such rights have been granted at all.",
        "The separation runs both ways: obtaining the software grants you no right of access to any instance I run, and using an instance I run grants you no rights in the code beyond the repository's licence.",
      ],
    },
    {
      id: "my-instance",
      heading: "No uptime or data-preservation commitment",
      body: [
        `The instance I run at my own domain exists for my own mail. There is no uptime commitment of any kind: it may be offline, broken, mid-migration, or switched off for good, at any time and without notice.`,
        "There is likewise no commitment to preserve data on it. I may drop the database, rebuild it from scratch, or delete anything on it whenever I like, and data may be lost in the process. Nothing on it should be treated as a copy of record — your mail lives in Gmail, and that is the copy that matters.",
        "The public pages at the root of that domain — this one, the privacy policy and the homepage — are readable by anyone. The app and its API sit behind an access gate and are not open to the public.",
      ],
    },
    {
      id: "acceptable-use",
      heading: "Use it lawfully",
      body: [
        "Do not use Miel to access a mailbox you are not entitled to access, and do not use it in a way that breaks Google's or Anthropic's terms. If you run an instance others use, that is on you to enforce.",
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      body: [
        "These terms may change as the project does; the date at the top moves when they do. Since there are no accounts, there is no way to notify you, and no version of these terms binds you retroactively for a copy of the software you already have.",
      ],
    },
  ],
  contactHeading: "Contact",
  contactIntro: "Questions about these terms, or about the project generally:",
};
