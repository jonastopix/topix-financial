import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { OpgavelisteView } from "@/components/hjemmebane/opgaver/OpgavelisteView";

/** /opgaver — rådgivernes fælles to-do-liste (8/9) som tynd wrapper i
    Hb-medlemsskallen (Virksomheder-mønstret). */
const Opgaver = () => (
  <HbMemberShell active="opgaver">
    <OpgavelisteView />
  </HbMemberShell>
);

export default Opgaver;
