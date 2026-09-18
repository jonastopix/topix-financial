import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { AnsoegningslisteView } from "@/components/hjemmebane/ansoegninger/AnsoegningslisteView";

const Ansoegninger = () => (
  <HbMemberShell active="ansoegninger">
    <AnsoegningslisteView />
  </HbMemberShell>
);
export default Ansoegninger;
