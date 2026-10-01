import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { EngagementView } from "@/components/hjemmebane/engagement/EngagementView";

/** /engagement — rådgivernes overblik over score, streak og trofæer (1/10-2026). */
const Engagement = () => (
  <HbMemberShell active="engagement">
    <EngagementView />
  </HbMemberShell>
);

export default Engagement;
