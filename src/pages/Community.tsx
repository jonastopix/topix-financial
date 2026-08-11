import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { CommunityView } from "@/components/hjemmebane/community/CommunityView";

/** /community — fællesskabets feed (forum light, læse-leddet). Erstatter
    den tidligere linkside til den eksterne Circle-platform. Events.tsx-
    mønstret: tynd wrapper i Hb-medlemsskallen. */
const Community = () => (
  <HbMemberShell active="community">
    <CommunityView />
  </HbMemberShell>
);

export default Community;
