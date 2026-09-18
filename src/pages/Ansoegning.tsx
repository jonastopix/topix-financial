import "@/styles/hjemmebane.css";
import { useParams } from "react-router-dom";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { AnsoegningView } from "@/components/hjemmebane/ansoegninger/AnsoegningView";

const Ansoegning = () => {
  const { ansoegningId } = useParams<{ ansoegningId: string }>();
  return (
    <HbMemberShell active="virksomheder">
      <AnsoegningView id={ansoegningId} />
    </HbMemberShell>
  );
};
export default Ansoegning;
