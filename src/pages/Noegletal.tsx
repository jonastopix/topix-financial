import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { NoegletalView } from "@/components/hjemmebane/noegletal/NoegletalView";

/** Hb-KPI-fladen. KPI-GO gennemført 2026-08-06: /kpis bærer fladen
    (URL'en er notifikations-/email-kontrakt: notify-kpi-comment,
    detect-financial-alerts, send-monthly-digest skriver /kpis-deep-links;
    #goals er Guide-kontrakt), og /noegletal redirecter til /kpis m.
    bevaret hash/query — jf. konvergens.md §2 og BACKLOG "KPI-GO". */
const Noegletal = () => (
  <HbMemberShell active="noegletal">
    <NoegletalView />
  </HbMemberShell>
);

export default Noegletal;
