import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import {
  klipKortTekst,
  klipRetning,
  RETNING_FELT_ORD,
  RETNING_NOEGLER,
  RETNING_ORD,
  retningLinjer,
  retningMeta,
  type Retning,
  type RetningNoegle,
} from "@/lib/hjemmebane/maalRetning";
import { danskDato } from "@/lib/hjemmebane/skridtForslag";
import { HbButton } from "../HbButton";
import { HbField, HbTextarea } from "../admin/HbField";

/**
 * «Jeres retning» øverst på Dine mål (Jonas 1/10-2026 kl. 22:37, ja): de tre
 * spørgsmål fra handoutet «Målsætning 12 mdr.». Svarene BOR i handouts-rækken
 * (lib/hjemmebane/maalRetning.ts, hooks/dineMaalGrundlag.ts: hentRetning/
 * gemRetning) — et svar givet i handoutet står her af sig selv.
 *
 * FELTET (2/10-2026, Jonas: «gør det øverste afsnit med Jeres retning … lidt
 * mere lækkert visuelt»; mockup ia-forslag «Dine mål»): et MØRKEGRØNT felt
 * (husets evergreen, tekst i papir/sage, eyebrow i amber — tokens i
 * hjemmebane.css, ingen rå farver) med
 *   - toppen: eyebrow «Jeres retning» + meta «Skrevet af <fornavn> · <dato> ·
 *     Ret» (retningMeta: fornavnet KUN fra den indloggedes egen profil — ingen
 *     ny RLS; ellers «Skrevet <dato>»);
 *   - spørgsmål 1 som stor serif «Om 12 måneder er vi lykkedes, hvis …» og
 *     svaret som LISTE (retningLinjer: split på linjeskift, tomme væk; lange
 *     svar klippes ved linjegrænsen — klipRetning — med «Læs alt»);
 *   - de to andre svar som to kort: «Hverdagen, vi bygger» og «Prisen, hvis
 *     intet ændrer sig» (eyebrow i amber), klippet med klipKortTekst;
 *   - foden «Jeres mål herunder er vejen derhen.»
 * «Læs alt» folder HELE feltet ud (én tilstand); et ubesvaret spørgsmål siger
 * «Ikke svaret endnu». Mobil (375): alt stabler, intet vandret scroll.
 *
 * TRE TILSTANDE: henter (skelet i feltet) · tom (samme felt, inviterende: ÉN
 * invitation «Skriv jeres retning (3 spørgsmål, 5 minutter)» åbner redigeringen
 * med alle tre felter — valgt frem for ét felt ad gangen, fordi de tre
 * spørgsmål hører sammen) · udfyldt (ovenfor, «Ret» i meta-linjen).
 * Redigeringen er inline (ingen dialog) i et lyst kort inde i feltet, fail-closed:
 * gemmes først ved klik, fejl vises i feltet, «Fortryd» kasserer kladden.
 *
 * Tegner kun: ordene er RETNING_ORD/RETNING_FELT_ORD, afledningerne (linjer,
 * klip, meta) er maalRetning.ts', dommen over svarene er gemRetning's.
 *
 * Rådets fund (1/10 aften):
 *   - (3) `kanRette` er false for rådgiveren: gemRetning skriver på den
 *     indloggedes EGET user_id. Rådgiveren LÆSER; «Ret» og invitationen vises
 *     ikke, og den tomme tilstand siger, at virksomheden ikke har skrevet.
 *   - (6) Tre tomme svar gemmes aldrig oven på svar, der findes — dømt her FØR
 *     onGem (og igen i gemRetning).
 *   - (14) `skrevetAfAnden`: svarene står i en ANDEN brugers række (en medejer).
 *     Vises som «Skrevet af en anden i virksomheden» — ALDRIG for rådgiveren
 *     (2/10: kalderen giver false for den rå rådgiverrolle; for rådgiveren er
 *     enhver række «en andens», og linjen sagde intet).
 */

export const RETNING_INVITATION = "Skriv jeres retning (3 spørgsmål, 5 minutter)";
export const RETNING_RET = "Ret";
export const RETNING_GEM = "Gem retningen";
export const RETNING_FORTRYD = "Fortryd";
export const RETNING_FEJL_TEKST = "Jeres retning kunne ikke hentes lige nu.";
export const RETNING_INTRO = "Tre sætninger, der holder målene på sporet — hvad I vil nå, hvad der skal være anderledes, og hvad det koster at lade stå til.";
/** Rådgiverens tomme tilstand (fund 3): læser, retter ikke. */
export const RETNING_IKKE_SKREVET_TEKST = "Virksomheden har ikke skrevet sin retning endnu.";
/** Fund 14: rækken tilhører en anden bruger end den, der ser siden. */
export const RETNING_SKREVET_AF_ANDEN = "Skrevet af en anden i virksomheden";
/** Fund 6: tre tomme svar oven på eksisterende — fladen afviser før skrivningen. */
export const RETNING_TOM_KLADDE_TEKST = "Alle tre svar er tomme — skriv mindst ét, eller fortryd.";

