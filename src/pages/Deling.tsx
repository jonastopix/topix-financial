import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { DelingView } from "@/components/hjemmebane/deling/DelingView";

/** /deling — delingskreativen i Hjemmebane (14/9, første skridt). Tynd
    wrapper i Hb-medlemsskallen (Konto-mønstret); alt bor i DelingView.
    Intet menupunkt endnu — `active="deling"` markerer ingen nav-linje. */
const Deling = () => (
  <HbMemberShell active="deling">
    <DelingView />
  </HbMemberShell>
);

export default Deling;
