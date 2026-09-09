import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { OpgavelisteView } from "@/components/hjemmebane/opgaver/OpgavelisteView";

/** /opgaver — HELE listen (alle åbne, filter, gjorte) som tynd wrapper i
    Hb-medlemsskallen. Uden menupunkt (Jonas 8/9): forsiden bærer listen og
    skrivefeltet; denne side er «vis alle», nået fra forsidens link. */
const Opgaver = () => (
  <HbMemberShell active="opgaver">
    <OpgavelisteView />
  </HbMemberShell>
);

export default Opgaver;