type Props = {
  retning: Retning | null;
  isLoading: boolean;
  fejlede: boolean;
  /** Gemmer de tre svar; returnerer fejlteksten ordret, eller null ved ja. */
  onGem: (svar: Record<RetningNoegle, string>) => Promise<string | null>;
  /** Må den, der ser siden, skrive retningen? Fail-closed: false for rådgiveren (fund 3). */
  kanRette: boolean;
  /** Svarene står i en anden brugers række (fund 14) — aldrig true for rådgiveren. */
  skrevetAfAnden: boolean;
  /** Fornavnet på den, der skrev — KUN når kalderen har det uden opslag (egen profil); ellers null. */
  fornavn?: string | null;
};

/** Feltets ramme: mørkegrøn, papirtekst, afrundet; dekorativ ring øverst til højre (overflow-hidden holder den inde). */
const felt = "relative overflow-hidden rounded-[20px] bg-hb-evergreen px-[22px] py-7 text-hb-paper md:px-11 md:py-10";
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.14em] text-hb-amber";
const meta = "text-xs text-hb-sage";
const kortEyebrow = "text-[11px] font-semibold uppercase tracking-[0.12em]";
/** Fokus på den mørke flade: lys ring med feltets egen farve som offset. */
const fokusMoerk = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-paper focus-visible:ring-offset-2 focus-visible:ring-offset-hb-evergreen";
const linkMoerk = cn("text-hb-paper underline-offset-4 hover:underline", fokusMoerk);

const Ring = () => <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-hb-sage/20" />;

