import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Award, ChevronDown, Flame, Lock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { krTekst } from "@/lib/boardroomScore/score";
import type { ScoreDom } from "@/lib/boardroomScore/typer";
import {
  daekningTekst,
  FORSIDE_RING_RADIUS,
  ikkeNokDataTekst,
  LOEFTER_MEST_MAERKE,
  LOEFTER_MAAL_MAERKE,
  loefterLinjer,
  loefterMest,
  oevrigeLoeftere,
  retningTekst,
  retningVises,
  RING_RADIUS,
  ringBue,
  SCORE_AFVENTER_OVERSKRIFT,
  SCORE_AFVENTER_TEKST,
  SCORE_DETALJER_KNAP,
  SCORE_DETALJER_KNAP_LUK,
  SCORE_FEJL_TEKST,
  SCORE_FORBEHOLD,
  SCORE_FORSIDE_FORBEHOLD,
  SCORE_INGEN_TAL,
  SCORE_LOEFTER_OVERSKRIFT,
  SCORE_OEVRIGE_OVERSKRIFT,
  SCORE_SOEJLER_OVERSKRIFT,
  soejleLinjer,
  streakForsideLinje,
  streakKortLinje,
  streakLinjer,
  TAEL_OP_MS,
  taelOpVaerdi,
  trofaeLinje,
  type LoefterLinje,
  type SoejleLinje,
} from "@/lib/hjemmebane/scoreKort";
import { certifikatLinje, type CertifikatScore } from "@/lib/hjemmebane/certifikatKort";
import type { TrofaeDom } from "@/lib/gamification/trofaeer";
import { HbCard } from "../HbCard";
import { TrofaeAntal, TrofaeKort } from "./TrofaeKort";

