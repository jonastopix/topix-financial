import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { RaadgiverForsideView } from "@/components/hjemmebane/forside/RaadgiverForsideView";

/** 4/9: denne rute viser DOMMEN (src/lib/forsidensDom.ts, designets §13
    pkt. 2). De gamle køer (#630) stod nedenunder til sammenligning og blev
    fjernet samme dag, efter at dommen var bevist på skærm kl. 13:04: syv
    linjer mod køernes 38 rækker. Se filhovedet i RaadgiverForsideView.tsx. */

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
