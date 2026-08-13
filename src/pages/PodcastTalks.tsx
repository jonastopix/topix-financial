import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { PodcastTalksView } from "@/components/hjemmebane/podcasttalks/PodcastTalksView";

/** Podcast & Talks-miljøet (13-08-2026, Noegletal.tsx-mønstret): /podcast
    bærer fladen i Hb-skallen. Abonnentens sidste manglende flade — podcast
    fra RSS + talks fra content_items (area='talks', som BLIVER i Akademiet
    i dette trin). MemberRoute, ikke ProtectedRoute — samme gate som /events
    og /community; en abonnent passerer den, hvilket er tilsigtet. */
const PodcastTalks = () => (
  <HbMemberShell active="podcast">
    <PodcastTalksView />
  </HbMemberShell>
);

export default PodcastTalks;
