import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { useAnnonceforbrug } from "@/hooks/annonceforbrug";
import { kr } from "@/lib/oekonomi/omsaetning";
import { brokOgPct, pct, type AnsoegerMail, type Tilmelding } from "@/lib/webinar/dashboard";
import {
  annoncepriser,
  MODNING_FORKLARING,
  navnekoblingTekst,
  periodeOrd,
  udaekketTekst,
  PRIS_MANGLER_TEKST,
  PRIS_TOM_TEKST,
  PRIS_UDEN_FORBRUG_TEKST,
  TROVAERDIG_FRA,
  TYND_FORKLARING,
  type Annoncepriser,
  type Pris,
  type Prislinje,
  type VindueValg,
} from "@/lib/webinar/annoncepriser";

/**
 * Hvad annoncerne koster pr. led — et AFSNIT, ikke en side (udkast 19/9-2026).
 *
 * Det står på /webinar, hvor tallene i forvejen er. Men det tager sine egne
 * data ind som props og henter kun forbruget selv, så det kan flyttes til en
 * marketingflade uden at røre en linje: `<AnnoncepriserAfsnit tilmeldinger=…
 * ansoegninger=… />`. Derfor ligger det i components/hjemmebane/annoncer/ og
 * ikke i webinar/.
 *
 * TRE TING FLADEN ALDRIG GØR:
 *   1. Viser 0 kr., når vi bare ikke har spurgt. Tre tilstande, tre sætninger.
 *   2. Viser et forhold uden sit antal. Prisen står ALTID med «af N».
 *   3. Lader et tyndt tal se ud som et stærkt. Under fem er tallet dæmpet og
 *      bærer sin forklaring.
 */

const GRID =
  "grid grid-cols-[minmax(0,1fr)_repeat(4,4.25rem)] md:grid-cols-[minmax(0,1fr)_repeat(4,6.5rem)] items-baseline gap-x-1.5 md:gap-x-3";

/** Prisen med sit antal — aldrig det ene uden det andet. */
const Prisfelt = ({ p, enhed }: { p: Pris; enhed: string }) => {
  if (p.tillid === "udaekket") {
    return (
      <span className="text-right text-sm tabular-nums text-hb-ink-soft" title="Forbruget dækker ikke hele perioden — prisen ville være for lav.">
        –
      </span>
    );
  }
  if (p.antal === 0) {
    return (
      <span className="text-right text-sm tabular-nums text-hb-ink-soft" title={`Ingen ${enhed} endnu — der er intet at dividere med.`}>
        –
      </span>
    );
  }
  const tynd = p.tillid === "tynd";
  return (
    <span
      className={cn("text-right text-sm tabular-nums", tynd ? "text-hb-ink-soft" : "text-hb-ink")}
      title={tynd ? `${p.antal} ${enhed}. ${TYND_FORKLARING}` : `${p.antal} ${enhed}`}
    >
      <span className={cn(tynd && "opacity-70")}>{kr(p.oerePrStk ?? 0)}</span>
      <span className="ml-1 text-[11px] text-hb-ink-soft">af {p.antal}</span>
      {tynd && <span className="ml-0.5 text-[11px] text-hb-rust" aria-label="for tyndt">*</span>}
    </span>
  );
};

const Hoveder = () => (
  <div className={cn(GRID, "border-b border-hb-line pb-1.5 text-[10px] font-medium uppercase leading-tight tracking-[0.12em] text-hb-ink-soft")}>
    <span />
    <span className="text-right">pr. tilmelding</span>
    <span className="text-right">pr. deltager</span>
    <span className="text-right">pr. ansøgning</span>
    <span className="text-right">pr. medlem</span>
  </div>
);

