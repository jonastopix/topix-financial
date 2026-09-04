import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { ReportDebugView } from "@/components/hjemmebane/admin/views/ReportDebugView";

/** /admin/report-debug/:reportId — Report Debug i Hjemmebane (4/9), tynd
    wrapper i Hb-medlemsskallen (Review Queue-mønstret, side-flow: én
    rapports pipeline læses ovenfra og ned). AdminRoute gater som før
    (App.tsx). Nås fra Review Queue eller ved at kende id'et.

    active: samme forbehold som de seks andre Platform-sider — ingen
    `active`-værdi findes for den (HbMemberShell.tsx:190-194), og unionen
    udvides ikke her, for menuen og skallen røres ikke i denne PR.
    Værdien matcher ingen sammenligning, så intet punkt markeres. */
const ReportDebug = () => (
  <HbMemberShell active={"report-debug" as never}>
    <ReportDebugView />
  </HbMemberShell>
);

export default ReportDebug;
