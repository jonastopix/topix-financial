import "@/styles/hjemmebane.css";
import { HbAdminShell, type AdminSection } from "@/components/hjemmebane/admin/HbAdminShell";
import { ContentView } from "@/components/hjemmebane/admin/views/ContentView";
import { PartnersView } from "@/components/hjemmebane/admin/views/PartnersView";
import { EventsView } from "@/components/hjemmebane/admin/views/EventsView";
import { ProgressView } from "@/components/hjemmebane/admin/views/ProgressView";
import { PushView } from "@/components/hjemmebane/admin/views/PushView";
import { UgensVideoView } from "@/components/hjemmebane/admin/views/UgensVideoView";

/** /admin/indhold — indholdsstyring i Hjemmebane-identiteten (C1 trin 2).
    Advisor-only via AdvisorRoute; RLS (advisor-write-policies) er anden
    forsvarslinje. Standalone-skal — ikke AppLayout; theme-scoped så appens
    mørke tema og PDF-eksporten er urørt. */
const AdminContent = ({ view }: { view: AdminSection }) => (
  <HbAdminShell section={view}>
    {view === "content" ? (
      <ContentView />
    ) : view === "partners" ? (
      <PartnersView />
    ) : view === "events" ? (
      <EventsView />
    ) : view === "progress" ? (
      <ProgressView />
    ) : view === "ugens_video" ? (
      <UgensVideoView />
    ) : (
      <PushView />
    )}
  </HbAdminShell>
);

export default AdminContent;
