import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { EmailTemplatesView } from "@/components/hjemmebane/admin/views/EmailTemplatesView";

/** /admin/emails — e-mail-skabelonerne i Hjemmebane (4/9), tynd wrapper i
    Hb-medlemsskallen (Legat-/Feedback-mønstret). AdminRoute gater som før
    (App.tsx). layout="fuld": fladen er et HbAdminSplit (liste + editor)
    og skal have bundet højde som chatten. Med denne er den sidste gamle
    admin-side væk — men fladen skal GENTÆNKES, ikke kun konverteres
    (se EmailTemplatesView's filhoved).

    active: samme forbehold som de syv andre — «E-mails» er et Platform-
    punkt i admin-blokken, som bevidst ingen `active` har
    (HbMemberShell.tsx:190-194), og unionen udvides ikke her, for menuen
    og skallen røres ikke i denne PR. Værdien matcher ingen sammenligning,
    så intet punkt markeres. Casten fjernes når unionen får medlemmet. */
const EmailTemplates = () => (
  <HbMemberShell active={"emails" as never} layout="fuld">
    <EmailTemplatesView />
  </HbMemberShell>
);

export default EmailTemplates;
