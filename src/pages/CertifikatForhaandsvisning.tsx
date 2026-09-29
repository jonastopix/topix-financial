import "@/styles/hjemmebane.css";
import { useMemo, useState } from "react";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { CertificatePage } from "@/components/hjemmebane/certifikat/CertificatePage";
import { getCertificateStatus } from "@/components/hjemmebane/certifikat/format";
import {
  EKSEMPEL_NAVN,
  EKSEMPEL_VIRKSOMHED,
  FORHAANDSVISNING_LINJE,
  UPLOAD_SLAAET_FRA,
  forhaandsvisningsStart,
  type Forhaandstilstand,
} from "@/lib/certifikat/forhaandsvisning";

/** /certifikat/forhaandsvisning — rådgiverens forhåndsvisning af «Dit
    certifikat» (29/9-2026). Bag AdvisorRoute i App.tsx; intet menupunkt.
    Den ÆGTE CertificatePage med eksempeldata. INTET GEMMES: upload kaster en
    besked, og onDownloaded udelades, så en hentning aldrig bliver en række i
    certificate_downloads. PDF og PNG virker som for medlemmet. */
const CertifikatForhaandsvisning = () => {
  const [tilstand, setTilstand] = useState<Forhaandstilstand>("aaben");
  const status = useMemo(() => getCertificateStatus(forhaandsvisningsStart(tilstand), true), [tilstand]);

  return (
    <HbMemberShell active="certifikat">
      <div className="mb-6 space-y-3">
        <p className="text-sm text-hb-ink-soft">{FORHAANDSVISNING_LINJE}</p>
        <div className="flex gap-2" role="group" aria-label="Tilstand">
          <HbButton
            type="button"
            variant={tilstand === "laast" ? "primary" : "secondary"}
            aria-pressed={tilstand === "laast"}
            onClick={() => setTilstand("laast")}
          >
            Låst
          </HbButton>
          <HbButton
            type="button"
            variant={tilstand === "aaben" ? "primary" : "secondary"}
            aria-pressed={tilstand === "aaben"}
            onClick={() => setTilstand("aaben")}
          >
            Åben
          </HbButton>
        </div>
      </div>
      <CertificatePage
        key={tilstand}
        status={status}
        initialName={EKSEMPEL_NAVN}
        initialCompany={EKSEMPEL_VIRKSOMHED}
        portraitUrl={null}
        onPortraitUpload={async () => {
          throw new Error(UPLOAD_SLAAET_FRA);
        }}
      />
    </HbMemberShell>
  );
};

export default CertifikatForhaandsvisning;
