import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { NyhederView } from "@/components/hjemmebane/nyheder/NyhederView";

/** /nyheder (nyhedsagenten skive 1, 30/9-2026) — rådgiverens godkendelse af
    ugens nyhedsudkast til community. Ruten gates af AdvisorRoute (App.tsx).
    Intet menupunkt i skive 1 (menuen er låst af hbNav.test): siden nås fra
    klokken «nyhed_udkast_klar» (klokke.ts: reference_type nyhed_udkast →
    /nyheder) og mandagens morgenmail. Markeret som Community i menuen, fordi
    det er dér, opslaget lander. */
const Nyheder = () => (
  <HbMemberShell active="community">
    <NyhederView />
  </HbMemberShell>
);

export default Nyheder;
