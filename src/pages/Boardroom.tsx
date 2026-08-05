import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { BoardroomView } from "@/components/hjemmebane/boardroom/BoardroomView";

/** /boardroom — Hb-forsiden "Dit Boardroom" (route-parallel konvertering).
    AdvisorRoute i BYGGEPERIODEN: Index ("/") er frosset og uændret for
    medlemmer; GO = swap-PR ("/"-medlemsgrenen renderer denne side, gaten
    fjernes, previewen pensioneres) — jf. konvergens.md §2.3 og BACKLOG
    "[P1] Forside-GO = swap-PR". Theme-scoped standalone-skal: :root/.dark
    og PDF-eksporten er urørt. */
const Boardroom = () => (
  <HbMemberShell active="boardroom">
    <BoardroomView />
  </HbMemberShell>
);

export default Boardroom;
