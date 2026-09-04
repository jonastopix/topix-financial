import "@/styles/hjemmebane.css";
import { useParams } from "react-router-dom";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { VirksomhedView } from "@/components/hjemmebane/virksomhed/VirksomhedView";

/** /virksomhed/:companyId — virksomhedssiden (raadgiverfladen-design.md
    §3.3, §4), etape 1, som tynd wrapper i Hb-medlemsskallen. Deler
    active="virksomheder" med listen — en virksomhed hører til listen
    (MemberProfile/MemberDirectory-mønstret). Den gamle /members/:userId
    står urørt ved siden af. */
const Virksomhed = () => {
  const { companyId } = useParams<{ companyId: string }>();
  return (
    <HbMemberShell active="virksomheder">
      <VirksomhedView companyId={companyId} />
    </HbMemberShell>
  );
};

export default Virksomhed;
