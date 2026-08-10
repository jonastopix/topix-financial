import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { MemberDirectoryView } from "@/components/hjemmebane/members/MemberDirectoryView";

/** /medlemmer — medlemsoversigten (Events.tsx-mønstret: tynd wrapper
    i Hb-medlemsskallen). Deler active="medlemmer" med profilsiden —
    en profil hører til netværket. */
const MemberDirectory = () => (
  <HbMemberShell active="medlemmer">
    <MemberDirectoryView />
  </HbMemberShell>
);

export default MemberDirectory;
