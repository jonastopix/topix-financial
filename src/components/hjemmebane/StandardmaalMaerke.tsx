import { cn } from "@/lib/utils";
import { HbTag } from "./HbTag";
import { STANDARDMAAL_FORKLARING, STANDARDMAAL_KOMPAKT, STANDARDMAAL_TEKST } from "@/lib/kpiMaal";

/** Lille mærkat ved et KPI-mål der er husets standard, ikke virksomhedens
    (Jonas 7/9). Samme form og placering som EstimatMaerke — et tal der ikke
    er hvad det ligner, mærkes, det undskyldes ikke:
    - pill (default): HbTag «Standardmål» — kort, rolig, sage-baggrund.
    - kompakt: «standard» til trange steder (kort-linjer) hvor en pill fylder.
    Begge bærer forklaringen som title. Teksterne bor i lib/kpiMaal. */
export const StandardmaalMaerke = ({
  kompakt = false,
  className,
}: {
  kompakt?: boolean;
  className?: string;
}) =>
  kompakt ? (
    <span
      title={STANDARDMAAL_FORKLARING}
      className={cn(
        "cursor-help text-[10px] font-medium normal-case tracking-normal text-hb-ink-soft",
        className,
      )}
    >
      {STANDARDMAAL_KOMPAKT}
    </span>
  ) : (
    <HbTag
      title={STANDARDMAAL_FORKLARING}
      className={cn("cursor-help bg-hb-sage/70 px-2 py-0.5 text-[11px] text-hb-ink-soft", className)}
    >
      {STANDARDMAAL_TEKST}
    </HbTag>
  );
