import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { MilestonesView } from "@/components/hjemmebane/milestones/MilestonesView";

/** /milestones i Hjemmebane — etape 1 (4/9): siden, listen og rækkerne
    konverteret; de fire Radix-portaler (opret, rediger, slet) er de gamle
    og ser mørke ud indtil etape 2. Den eneste flade i medlemmets menu der
    landede i det gamle design (Jonas 4/9: «rigtig dårlig oplevelse»).
    ProtectedRoute som før (App.tsx); Legat-brugere skal kunne stå her.
    Den gamle MilestonesList.tsx står urørt. Se filhovedet i MilestonesView. */
const Milestones = () => (
  <HbMemberShell active="milestones">
    <MilestonesView />
  </HbMemberShell>
);

export default Milestones;
