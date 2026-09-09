import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { KontoView } from "@/components/hjemmebane/konto/KontoView";

/** /konto — kontoen i Hjemmebane (9/9), for alle roller. Tynd wrapper i
    Hb-medlemsskallen (Milestones-mønstret). Se KontoViews filhoved. */
const Konto = () => (
  <HbMemberShell active="konto">
    <KontoView />
  </HbMemberShell>
);

export default Konto;
