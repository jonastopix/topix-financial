import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { DelingView } from "@/components/hjemmebane/deling/DelingView";

/** /deling — delingskreativen i Hjemmebane (14/9, første skridt). Tynd
    wrapper i Hb-medlemsskallen (Konto-mønstret); alt bor i DelingView.
    Menupunktet «Fortæl det videre» (14/9) — `active="deling"` markerer det. */
const Deling = () => (
  <HbMemberShell active="deling">
    <DelingView />
  </HbMemberShell>
);

export default Deling;
