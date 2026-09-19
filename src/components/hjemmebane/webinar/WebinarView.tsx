import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbSection } from "@/components/hjemmebane/HbSection";
import { useWebinarDashboard } from "@/hooks/webinarDashboard";
import {
  AFHOLDTE_TOM_TEKST,
  datoKort,
  datoLang,
  KOBLING_TOM_TEKST,
  NAESTE_TOM_TEKST,
  pct,
  procentTal,
  SET_GRAENSE_PROCENT,
  SPOR_MANGLER_TEKST,
  SPOR_TOMT_TEKST,
  webinarDashboard,
  WEBINAR_EYEBROW,
  WEBINAR_FEJL_TEKST,
  WEBINAR_TITEL,
  WEBINAR_TOM_TEKST,
  WEBINAR_UNDERLINJE,
  type AfholdtSession,
  type Annoncespor,
  type Kampagnelinje,
  type NaesteWebinar,
  type Sporlinje,
  type TilmeldtPrDag,
  type WebinarDashboard,
} from "@/lib/webinar/dashboard";

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

const StortTal = ({ label, tal, linje, testId }: { label: string; tal: string; linje?: string; testId: string }) => (
  <HbCard className="p-5 md:p-6" data-webinar-noegletal={testId}>
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
    <p className="mt-2 font-editorial text-3xl font-medium leading-none text-hb-ink md:text-4xl">{tal}</p>
    {linje && <p className="mt-2 text-xs text-hb-ink-soft">{linje}</p>}
  </HbCard>
);

/** Tilmeldinger pr. dag frem mod sessionen — søjler i SVG, som økonomisidens kontantkurve. */
const TilmeldtKurve = ({ prDag }: { prDag: TilmeldtPrDag[] }) => {
  if (prDag.length < 2) return null;
  const top = Math.max(...prDag.map((d) => d.antal));
  const B = 100, H = 14, bredde = B / prDag.length;
  const foerste = prDag[0], sidste = prDag[prDag.length - 1];
  return (
    <div className="mt-4" data-webinar-tilmeldt-kurve={prDag.length}>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Tilmeldinger pr. dag · top {top}</p>
      <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="mt-1.5 h-14 w-full" aria-hidden>
        <line x1="0" x2={B} y1={H} y2={H} stroke="hsl(var(--hb-line))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {prDag.map((d) => {
          const h = (d.antal / top) * H;
          return <rect key={d.dag} x={(prDag.indexOf(d) * bredde + bredde * 0.15).toFixed(2)} y={(H - h).toFixed(2)} width={(bredde * 0.7).toFixed(2)} height={h.toFixed(2)} fill="hsl(var(--hb-sage))" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-hb-ink-soft">
        <span>{datoKort(`${foerste.dag}T12:00:00Z`)}</span>
        <span>{datoKort(`${sidste.dag}T12:00:00Z`)}</span>
      </div>
    </div>
  );
};

