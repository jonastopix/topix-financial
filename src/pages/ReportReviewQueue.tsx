import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { ReviewQueueView } from "@/components/hjemmebane/admin/views/ReviewQueueView";

/** /admin/review-queue — Review Queue i Hjemmebane (4/9), tynd wrapper i
    Hb-medlemsskallen (Virksomheder-mønstret, side-layout: det er en liste
    man skimmer, ikke et split). AdvisorRoute gater som før (App.tsx).

    active: skallen kræver et nav-punkt, men Review Queue er et af
    «Platform»-punkterne i admin-blokken, som bevidst ingen `active` har
    (HbMemberShell.tsx:190-194), og menuen røres ikke i denne PR — om
    punktet bliver i menuen er målt i det andet vindue. Samme cast som
    AdminLegat: værdien matcher ingen sammenligning, intet punkt markeres.
    Fjernes når unionen får et medlem. */
const ReportReviewQueue = () => (
  <HbMemberShell active={"review-queue" as never}>
    <ReviewQueueView />
  </HbMemberShell>
);

export default ReportReviewQueue;