/** Boardroom Score-kortet på medlemmets forside (30/9-2026 — Jonas D3
    «Boardroom Score (0–1000) plus tal-streak først»; designet i
    docs/boardroom-score.md §7). TEGNER KUN: tallet, streaken, de fire søjler
    og «Hvad løfter dit tal» kommer færdige fra motoren (lib/boardroomScore)
    gennem ordene i lib/hjemmebane/scoreKort — kortet regner intet og
    hårdkoder ingen handling. Data: ÉN hook (useBoardroomScore), kaldt i
    BoardroomViews topblok og givet ind her.

    KOMPAKT (Jonas 30/9 20:43: «meget stor på forsiden … mere kompakt, og
    måske også lidt mere interessant at kigge på»; målt 669–760 px høj på
    1440 px bredde): ÉN række — til venstre scoren i en tynd RING (SVG-bue i
    skala 0–1000, ringBue), til højre de fire søjler som små barer (navn +
    point/250), streaken som én linje med flammen og KUN den øverste løfter.
    Resten (de øvrige løftere, søjlernes tal i ord, streakens status og
    bedste) ligger bag «Se hvad der tæller» (lukket som standard,
    aria-expanded + aria-controls; fokus bliver på knappen, synlig ring).
    Regnet højde på desktop i hvile ≈ 260 px:
      p-6 (24 + 24) + ringkolonnen (ring 128 + to linjer à 16 + mellemrum 8 ≈ 168)
      + bunden (mt-4 16 + pt-3 12 + knaplinje 20 ≈ 48) ≈ 264 px.
    Højre kolonne (barer ≈ 26 + streak 20 + løfter ≈ 52 + 2 × 16 mellemrum ≈ 130;
    med trofælinjen (2/10) + 4 + 16 ≈ 150) er lavere end ringen og bestemmer
    ikke højden.

    FIRE TILSTANDE: henter (skelet i samme højde) · fejl (rust linje +
    «Prøv igen» — en fejl er ikke «ingen tal») · afventer migration (roligt
    «på vej», migration 20260930130000 ikke kørt — bliver rigtigt af sig
    selv) · dommen (med eller uden score; uden score står ringen tom med
    «Ikke nok tal endnu» — samme ramme, samme højde).

    Animation: tallet OG buen tæller op sammen (ease-out, TAEL_OP_MS) fra det
    sidst viste — samme tal ved genhentning/uret tæller ikke igen.
    prefers-reduced-motion → tallet og buen står straks. Ingen konfetti,
    ingen farve for op/ned. Før den første ramme vises 0 (ikke det endelige
    tal), så tallet ikke blinker endeligt → 0 → optælling (rådets fund 4).
    Skærmlæserteksten (sr-only = position:absolute) står INDE i ringens
    `relative`-boks, så den aldrig positioneres mod en fjern forfader.

    Overskriften er sektionens eyebrow «Boardroom Score» (BoardroomView) —
    kortet har ingen egen «Din score» over tallet (rådets fund 7).

    TROFÆERNE (2/10-2026 eftermiddag, designgennemsynet i drift: den separate
    sektion fyldte en hel mobilskærm over «Din plan»; mockuppen: «ind bag ‹Se
    hvad der tæller›»): «Dine trofæer» tegnes INDE i detaljerne (TrofaeKort
    `indlejret`, uden egen ramme), og det lukkede kort bærer kun én linje
    under streaken, «3 af 8 trofæer» (TrofaeAntal). Dommen og hentningen er
    urørte — de kommer færdige ind som props fra BoardroomView.

    TO VARIANTER (2/10-2026 aften, docs/forside-v3.md §3 «Score kompakt»):
    `variant="fuld"` (standard) er kortet ovenfor, uændret. `variant="forside"`
    tegner den godkendte mockups kompakte kort til forsidens smalle højre
    kolonne: ring 92 px (r 38) med «/ 1.000», fire søjler (én kolonne ved xl,
    to fra 1500 px og på sm), en liste med streaken (forsidens datoformat,
    streakForsideLinje), «N af 8 trofæer» (trofaeLinje) og certifikatlinjen
    (certifikatLinje — certifikatkortet udgår af forsiden ved integrationen),
    ÉN løfter «Løfter mest» (loefterMest: aldrig samme sti som forsidens
    primære handling, `undgaaSti`) og bundlinjen «Se hvad der tæller» +
    «Et helbredstal, ikke en kreditvurdering.». Detaljerne bag knappen er
    SAMME komponent (ScoreDetaljer) som den fulde variants — søjler i ord,
    streakstatus, de øvrige løftere og TrofaeKort indlejret. Hooks og
    tilstande (fejl/afventer) er de samme; hentningen tegnes i forside-
    kortets mål (ForsideSkelet). */

type Props = {
  dom: ScoreDom | null;
  afventerMigration: boolean;
  isLoading: boolean;
  isError: boolean;
  onProevIgen: () => void;
  /** Medlemmets trofæer (hooks/trofaeer, kaldt i BoardroomViews topblok). Udeladt/undefined = henter → intet. */
  trofaeer?: TrofaeDom[] | undefined;
  trofaeerFejl?: boolean;
  /** «fuld» (standard) = kortet som før; «forside» = docs/forside-v3.md §3 «Score kompakt». */
  variant?: "fuld" | "forside";
  /** Kun forside: certifikatlinjen (certifikatKort → certifikatTilScore). null/udeladt = ingen linje. */
  certifikat?: CertifikatScore;
  /** Kun forside: forsidens primære handlings sti — en løfter med samme sti springes over (loefterMest). */
  undgaaSti?: string | null;
};

/** prefers-reduced-motion — læst ved mount og fulgt, hvis brugeren skifter. Uden matchMedia (test/SSR): ingen bevægelse. */
function useFaarBevaegelse(): boolean {
  const [bevaegelse, setBevaegelse] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const skift = () => setBevaegelse(!mq.matches);
    mq.addEventListener?.("change", skift);
    return () => mq.removeEventListener?.("change", skift);
  }, []);
  return bevaegelse;
}

