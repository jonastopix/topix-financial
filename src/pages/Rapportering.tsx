import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { RapporteringView } from "@/components/hjemmebane/rapportering/RapporteringView";

/** /rapportering — Hb-rapporteringsfladen (route-parallel konvertering,
    første flade i "Dine tal"-miljøet). AdvisorRoute i BYGGEPERIODEN:
    /reports er frosset og uændret for medlemmer. VED GO bærer /reports
    fladen (URL'en er EMAIL-KONTRAKT: ?reportId= + #upload/#annual-reports
    skal virke identisk), og /rapportering bliver redirect — jf.
    konvergens.md §2 og BACKLOG "[P1] Rapportering-GO = swap på /reports". */
const Rapportering = () => (
  <HbMemberShell active="rapportering">
    <RapporteringView />
  </HbMemberShell>
);

export default Rapportering;
