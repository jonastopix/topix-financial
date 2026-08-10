import "@/styles/hjemmebane.css";
import { useParams } from "react-router-dom";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { MemberProfileView } from "@/components/hjemmebane/members/MemberProfileView";

/** /medlemmer/:userId — medlemsprofilens visningsflade (EventDetail-
    mønstret: parameteren læses her og gives som prop; ikke-fundet
    håndteres blødt i view'et). Deler active="medlemmer" med
    oversigten — en profil hører til netværket. */
const MemberProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  return (
    <HbMemberShell active="medlemmer">
      <MemberProfileView userId={userId ?? ""} />
    </HbMemberShell>
  );
};

export default MemberProfile;
