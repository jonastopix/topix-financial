import "@/styles/hjemmebane.css";
import { useParams } from "react-router-dom";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { CommunityTraadView } from "@/components/hjemmebane/community/CommunityTraadView";

/** /community/:id — trådsiden (fællesskabets læse-led, trin 2).
    EventDetail.tsx-mønstret: parameteren læses HER og gives som prop;
    ikke-fundet håndteres blødt i view'et. */
const CommunityTraad = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <HbMemberShell active="community">
      <CommunityTraadView traadId={id ?? ""} />
    </HbMemberShell>
  );
};

export default CommunityTraad;
