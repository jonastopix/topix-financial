import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { FeedbackView } from "@/components/hjemmebane/admin/views/FeedbackView";

/** /admin/feedback — Feedback i Hjemmebane (4/9), tynd wrapper i Hb-
    medlemsskallen (Legat-mønstret). AdminRoute gater som før (App.tsx).
    layout="fuld": fladen er et HbAdminSplit (liste + detalje) og skal
    have bundet højde som chatten og Legat.

    active: samme forbehold som de fem andre — Feedback er et «Platform»-
    punkt i admin-blokken, som bevidst ingen `active` har
    (HbMemberShell.tsx:190-194), og unionen udvides ikke her, for menuen
    og skallen røres ikke i denne PR. Værdien matcher ingen sammenligning,
    så intet punkt markeres. Casten fjernes når unionen får medlemmet. */
const AdminFeedback = () => (
  <HbMemberShell active={"feedback" as never} layout="fuld">
    <FeedbackView />
  </HbMemberShell>
);

export default AdminFeedback;
