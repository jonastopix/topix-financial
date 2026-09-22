import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbSection } from "@/components/hjemmebane/HbSection";
import { useWebinarDashboard } from "@/hooks/webinarDashboard";
import { AnnoncepriserAfsnit } from "@/components/hjemmebane/annoncer/AnnoncepriserAfsnit";
import { PRIS_EYEBROW, PRIS_TITEL } from "@/lib/webinar/annoncepriser";
import {
  AFHOLDTE_TOM_TEKST,
  bedoemmelseTekst,
  brokOgPct,
  dageOrd,
  datoKort,
  datoLang,
  KOBLING_TOM_TEKST,
  NAESTE_TOM_TEKST,
  pct,
  procentTal,
  SET_GRAENSE_PROCENT,
  SPOR_MANGLER_TEKST,
  SPOR_TOMT_TEKST,
  stemmerOrd,
  TID_EYEBROW,
  TID_TITEL,
  TID_TOM_TEKST,
  TRAGT_EYEBROW,
  TRAGT_TITEL,
  TRAGT_TOM_TEKST,
  webinarDashboard,
  WEBINAR_EYEBROW,
  WEBINAR_FEJL_TEKST,
  WEBINAR_TITEL,
  WEBINAR_TOM_TEKST,
  WEBINAR_UNDERLINJE,
  type AfholdtSession,
  type Annoncespor,
  type Bedoemmelse,
  type Kampagnelinje,
  type KommendeSession,
  type NaesteWebinar,
  type Sporlinje,
  type TidTilAnsoegning,
  type TilmeldtPrDag,
  type Tragt,
  type WebinarDashboard,
  type WebinarDashboardSvar,
} from "@/lib/webinar/dashboard";
import type { ReactNode } from "react";

/**
 * /webinar — webinartallene for rådgiverne (udkast 19/9-2026).
 *
 * JONAS 19/9: «Byg en side, der svarer på: hvor mange er tilmeldt det næste
 * webinar og hvornår · for hvert afholdt webinar tilmeldte/mødte op/så det
 * færdigt/faldt fra · HVOR KOM DE FRA, pr. annonce og pr. kilde — det er
 * det, ingen annonceplatform kan fortælle · og hvor mange af de tilmeldte
 * der ansøgte.»
 *
 * ÉN KILDE: useWebinarDashboard (webinar_tilmeldinger + ansoegningernes
 * mails). ÉN DOM: webinarDashboard (lib/webinar/dashboard.ts) — fladen
 * regner intet selv, heller ikke en procent. Graden «set / delvist / mødte
 * ikke» er webinarDom's, spejlet i _shared med paritetstest.
 *
 * FORMEN (docs/hjemmebane-designsprog.md), målt mod OekonomiView 17/9:
 * HbSection-rytme med hairline og mt-10/md:mt-12 mellem sektioner, Fraunces
 * til de store tal (font-editorial, font-medium, leading-none), rammeløse
 * rækker adskilt af border-hb-line, fold-ud frem for navigation, søjler i
 * SVG med viewBox + preserveAspectRatio="none". Samme tæthed: nøgletallene
 * i et 2/3-grid af HbCards, listerne som hairline-rækker uden kort.
 *
 * NUL DATA I DAG. Hver sektion har sin egen tomme sætning fra dommen, og
 * annoncesporet siger i klartekst om kolonnerne mangler. Siden er rigtig
 * med nul rækker og rigtig tirsdag med 330.
 */

const sektion = "mt-10 md:mt-12";

/**
 * ÉN skabelon til både kolonneoverskrifterne og rækkerne (Jonas 19/9, punkt 1).
 *
 * FEJLEN DER VAR: header og rækker havde hver sit grid med en `auto`-kolonne.
 * `auto` måles pr. grid, så overskriften «så færdigt» gjorde header-kolonnen
 * bredere end rækkens tal — og tallene stod under den forkerte titel. Faste
 * talbredder i ÉN delt konstant kan ikke drive fra hinanden; ændrer man
 * bredden, ændrer den sig begge steder på én gang.
 *
 * Fem talkolonner: tilmeldt · mødte · færdigt · ansøgt · medlem — tragtens
 * rækkefølge, så rækken læses som historien. Smalle på telefon, brede fra md.
 */
const TAL_GRID =
  "grid grid-cols-[minmax(0,1fr)_repeat(5,2.75rem)_1.25rem] md:grid-cols-[minmax(0,1fr)_repeat(5,4.5rem)_1.5rem] items-baseline gap-x-1.5 md:gap-x-2";
