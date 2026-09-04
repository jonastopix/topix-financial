import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { ConfigView } from "@/components/hjemmebane/admin/views/ConfigView";

/** /admin/config — platform-konfigurationen i Hjemmebane (4/9), tynd
    wrapper i Hb-medlemsskallen (Legat-/E-mail-log-mønstret). AdminRoute
    gater ruten som før (App.tsx), og fladen selv redirecter ikke-admins
    til «/» som den gamle side gjorde.

    active: samme forbehold som AdminLegat.tsx og AdminEmailLog.tsx —
    «Platformconfig» er et Platform-punkt i admin-blokken, som bevidst
    ingen `active` har (HbMemberShell.tsx:190-194), og unionen udvides
    ikke her, for menuen og skallen røres ikke i denne PR. Værdien
    matcher ingen sammenligning, så intet punkt markeres. Casten fjernes
    når unionen får medlemmet. */
const AdminConfig = () => (
  <HbMemberShell active={"config" as never}>
    <ConfigView />
  </HbMemberShell>
);

export default AdminConfig;
