import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { HandoutsView } from "@/components/hjemmebane/handouts/HandoutsView";

/** Hb-handoutfladen. Handouts-GO gennemført 2026-08-06: /handouts bærer
    fladen via PROTECTEDROUTE — IKKE MemberRoute: Legat-brugere skal
    kunne stå her (MemberRoute redirecter isLegat → /legat). URL-kontrakt:
    ?module=<m> (Akademi-broens OevelseKort linker /handouts?module=…);
    /handout redirecter til /handouts m. bevaret query/hash — jf.
    hb-handouts-byggeplan §1/§5 og BACKLOG "Handouts-GO".
    Handouts i Akademiet (1/10-2026 nat): ruten står IKKE i medlemmets menu
    længere — et medlem uden modul sendes til Akademiet, med modul til
    editoren (HandoutsView erMedlemsvisning). `active="handouts"` matcher
    da intet punkt, hvilket er rigtigt. */
const Handout = () => (
  <HbMemberShell active="handouts">
    <HandoutsView />
  </HbMemberShell>
);

export default Handout;