const Linje = ({ l, indrykket = false }: { l: Prislinje; indrykket?: boolean }) => (
  <div className={cn(GRID, "py-2", indrykket && "pl-4")}>
    <div className="min-w-0">
      <p className={cn("flex min-w-0 items-baseline gap-1.5 text-sm", indrykket ? "text-hb-ink-soft" : "font-medium text-hb-ink")}>
        <span className="truncate">{l.navn}</span>
        {/* KOBLET PÅ NAVN (19/9): mærket skal stå ved tallet, ikke i en note.
            Et navn er ikke entydigt — flere annoncer kan bære det, og så er
            deres forbrug lagt sammen i denne ene linje. */}
        {l.koblingsform === "navn" && (
          <span
            className="shrink-0 rounded-full border border-hb-rust/40 px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.1em] text-hb-rust"
            title={navnekoblingTekst(l) ?? undefined}
            data-koblet-paa-navn={l.annoncer}
          >
            navn{l.annoncer > 1 ? ` · ${l.annoncer} annoncer` : ""}
          </span>
        )}
      </p>
      <p className="truncate text-[11px] text-hb-ink-soft">
        {kr(l.forbrugOere)} kr.
        {l.valutaer.length === 1 ? ` ${l.valutaer[0]}` : l.valutaer.length > 1 ? ` · ${l.valutaer.join(" + ")} — beløb i flere valutaer, læg dem ikke sammen` : ""}
        {` · ${l.tilmeldte} tilmeldte · ${l.deltagere} mødte op`}
        {l.fremmoedeAndel !== null ? ` (${pct(l.fremmoedeAndel)})` : ""}
        {l.underNavn ? ` · ${l.underNavn}` : ""}
      </p>
    </div>
    <Prisfelt p={l.prPrTilmelding} enhed="tilmeldte" />
    <Prisfelt p={l.prPrDeltager} enhed="deltagere" />
    <Prisfelt p={l.prPrAnsoegning} enhed="ansøgninger" />
    <Prisfelt p={l.prPrMedlem} enhed="medlemmer" />
  </div>
);

const Brud = ({ dom }: { dom: Annoncepriser }) => {
  const b = dom.brud;
  const dele = [
    b.udenAnnoncemaerke > 0 ? `${brokOgPct(b.udenAnnoncemaerke, b.personer)} bærer intet annoncemærke` : null,
    b.maerkeErIkkeId > 0 ? `${b.maerkeErIkkeId} har et mærke, der ikke er et Meta-id — makroen {{ad.id}} er ikke sat på den annonce` : null,
    b.udenForbrug > 0 ? `${b.udenForbrug} peger på en annonce, vi ikke har forbrug på` : null,
    b.forbrugUdenTilmeldinger > 0 ? `${b.forbrugUdenTilmeldinger} ${b.forbrugUdenTilmeldinger === 1 ? "annonce har" : "annoncer har"} kostet penge uden en eneste tilmelding` : null,
  ].filter((x): x is string => x !== null);
  const navne = b.kobletPaaNavn > 0
    ? `${brokOgPct(b.kobletPaaNavn, b.personer)} er koblet på annoncens NAVN i stedet for dens id${b.delteNavne > 0 ? `, og ${b.delteNavne} ${b.delteNavne === 1 ? "navn bæres" : "navne bæres"} af flere annoncer — deres forbrug er lagt sammen i én linje hver` : ""}. Sæt {{ad.id}} i url_tags, så bliver koblingen entydig.`
    : null;
  if (dele.length === 0 && navne === null) return null;
  return (
    <>
      {dele.length > 0 && (
        <p className="mt-3 text-xs text-hb-rust" data-pris-brud={dele.length}>
          <span className="font-medium">Hvor kæden brister:</span> {dele.join(" · ")}.
        </p>
      )}
      {navne && <p className="mt-2 text-xs text-hb-ink-soft" data-pris-navnekobling={b.kobletPaaNavn}>{navne}</p>}
    </>
  );
};

