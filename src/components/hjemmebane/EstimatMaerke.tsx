import * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { HbPopover } from "./milestones/HbOverlejring";

/** Estimat-mærket (data_basis-kontrakten, docs/data-basis-kontrakt.md:
    "Visninger må vise dem, men skal sige det"). ÉN forklaring, ét sted —
    formuleringen matcher uploadsidens egen lovtekst (RapporteringView:
    "tallene fordeles over 12 måneder og giver dine grafer historisk
    kontekst"). Estimater er en funktion medlemmet selv har valgt ved at
    uploade årsrapporten — mærket oplyser, det undskylder ikke. */
export const ESTIMAT_FORKLARING =
  "Estimat: tal fra din årsrapport fordelt over 12 måneder. De giver dine grafer historisk kontekst, men er ikke målte månedstal.";

/**
 * Trykfladen (10/9, kort #64): forklaringen lå KUN i `title`, som ikke
 * findes på en telefon — og efter #787 er estimater mere synlige end før.
 * Mærket er nu en knap der åbner forklaringen i husets HbPopover (samme
 * overlejring som milepælenes datovælger; ingen portal, ingen ny komponent).
 * Pillen er visuelt ~20 px høj; `before:inset-[-11px]` lægger en usynlig
 * trykflade på 11 px rundt om, så det trykbare er mindst 44 × 44 punkter
 * (Apples grænse; husets knapper er h-11 = 44 px) uden at pillen vokser i
 * linjen. På mobil lægger panelet sig som et lille ark i bunden (fixed),
 * så det aldrig skæres af skærmens kant; fra sm: står det under mærket.
 * `title` bevares til musen.
 */
const TRYKFLADE = "relative touch-manipulation before:absolute before:inset-[-11px] before:content-['']";
const FOKUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60";
const PANEL = "fixed inset-x-4 bottom-4 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-72";

/** Lille mærkat til visninger der viser estimattal.
    - pill (default): "Estimat" — kort, rolig, sage-baggrund.
    - kompakt: "est." til trange steder (tabel-headere) hvor en pill fylder.
    Begge åbner forklaringen ved tryk og bærer den som title. */
export const EstimatMaerke = ({
  kompakt = false,
  className,
}: {
  kompakt?: boolean;
  className?: string;
}) => {
  const [aaben, setAaben] = useState(false);
  return (
    <HbPopover
      inline
      open={aaben}
      onOpenChange={setAaben}
      className={className}
      panelClassName={PANEL}
      trigger={(p) =>
        kompakt ? (
          <button
            type="button"
            {...p}
            title={ESTIMAT_FORKLARING}
            aria-label="Estimat — vis forklaring"
            className={cn(
              "cursor-help rounded text-[10px] font-medium normal-case tracking-normal text-hb-ink-soft hover:text-hb-ink",
              TRYKFLADE,
              FOKUS,
            )}
          >
            est.
          </button>
        ) : (
          <button
            type="button"
            {...p}
            title={ESTIMAT_FORKLARING}
            aria-label="Estimat — vis forklaring"
            className={cn(
              "inline-flex cursor-help items-center rounded-full bg-hb-sage/70 px-2 py-0.5 text-[11px] font-medium text-hb-ink-soft hover:bg-hb-sage",
              TRYKFLADE,
              FOKUS,
            )}
          >
            Estimat
          </button>
        )
      }
    >
      {/* Panelet nulstiller det omgivende afsnits typografi: forsidens strip
          står i whitespace-nowrap og uppercase/tracking — forklaringen skal
          ombryde og stå i normal skrift. */}
      <span className="block whitespace-normal p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-hb-ink-soft">
        {ESTIMAT_FORKLARING}
      </span>
    </HbPopover>
  );
};
