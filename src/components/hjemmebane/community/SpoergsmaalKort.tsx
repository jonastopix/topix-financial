import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { CommunityTraad } from "@/lib/hjemmebane/communityApi";
import {
  FJERN_MARKERING_LABEL,
  SPOERGSMAAL_EYEBROW,
  SPOERGSMAAL_FOLDET_TEKST,
  SPOERGSMAAL_SVAR_KNAP,
  SPOERGSMAAL_LAES_KNAP,
  SPOERGSMAAL_TAG,
  SPOERGSMAAL_UNDERLINJE,
  harSvaretTekst,
} from "@/lib/hjemmebane/communitySpoergsmaal";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbTag } from "../HbTag";

/** Rådgivernes «Spørgsmål» øverst i Community (2/10-2026). Dommen (hvilket
    opslag, foldet eller ej) bor i lib/hjemmebane/communitySpoergsmaal —
    kortet tegner kun.

    UDFOLDET: eyebrow «Spørgsmål fra rådgiverne», rust-kant som mockuppen,
    titlen som link til tråden, «Et svar kan være én linje.», «N har svaret»
    (antal PERSONER — antal_svarere; uden tallet «N svar», harSvaretTekst)
    og knappen «Svar» (tråden). FOLDET (læseren har svaret): én rolig linje
    med mærket «Spørgsmål», titlen og «du har svaret» — den fylder ikke for
    den, der har gjort sit. Rådgiveren kan fjerne markeringen herfra
    (onFjern — udeladt for medlemmer OG for en rådgiver, der ser som medlem). */
export const SpoergsmaalKort = ({
  traad,
  foldet,
  onFjern,
  fjerner,
  kanSvare = true,
}: {
  traad: CommunityTraad;
  foldet: boolean;
  /** Kun rådgivere: fjern markeringen. Udeladt = ingen knap. */
  onFjern?: () => void;
  fjerner?: boolean;
  /** Gæsten (2/10, læser, skriver ikke): false → knappen hedder «Læs tråden», ikke «Svar». */
  kanSvare?: boolean;
}) => {
  const sti = `/community/${traad.id}`;
  if (foldet) {
    return (
      <div className="mb-10" data-spoergsmaal="foldet">
        {/* Under sm (375 px) bryder metateksten under titlen: mærke + titel
            på første linje, «du har svaret · N har svaret» på sin egen —
            ellers spiser den faste metatekst titlen ned til få tegn. Fra sm
            står alt på én linje som før. */}
        <Link
          to={sti}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-hb border border-hb-line px-4 py-3 text-sm transition-colors hover:bg-hb-sage/20 sm:flex-nowrap"
        >
          <HbTag className="shrink-0 bg-hb-rust/10 text-hb-rust">{SPOERGSMAAL_TAG}</HbTag>
          <span className="min-w-0 flex-1 truncate font-medium text-hb-ink">{traad.titel}</span>
          <span className="basis-full text-xs text-hb-ink-soft sm:basis-auto sm:shrink-0">
            {SPOERGSMAAL_FOLDET_TEKST} · {harSvaretTekst(traad)}
          </span>
        </Link>
      </div>
    );
  }
  return (
    <HbSection eyebrow={SPOERGSMAAL_EYEBROW} hairline className="mb-10" data-spoergsmaal="udfoldet">
      <HbCard className={cn("border-l-[3px] border-l-hb-rust p-5 md:p-6")}>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{SPOERGSMAAL_TAG}</p>
        <h2 className="mt-2 font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-[26px]">
          <Link to={sti} className="hover:underline underline-offset-4">
            {traad.titel}
          </Link>
        </h2>
        <p className="mt-2 text-sm text-hb-ink-soft">
          {traad.forfatter_navn ?? "En rådgiver"} · {SPOERGSMAAL_UNDERLINJE}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="text-sm text-hb-ink-soft">{harSvaretTekst(traad)}</span>
          <Link
            to={sti}
            className="ml-auto inline-flex h-10 items-center justify-center rounded-full bg-hb-evergreen px-5 text-sm font-medium text-white transition-colors hover:bg-hb-evergreen/90"
          >
            {kanSvare ? SPOERGSMAAL_SVAR_KNAP : SPOERGSMAAL_LAES_KNAP}
          </Link>
        </div>
        {onFjern && (
          <div className="mt-4 border-t border-hb-line pt-3">
            <button
              type="button"
              onClick={onFjern}
              disabled={fjerner}
              className="font-body text-sm text-hb-ink-soft transition-colors hover:text-hb-ink disabled:opacity-50"
            >
              {FJERN_MARKERING_LABEL}
            </button>
          </div>
        )}
      </HbCard>
    </HbSection>
  );
};