/** Tallet undervejs: tæller fra det sidst viste til `til` (taelOpVaerdi). */
function useTaelOp(til: number | null, bevaegelse: boolean): number | null {
  const [vist, setVist] = useState<number | null>(bevaegelse ? (til === null ? null : 0) : til);
  const sidst = useRef<number>(0);
  useEffect(() => {
    if (til === null) {
      // Næste tal tæller fra 0 — samme værdi, som kortet viser før første ramme.
      sidst.current = 0;
      setVist(null);
      return;
    }
    const fra = sidst.current;
    if (!bevaegelse || fra === til || typeof window.requestAnimationFrame !== "function") {
      sidst.current = til;
      setVist(til);
      return;
    }
    let ramme = 0;
    const start = performance.now();
    const trin = (t: number) => {
      const v = taelOpVaerdi(fra, til, t - start, TAEL_OP_MS);
      setVist(v);
      if (v !== til) ramme = window.requestAnimationFrame(trin);
    };
    ramme = window.requestAnimationFrame(trin);
    sidst.current = til;
    return () => window.cancelAnimationFrame(ramme);
  }, [til, bevaegelse]);
  return vist;
}

const mikro = "text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft";
const fokus = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2";

/** Én løfter-linje — samme form øverst og i detaljerne. Teksten og effekten er motorens (loefterLinjer). */
function LoefterRaekke({ h }: { h: LoefterLinje }) {
  const indhold = (
    <>
      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-hb-ink">
        {h.art === "maal" && <span className={cn(mikro, "mr-2")} data-loefter-maal>{LOEFTER_MAAL_MAERKE}</span>}
        {h.tekst}
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs text-hb-ink-soft">{h.effekt}</span>
      {h.sti && <ArrowRight className="h-4 w-4 shrink-0 self-center text-hb-evergreen" aria-hidden />}
    </>
  );
  return (
    <li className="border-t border-hb-line" data-loefter-soejle={h.soejle} data-loefter-art={h.art}>
      {h.sti ? (
        <Link to={h.sti} className={cn("flex items-baseline gap-3 py-2 hover:bg-hb-sage/20", fokus)}>
          {indhold}
        </Link>
      ) : (
        <div className="flex items-baseline gap-3 py-2">{indhold}</div>
      )}
    </li>
  );
}

