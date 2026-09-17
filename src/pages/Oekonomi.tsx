import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { OekonomiView } from "@/components/hjemmebane/oekonomi/OekonomiView";

/** /oekonomi (Ø2 rollen og RPC'en; Ø3 siden, 18/9-2026) — økonomioverblikket
    for partnerne (Jonas og Morten). Ruten gates af PartnerRoute (App.tsx) på
    rollen partner; menupunktet «Økonomi» i rådgivermenuen vises kun for
    partnere (hbNav.ts). Tynd wrapper i Hb-skallen (Virksomheder-mønstret);
    fladen er OekonomiView, dommen lib/oekonomi/dashboard.ts. */
const Oekonomi = () => (
  <HbMemberShell active="oekonomi">
    <OekonomiView />
  </HbMemberShell>
);

export default Oekonomi;
