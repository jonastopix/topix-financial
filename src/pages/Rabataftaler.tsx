import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { RabataftalerView } from "@/components/hjemmebane/rabataftaler/RabataftalerView";

/** Rabataftaler-miljøet (13-08-2026, PodcastTalks.tsx-mønstret):
    /rabataftaler bærer fladen i Hb-skallen. Datamodel og admin fandtes
    (partners + PartnersView/PartnerEditor) — dette er medlemsfladen.
    MemberRoute; abonnenter må bevidst gerne se rabataftaler. */
const Rabataftaler = () => (
  <HbMemberShell active="rabataftaler">
    <RabataftalerView />
  </HbMemberShell>
);

export default Rabataftaler;
