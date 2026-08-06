import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { HandoutsView } from "@/components/hjemmebane/handouts/HandoutsView";

/** /handout — Hb-handoutfladen (route-parallel konvertering, sidste
    flade i "Dine tal"-miljøet). AdvisorRoute i BYGGEPERIODEN: /handouts
    er frosset og uændret for medlemmer. VED GO bærer /handouts fladen
    via PROTECTEDROUTE — IKKE MemberRoute: Legat-brugere skal kunne stå
    her (MemberRoute redirecter isLegat → /legat). URL-kontrakt:
    ?module=<m> (Akademi-broens ElementView linker /handouts?module=…),
    og /handout bliver redirect m. bevaret query — jf.
    hb-handouts-byggeplan §1/§5 og BACKLOG "Handouts-GO". */
const Handout = () => (
  <HbMemberShell active="handouts">
    <HandoutsView />
  </HbMemberShell>
);

export default Handout;
