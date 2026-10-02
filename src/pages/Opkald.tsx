import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { OpkaldView } from "@/components/hjemmebane/opkald/OpkaldView";

/** /opkald («Må vi ringe til dig?», 2/10-2026) — rådgivernes kø af dem, der
    selv bad om et opkald efter webinaret. Ruten gates af AdvisorRoute
    (App.tsx). Intet menupunkt (menuen er låst af hbNav.test): siden nås fra
    klokken «opkald_anmodet» (klokke.ts: reference_type opkald → /opkald) og
    morgenmailen. Markeret som Webinar i menuen — det er dér, de kom fra. */
const Opkald = () => (
  <HbMemberShell active="opkald">
    <OpkaldView />
  </HbMemberShell>
);

export default Opkald;