export const AnnoncepriserAfsnit = ({
  tilmeldinger,
  ansoegninger,
  nu = new Date(),
}: {
  tilmeldinger: readonly Tilmelding[];
  ansoegninger: readonly AnsoegerMail[];
  nu?: Date;
}) => {
  const query = useAnnonceforbrug();
  const [aabenKampagne, setAabenKampagne] = useState<string | null>(null);
  const [valg, saetValg] = useState<VindueValg>("daekning");
  const dom = useMemo<Annoncepriser | null>(
    () =>
      query.data
        ? annoncepriser({ tilmeldinger, ansoegninger, dage: query.data.dage, annoncer: query.data.annoncer, tilstand: query.data.tilstand, valg }, nu)
        : null,
    [query.data, tilmeldinger, ansoegninger, nu, valg],
  );

  if (query.isError) {
    return <p className="text-sm text-hb-rust" data-pris="fejl">Annonceforbruget kunne ikke hentes. Tallene på resten af siden er upåvirkede.</p>;
  }
  if (query.isPending || dom === null) {
    return <div className="h-24 animate-pulse rounded-hb bg-hb-line/60" data-pris="henter" />;
  }
  if (dom.tilstand === "mangler") {
    return <p className="text-sm text-hb-ink-soft" data-pris="mangler">{PRIS_MANGLER_TEKST}</p>;
  }
  if (dom.tilstand === "tom") {
    return <p className="text-sm text-hb-ink-soft" data-pris="tom">{PRIS_TOM_TEKST}</p>;
  }

  return (
    <div data-pris={dom.perAnnonce.length}>
      {/* PERIODEVÆLGEREN (19/9): kun de vinduer, forbruget FAKTISK dækker, kan
          vælges. De øvrige står slukkede med grunden — et valg, der ville give
          et forkert tal, er ikke et valg. */}
      <div className="mb-4 flex flex-wrap gap-1 text-xs" role="group" aria-label="Vælg perioden prisen regnes over">
        {dom.muligheder.map((m) => (
          <button
            key={m.valg}
            type="button"
            disabled={!m.daekket}
            onClick={() => saetValg(m.valg)}
            aria-pressed={valg === m.valg}
            title={m.daekket ? (periodeOrd(m.vindue) ?? undefined) : `Forbruget dækker kun ${periodeOrd(dom.daekning) ?? "ingenting"} — for kort til dette vindue.`}
            className={cn(
              "rounded-full border px-3 py-1 transition-colors",
              !m.daekket
                ? "cursor-not-allowed border-hb-line text-hb-ink-soft/50"
                : valg === m.valg
                  ? "border-hb-evergreen bg-hb-evergreen/10 text-hb-evergreen"
                  : "border-hb-line text-hb-ink-soft hover:text-hb-ink",
            )}
            data-vindue={m.valg}
            data-daekket={m.daekket}
          >
            {m.navn}
            {m.daekket && m.valg === "daekning" && periodeOrd(m.vindue) ? ` · ${periodeOrd(m.vindue)}` : ""}
          </button>
        ))}
      </div>

      {!dom.daekket && (
        <p className="mb-4 text-sm text-hb-rust" data-pris-udaekket>{udaekketTekst(dom.vindue, dom.daekning)}</p>
      )}

      {/* Forskellen mellem hvad vi har forbrug for, og hvor længe der er kommet
          tilmeldinger. Er den stor, er det dét, der gør et samlet tal misvisende. */}
      {dom.daekket && dom.tilmeldingsspan && dom.daekning && dom.tilmeldingsspan.fra < dom.daekning.fra && (
        <p className="mb-4 text-xs text-hb-ink-soft" data-pris-spaendforskel>
          Tilmeldingerne går tilbage til {periodeOrd({ fra: dom.tilmeldingsspan.fra, til: dom.tilmeldingsspan.fra })}, men forbruget er kun hentet for {periodeOrd(dom.daekning)}.
          Tallene nedenfor dækker KUN den periode — i begge ender.
        </p>
      )}

      {!dom.harForbrug && <p className="mb-4 text-sm text-hb-ink-soft" data-pris-nulforbrug>{PRIS_UDEN_FORBRUG_TEKST}</p>}

      <HbCard className="mb-5 p-5 md:p-6" data-pris-samlet={dom.samlet.forbrugOere}>
        {/* PERIODEN STÅR VED BELØBET (19/9): et forbrug uden en periode kan ikke
            holdes op mod noget — hverken mod Metas egne tal eller mod sig selv
            i sidste uge. */}
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Brugt{periodeOrd(dom.vindue) ? ` · ${periodeOrd(dom.vindue)}` : ""}
        </p>
        <p className="mt-2 font-editorial text-3xl font-medium leading-none text-hb-ink md:text-4xl">{kr(dom.samlet.forbrugOere)} kr.</p>
        <div className="mt-4">
          <Hoveder />
          <Linje l={dom.samlet} />
        </div>
      </HbCard>

      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Pr. kampagne · fold ud for annoncerne</p>
      <Hoveder />
      <ul>
        {dom.perKampagne.map((k) => {
          const annoncer = dom.perAnnonce.filter((a) => a.underNavn === k.navn || a.noegle === k.noegle);
          const aaben = aabenKampagne === k.noegle;
          return (
            <li key={k.noegle} className="border-t border-hb-line last:border-b" data-pris-kampagne={k.noegle}>
              <div className="flex items-baseline gap-2">
                <div className="min-w-0 flex-1"><Linje l={k} /></div>
                {annoncer.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAabenKampagne(aaben ? null : k.noegle)}
                    aria-expanded={aaben}
                    className="shrink-0 text-hb-ink-soft hover:text-hb-ink"
                    aria-label={`${aaben ? "Skjul" : "Vis"} annoncerne i ${k.navn}`}
                  >
                    {aaben ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                )}
              </div>
              {aaben && annoncer.map((a) => <Linje key={a.noegle} l={a} indrykket />)}
            </li>
          );
        })}
      </ul>

      <Brud dom={dom} />
      <p className="mt-3 text-xs text-hb-ink-soft">
        <span className="text-hb-rust">*</span> {TYND_FORKLARING} {MODNING_FORKLARING} Grænsen er {TROVAERDIG_FRA}.
      </p>
    </div>
  );
};

export default AnnoncepriserAfsnit;
