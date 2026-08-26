import * as React from "react";
import { cn } from "@/lib/utils";
import { HbTag } from "./HbTag";

/** Estimat-mærket (data_basis-kontrakten, docs/data-basis-kontrakt.md:
    "Visninger må vise dem, men skal sige det"). ÉN forklaring, ét sted —
    formuleringen matcher uploadsidens egen lovtekst (RapporteringView:
    "tallene fordeles over 12 måneder og giver dine grafer historisk
    kontekst"). Estimater er en funktion medlemmet selv har valgt ved at
    uploade årsrapporten — mærket oplyser, det undskylder ikke. */
export const ESTIMAT_FORKLARING =
  "Estimat: tal fra din årsrapport fordelt over 12 måneder. De giver dine grafer historisk kontekst, men er ikke målte månedstal.";

/** Lille mærkat til visninger der viser estimattal.
    - pill (default): HbTag-pillen "Estimat" — kort, rolig, sage-baggrund.
    - kompakt: "est." til trange steder (tabel-headere) hvor en pill fylder.
    Begge bærer forklaringen som title, så mærket forklarer sig selv. */
export const EstimatMaerke = ({
  kompakt = false,
  className,
}: {
  kompakt?: boolean;
  className?: string;
}) =>
  kompakt ? (
    <span
      title={ESTIMAT_FORKLARING}
      className={cn(
        "cursor-help text-[10px] font-medium normal-case tracking-normal text-hb-ink-soft",
        className,
      )}
    >
      est.
    </span>
  ) : (
    <HbTag
      title={ESTIMAT_FORKLARING}
      className={cn("cursor-help bg-hb-sage/70 px-2 py-0.5 text-[11px] text-hb-ink-soft", className)}
    >
      Estimat
    </HbTag>
  );