export const ScoreKort = ({ dom, afventerMigration, isLoading, isError, onProevIgen, trofaeer, trofaeerFejl = false, variant = "fuld", certifikat, undgaaSti }: Props) => {
  // Hooks i TOPBLOKKEN, før enhver betinget return (React #310).
  const bevaegelse = useFaarBevaegelse();
  const vist = useTaelOp(dom?.score ?? null, bevaegelse);
  const [aaben, setAaben] = useState(false);
  const detaljerId = useId();

  if (isLoading) {
    if (variant === "forside") return <ForsideSkelet />;
    // Skelettet har KORTETS opbygning (rådets gennemsyn af #1189) — samme klasser for ramme, ringkolonne,
    // barernes grid, streaklinjen, løfteren og bundlinjen — så siden ikke hopper, når dommen lander.
    // Linjehøjderne: text-xs = 16 px (h-4), text-sm = 20 px (h-5), mikro 11 px ≈ h-3, løfterrækken py-2 + 20 = 36 px (h-9).
    const blok = "rounded bg-hb-line/70";
    return (
      <HbCard className="p-5 md:p-6" data-score="henter" aria-busy="true">
        <div className="animate-pulse">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
            <div className="flex shrink-0 items-center gap-4 sm:w-36 sm:flex-col sm:gap-2" data-skelet-ring>
              <div className="h-24 w-24 shrink-0 rounded-full border-[5px] border-hb-line sm:h-32 sm:w-32" />
              {/* Retning + dækning: to text-xs-linjer (16 px hver), centreret under ringen på sm+. */}
              <div className="flex min-w-0 flex-col sm:items-center">
                <div className={cn(blok, "my-0.5 h-3 w-32")} />
                <div className={cn(blok, "my-0.5 h-3 w-24")} />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 lg:grid-cols-4" data-skelet-soejler>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className={cn(blok, "h-4 w-16")} />
                      <div className={cn(blok, "h-4 w-10")} />
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-hb-line" />
                  </div>
                ))}
              </div>
              <div className={cn(blok, "h-5 w-4/5")} data-skelet-streak />
              <div data-skelet-loefter>
                <div className={cn(blok, "h-3 w-28")} />
                <div className={cn(blok, "mt-1 h-9 w-full")} />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-hb-line pt-3" data-skelet-bund>
            <div className={cn(blok, "h-5 w-32")} />
            <div className={cn(blok, "h-4 w-56")} />
          </div>
        </div>
      </HbCard>
    );
  }

  // En fejlet GENHENTNING med en dom i hånden viser stadig dommen (react-query bevarer data).
  if (isError && !dom && !afventerMigration) {
    return (
      <HbCard className="p-5" data-score="fejl">
        <p className="text-sm text-hb-rust">
          {SCORE_FEJL_TEKST}{" "}
          <button type="button" onClick={onProevIgen} className={cn("underline-offset-4 hover:underline", fokus)}>Prøv igen</button>
        </p>
      </HbCard>
    );
  }

  if (afventerMigration || !dom) {
    return (
      <HbCard className="p-5" data-score="afventer">
        <h3 className="font-editorial text-xl font-medium leading-tight text-hb-ink">{SCORE_AFVENTER_OVERSKRIFT}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{SCORE_AFVENTER_TEKST}</p>
      </HbCard>
    );
  }

  // Motorens løftere — regnet ÉN gang for begge varianter (kildeværnet dom 3).
  const loefter = loefterLinjer(dom);

  if (variant === "forside") {
    return (
      <ScoreKortForside
        dom={dom}
        loefter={loefter}
        vist={vist}
        bevaegelse={bevaegelse}
        aaben={aaben}
        onSkift={() => setAaben((v) => !v)}
        detaljerId={detaljerId}
        trofaeer={trofaeer}
        trofaeerFejl={trofaeerFejl}
        certifikat={certifikat}
        undgaaSti={undgaaSti ?? null}
      />
    );
  }

  // Retningen først, når scoren har fandtes en måned (scoreKort.RETNING_VISES_FRA). Kortet gentegnes hvert minut (hooken tikker).
  const retning = retningVises(new Date()) ? retningTekst(dom.score, dom.forrige) : null;
  const daekning = daekningTekst(dom);
  const mangler = ikkeNokDataTekst(dom);
  const streak = streakLinjer(dom.streak);
  const streakKort = streakKortLinje(dom.streak);
  const soejler = soejleLinjer(dom);
  const [oeverst, ...oevrige] = loefter;
  // Før første ramme: 0 med bevægelse (optællingen starter derfra), ellers tallet selv — aldrig det endelige tal i én frame.
  const tallet = dom.score === null ? null : vist ?? (bevaegelse ? 0 : dom.score);
  // Buen følger det VISTE tal, så den vokser med optællingen (og står straks uden bevægelse).
  const bue = ringBue(tallet);

  return (
    <HbCard className="p-5 md:p-6" data-score={dom.score ?? "ingen"} data-score-daekning={dom.daekning}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
        {/* Ringen med tallet */}
        <div className="flex shrink-0 items-center gap-4 sm:w-36 sm:flex-col sm:gap-2" data-score-tal>
          <div className="relative h-24 w-24 shrink-0 sm:h-32 sm:w-32" data-score-ring>
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden focusable="false">
              <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="5" className="text-hb-line" />
              {bue.laengde > 0 && (
                <circle
                  cx="60"
                  cy="60"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${bue.laengde} ${bue.omkreds}`}
                  className="text-hb-evergreen"
                  data-score-bue
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {tallet !== null ? (
                <>
                  <span className="font-editorial text-3xl font-medium leading-none tabular-nums text-hb-ink sm:text-4xl" aria-hidden>
                    {krTekst(tallet)}
                  </span>
                  <span className="mt-1 text-[11px] text-hb-ink-soft" aria-hidden>/ 1.000</span>
                </>
              ) : (
                <span className="font-editorial text-3xl leading-none text-hb-ink-soft" aria-hidden>—</span>
              )}
            </div>
            {dom.score !== null && <span className="sr-only">{`Din Boardroom Score er ${dom.score} ud af 1.000`}</span>}
          </div>
          <div className="min-w-0 sm:text-center">
            {dom.score !== null ? (
              <>
                {retning && <p className="text-xs text-hb-ink-soft" data-score-retning>{retning}</p>}
                {daekning && <p className="text-xs text-hb-ink-soft" data-score-daekning-tekst>{daekning}</p>}
              </>
            ) : (
              <p className="font-editorial text-lg font-medium leading-tight text-hb-ink">{SCORE_INGEN_TAL}</p>
            )}
          </div>
        </div>

        {/* Søjlerne, streaken og den øverste løfter */}
        <div className="min-w-0 flex-1 space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-6 lg:grid-cols-4" data-score-soejler>
            {soejler.map((s) => (
              <div key={s.navn} className="min-w-0" data-soejle={s.navn} data-soejle-point={s.point ?? "ingen"}>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className={cn(mikro, "truncate tracking-[0.1em] sm:tracking-[0.14em]")}>{s.label}</dt>
                  <dd className="shrink-0 text-xs tabular-nums text-hb-ink">
                    {s.point !== null ? (
                      <>
                        {s.point}<span className="text-hb-ink-soft">/{s.max}</span>
                      </>
                    ) : (
                      <span className="text-hb-ink-soft">—</span>
                    )}
                  </dd>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-hb-line" aria-hidden>
                  <div
                    className="h-full rounded-full bg-hb-evergreen/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.round(s.andel * 1000) / 10}%` }}
                  />
                </div>
              </div>
            ))}
          </dl>

          {/* Streaken + højst én trofælinje tæt under (2/10: trofæerne selv står bag «Se hvad der tæller»). */}
          <div className="space-y-1">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm" data-score-streak={dom.streak.status}>
              <Flame className={cn("h-4 w-4 shrink-0 self-center", dom.streak.status === "aktiv" ? "text-hb-evergreen" : "text-hb-ink-soft/60")} aria-hidden />
              {/* Uden streak (længde 0) er linjen statussen selv — aldrig «0 måneder i træk» (streakKortLinje). */}
              <span className="font-medium tabular-nums text-hb-ink" data-score-streak-tal={streakKort.erStatus ? "status" : "laengde"}>{streakKort.tal}</span>
              <span className="text-hb-ink-soft" data-score-frist>{streakKort.frist}</span>
            </p>
            <TrofaeAntal trofaeer={trofaeer} isError={trofaeerFejl} />
          </div>

          {mangler && <p className="text-sm leading-relaxed text-hb-ink-soft" data-score-mangler>{mangler}</p>}

          {oeverst && (
            <div data-score-loefter={loefter.length}>
              <p className={mikro}>{SCORE_LOEFTER_OVERSKRIFT}</p>
              <ul className="mt-1">
                <LoefterRaekke h={oeverst} />
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Bunden: knappen til detaljerne og forbeholdet */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-hb-line pt-3">
        <DetaljerKnap aaben={aaben} onSkift={() => setAaben((v) => !v)} detaljerId={detaljerId} />
        <p className="text-xs text-hb-ink-soft">{SCORE_FORBEHOLD}</p>
      </div>

      <ScoreDetaljer
        aaben={aaben}
        detaljerId={detaljerId}
        soejler={soejler}
        streakStatus={streakKort.erStatus ? null : streak.status}
        bedste={streak.bedste}
        oevrige={oevrige}
        trofaeer={trofaeer}
        trofaeerFejl={trofaeerFejl}
      />
    </HbCard>
  );
};

