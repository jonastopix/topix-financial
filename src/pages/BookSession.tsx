import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { BookSessionView } from "@/components/hjemmebane/booksession/BookSessionView";

/** Hb-book-session-fladen. BookSession-GO gennemført 2026-08-13:
    /book-session bærer fladen i Hb-skallen (Noegletal.tsx-mønstret).
    Al logik bor i BookSessionView; tilstandsmaskinen i
    bookSessionTilstand.ts (PR #356). Hook-ordenen og 403-body-parsningen
    fra PR #353 er bevaret ordret i viewet. */
const BookSession = () => (
  <HbMemberShell active="booksession">
    <BookSessionView />
  </HbMemberShell>
);

export default BookSession;
