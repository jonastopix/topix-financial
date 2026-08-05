import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { NoegletalView } from "@/components/hjemmebane/noegletal/NoegletalView";

/** /noegletal — Hb-KPI-fladen (route-parallel konvertering; gør "Dine tal"-
    miljøet komplet). AdvisorRoute i BYGGEPERIODEN: /kpis er frosset og
    uændret for medlemmer. VED GO bærer /kpis fladen (URL'en er
    notifikations-/email-kontrakt: notify-kpi-comment, detect-financial-
    alerts, send-monthly-digest skriver /kpis-deep-links; #goals er
    Guide-kontrakt), og /noegletal bliver redirect — jf. konvergens.md §2
    og BACKLOG "[P1] KPI-GO = swap på /kpis". */
const Noegletal = () => (
  <HbMemberShell active="noegletal">
    <NoegletalView />
  </HbMemberShell>
);

export default Noegletal;