/** Forside-variantens skelet: kortets opbygning i forside-kortets mål (ring 92 px, søjlegrid, tre listelinjer,
    løfterlinjen, bundlinjen), så siden ikke hopper, når dommen lander. Linjehøjder: text-sm = 20 px (h-5), text-xs = 16 px (h-4). */
function ForsideSkelet() {
  const blok = "rounded bg-hb-line/70";
  return (
    <HbCard className="p-5" data-score="henter" data-score-variant="forside" aria-busy="true">
      <div className="animate-pulse">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="h-[92px] w-[92px] shrink-0 rounded-full border-[5px] border-hb-line" data-skelet-ring />
          <div className="grid w-full min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-1 min-[1500px]:grid-cols-2" data-skelet-soejler>
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div className="flex justify-between">
                  <div className={cn(blok, "h-3 w-16")} />
                  <div className={cn(blok, "h-3 w-6")} />
                </div>
                <div className="mt-1 h-1 rounded-full bg-hb-line" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 space-y-1.5 border-t border-hb-line pt-3" data-skelet-streak>
          <div className={cn(blok, "h-5 w-4/5")} />
          <div className={cn(blok, "h-5 w-1/3")} />
          <div className={cn(blok, "h-5 w-1/2")} />
        </div>
        <div className="mt-3 border-t border-hb-line pt-3" data-skelet-loefter>
          <div className={cn(blok, "h-5 w-full")} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3" data-skelet-bund>
          <div className={cn(blok, "h-4 w-28")} />
          <div className={cn(blok, "h-4 w-48")} />
        </div>
      </div>
    </HbCard>
  );
}

