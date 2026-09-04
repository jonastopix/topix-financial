import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { RaadgiverForsideView } from "@/components/hjemmebane/forside/RaadgiverForsideView";

/** ⚠️ RÅMATERIALE (4/9): denne rute viser KØER; det gældende design,
    docs/forsiden-design.md, beskriver OPGAVER. Set på skærm 4/9 kl. 11:35:
    38 rækker, 16 af dem samme tilstand. Swappes ALDRIG ind som den er —
    dommen bygges først som ren funktion (designets §13), så en ny flade.
    Se filhovedet i RaadgiverForsideView.tsx. */

/** /forside — rådgiverens Dit Boardroom i Hjemmebane (raadgiverfladen-
    design.md §3.5, §11 pkt. 6), etape 1, som tynd wrapper i Hb-medlems-
    skallen (Virksomheder-mønstret). MIDLERTIDIG rute: "/" renderer stadig
    AdvisorDashboard i AppLayout for rådgiveren (Index.tsx:241-252) til
    swappet. active="boardroom": det ER Dit Boardroom, for rådgiveren. */
const Forside = () => (
  <HbMemberShell active="boardroom">
    <RaadgiverForsideView />
  </HbMemberShell>
);

export default Forside;
