import { HbButton } from "../HbButton";
import { HbDialog } from "./HbOverlejring";
import type { Milestone } from "./useMilestones";

/**
 * Milestone-dialogerne i Hjemmebane. ETAPE 2 (4/9) byggede tre — opret,
 * detalje/rediger og slet — i skallens eget DOM-træ (HbOverlejring.tsx).
 * FLADEN 1/10-2026 (designet Jonas sagde ja til kl. 21:04) afløste opret
 * (→ SaetMaalGuide: tre trin, motorens tal) og detalje/rediger (→
 * RedigerMaalDialog: titel, frist, tastet tal — ingen skyder, ingen
 * «nuværende ÷ mål», ingen kategori/baseline/beskrivelse på fladen). Tilbage
 * står SLET: en advarselsdialog (role="alertdialog"; overlay-klik lukker IKKE),
 * bekræftet i siden — aldrig confirm().
 */

export const SletMilestoneDialog = ({
  ms, open, onOpenChange, onSlet,
}: { ms: Milestone | null; open: boolean; onOpenChange: (v: boolean) => void; onSlet: () => void }) => (
  <HbDialog
    open={open}
    onClose={() => onOpenChange(false)}
    alert
    titel="Slet målet?"
    beskrivelse={<>Er du sikker på, at du vil slette {ms ? `«${ms.title}»` : "dette mål"}? Skridtene under det mister deres mål, men slettes ikke. Denne handling kan ikke fortrydes.</>}
    fod={
      <>
        <HbButton variant="secondary" onClick={() => onOpenChange(false)}>Annuller</HbButton>
        <HbButton onClick={onSlet} className="bg-hb-rust hover:bg-hb-rust/90">Slet</HbButton>
      </>
    }
  >
    {null}
  </HbDialog>
);
