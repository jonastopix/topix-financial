import "@/styles/hjemmebane.css";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { ImportView } from "@/components/hjemmebane/admin/views/ImportView";

/** /admin/import — Import i Hjemmebane (4/9), tynd wrapper i Hb-medlems-
    skallen (Virksomheder-/Legat-mønstret). AdminRoute gater som før
    (App.tsx), og fladen selv sender ikke-admin til «/» som den gamle side.
    Side-flow (default layout).

    active: samme forbehold som AdminLegat.tsx og AdminEmailLog.tsx —
    Import er et «Platform»-punkt i admin-blokken, som bevidst ingen
    `active` har (HbMemberShell.tsx:190-194), og unionen udvides ikke
    her, for menuen og skallen røres ikke i denne PR. Værdien matcher
    ingen sammenligning, så intet punkt markeres. Casten fjernes når
    unionen får medlemmet — eller når siden flytter til virksomhedssiden
    (Jonas 4/9, se ImportView). */
const BulkImport = () => (
  <HbMemberShell active={"import" as never}>
    <ImportView />
  </HbMemberShell>
);

export default BulkImport;
