import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { DineMaalView } from "@/components/hjemmebane/milestones/DineMaalView";

/** /milestones i Hjemmebane — «Dine mål» («Én plan», fase 3, 16/9): stien
    beholdes (deep-links, menuen), siden er DineMaalView (afløser
    MilestonesView fra etape 1, 4/9). ProtectedRoute som før (App.tsx);
    Legat-brugere skal kunne stå her. Se filhovedet i DineMaalView. */
const Milestones = () => (
  <HbMemberShell active="milestones">
    <DineMaalView />
  </HbMemberShell>
);

export default Milestones;
