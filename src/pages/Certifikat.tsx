import "@/styles/hjemmebane.css";
import { Navigate } from "react-router-dom";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { HbSpinner } from "@/components/hjemmebane/HbSpinner";
import { CertificatePage } from "@/components/hjemmebane/certifikat/CertificatePage";
import { useCertificate } from "@/hooks/useCertificate";

/** /certifikat — «Dit certifikat» (29/9-2026, trin 1). Tynd wrapper i
    Hb-medlemsskallen (Deling-mønstret). Skjult (ikke berettiget, ikke fuldt
    medlem, ingen startdato) → forsiden, også ved direkte URL (HANDOFF §11).
    En FEJL i opslaget er ikke et nej: den vises som en linje, ikke en redirect. */
const Certifikat = () => {
  const c = useCertificate();
  if (c.loading) {
    return (
      <HbMemberShell active="certifikat">
        <HbSpinner />
      </HbMemberShell>
    );
  }
  if (c.fejl !== null) {
    return (
      <HbMemberShell active="certifikat">
        <p role="alert" className="text-sm text-hb-rust">
          Certifikatet kunne ikke hentes lige nu. Prøv igen om lidt.
        </p>
      </HbMemberShell>
    );
  }
  if (c.dom.synlig === false) return <Navigate to="/" replace />;
  return (
    <HbMemberShell active="certifikat">
      <CertificatePage
        status={c.dom.status}
        initialName={c.navn}
        initialCompany={c.virksomhed}
        portraitUrl={c.portraetUrl}
        onPortraitUpload={c.uploadPortraet}
        onDownloaded={(design, format) => void c.logHentning(design, format)}
      />
    </HbMemberShell>
  );
};

export default Certifikat;