/** 1. Det næste webinar — hvornår, og hvor mange. */
const Naeste = ({ naeste }: { naeste: NaesteWebinar | null }) => {
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

/** Fire tal på en række — de fire Jonas bad om, plus de to der ellers forsvandt i dem. */
const Deltagelsestal = ({ s }: { s: AfholdtSession }) => (
  <div className="grid grid-cols-4 gap-2 text-right text-sm tabular-nums">
    <span className="text-hb-ink">{s.tilmeldte}</span>
    <span className="text-hb-ink">{s.moedteOp}</span>
    <span className="font-medium text-hb-evergreen">{s.saaFaerdigt}</span>
    <span className="text-hb-ink-soft">{s.moedteIkke}</span>
  </div>
);

const AfholdtRaekke = ({ s }: { s: AfholdtSession }) => {
  const [aaben, setAaben] = useState(false);
  return (
    <li className="border-t border-hb-line py-3 last:border-b" data-webinar-session={s.sessionTid ?? "uden-tid"}>
      <div className="grid grid-cols-[1fr_auto_1.5rem] items-baseline gap-3">
        <div className="min-w-0">
          <span className="text-sm font-medium text-hb-ink">{s.dato ?? (s.sessionType ?? "optagelsen")}</span>
          {s.titel && <span className="ml-2 truncate text-sm text-hb-ink-soft">{s.titel}</span>}
        </div>
        <Deltagelsestal s={s} />
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
      {aaben && (
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4" data-webinar-session-fold>
          <Post navn="Fremmøde" vaerdi={pct(s.fremmoedeAndel)} under={`${s.moedteOp} af ${s.tilmeldte}`} />
          <Post navn={`Så ≥ ${SET_GRAENSE_PROCENT} %`} vaerdi={pct(s.gennemfoerselAndel)} under={`${s.saaFaerdigt} af de ${s.moedteOp} der mødte op`} />
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

const Post = ({ navn, vaerdi, under }: { navn: string; vaerdi: string; under: string }) => (
  <div>
    <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{navn}</dt>
    <dd className="mt-0.5 tabular-nums text-hb-ink">{vaerdi} <span className="text-xs text-hb-ink-soft">· {under}</span></dd>
  </div>
);

const Kolonnehoveder = () => (
  <div className="grid grid-cols-[1fr_auto_1.5rem] items-baseline gap-3 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
    <span />
    <div className="grid grid-cols-4 gap-2 text-right">
      <span>tilmeldte</span>
      <span>mødte op</span>
      <span>så færdigt</span>
      <span>mødte ikke</span>
    </div>
    <span />
  </div>
);

/** 2. De afholdte webinarer. */
const Afholdte = ({ dom }: { dom: WebinarDashboard }) => {
  if (dom.afholdte.length === 0) return <p className="text-sm text-hb-ink-soft" data-webinar-afholdte="tom">{AFHOLDTE_TOM_TEKST}</p>;
  return (
    <div data-webinar-afholdte={dom.afholdte.length}>
      <Kolonnehoveder />
      <ul>{dom.afholdte.map((s) => <AfholdtRaekke key={`${s.webinarId}-${s.sessionTid ?? "uden"}`} s={s} />)}</ul>
      <p className="mt-3 text-xs text-hb-ink-soft">
        «Mødte op» er dem eWebinar har set deltage; «så færdigt» er {SET_GRAENSE_PROCENT} % eller mere. Har en tilmelding ingen procent, afgør eWebinars egen tilstand.
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
const SporRaekke = ({ l, indrykket = false }: { l: Sporlinje; indrykket?: boolean }) => (
  <div className={cn("grid grid-cols-[1fr_auto] items-baseline gap-3 py-2", indrykket && "pl-5")}>
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
    <div className="grid grid-cols-4 gap-2 text-right text-sm tabular-nums">
      <span className="text-hb-ink">{l.tilmeldte}</span>
      <span className="text-hb-ink-soft">{l.moedteOp}</span>
      <span className="text-hb-evergreen">{l.saaFaerdigt}</span>
      <span className={cn(l.ansoegte > 0 ? "font-medium text-hb-rust" : "text-hb-ink-soft")}>{l.ansoegte}</span>
    </div>
  </div>
);

const SporHoveder = () => (
  <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-hb-line pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
    <span />
    <div className="grid grid-cols-4 gap-2 text-right">
      <span>tilmeldte</span>
      <span>mødte op</span>
      <span>så færdigt</span>
      <span>ansøgte</span>
    </div>
  </div>
);

const KampagneRaekke = ({ k }: { k: Kampagnelinje }) => {
  const [aaben, setAaben] = useState(false);
  const flere = k.annoncer.length > 1 || (k.annoncer.length === 1 && k.annoncer[0].navn !== "uden annonce");
  return (
    <li className="border-t border-hb-line last:border-b" data-webinar-kampagne={k.navn}>
      <div className="flex items-baseline gap-2">
        <div className="min-w-0 flex-1"><SporRaekke l={k} /></div>
        {flere ? (
          <button type="button" onClick={() => setAaben((a) => !a)} aria-expanded={aaben} className="shrink-0 text-hb-ink-soft hover:text-hb-ink" aria-label={`${aaben ? "Skjul" : "Vis"} annoncerne i ${k.navn}`}>
            {aaben ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        ) : <span className="w-4 shrink-0" />}
      </div>
      {aaben && flere && (
        <div className="pb-2 pr-6" data-webinar-annoncer={k.annoncer.length}>
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
const Kobling = ({ dom }: { dom: WebinarDashboard }) => {
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

export const WebinarView = ({ nu = new Date() }: { nu?: Date }) => {
  const query = useWebinarDashboard();
  const [kunNaeste, setKunNaeste] = useState(false);
  const dom = useMemo<WebinarDashboard | null>(
    () => (query.data ? webinarDashboard(query.data, nu) : null),
    [query.data, nu],
  );
  const spor = dom === null ? null : kunNaeste && dom.sporNaeste !== null ? dom.sporNaeste : dom.spor;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 md:px-6" data-webinar-side>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{WEBINAR_EYEBROW}</p>
      <h1 className="mt-2 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{WEBINAR_TITEL}</h1>
      <p className="mt-2 text-sm text-hb-ink-soft">{WEBINAR_UNDERLINJE}</p>

      {query.isError ? (
        <p className="mt-8 text-sm text-hb-rust" data-webinar="fejl">{WEBINAR_FEJL_TEKST}</p>
      ) : query.isPending || dom === null ? (
        <div className="mt-8"><Skelet /></div>
      ) : dom.tom ? (
        <p className="mt-8 text-sm text-hb-ink-soft" data-webinar="tom">{WEBINAR_TOM_TEKST}</p>
      ) : (
        <>
          <HbSection eyebrow="Det næste webinar" title="Hvem der venter, og hvornår" hairline className="mt-8">
            <Naeste naeste={dom.naeste} />
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

          <HbSection eyebrow="Ansøgningerne" title="Hvor mange af de tilmeldte ansøgte" hairline className={sektion}>
            <p className="mb-4 text-sm text-hb-ink-soft">Koblingen er mailen — begge sider med små bogstaver. Kun indsendte ansøgninger tæller; kladder er ikke en ansøgning.</p>
            <Kobling dom={dom} />
          </HbSection>
        </>
      )}
    </div>
  );
};

export default WebinarView;
