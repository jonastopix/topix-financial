import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { RETNING_NOEGLER, RETNING_ORD, type Retning, type RetningNoegle } from "@/lib/hjemmebane/maalRetning";
import { HbButton } from "../HbButton";
import { HbField, HbTextarea } from "../admin/HbField";

/**
 * «Jeres retning» øverst på Dine mål (Jonas 1/10-2026 kl. 22:37, ja): de tre
 * spørgsmål fra handoutet «Målsætning 12 mdr.» i et roligt felt. Svarene BOR i
 * handouts-rækken (lib/hjemmebane/maalRetning.ts, hooks/dineMaalGrundlag.ts:
 * hentRetning/gemRetning) — et svar givet i handoutet står her af sig selv.
 *
 * TRE TILSTANDE: henter (skelet) · tom (ÉN invitation: «Skriv jeres retning
 * (3 spørgsmål, 5 minutter)» åbner redigeringen med alle tre felter — valgt frem
 * for ét felt ad gangen, fordi de tre spørgsmål hører sammen, og tre felter på
 * én skærm er færre klik) · udfyldt (læsbar tekst med «Ret» diskret).
 * Redigeringen er inline (ingen dialog), fail-closed: gemmes først ved klik,
 * fejl vises i feltet, «Fortryd» kasserer kladden.
 *
 * Tegner kun: ordene er RETNING_ORD, dommen over svarene er gemRetning's.
 */

export const RETNING_INVITATION = "Skriv jeres retning (3 spørgsmål, 5 minutter)";
export const RETNING_RET = "Ret";
export const RETNING_GEM = "Gem retningen";
export const RETNING_FORTRYD = "Fortryd";
export const RETNING_FEJL_TEKST = "Jeres retning kunne ikke hentes lige nu.";
export const RETNING_INTRO = "Tre sætninger, der holder målene på sporet — hvad I vil nå, hvad der skal være anderledes, og hvad det koster at lade stå til.";

type Props = {
  retning: Retning | null;
  isLoading: boolean;
  fejlede: boolean;
  /** Gemmer de tre svar; returnerer fejlteksten ordret, eller null ved ja. */
  onGem: (svar: Record<RetningNoegle, string>) => Promise<string | null>;
};

const mikro = "text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft";
const fokus = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2";

export const JeresRetning = ({ retning, isLoading, fejlede, onGem }: Props) => {
  // Hooks i TOPBLOKKEN, før enhver betinget return (React #310).
  const [redigerer, setRedigerer] = useState(false);
  const [kladde, setKladde] = useState<Record<RetningNoegle, string>>({ lykkedes_12mdr: "", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" });
  const [fejl, setFejl] = useState<string | null>(null);
  const [gemmer, setGemmer] = useState(false);
  const idRod = useId();

  const aabn = () => {
    setKladde({ ...(retning?.svar ?? { lykkedes_12mdr: "", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" }) });
    setFejl(null);
    setRedigerer(true);
  };
  const gem = async () => {
    setGemmer(true);
    const svar = await onGem(kladde);
    setGemmer(false);
    if (svar) { setFejl(svar); return; }
    setRedigerer(false);
  };

  const ramme = "rounded-hb border border-hb-line bg-hb-paper/60 p-5 md:p-6";

  if (isLoading) {
    return (
      <section className={ramme} aria-busy="true" data-retning="henter">
        <div className="animate-pulse">
          <div className="h-3 w-24 rounded bg-hb-line/70" />
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <div className="h-3 w-3/4 rounded bg-hb-line/70" />
                <div className="mt-2 h-10 w-full rounded bg-hb-line/50" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (redigerer) {
    return (
      <section className={ramme} data-retning="redigerer" aria-labelledby={`${idRod}-overskrift`}>
        <p id={`${idRod}-overskrift`} className={mikro}>{RETNING_ORD.overskrift}</p>
        <form
          noValidate
          className="mt-4 grid gap-4 md:grid-cols-3"
          onSubmit={(e) => { e.preventDefault(); void gem(); }}
        >
          {RETNING_NOEGLER.map((n) => (
            <HbField key={n} label={RETNING_ORD.spoergsmaal[n]} htmlFor={`${idRod}-${n}`} help={RETNING_ORD.hjaelp[n] ?? undefined}>
              <HbTextarea
                id={`${idRod}-${n}`}
                rows={3}
                value={kladde[n]}
                onChange={(e) => setKladde((k) => ({ ...k, [n]: e.target.value }))}
                autoFocus={n === RETNING_NOEGLER[0]}
                className="text-sm"
              />
            </HbField>
          ))}
          <div className="flex flex-wrap items-center gap-3 md:col-span-3">
            <HbButton type="submit" className="h-9 px-4 text-xs" disabled={gemmer}>{gemmer ? "Gemmer…" : RETNING_GEM}</HbButton>
            <HbButton type="button" variant="secondary" className="h-9 px-4 text-xs" disabled={gemmer} onClick={() => setRedigerer(false)}>{RETNING_FORTRYD}</HbButton>
            {fejl && <p className="text-sm text-hb-rust" role="alert" data-retning-fejl>{fejl}</p>}
          </div>
        </form>
      </section>
    );
  }

  if (fejlede && !retning) {
    return (
      <section className={ramme} data-retning="fejl">
        <p className={mikro}>{RETNING_ORD.overskrift}</p>
        <p className="mt-2 text-sm text-hb-ink-soft">{RETNING_FEJL_TEKST}</p>
      </section>
    );
  }

  if (!retning || retning.besvaret === 0) {
    return (
      <section className={ramme} data-retning="tom">
        <p className={mikro}>{RETNING_ORD.overskrift}</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-hb-ink-soft">{RETNING_INTRO}</p>
        <button type="button" onClick={aabn} className={cn("mt-3 inline-flex items-center text-sm font-medium text-hb-evergreen underline-offset-4 hover:underline", fokus)} data-retning-invitation>
          {RETNING_INVITATION}
        </button>
      </section>
    );
  }

  return (
    <section className={ramme} data-retning="udfyldt" data-retning-besvaret={retning.besvaret}>
      <div className="flex items-baseline justify-between gap-4">
        <p className={mikro}>{RETNING_ORD.overskrift}</p>
        <button type="button" onClick={aabn} className={cn("text-xs text-hb-ink-soft underline-offset-4 hover:text-hb-ink hover:underline", fokus)} data-retning-ret>
          {RETNING_RET}
        </button>
      </div>
      <dl className="mt-4 grid gap-5 md:grid-cols-3">
        {RETNING_NOEGLER.map((n) => (
          <div key={n} className="min-w-0">
            <dt className="font-editorial text-base font-medium leading-snug text-hb-ink">{RETNING_ORD.spoergsmaal[n]}</dt>
            <dd className={cn("mt-1.5 whitespace-pre-wrap text-sm leading-relaxed", retning.svar[n].trim() ? "text-hb-ink" : "italic text-hb-ink-soft")}>
              {retning.svar[n].trim() || "Ikke svaret endnu"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