type ForsideProps = {
  dom: ScoreDom;
  /** Motorens løftere i ord, regnet ÉN gang i ScoreKort. */
  loefter: LoefterLinje[];
  vist: number | null;
  bevaegelse: boolean;
  aaben: boolean;
  onSkift: () => void;
  detaljerId: string;
  trofaeer: TrofaeDom[] | undefined;
  trofaeerFejl: boolean;
  certifikat: CertifikatScore | undefined;
  undgaaSti: string | null;
};

/** Forside-varianten (docs/forside-v3.md §3) — mockuppens kort præcist. Ingen hooks: alt kommer fra ScoreKorts topblok. */
function ScoreKortForside({ dom, loefter: linjer, vist, bevaegelse, aaben, onSkift, detaljerId, trofaeer, trofaeerFejl, certifikat, undgaaSti }: ForsideProps) {
  const soejler = soejleLinjer(dom);
  const valgt = loefterMest(linjer, undgaaSti);
  const resten = oevrigeLoeftere(linjer, valgt);
  const streak = streakLinjer(dom.streak);
  // Kortet gentegnes hvert minut (hooken tikker `nu`), så datoen i linjen følger med.
  const streakTekst = streakForsideLinje(dom.streak, new Date());
  const trofaeTekst = trofaeLinje(trofaeer, trofaeerFejl);
  const cert = certifikatLinje(certifikat);
  // Dækningen og «hvad mangler» — den fulde variant viser dem i hvile; mockuppen har ikke plads, så de står i detaljerne.
  const noter = [daekningTekst(dom), ikkeNokDataTekst(dom)].filter((t): t is string => !!t);
  // Før første ramme: 0 med bevægelse, ellers tallet selv (som den fulde variant).
  const tallet = dom.score === null ? null : vist ?? (bevaegelse ? 0 : dom.score);
  const bue = ringBue(tallet, 1000, FORSIDE_RING_RADIUS);

  return (
    <HbCard className="p-5" data-score={dom.score ?? "ingen"} data-score-daekning={dom.daekning} data-score-variant="forside">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="relative h-[92px] w-[92px] shrink-0" data-score-tal data-score-ring>
          <svg viewBox="0 0 92 92" className="h-full w-full -rotate-90" aria-hidden focusable="false">
            <circle cx="46" cy="46" r={FORSIDE_RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="5" className="text-hb-line" />
            {bue.laengde > 0 && (
              <circle
                cx="46"
                cy="46"
                r={FORSIDE_RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${bue.laengde} ${bue.omkreds}`}
                className="text-hb-evergreen"
                data-score-bue
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {tallet !== null ? (
              <>
                <span className="font-editorial text-[23px] font-medium leading-none tabular-nums text-hb-ink" aria-hidden>
                  {krTekst(tallet)}
                </span>
                <span className="mt-1 text-[9px] leading-none text-hb-ink-soft" aria-hidden>/ 1.000</span>
              </>
            ) : (
              <span className="font-editorial text-[23px] leading-none text-hb-ink-soft" aria-hidden>—</span>
            )}
          </div>
          <span className="sr-only">{dom.score !== null ? `Din Boardroom Score er ${dom.score} ud af 1.000` : SCORE_INGEN_TAL}</span>
        </div>
        <div className="grid w-full min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-1 min-[1500px]:grid-cols-2" data-score-soejler>
          {soejler.map((s) => (
            <div key={s.navn} data-soejle={s.navn} data-soejle-point={s.point ?? "ingen"}>
              <div className="flex justify-between text-[10px] font-medium uppercase tracking-[0.12em] text-hb-ink-soft">
                <span>{s.label}</span>
                <span className="tabular-nums">{s.point ?? "—"}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-hb-line" aria-hidden>
                <div
                  className="h-full rounded-full bg-hb-evergreen/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.round(s.andel * 1000) / 10}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-4 space-y-1.5 border-t border-hb-line pt-3 text-sm">
        <li className="flex items-center gap-2 text-hb-ink" data-score-streak={dom.streak.status}>
          <Flame className="h-4 w-4 shrink-0 text-hb-rust" aria-hidden />
          {streakTekst}
        </li>
        {trofaeTekst && (
          <li className="flex items-center gap-2 text-hb-ink-soft" data-score-trofaeer-antal>
            <Trophy className="h-4 w-4 shrink-0" aria-hidden />
            {trofaeTekst}
          </li>
        )}
        {cert &&
          (cert.tilstand === "klar" ? (
            <li className="flex items-center gap-2 text-hb-ink-soft" data-score-certifikat="klar">
              <Award className="h-4 w-4 shrink-0 text-hb-evergreen" aria-hidden />
              <Link to={cert.sti} className={cn("text-hb-evergreen underline-offset-4 hover:underline", fokus)}>{cert.tekst}</Link>
            </li>
          ) : (
            <li className="flex items-center gap-2 text-hb-ink-soft" data-score-certifikat="laast">
              <Lock className="h-4 w-4 shrink-0" aria-hidden />
              {cert.tekst}
            </li>
          ))}
      </ul>

      {valgt && (
        <p className="mt-3 border-t border-hb-line pt-3 text-sm text-hb-ink" data-score-loefter-mest={valgt.soejle} data-loefter-sti={valgt.sti ?? "ingen"}>
          <span className={cn(mikro, "mr-2")}>{LOEFTER_MEST_MAERKE}</span>
          {/* Motorens sætning slutter med punktum — før «· +50 point» læses det som to sætninger (set på Topix' data). */}
          {valgt.tekst.replace(/\.$/, "")} <span className="text-hb-ink-soft">· {valgt.effekt}</span>
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-hb-ink-soft">
        <DetaljerKnap aaben={aaben} onSkift={onSkift} detaljerId={detaljerId} lille />
        <span className="text-right">{SCORE_FORSIDE_FORBEHOLD}</span>
      </div>

      <ScoreDetaljer
        aaben={aaben}
        detaljerId={detaljerId}
        soejler={soejler}
        streakStatus={dom.streak.status === "aktiv" ? streak.status : null}
        bedste={streak.bedste}
        oevrige={resten}
        trofaeer={trofaeer}
        trofaeerFejl={trofaeerFejl}
        noter={noter}
        smal
      />
    </HbCard>
  );
}

type DetaljerProps = {
  aaben: boolean;
  detaljerId: string;
  soejler: SoejleLinje[];
  /** Streakens status i ord — null når kortets streaklinje allerede ER statussen. */
  streakStatus: string | null;
  bedste: string | null;
  oevrige: LoefterLinje[];
  trofaeer: TrofaeDom[] | undefined;
  trofaeerFejl: boolean;
  /** Kun forside: dækningen/«hvad mangler», som den fulde variant viser i hvile. */
  noter?: string[];
  /** Kun forside: kortet står i den smalle højre kolonne ved xl — én kolonne dér, to fra 1500 px (som søjlerne),
      og trofæfliserne to ad gangen ved xl i stedet for fire (overflow-wrap brækker ellers ord — TrofaeKort). */
  smal?: boolean;
};

/** «Se hvad der tæller» — SAMME indhold i begge varianter: søjlerne i ord, streakens status og bedste,
    de øvrige løftere og trofæerne indlejret. Tegnes kun, når knappen er åben. */
function ScoreDetaljer({ aaben, detaljerId, soejler, streakStatus, bedste, oevrige, trofaeer, trofaeerFejl, noter = [], smal = false }: DetaljerProps) {
  return (
    <div id={detaljerId} hidden={!aaben} data-score-detaljer className={cn(smal && "xl:[&_[data-trofaeer]_ul]:grid-cols-2")}>
      {aaben && (
        <div className={cn("mt-4 grid grid-cols-1 gap-6", smal ? "sm:grid-cols-2 xl:grid-cols-1 min-[1500px]:grid-cols-2" : "md:grid-cols-2")}>
          <div className="min-w-0 space-y-3">
            {noter.map((n) => (
              <p key={n} className="text-sm leading-relaxed text-hb-ink-soft" data-score-note>{n}</p>
            ))}
            <p className={mikro}>{SCORE_SOEJLER_OVERSKRIFT}</p>
            <ul className="space-y-2">
              {soejler.map((s) => (
                <li key={s.navn} className="text-sm leading-relaxed">
                  <span className="font-medium text-hb-ink">{s.label}</span>
                  {s.detalje && <span className="text-hb-ink-soft" data-soejle-detalje> — {s.detalje}</span>}
                </li>
              ))}
            </ul>
            {streakStatus && <p className="text-sm text-hb-ink" data-score-streak-status>{streakStatus}</p>}
            {bedste && <p className="text-xs text-hb-ink-soft">{bedste}</p>}
          </div>
          {oevrige.length > 0 && (
            <div className="min-w-0">
              <p className={mikro}>{SCORE_OEVRIGE_OVERSKRIFT}</p>
              <ul className="mt-1 [&>li:last-child]:border-b [&>li:last-child]:border-hb-line">
                {oevrige.map((h) => (
                  <LoefterRaekke key={`${h.soejle}:${h.tekst}`} h={h} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {aaben && <TrofaeKort trofaeer={trofaeer} isError={trofaeerFejl} indlejret />}
    </div>
  );
}

/** «Se hvad der tæller» / «Skjul detaljer» — ÉN knap for begge varianter (aria-expanded + aria-controls,
    lukket som standard i ScoreKorts topblok). `lille`: forside-kortets bundlinje er text-xs (mockuppen). */
function DetaljerKnap({ aaben, onSkift, detaljerId, lille = false }: { aaben: boolean; onSkift: () => void; detaljerId: string; lille?: boolean }) {
  return (
    <button
      type="button"
      onClick={onSkift}
      aria-expanded={aaben}
      aria-controls={detaljerId}
      className={cn("inline-flex items-center gap-1 font-medium text-hb-evergreen underline-offset-4 hover:underline", lille ? "shrink-0" : "text-sm", fokus)}
      data-score-detaljer-knap
    >
      {aaben ? SCORE_DETALJER_KNAP_LUK : SCORE_DETALJER_KNAP}
      <ChevronDown className={cn(lille ? "h-3.5 w-3.5" : "h-4 w-4", "transition-transform motion-reduce:transition-none", aaben && "rotate-180")} aria-hidden />
    </button>
  );
}
