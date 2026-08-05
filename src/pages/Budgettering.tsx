import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { BudgetteringView } from "@/components/hjemmebane/budget/BudgetteringView";

/** /budgettering — Hb-budgetfladen (route-parallel konvertering; næstsidste
    flade i "Dine tal"-miljøet). AdvisorRoute i BYGGEPERIODEN: /budget er
    frosset og uændret for medlemmer. VED GO bærer /budget fladen (URL'en
    er kontrakt: notifikations-deep_link fra detect-financial-alerts +
    Guide-hash'en /budget#forecast), og /budgettering bliver redirect —
    jf. konvergens.md §1/§2.2 og BACKLOG "[P1] Budget-GO = swap på /budget". */
const Budgettering = () => (
  <HbMemberShell active="budget">
    <BudgetteringView />
  </HbMemberShell>
);

export default Budgettering;
