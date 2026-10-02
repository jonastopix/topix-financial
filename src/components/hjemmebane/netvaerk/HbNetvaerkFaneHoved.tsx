import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { visNetvaerkFaner } from "@/lib/hjemmebane/netvaerkFaner";

/** FANENS HOVED (seks steder, skridt 2, 2/10-2026) — det, Events,
    Medlemmerne og Fordele tegner øverst, nu hvor Netværket har ÉT hoved
    (HbNetvaerkFaner: eyebrow → h1 → sætningen → fanerne) over dem.

    Under fanerne er siden en FANE: dens rubrik er en h2 (sidens h1 er
    «Netværket»), uden eyebrow (fanen hedder det allerede) og uden intro
    (sætningen står over fanerne) — hierarkiet er ÉT, som rådets fund 7
    krævede: eyebrow → h1 → sætningen → faner → h2.

    UDEN fanerne — abonnenten på /rabataftaler, rådgiveren på sine egne
    flader (/events og /medlemmer under «Medlemmets flader») — er siden
    stadig en SIDE og tegner sit gamle hoved ordret: eyebrow → h1 → intro.
    Samme dom som fanerne (visNetvaerkFaner), så de to aldrig kan skilles:
    tegnes fanerne, tegnes h2'en; tegnes de ikke, tegnes h1'en.
    Hooks i topblokken, før den betingede return. */
export const HbNetvaerkFaneHoved = ({ eyebrow, rubrik, intro }: { eyebrow: string; rubrik: string; intro: ReactNode }) => {
  const { isAdvisor, membershipTier } = useAuth();
  const { viewingAsMember } = useViewMode();
  const underFaner = visNetvaerkFaner({ isAdvisor, viewingAsMember, membershipTier });
  if (underFaner) {
    return (
      <section className="max-w-3xl" data-netvaerk-fane={eyebrow}>
        <h2 className="font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">{rubrik}</h2>
      </section>
    );
  }
  return (
    <section className="max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{eyebrow}</p>
      <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{rubrik}</h1>
      {intro}
    </section>
  );
};