const SPOR_GRID =
  "grid grid-cols-[minmax(0,1fr)_repeat(4,2.75rem)_1.25rem] md:grid-cols-[minmax(0,1fr)_repeat(4,4.5rem)_1.5rem] items-baseline gap-x-1.5 md:gap-x-2";

const Overskrifter = ({ grid, navne }: { grid: string; navne: string[] }) => (
  <div className={cn(grid, "border-b border-hb-line pb-1.5 text-[10px] font-medium uppercase leading-tight tracking-[0.12em] text-hb-ink-soft")}>
    <span />
    {navne.map((n) => <span key={n} className="text-right">{n}</span>)}
  </div>
);

const StortTal = ({ label, tal, linje, testId }: { label: string; tal: string; linje?: string; testId: string }) => (
  <HbCard className="p-5 md:p-6" data-webinar-noegletal={testId}>
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
    <p className="mt-2 font-editorial text-3xl font-medium leading-none text-hb-ink md:text-4xl">{tal}</p>
    {linje && <p className="mt-2 text-xs text-hb-ink-soft">{linje}</p>}
  </HbCard>
);

/**
 * Tilmeldinger pr. dag frem mod sessionen — med TALLET over hver søjle
 * (Jonas 19/9, punkt 2: «skal kunne læses, ikke kun ses som højder»).
 *
 * HTML, ikke SVG: en `preserveAspectRatio="none"`-SVG strækker sin tekst, og
 * et strakt tal er netop det der ikke kan læses. Søjlerne er div'er, så
 * tallene står i husets typografi i deres rigtige størrelse.
 *
 * Er der mange dage, ville hvert tal ikke kunne stå: fra 15 dage og op vises
 * tallet kun på de dage der bærer noget — den højeste, den første og den
 * sidste — mens søjlerne stadig tegner hele forløbet.
 */