export const JeresRetning = ({ retning, isLoading, fejlede, onGem, kanRette, skrevetAfAnden, fornavn = null }: Props) => {
  // Hooks i TOPBLOKKEN, før enhver betinget return (React #310).
  const [redigerer, setRedigerer] = useState(false);
  const [kladde, setKladde] = useState<Record<RetningNoegle, string>>({ lykkedes_12mdr: "", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" });
  const [fejl, setFejl] = useState<string | null>(null);
  const [gemmer, setGemmer] = useState(false);
  const [visAlt, setVisAlt] = useState(false);
  const idRod = useId();

  const aabn = () => {
    setKladde({ ...(retning?.svar ?? { lykkedes_12mdr: "", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" }) });
    setFejl(null);
    setRedigerer(true);
  };
  const gem = async () => {
    if (gemmer) return;
    const alleTomme = RETNING_NOEGLER.every((n) => kladde[n].trim() === "");
    if (alleTomme && (retning?.besvaret ?? 0) > 0) { setFejl(RETNING_TOM_KLADDE_TEKST); return; }
    setGemmer(true);
    const svar = await onGem(kladde);
    setGemmer(false);
    if (svar) { setFejl(svar); return; }
    setRedigerer(false);
  };

  if (isLoading) {
    return (
      <section className={felt} aria-busy="true" data-retning="henter">
        <Ring />
        <div className="animate-pulse">
          <div className="h-3 w-24 rounded bg-hb-paper/20" />
          <div className="mt-5 h-8 w-3/4 max-w-md rounded bg-hb-paper/20" />
          <div className="mt-5 space-y-2.5">
            {[0, 1, 2].map((i) => <div key={i} className="h-4 w-2/3 rounded bg-hb-paper/15" />)}
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => <div key={i} className="h-20 rounded-[14px] bg-hb-paper/10" />)}
          </div>
        </div>
      </section>
    );
  }

  if (redigerer) {
    return (
      <section className={felt} data-retning="redigerer" aria-labelledby={`${idRod}-overskrift`}>
        <Ring />
        <p id={`${idRod}-overskrift`} className={eyebrow}>{RETNING_ORD.overskrift}</p>
        <form
          noValidate
          className="relative mt-4 grid gap-4 rounded-[14px] bg-hb-surface p-4 text-hb-ink md:grid-cols-3 md:p-5"
          onSubmit={(e) => { e.preventDefault(); void gem(); }}
        >
          {RETNING_NOEGLER.map((n) => (
            <HbField key={n} label={RETNING_ORD.spoergsmaal[n]} htmlFor={`${idRod}-${n}`} help={RETNING_ORD.hjaelp[n] ?? undefined}>
              <HbTextarea
                id={`${idRod}-${n}`}
                rows={4}
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
      <section className={felt} data-retning="fejl">
        <Ring />
        <p className={eyebrow}>{RETNING_ORD.overskrift}</p>
        <p className="mt-2 text-sm text-hb-sage">{RETNING_FEJL_TEKST}</p>
      </section>
    );
  }

  if (!retning || retning.besvaret === 0) {
    return (
      <section className={felt} data-retning="tom" data-retning-kan-rette={kanRette ? "1" : "0"}>
        <Ring />
        <p className={eyebrow}>{RETNING_ORD.overskrift}</p>
        <p className="mt-3.5 max-w-[24ch] font-editorial text-[28px] font-medium leading-[1.15] text-hb-paper [text-wrap:balance] md:text-4xl">{RETNING_ORD.spoergsmaal.lykkedes_12mdr}</p>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-hb-sage">{kanRette ? RETNING_INTRO : RETNING_IKKE_SKREVET_TEKST}</p>
        {kanRette && (
          <HbButton
            type="button"
            variant="secondary"
            onClick={aabn}
            // Mobil 375: feltet efterlader ~300 px — teksten må ombrydes (h-auto, whitespace-normal).
            className="relative mt-5 h-auto min-h-10 whitespace-normal border-hb-paper/40 bg-transparent px-5 py-2 text-left text-sm text-hb-paper hover:bg-hb-paper/10 focus-visible:ring-hb-paper focus-visible:ring-offset-hb-evergreen"
            data-retning-invitation
          >
            {RETNING_INVITATION}
          </HbButton>
        )}
      </section>
    );
  }

  // ── Udfyldt ──
  const metaLinje = retningMeta(fornavn, retning.opdateret, danskDato);
  const alleLinjer = retningLinjer(retning.svar.lykkedes_12mdr);
  const liste = visAlt ? { linjer: alleLinjer, klippet: false } : klipRetning(alleLinjer);
  const kortTekst = (n: RetningNoegle) => (visAlt ? { tekst: retning.svar[n].trim(), klippet: false } : klipKortTekst(retning.svar[n]));
  const hverdagen = kortTekst("anderledes_hverdag");
  const prisen = kortTekst("konsekvenser_ingen_aendring");
  const nogetKlippet = liste.klippet || hverdagen.klippet || prisen.klippet;

  const kort = (n: RetningNoegle, overskrift: string, t: { tekst: string; klippet: boolean }, pris: boolean) => (
    <div className="rounded-[14px] bg-hb-paper/10 px-[18px] py-4 text-sm leading-relaxed" data-retning-kort={n}>
      <p className={cn(kortEyebrow, pris ? "text-hb-amber" : "text-hb-sage")}>{overskrift}</p>
      <p className={cn("mt-1.5 break-words whitespace-pre-wrap", t.tekst ? "text-hb-paper" : "italic text-hb-sage")}>{t.tekst || RETNING_FELT_ORD.ikkeSvaret}</p>
    </div>
  );

  return (
    <section className={felt} data-retning="udfyldt" data-retning-besvaret={retning.besvaret} data-retning-kan-rette={kanRette ? "1" : "0"} data-retning-vis-alt={visAlt ? "1" : "0"}>
      <Ring />
      <div className="relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <p className={eyebrow}>{RETNING_ORD.overskrift}</p>
        <p className={meta} data-retning-meta>
          {metaLinje && <span>{metaLinje}</span>}
          {skrevetAfAnden && <span data-retning-skrevet-af-anden>{metaLinje ? " · " : ""}{RETNING_SKREVET_AF_ANDEN}</span>}
          {kanRette && (
            <>
              {(metaLinje || skrevetAfAnden) && " · "}
              <button type="button" onClick={aabn} className={linkMoerk} data-retning-ret>{RETNING_RET}</button>
            </>
          )}
        </p>
      </div>

      <h2 className="relative mt-3.5 max-w-[24ch] font-editorial text-[28px] font-medium leading-[1.15] text-hb-paper [text-wrap:balance] md:text-4xl">
        {RETNING_ORD.spoergsmaal.lykkedes_12mdr}
      </h2>
      {liste.linjer.length > 0 ? (
        <ul className="relative mt-[18px] grid max-w-[62ch] gap-2.5" data-retning-liste={liste.linjer.length}>
          {liste.linjer.map((l, i) => (
            <li key={i} className="relative break-words pl-[26px] text-base leading-[1.45] before:absolute before:left-0 before:top-[11px] before:h-0.5 before:w-3 before:bg-hb-amber">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="relative mt-4 text-base italic text-hb-sage">{RETNING_FELT_ORD.ikkeSvaret}</p>
      )}

      <div className="relative mt-[26px] grid gap-3 md:grid-cols-2">
        {kort("anderledes_hverdag", RETNING_FELT_ORD.hverdagen, hverdagen, false)}
        {kort("konsekvenser_ingen_aendring", RETNING_FELT_ORD.prisen, prisen, true)}
      </div>

      <div className="relative mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px] text-hb-sage">
        <p>{RETNING_FELT_ORD.fod}</p>
        {(nogetKlippet || visAlt) && (
          <button type="button" onClick={() => setVisAlt((v) => !v)} className={linkMoerk} aria-expanded={visAlt} data-retning-laes-alt>
            {visAlt ? RETNING_FELT_ORD.visMindre : RETNING_FELT_ORD.laesAlt}
          </button>
        )}
      </div>
    </section>
  );
};
