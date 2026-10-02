import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getOwnHandout } from "@/lib/hjemmebane/akademiApi";
import { handoutConfigs, type HandoutModule } from "@/lib/handoutConfig";
import {
  OEVELSE_EYEBROW,
  OEVELSE_KNAP_UAFGJORT,
  OEVELSE_LAAST_TEKST,
  RETNING_MODUL,
  RETNING_STI,
  RETNING_TEKST,
  erOevelse,
  oevelseDom,
  oevelseSti,
  type OevelseAfsender,
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

    `fra` er afsenderen (lektionen) — den bæres i linket som `fra=` og
    afgør «Tilbage» i editoren (oevelseTilbage; samlingen giver ingen).

    LÅST (dryp): kort uden knap og uden status — «Låses op med lektionen»
    (rådets fund 5, 2/10). Status vises KUN, når rækken er hentet
    (query.isSuccess) — en slået-fra query er i v5 `isPending && !isFetching`,
    så `isLoading` var falsk, og en udfyldt øvelse så ustartet ud.

    RETNING_MODUL (overordnet) tegnes ALDRIG som en øvelse: lektionen
    henviser til Dine mål. Ukendt modul → intet (CHECK forhindrer det). */
export const OevelseKort = ({
  module,
  unlocked,
  fra,
}: {
  module: string;
  unlocked: boolean;
  fra?: OevelseAfsender | null;
}) => {
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

  if (!unlocked) {
    return (
      <section className="mt-8 rounded-hb border border-hb-line bg-hb-paper px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{OEVELSE_EYEBROW}</p>
        <h2 className="mt-2 font-editorial text-xl font-medium text-hb-ink-soft">{config.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">{config.subtitle}</p>
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-hb-ink-soft">
          <Lock className="h-4 w-4" /> {OEVELSE_LAAST_TEKST}
        </p>
      </section>
    );
  }

  const dom = query.isSuccess ? oevelseDom(query.data, config) : null;

  return (
    <section className="mt-8 rounded-hb border border-hb-line bg-hb-sage/20 px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{OEVELSE_EYEBROW}</p>
      <h2 className="mt-2 font-editorial text-xl font-medium text-hb-ink">{config.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">{config.subtitle}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link to={oevelseSti(config.module, fra)}>
          <HbButton variant={dom?.tilstand === "udfyldt" ? "secondary" : "primary"}>
            {dom ? dom.knapTekst : OEVELSE_KNAP_UAFGJORT}
            <ArrowRight className="h-4 w-4" />
          </HbButton>
        </Link>
        {/* Fejlet ≠ ikke startet (hentefejl.ts): kunne rækken ikke hentes,
            siges det — ellers ville en fejl ligne «Ikke startet». Uafgjort
            (henter, eller query slået fra) siger intet. */}
        <span className="text-sm text-hb-ink-soft">
          {query.isError ? sektionsfejlTekst("handouts") : dom ? dom.statusTekst : ""}
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