const TilmeldtKurve = ({ prDag }: { prDag: TilmeldtPrDag[] }) => {
  if (prDag.length < 2) return null;
  const top = Math.max(...prDag.map((d) => d.antal));
  const alle = prDag.length <= 14;
  const dagTekst = (dag: string) => datoKort(`${dag}T12:00:00Z`);
  return (
    <div className="mt-5" data-webinar-tilmeldt-kurve={prDag.length}>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
        Tilmeldinger pr. dag · top {top}
      </p>
      <div className="mt-2 flex items-end gap-[3px]">
        {prDag.map((d, i) => {
          const vis = alle || d.antal === top || i === 0 || i === prDag.length - 1;
          return (
            <div key={d.dag} className="flex min-w-0 flex-1 flex-col items-center" title={`${dagTekst(d.dag)}: ${d.antal}`}>
              <span className={cn("mb-1 text-[10px] tabular-nums leading-none", vis ? "text-hb-ink-soft" : "invisible")}>{d.antal}</span>
              <span
                className="w-full rounded-t-[2px] bg-hb-sage"
                style={{ height: `${Math.max(2, (d.antal / top) * 44)}px` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between border-t border-hb-line pt-1 text-[11px] tabular-nums text-hb-ink-soft">
        <span>{dagTekst(prDag[0].dag)}</span>
        <span>{dagTekst(prDag[prDag.length - 1].dag)}</span>
      </div>
    </div>
  );
};

/**
 * De programsatte sessioner EFTER den næste — op til tre små bokse under den
 * store (Jonas 21/9-2026 23:45). Samme kort, samme typografi og samme farver
 * som den store, i mindre skala: tallet i font-editorial, tidspunktet i
 * datoLang og den relative tid i omHvorLaenge — alt sammen dommens egne
 * værdier, fladen regner intet.
 *
 * INGEN GRAF: kurven svarer på «hvordan fyldes den op», og det spørgsmål
 * hører til den session, der er lige om hjørnet. Tre små kurver ville være tre
 * gæt om noget, der ikke er begyndt endnu.
 *
 * Tom liste → ingen række overhovedet (ikke en tom stribe). På telefon stables
 * boksene; fra md står de tre ved siden af hinanden.
 */
const EfterNaeste = ({ sessioner }: { sessioner: readonly KommendeSession[] }) => {
  if (sessioner.length === 0) return null;
  return (
    <div className="mt-3 grid gap-3 md:mt-4 md:grid-cols-3 md:gap-4" data-webinar-efter-naeste={sessioner.length}>
      {sessioner.map((s) => (
        <HbCard key={s.sessionTid} className="p-4 md:p-5" data-webinar-kommende-session={s.personer}>
          <p className="font-editorial text-3xl font-medium leading-none text-hb-ink md:text-4xl">{s.personer}</p>
          <p className="mt-1 text-xs text-hb-ink-soft">tilmeldte</p>
          <p className="mt-3 font-editorial text-base font-medium leading-tight text-hb-ink md:text-lg">
            {datoLang(s.sessionTid) ?? "tidspunkt ukendt"}
          </p>
          <p className="mt-1 text-xs text-hb-ink-soft">
            {s.omHvorLaenge}
            {s.titel ? ` · ${s.titel}` : ""}
          </p>
        </HbCard>
      ))}
    </div>
  );
};

/** 1. Det næste webinar — hvornår, og hvor mange. */
const Naeste = ({ naeste }: { naeste: Omit<NaesteWebinar, "raekker"> | null }) => {
  if (naeste === null) return <p className="text-sm text-hb-ink-soft" data-webinar-naeste="tom">{NAESTE_TOM_TEKST}</p>;
  return (
    <HbCard className="p-5 md:p-6" data-webinar-naeste={naeste.personer}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="font-editorial text-5xl font-medium leading-none text-hb-ink md:text-6xl">{naeste.personer}</p>
          <p className="mt-2 text-sm text-hb-ink-soft">tilmeldte</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="font-editorial text-xl font-medium leading-tight text-hb-ink md:text-2xl">{datoLang(naeste.sessionTid) ?? "tidspunkt ukendt"}</p>
          <p className="mt-1 text-sm text-hb-ink-soft">
            {naeste.omHvorLaenge}
            {naeste.titel ? ` · ${naeste.titel}` : ""}
          </p>
          {/* Flere kommende sessioner: uden denne linje kan tallet ovenfor
              læses som «vi mangler tilmeldte», selv når alle står i kø. */}
          {naeste.kommendeSessioner > 1 && (
            <p className="mt-1 text-xs text-hb-ink-soft" data-webinar-kommende={naeste.kommendeIAlt}>
              {naeste.kommendeIAlt} tilmeldte fordelt på {naeste.kommendeSessioner} kommende sessioner
            </p>
          )}
        </div>
      </div>
      <TilmeldtKurve prDag={naeste.prDag} />
    </HbCard>
  );
};

/** Den store boks og rækken af små under den — ét afsnit, ét dom-objekt. */
const NaesteAfsnit = ({ naeste }: { naeste: Omit<NaesteWebinar, "raekker"> | null }) => (
  <>
    <Naeste naeste={naeste} />
    {naeste !== null && <EfterNaeste sessioner={naeste.efterfoelgende} />}
  </>
);

const Post = ({ navn, vaerdi, under }: { navn: string; vaerdi: string; under: string }) => (
  <div>
    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{navn}</dt>
    <dd className="mt-0.5 tabular-nums text-hb-ink">{vaerdi} <span className="text-xs text-hb-ink-soft">· {under}</span></dd>
  </div>
);

/**
 * DELTAGERNES BEDØMMELSE af en afholdt session (Jonas 22/9-2026) — lille og
 * roligt: stjernen, tallet, fem smalle søjler og antallet.
 *
 * INGEN STEMMER TEGNER INTET. Dommen svarer `null`, og der står ikke «0
 * stemmer»: et nul ligner en måling, og der er ingen. Derfor findes elementet
 * simpelthen ikke på en session, ingen har bedømt.
 *
 * SØJLERNE ER DOMMENS ANDELE (`fordeling[].andel`) — fladen lægger ikke
 * stemmerne sammen til en nævner, præcis som fordelingssøjlen i annoncesporet.
 * Fem søjler, 1 til 5, altid alle fem: en fordeling med huller kan ikke læses.
 *
 * Samme element på /delt/webinar — det er den samme komponent og det samme
 * dom, og bedømmelsen bærer hverken mail eller række.
 */
const Bedoemmelsen = ({ b }: { b: Bedoemmelse }) => (
  <span className="inline-flex items-center gap-2" data-webinar-bedoemmelse={b.stemmer} title={bedoemmelseTekst(b)}>
    <Star className="h-3 w-3 shrink-0 fill-hb-sage text-hb-sage" aria-hidden />
    <span className="text-xs font-medium tabular-nums text-hb-ink">{b.gennemsnitTekst}</span>
    <span className="flex items-end gap-[2px]" aria-hidden>
      {b.fordeling.map((t) => (
        <span key={t.stjerner} className="relative block h-3 w-[3px] overflow-hidden rounded-[1px] bg-hb-line">
          <span
            className="absolute inset-x-0 bottom-0 rounded-[1px] bg-hb-sage"
            style={{ height: `${((t.andel ?? 0) * 100).toFixed(1)}%` }}
          />
        </span>
      ))}
    </span>
    <span className="text-xs text-hb-ink-soft">{stemmerOrd(b.stemmer)}</span>
  </span>
);

const AfholdtRaekke = ({ s }: { s: AfholdtSession }) => {
  const [aaben, setAaben] = useState(false);
  return (
    <li className="border-t border-hb-line py-3 last:border-b" data-webinar-session={s.sessionTid ?? "uden-tid"}>
      <div className={TAL_GRID}>
        <span className="min-w-0 truncate text-sm font-medium text-hb-ink">
          {s.dato ?? (s.sessionType ?? "optagelsen")}
          {s.titel && <span className="ml-2 font-normal text-hb-ink-soft">{s.titel}</span>}
        </span>
        <span className="text-right text-sm tabular-nums text-hb-ink">{s.tilmeldte}</span>
        <span className="text-right text-sm tabular-nums text-hb-ink-soft">{s.moedteOp}</span>
        <span className="text-right text-sm tabular-nums font-medium text-hb-evergreen">{s.saaFaerdigt}</span>
        <span className={cn("text-right text-sm tabular-nums", s.ansoegte > 0 ? "font-medium text-hb-rust" : "text-hb-ink-soft")}>{s.ansoegte}</span>
        <span className={cn("text-right text-sm tabular-nums", s.blevMedlem > 0 ? "font-medium text-hb-ink" : "text-hb-ink-soft")}>{s.blevMedlem}</span>
        <button
          type="button"
          onClick={() => setAaben((a) => !a)}
          aria-expanded={aaben}
          className="justify-self-end text-hb-ink-soft hover:text-hb-ink"
          aria-label={`${aaben ? "Skjul" : "Vis"} tallene bag ${s.dato ?? "sessionen"}`}
        >
          {aaben ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {/* Brøk OG procent, så de tre tal Jonas spurgte om kan læses uden at regne
          (punkt 3, 4 og 6). Står ude i venstre kolonne, ikke gemt i folden. */}
      <p className="mt-1 text-xs text-hb-ink-soft" data-webinar-session-noegler>
        mødte op {brokOgPct(s.moedteOp, s.tilmeldte)}
        {" · "}ansøgte {brokOgPct(s.ansoegte, s.tilmeldte)}
        {" · "}blev medlem {brokOgPct(s.blevMedlem, s.ansoegte)}
      </p>
      {s.bedoemmelse !== null && (
        <p className="mt-1.5">
          <Bedoemmelsen b={s.bedoemmelse} />
        </p>
      )}
      {aaben && (
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4" data-webinar-session-fold>
          <Post navn="Så det færdigt" vaerdi={pct(s.gennemfoerselAndel)} under={`${s.saaFaerdigt} af de ${s.moedteOp} der mødte op`} />
          <Post navn="Mødte ikke op" vaerdi={String(s.moedteIkke)} under={`af ${s.tilmeldte} tilmeldte`} />
          <Post navn="Delvist" vaerdi={String(s.delvist)} under="var der, men ikke helt" />
          <Post
            navn="Gennemsnit set"
            vaerdi={procentTal(s.gennemsnitProcent)}
            under={s.medProcent === 0 ? "ingen har et målt tal" : `målt på ${s.medProcent}`}
          />
          {s.ukendt > 0 && <Post navn="Ukendt" vaerdi={String(s.ukendt)} under="ingen hændelse har sagt noget" />}
        </dl>
      )}
    </li>
  );
};

const Kolonnehoveder = () => (
  <Overskrifter grid={TAL_GRID} navne={["tilmeldt", "mødte", "færdigt", "ansøgt", "medlem"]} />
);

/** 2. De afholdte webinarer. */
const Afholdte = ({ dom }: { dom: WebinarDashboardSvar }) => {
  if (dom.afholdte.length === 0) return <p className="text-sm text-hb-ink-soft" data-webinar-afholdte="tom">{AFHOLDTE_TOM_TEKST}</p>;
  return (
    <div data-webinar-afholdte={dom.afholdte.length}>
      <Kolonnehoveder />
      <ul>{dom.afholdte.map((s) => <AfholdtRaekke key={`${s.webinarId}-${s.sessionTid ?? "uden"}`} s={s} />)}</ul>
      <p className="mt-3 text-xs text-hb-ink-soft">
        Kolonnerne er tragtens rækkefølge: tilmeldt · mødte op · så det færdigt ({SET_GRAENSE_PROCENT} % eller mere) · ansøgte · blev medlem.
        «Blev medlem» er husets egen dom — underskrevet OG betalt — og procenten under rækken er af de ANSØGTE, ikke af de tilmeldte.
        Har en tilmelding ingen procent, afgør eWebinars egen tilstand.
      </p>
    </div>
  );
};

/**
 * TRAGTEN (Jonas 19/9, punkt 5): tilmeldte → mødte op → så færdigt → ansøgte
 * → blev medlem, med tal OG procent af leddet før. Hele historien på én
 * linje, så ingen skal regne den i hovedet.
 *
 * LODRET, ikke vandret: fem led med hver to tal kan ikke stå ved siden af
 * hinanden på en telefon uden at blive til småt. Lodret får hvert led sin
 * søjle (bredden er andelen af FØRSTE led), og formen på tragten kan ses
 * ned ad siden.
 *
 * Tragten regnes KUN på afholdte webinarer — dommen sørger for det, og
 * linjen nedenunder siger hvor mange der venter udenfor, så de hverken
 * forsvinder eller tælles som frafald.
 */
const Tragten = ({ t }: { t: Tragt }) => {
  if (t.grundlag === 0) {
    return (
      <p className="text-sm text-hb-ink-soft" data-webinar-tragt="tom">
        {TRAGT_TOM_TEKST}
        {t.kommendeUdenfor > 0 ? ` ${t.kommendeUdenfor} er tilmeldt et webinar, der ikke er afholdt endnu.` : ""}
      </p>
    );
  }
  return (
    <div data-webinar-tragt={t.grundlag}>
      <ul className="space-y-2.5">
        {t.trin.map((trin) => (
          <li key={trin.navn} className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 md:grid-cols-[minmax(0,10rem)_1fr]" data-tragt-trin={trin.navn}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-hb-ink">{trin.navn}</p>
              <p className="truncate text-[11px] text-hb-ink-soft">{trin.forklaring}</p>
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-editorial text-2xl font-medium leading-none text-hb-ink md:text-3xl">{trin.antal}</span>
                <span className="text-xs text-hb-ink-soft">
                  {trin.andelAfFoer === null ? "udgangspunktet" : `${pct(trin.andelAfFoer)} af leddet før`}
                </span>
              </div>
              <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-hb-line">
                <span className="block h-full rounded-full bg-hb-sage" style={{ width: `${((trin.andelAfStart ?? 0) * 100).toFixed(1)}%` }} />
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-hb-ink-soft">
        Regnet på de {t.grundlag} personer, hvis webinar ER afholdt — man kan ikke møde op til noget, der ikke har været.
        {t.kommendeUdenfor > 0 ? ` ${t.kommendeUdenfor} er tilmeldt et kommende webinar og står uden for tragten.` : ""}
      </p>
    </div>
  );
};

/**
 * TIDEN (Jonas 19/9, punkt 7): hvor lang tid går der fra tilmelding til
 * ansøgning? Gennemsnit OG median — én der ansøger efter 90 dage kan flytte
 * et gennemsnit på tyve mere end den fortjener, og står de to langt fra
 * hinanden, er dét selv en oplysning.
 */
const Tiden = ({ t }: { t: TidTilAnsoegning }) => {
  if (t.antal === 0) {
    return (
      <p className="text-sm text-hb-ink-soft" data-webinar-tid="tom">
        {TID_TOM_TEKST}
        {t.ansoegteFoerTilmelding > 0 ? ` ${t.ansoegteFoerTilmelding} ansøgte FØR de meldte sig til — de kom ind ad en anden dør.` : ""}
      </p>
    );
  }
  return (
    <div data-webinar-tid={t.antal}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StortTal testId="tid-gennemsnit" label="Gennemsnit" tal={dageOrd(t.gennemsnitDage)} linje={`målt på ${t.antal}`} />
        <StortTal testId="tid-median" label="Median" tal={dageOrd(t.medianDage)} linje="halvdelen er hurtigere" />
        <StortTal testId="tid-hurtigste" label="Hurtigste" tal={dageOrd(t.hurtigsteDage)} linje="korteste vej ind" />
        <StortTal testId="tid-langsomste" label="Langsomste" tal={dageOrd(t.langsomsteDage)} linje="længste vej ind" />
      </div>
      <p className="mt-4 text-xs text-hb-ink-soft">
        Fra personens FØRSTE tilmelding til ansøgningen blev indsendt.
        {t.ansoegteFoerTilmelding > 0 ? ` ${t.ansoegteFoerTilmelding} ansøgte før de meldte sig til og er ikke med — det er ikke en ventetid.` : ""}
        {t.udenTidspunkt > 0 ? ` ${t.udenTidspunkt} kunne ikke måles, fordi tilmeldingen mangler et tidspunkt.` : ""}
      </p>
    </div>
  );
};

/**
 * Én linje i annoncesporet — samme rytme som de afholdte, plus ansøgerne.
 *
 * FORDELINGSSØJLEN (19/9, efter de rigtige tal): syv rækker med hvert sit
 * antal ER ikke en fordeling — øjet kan ikke regne 336 mod 594 undervejs.
 * Søjlen under navnet er linjens andel af helheden (dommens andelAfHelhed:
 * kilden og kampagnen af alle, annoncen af sin egen kampagne), og procenten
 * står ved siden af. Sage som økonomisidens kontantsøjler; indrykkede
 * linjer får den smallere, så kampagnen bliver ved med at bære rækken.
 */
const SporRaekke = ({ l, indrykket = false, knap }: { l: Sporlinje; indrykket?: boolean; knap?: { aaben: boolean; slaaOm: () => void } }) => (
  <div className={cn(SPOR_GRID, "py-2", indrykket && "pl-5")}>
    <div className="min-w-0">
      <span className={cn("truncate text-sm", indrykket ? "text-hb-ink-soft" : "font-medium text-hb-ink")}>{l.navn}</span>
      {l.raa.length > 0 && <span className="ml-2 text-xs text-hb-ink-soft">{l.raa.join(" · ")}</span>}
      {l.andelAfHelhed !== null && (
        <span className="mt-1 flex items-center gap-2" data-spor-andel={l.navn}>
          <span className={cn("block overflow-hidden rounded-full bg-hb-line", indrykket ? "h-1 w-24" : "h-1.5 w-40")}>
            <span className="block h-full rounded-full bg-hb-sage" style={{ width: `${(l.andelAfHelhed * 100).toFixed(1)}%` }} />
          </span>
          <span className="text-[11px] tabular-nums text-hb-ink-soft">{pct(l.andelAfHelhed)}</span>
        </span>
      )}
    </div>
    <span className="text-right text-sm tabular-nums text-hb-ink">{l.tilmeldte}</span>
    <span className="text-right text-sm tabular-nums text-hb-ink-soft">{l.moedteOp}</span>
    <span className="text-right text-sm tabular-nums text-hb-evergreen">{l.saaFaerdigt}</span>
    <span className={cn("text-right text-sm tabular-nums", l.ansoegte > 0 ? "font-medium text-hb-rust" : "text-hb-ink-soft")}>{l.ansoegte}</span>
    {knap ? (
      <button
        type="button"
        onClick={knap.slaaOm}
        aria-expanded={knap.aaben}
        className="justify-self-end text-hb-ink-soft hover:text-hb-ink"
        aria-label={`${knap.aaben ? "Skjul" : "Vis"} annoncerne i ${l.navn}`}
      >
        {knap.aaben ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
    ) : <span />}
  </div>
);

const SporHoveder = () => (
  <Overskrifter grid={SPOR_GRID} navne={["tilmeldt", "mødte", "færdigt", "ansøgt"]} />
);

const KampagneRaekke = ({ k }: { k: Kampagnelinje }) => {
  const [aaben, setAaben] = useState(false);
  const flere = k.annoncer.length > 1 || (k.annoncer.length === 1 && k.annoncer[0].navn !== "uden annonce");
  return (
    <li className="border-t border-hb-line last:border-b" data-webinar-kampagne={k.navn}>
      <SporRaekke l={k} knap={flere ? { aaben, slaaOm: () => setAaben((a) => !a) } : undefined} />
      {aaben && flere && (
        <div className="pb-2" data-webinar-annoncer={k.annoncer.length}>
          {k.annoncer.map((a) => <SporRaekke key={a.navn} l={a} indrykket />)}
        </div>
      )}
    </li>
  );
};

/** 3. Hvor kom de fra. */
const Spor = ({ spor }: { spor: Annoncespor }) => {
  if (!spor.sporFindes) {
    return <p className="text-sm text-hb-ink-soft" data-webinar-spor="mangler">{spor.personer === 0 ? SPOR_TOMT_TEKST : SPOR_MANGLER_TEKST}</p>;
  }
  return (
    <div data-webinar-spor={spor.personer}>
      <SporHoveder />
      <div className="mt-1">
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Pr. kilde</p>
        <ul>{spor.kilder.map((k) => <li key={k.navn} className="border-t border-hb-line last:border-b"><SporRaekke l={k} /></li>)}</ul>
        <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Pr. kampagne · fold ud for annoncerne</p>
        <ul>{spor.kampagner.map((k) => <KampagneRaekke key={k.navn} k={k} />)}</ul>
      </div>
      <p className="mt-3 text-xs text-hb-ink-soft">
        Hver person tælles ved sin FØRSTE tilmelding — annoncen der hentede hende ind.
        {spor.flereKilder > 0 ? ` ${spor.flereKilder} ${spor.flereKilder === 1 ? "person" : "personer"} har meldt sig til fra mere end én kilde.` : ""}
        {spor.kunFbclid > 0 ? ` ${spor.kunFbclid} er talt som Facebook på et fbclid alene — annoncen blev klikket, men utm-mærkerne faldt af.` : ""}
      </p>
    </div>
  );
};

/** 4. Fra tilmelding til ansøgning. */
const Kobling = ({ dom }: { dom: WebinarDashboardSvar }) => {
  const k = dom.kobling;
  if (k.ansoegereIAlt === 0) return <p className="text-sm text-hb-ink-soft" data-webinar-kobling="tom">{KOBLING_TOM_TEKST}</p>;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4" data-webinar-kobling={k.ansoegte}>
      <StortTal testId="ansoegte" label="Tilmeldte der ansøgte" tal={String(k.ansoegte)} linje={`${pct(k.andelAfTilmeldte)} af ${k.tilmeldte} tilmeldte`} />
      <StortTal testId="ansoegere-tilmeldt" label="Ansøgere der var tilmeldt" tal={pct(k.andelAfAnsoegere)} linje={`${k.ansoegereDerVarTilmeldt} af ${k.ansoegereIAlt} indsendte ansøgninger`} />
      <StortTal testId="ansoegere-i-alt" label="Indsendte ansøgninger i alt" tal={String(k.ansoegereIAlt)} linje="uanset webinar" />
    </div>
  );
};

const Skelet = () => (
  <div className="animate-pulse space-y-4" data-webinar="henter">
    <div className="h-28 rounded-hb bg-hb-line/60" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <div className="h-24 rounded-hb bg-hb-line/60" /><div className="h-24 rounded-hb bg-hb-line/60" /><div className="h-24 rounded-hb bg-hb-line/60" />
    </div>
    <div className="h-44 rounded-hb bg-hb-line/60" />
  </div>
);

/**
 * VISNINGEN — tegner et FÆRDIGT dashboard (udkast webinar-deling 21/9-2026).
 * Adskilt fra hentningen, så samme visning får data fra ENTEN hooken
 * (WebinarView, rådgiveren) ELLER functionen webinar-delt (DeltWebinar, den
 * eksterne). Typen er WebinarDashboardSvar — dashboardet uden de rå rækker —
 * så den delte side aldrig kan få dem, og rådgiverens fulde dom passer
 * strukturelt. Prisafsnittet gives ind som `priser` (rådgiveren:
 * AnnoncepriserAfsnit med sin egen hentning; den eksterne: AnnoncepriserVisning
 * med functionens færdige priser). Ingen links ud af siden.
 */
export const WebinarVisning = ({
  tilstand,
  dom,
  priser,
}: {
  tilstand: "henter" | "fejl" | "klar";
  dom: WebinarDashboardSvar | null;
  priser: ReactNode;
}) => {
  const [kunNaeste, setKunNaeste] = useState(false);
  const spor = dom === null ? null : kunNaeste && dom.sporNaeste !== null ? dom.sporNaeste : dom.spor;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 md:px-6" data-webinar-side>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{WEBINAR_EYEBROW}</p>
      <h1 className="mt-2 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{WEBINAR_TITEL}</h1>
      <p className="mt-2 text-sm text-hb-ink-soft">{WEBINAR_UNDERLINJE}</p>

      {tilstand === "fejl" ? (
        <p className="mt-8 text-sm text-hb-rust" data-webinar="fejl">{WEBINAR_FEJL_TEKST}</p>
      ) : tilstand === "henter" || dom === null ? (
        <div className="mt-8"><Skelet /></div>
      ) : dom.tom ? (
        <p className="mt-8 text-sm text-hb-ink-soft" data-webinar="tom">{WEBINAR_TOM_TEKST}</p>
      ) : (
        <>
          {/* ØVERST, FØR ALT ANDET (Jonas 19/9, punkt 5): hele historien på én linje. */}
          <HbSection eyebrow={TRAGT_EYEBROW} title={TRAGT_TITEL} hairline className="mt-8">
            <Tragten t={dom.tragt} />
          </HbSection>

          <HbSection eyebrow="Det næste webinar" title="Hvem der venter, og hvornår" hairline className={sektion}>
            <NaesteAfsnit naeste={dom.naeste} />
          </HbSection>

          <HbSection eyebrow="Afholdt" title="Session for session" hairline className={sektion}>
            <p className="mb-4 text-sm text-hb-ink-soft">
              Sessionen er enheden, ikke webinaret — det samme webinar kører mange gange, og et fremmøde på tværs af måneder er ikke ét tal.
              I alt: {dom.samlet.tilmeldte} tilmeldte · {dom.samlet.moedteOp} mødte op ({pct(dom.samlet.fremmoedeAndel)}) · {dom.samlet.saaFaerdigt} så det færdigt.
            </p>
            <Afholdte dom={dom} />
          </HbSection>

          <HbSection eyebrow="Hvor kom de fra" title="Fra annoncen til ansøgningen" hairline className={sektion}>
            <p className="mb-4 text-sm text-hb-ink-soft">
              Hele vejen i én tabel — det ingen annonceplatform kan vise: annoncen, deltagelsen og ansøgningen på den samme person.
            </p>
            {dom.sporNaeste !== null && (
              <div className="mb-4 flex gap-1 text-xs" role="group" aria-label="Vælg hvilke tilmeldinger sporet regnes på">
                {([[false, "Alle tilmeldte"], [true, "Kun det næste webinar"]] as const).map(([v, ord]) => (
                  <button
                    key={ord}
                    type="button"
                    onClick={() => setKunNaeste(v)}
                    aria-pressed={kunNaeste === v}
                    className={cn(
                      "rounded-full border px-3 py-1 transition-colors",
                      kunNaeste === v ? "border-hb-evergreen bg-hb-evergreen/10 text-hb-evergreen" : "border-hb-line text-hb-ink-soft hover:text-hb-ink",
                    )}
                  >
                    {ord}
                  </button>
                ))}
              </div>
            )}
            {spor && <Spor spor={spor} />}
          </HbSection>

          {/* Hvad annoncerne koster pr. led (19/9). Afsnittet gives ind: rådgiveren
              med AnnoncepriserAfsnit (henter selv forbruget), den eksterne med
              AnnoncepriserVisning (functionens færdige priser). */}
          <HbSection eyebrow={PRIS_EYEBROW} title={PRIS_TITEL} hairline className={sektion}>
            <p className="mb-4 text-sm text-hb-ink-soft">
              Det Meta ikke kan regne: resten af vejen. Prisen står altid med det antal, den er regnet på.
            </p>
            {priser}
          </HbSection>

          <HbSection eyebrow={TID_EYEBROW} title={TID_TITEL} hairline className={sektion}>
            <p className="mb-4 text-sm text-hb-ink-soft">Hvornår I skal skrive til folk — målt fra tilmeldingen til ansøgningen blev indsendt.</p>
            <Tiden t={dom.tid} />
          </HbSection>

          <HbSection eyebrow="Ansøgningerne" title="Hvor mange af de tilmeldte ansøgte" hairline className={sektion}>
            <p className="mb-4 text-sm text-hb-ink-soft">Koblingen er mailen — begge sider med små bogstaver. Kun indsendte ansøgninger tæller; kladder er ikke en ansøgning.</p>
            <Kobling dom={dom} />
          </HbSection>
        </>
      )}
    </div>
  );
};

/** Rådgiverens /webinar: ÉN kilde (useWebinarDashboard), ÉN dom (webinarDashboard) — og visningen ovenfor. */
export const WebinarView = ({ nu = new Date() }: { nu?: Date }) => {
  const query = useWebinarDashboard();
  const dom = useMemo<WebinarDashboard | null>(
    () => (query.data ? webinarDashboard(query.data, nu) : null),
    [query.data, nu],
  );
  return (
    <WebinarVisning
      tilstand={query.isError ? "fejl" : query.isPending ? "henter" : "klar"}
      dom={dom}
      priser={<AnnoncepriserAfsnit tilmeldinger={query.data?.tilmeldinger ?? []} ansoegninger={query.data?.ansoegninger ?? []} nu={nu} />}
    />
  );
};

export default WebinarView;
