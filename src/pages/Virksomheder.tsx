import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { VirksomhedslisteView } from "@/components/hjemmebane/virksomheder/VirksomhedslisteView";

/** /virksomheder — den rene virksomhedsliste (raadgiverfladen-design.md
    §3.6) som tynd wrapper i Hb-medlemsskallen (MemberDirectory-mønstret).
    MIDLERTIDIG rute: /members og AppSidebar står urørt til swappet. */
const Virksomheder = () => (
  <HbMemberShell active="virksomheder">
    <VirksomhedslisteView />
  </HbMemberShell>
);

export default Virksomheder;
