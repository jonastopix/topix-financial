import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { RapporteringView } from "@/components/hjemmebane/rapportering/RapporteringView";

/** Hb-rapporteringsfladen. Rapportering-GO gennemført 2026-08-06:
    /reports bærer fladen (URL'en er EMAIL-KONTRAKT: extract-financial-data
    + email-flows §1.1 skriver /reports?reportId=…; #upload/#annual-reports
    er Guide-kontrakt), og /rapportering redirecter til /reports m. bevaret
    hash/query — jf. konvergens.md §2 og BACKLOG "Rapportering-GO". */
const Rapportering = () => (
  <HbMemberShell active="rapportering">
    <RapporteringView />
  </HbMemberShell>
);

export default Rapportering;
