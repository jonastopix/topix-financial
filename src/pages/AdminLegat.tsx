import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { LegatView } from "@/components/hjemmebane/admin/views/LegatView";

/** /admin/legat — Legat i Hjemmebane (4/9), tynd wrapper i Hb-medlems-
    skallen (Virksomheder-mønstret). AdminRoute gater som før (App.tsx).
    layout="fuld": fladen er et HbAdminSplit (liste + detalje) og skal
    have bundet højde som chatten — ikke side-flowets max-width/padding.

    active: skallen kræver et nav-punkt, men Legat er et af «Platform»-
    punkterne i admin-blokken, som bevidst ingen `active` har
    (HbMemberShell.tsx:190-194), og unionen udvides ikke her — menuen
    og skallen røres ikke i denne PR; om punktet overhovedet bliver i
    menuen måles i det andet vindue. Værdien matcher ingen sammen-
    ligning i skallen, så intet punkt markeres — samme synlige tilstand
    som de øvrige Platform-sider. Casten fjernes når unionen får et
    «legat»-medlem. */
const AdminLegat = () => (
  <HbMemberShell active={"legat" as never} layout="fuld">
    <LegatView />
  </HbMemberShell>
);

export default AdminLegat;
