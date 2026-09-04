import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { RaadgiverForsideView } from "@/components/hjemmebane/forside/RaadgiverForsideView";

/** 4/9: denne rute viser nu DOMMEN (src/lib/forsidensDom.ts, designets
    §13 pkt. 2) øverst, og de gamle KØER (#630) nedenunder som råmateriale,
    så tærsklen kan måles mod 4/9's 38 rækker før swappet. Swappes ikke ind
    før dommen er set. Se filhovedet i RaadgiverForsideView.tsx. */

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
