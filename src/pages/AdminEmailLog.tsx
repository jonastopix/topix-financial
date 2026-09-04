import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { EmailLogView } from "@/components/hjemmebane/admin/views/EmailLogView";

/** /admin/email-log — e-mail-loggen i Hjemmebane (4/9), tynd wrapper i
    Hb-medlemsskallen (Virksomheder-/Legat-mønstret). AdminRoute gater
    som før (App.tsx). Side-flow (default layout): listen scroller med
    siden som virksomhedslisten.

    active: samme forbehold som AdminLegat.tsx — Legat og E-mail-log er
    «Platform»-punkter i admin-blokken, som bevidst ingen `active` har
    (HbMemberShell.tsx:190-194), og unionen udvides ikke her, for menuen
    og skallen røres ikke i denne PR. Værdien matcher ingen sammenligning,
    så intet punkt markeres. Casten fjernes når unionen får medlemmet. */
const AdminEmailLog = () => (
  <HbMemberShell active={"email-log" as never}>
    <EmailLogView />
  </HbMemberShell>
);

export default AdminEmailLog;
