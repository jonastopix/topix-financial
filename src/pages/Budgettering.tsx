import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { BudgetteringView } from "@/components/hjemmebane/budget/BudgetteringView";

/** Hb-budgetfladen. Budget-GO gennemført 2026-08-06: /budget bærer
    fladen (URL'en er kontrakt: notifikations-deep_link "/budget" fra
    detect-financial-alerts + Guide-hash'en /budget#forecast — ankeret
    indfries strukturelt, sektionen er altid i DOM), og /budgettering
    redirecter til /budget m. bevaret hash/query — jf. konvergens.md
    §1/§2.2 og BACKLOG "Budget-GO". */
const Budgettering = () => (
  <HbMemberShell active="budget">
    <BudgetteringView />
  </HbMemberShell>
);

export default Budgettering;
