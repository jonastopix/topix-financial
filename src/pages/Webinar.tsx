import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { WebinarView } from "@/components/hjemmebane/webinar/WebinarView";

/** /webinar (udkast 19/9-2026) — webinartallene for rådgiverne: hvor mange
    der er tilmeldt det næste, hvordan de afholdte gik, hvor de kom fra
    (annonce og kilde), og hvor mange af dem der ansøgte. Ruten gates af
    AdvisorRoute (App.tsx). Tynd wrapper i Hb-skallen (Oekonomi-mønstret);
    fladen er WebinarView, dommen lib/webinar/dashboard.ts. */
const Webinar = () => (
  <HbMemberShell active="webinar">
    <WebinarView />
  </HbMemberShell>
);

export default Webinar;
