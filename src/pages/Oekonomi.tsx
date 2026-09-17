import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";

export const OEKONOMI_KOMMER_TEKST = "Økonomi — kommer i Ø3";

/** /oekonomi (Ø2, 18/9-2026) — økonomioverblikket for partnerne (Jonas og
    Morten). Ruten gates af PartnerRoute (App.tsx) på rollen partner;
    menupunktet «Økonomi» i rådgivermenuen vises kun for partnere
    (hbNav.ts). Siden er TOM med vilje: Ø2 er rollen og RPC'en
    (hent_oekonomi_overblik + hooks/oekonomiOverblik.ts); tallene tegnes i
    Ø3 med motoren i src/lib/oekonomi/omsaetning.ts. */
const Oekonomi = () => (
  <HbMemberShell active="oekonomi">
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <p className="text-xs uppercase tracking-wider text-hb-ink-soft">Partnere</p>
      <h1 className="mt-2 font-serif text-2xl text-hb-ink md:text-3xl">{OEKONOMI_KOMMER_TEKST}</h1>
    </div>
  </HbMemberShell>
);

export default Oekonomi;
