import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { GenkoerRapporterView } from "@/components/hjemmebane/genkoersel/GenkoerRapporterView";

/** /virksomheder/genkoer — «Genkør flere rapporter» for rådgivere (17/9-2026), tynd wrapper i Hb-skallen
    som /virksomheder. Ruten er AdvisorRoute; kørslen bruger rådgiverens eget JWT hele vejen. */
const GenkoerRapporter = () => (
  <HbMemberShell active="virksomheder">
    <GenkoerRapporterView />
  </HbMemberShell>
);

export default GenkoerRapporter;
