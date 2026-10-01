import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getOwnHandout } from "@/lib/hjemmebane/akademiApi";
import { handoutConfigs, type HandoutModule } from "@/lib/handoutConfig";
import {
  OEVELSE_EYEBROW,
  RETNING_MODUL,
  RETNING_STI,
  RETNING_TEKST,
  erOevelse,
  oevelseDom,
  oevelseSti,
} from "@/lib/hjemmebane/oevelse";
import { sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";
import { HbButton } from "@/components/hjemmebane/HbButton";

/** Øvelsen (handouts i Akademiet, 1/10-2026 nat — lib/hjemmebane/oevelse.ts):
    kortet på en lektion (ElementView) eller en samling (KursusView), der
    bærer et handout-modul. Status læses fra medlemmets EGEN handouts-række
    (getOwnHandout, self-only RLS; en rådgiver har typisk ingen række →
    «Ikke startet», et korrekt billede af medlemmets start). Ord og dom bor
    i motoren; kortet tegner kun. Internt <Link> — udfyldningen bliver på
    platformen, og HandoutsView sender medlemmet tilbage hertil.

    RETNING_MODUL (overordnet) tegnes ALDRIG som en øvelse: lektionen
    henviser til Dine mål. Ukendt modul → intet (CHECK forhindrer det). */
export const OevelseKort = ({ module, unlocked }: { module: string; unlocked: boolean }) => {
  const { user } = useAuth();
  const erOev = erOevelse(module);
  const config = erOev ? handoutConfigs[module as HandoutModule] : null;
  // Hooken står i topblokken, før enhver betinget return (React #310).
  const query = useQuery({
    queryKey: ["akademi", "handout", module],
    queryFn: () => getOwnHandout(user!.id, module),
    enabled: unlocked && erOev && !!user,
  });

  if (module === RETNING_MODUL) return <RetningHenvisning />;
  if (!config) return null;

  const dom = oevelseDom(query.data, config);

  return (
    <section className="mt-8 rounded-hb border border-hb-line bg-hb-sage/20 px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{OEVELSE_EYEBROW}</p>
      <h2 className="mt-2 font-editorial text-xl font-medium text-hb-ink">{config.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">{config.subtitle}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link to={oevelseSti(config.module)}>
          <HbButton variant={dom.tilstand === "udfyldt" ? "secondary" : "primary"}>
            {dom.knapTekst}
            <ArrowRight className="h-4 w-4" />
          </HbButton>
        </Link>
        {/* Fejlet ≠ ikke startet (hentefejl.ts): kunne rækken ikke hentes,
            siges det — ellers ville en fejl ligne «Ikke startet». */}
        <span className="text-sm text-hb-ink-soft">
          {query.isLoading ? "" : query.isError ? sektionsfejlTekst("handouts") : dom.statusTekst}
        </span>
      </div>
    </section>
  );
};

/** «Din målsætning» (Start her) bærer RETNING_MODUL: henvisningen til Dine
    mål i stedet for et handout. Ingen status — retningen har sin egen
    flade (JeresRetning på /milestones). */
const RetningHenvisning = () => (
  <section className="mt-8 rounded-hb border border-hb-line bg-hb-sage/20 px-6 py-5">
    <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{RETNING_TEKST.eyebrow}</p>
    <h2 className="mt-2 font-editorial text-xl font-medium text-hb-ink">{RETNING_TEKST.titel}</h2>
    <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">{RETNING_TEKST.brod}</p>
    <div className="mt-4">
      <Link to={RETNING_STI}>
        <HbButton variant="secondary">
          {RETNING_TEKST.knap}
          <ArrowRight className="h-4 w-4" />
        </HbButton>
      </Link>
    </div>
  </section>
);
