import "@/styles/hjemmebane.css";
import { HbAdminShell, type AdminSection } from "@/components/hjemmebane/admin/HbAdminShell";
import { ContentView } from "@/components/hjemmebane/admin/views/ContentView";
import { PartnersView } from "@/components/hjemmebane/admin/views/PartnersView";
import { EventsView } from "@/components/hjemmebane/admin/views/EventsView";
import { ProgressView } from "@/components/hjemmebane/admin/views/ProgressView";

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
    ) : (
      <ProgressView />
    )}
  </HbAdminShell>
);

export default AdminContent;
