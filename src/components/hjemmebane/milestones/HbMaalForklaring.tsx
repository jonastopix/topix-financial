import { MAAL_EKSEMPLER, MAAL_FORKLARING_OVERSKRIFT, MAAL_FORKLARING_TEKST } from "@/lib/hjemmebane/maalForklaring";
import { cn } from "@/lib/utils";

/** «Hvad er et mål?» — forklaringen og eksemplerne (mål → skridt) fra ÉN kilde
    (lib/hjemmebane/maalForklaring). Bruges åben i de tomme tilstande (forsidens
    «Din plan», /milestones) og foldet i <details> når der er mål. Overskriften
    kan udelades når den står som <summary> udenom. */
export const HbMaalForklaring = ({ udenOverskrift = false, className }: { udenOverskrift?: boolean; className?: string }) => (
  <div className={cn("max-w-2xl", className)} data-maal-forklaring>
    {!udenOverskrift && <p className="text-sm font-medium text-hb-ink">{MAAL_FORKLARING_OVERSKRIFT}</p>}
    <p className={cn("text-sm leading-relaxed text-hb-ink-soft", !udenOverskrift && "mt-1")}>{MAAL_FORKLARING_TEKST}</p>
    <ul className="mt-3 space-y-2">
      {MAAL_EKSEMPLER.map((e) => (
        <li key={e.maal} className="text-sm leading-relaxed">
          <span className="font-medium text-hb-ink">{e.maal}</span>
          <span className="text-hb-ink-soft"> → {e.skridt.join(" · ")}</span>
        </li>
      ))}
    </ul>
  </div>
);
