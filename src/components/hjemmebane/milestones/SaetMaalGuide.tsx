import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoreMaaned } from "@/lib/boardroomScore";
import {
  doemNytMaal,
  enhedFor,
  FORESLAAET_FRIST_MAANEDER,
  foreslaaTitel,
  MAAL_ORD,
  MAKS_FRIST_MAANEDER,
  nuvaerendeTal,
  nytMaalForslag,
  prTekst,
  TITEL_MAX,
  vaerdiTekst,
  type MaalNoegle,
  type NytMaalInput,
  type SkarptForslag,
  type TalDom,
} from "@/lib/hjemmebane/maalTal";
import { danskTal, danskTalDom, danskTalTilFelt, GUIDE_ORD, guideKort, kraeverTekst, type GuideValg } from "@/lib/hjemmebane/dineMaalFlade";
import { MAAL_FORKLARING_TEKST, maalEksemplerHjaelp } from "@/lib/hjemmebane/maalForklaring";
import { doemFrist, doemFristModMaal, foreslaaetFristModMaal, senesteSkridtFrist } from "@/lib/hjemmebane/skridtForslag";
import { kbhDato, laegMaanederTilDato } from "@/lib/hverdage";
import type { SkriveSvar } from "@/hooks/dineMaalGrundlag";
import { HbButton } from "../HbButton";
import { HbField, HbInput } from "../admin/HbField";
import { HbDialog } from "./HbOverlejring";

/**
 * Guiden «Sæt et mål» i tre trin (designet 1/10-2026) — og «Gør målet skarpt»
 * for et mål fra før designet (samme guide, forudfyldt af motorens
 * skarptForslag, uden trin 3):
 *   1. «Hvad vil I nå?» — ét kort pr. nøgle (motorens MAAL_NOEGLER) med det
 *      NUVÆRENDE tal (nytMaalForslag → nuvaerendeTal) eller «mangler: <grund>»
 *      (et manglende tal kan ikke vælges — doemNytMaal ville afvise det), «et
 *      andet tal» (tastes) og «noget der skal ske» (begivenhed).
 *   2. «Hvor meget og hvornår?» — måltal (+ udgangspunkt og enhed for andet_tal),
 *      frist (foreslået 12 mdr., højst 36) og den levende linje «Det kræver ca.
 *      X pr. måned» (motorens kraeverPrMaaned). Titlen foreslås af motoren
 *      (foreslaaTitel) og følger tallet, indtil medlemmet retter den. Dommen
 *      doemNytMaal kører ved «Videre» og viser grunden i dialogen.
 *   3. «Det første skridt» — titel + frist (≤ målets, doemFristModMaal: SAMME
 *      dom som skridt-tilfoej) eller «Spring over».
 * Gemmer gennem dineMaalGrundlag's skrivere (opret/goerSkarpt, givet ind) og
 * skridtet gennem skridt-tilfoej (onTilfoejSkridt — fladens eksisterende vej).
 * Tegner kun: alle tal, datoer og domme er motorens.
 *
 * Rådets fund (1/10 aften):
 *   - (1) Målet oprettes HØJST ÉN gang: det oprettede id står i `oprettetId`;
 *     fejler skridtet, gentager et nyt klik KUN skridtet, og «Spring over»
 *     lukker blot. Et kald, mens der gemmes (dobbelt Enter), returnerer straks
 *     (gemmerRef — synkron, state'en er det ikke). «Tilbage» i trin 3 er låst,
 *     når målet er oprettet (en rettelse i trin 2 ville ellers gå tabt stille).
 *   - (4) Tal læses af danskTal («1.500» er 1500, «1,5» er halvanden).
 *   - (8) «Gør målet skarpt» forudfylder målets EGEN frist, når den er sat og
 *     ligger efter i dag; ellers forslaget (12 mdr.).
 *   - (9) Dommens grund står i ÉN synlig linje (role="alert") nederst i trinnet.
 *   - (19) Eksemplerne («Fx: …», maalEksemplerHjaelp) står under kortene i trin 1.
 *   - (20) Nulstillingen afhænger af [open, tilstand, nu] — `nu` er fastfrosset af
 *     kalderen, mens guiden er åben (DineMaalView gemmer åbningstidspunktet).
 *
 * Rådets runde 2:
 *   - (1) «Gør målet skarpt» forudfylder tal med danskTalTilFelt («2,125»), så
 *     danskTal læser dem tilbage uændret.
 *   - (3) Svarer skriveren ja uden id (svar.id === null — rækken kunne ikke
 *     læses tilbage efter insert), lukkes guiden IKKE stille: grunden står
 *     (MAALET_SAT_IKKE_LAEST_TEKST), og videre oprettelse er LÅST (`laast`) —
 *     et nyt klik ville oprette målet igen. Kun «Annuller»/luk er muligt.
 *   - (6) danskTalDom's egen grund («Skriv kun tallet — uden kr., % eller mio.»)
 *     vises ved «Videre», før dommen.
 */
export const MAALET_SAT_IKKE_LAEST_TEKST = "Målet er sat, men kunne ikke læses tilbage — genindlæs siden.";

export type GuideTilstand =
  | { art: "ny" }
  | { art: "skarpt"; maalId: string; titel: string; forslag: SkarptForslag; /** Målets eksisterende frist («YYYY-MM-DD»), null uden. */ frist: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  tilstand: GuideTilstand;
  maaneder: readonly ScoreMaaned[] | null;
  nu: Date;
  onOpret: (input: NytMaalInput) => Promise<SkriveSvar>;
  onGoerSkarpt: (maalId: string, input: NytMaalInput) => Promise<SkriveSvar>;
  /** Trin 3 — skridt-tilfoej; fejlteksten ordret, null ved ja. */
  onTilfoejSkridt: (maalId: string, titel: string, dueDate: string) => Promise<string | null>;
};

const mikro = "text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft";
const fokus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2";

export const GUIDE_TITEL_NY = "Sæt et mål";
export const SKRIDT_TITEL_MIN = 3;
export const SKRIDT_FEJL_EFTER_MAAL = "Målet er sat, men skridtet blev ikke tilføjet";

/** Et tal som «1,58 mio. kr.» for et inputfelt (motorens vaerdiTekst). */
const tekstFor = (noegle: MaalNoegle, egenEnhed: string | null) => (v: number) => vaerdiTekst(v, enhedFor(noegle), egenEnhed);

export const SaetMaalGuide = ({ open, onClose, tilstand, maaneder, nu, onOpret, onGoerSkarpt, onTilfoejSkridt }: Props) => {
  // Hooks i TOPBLOKKEN, før enhver betinget return (React #310).
  const [trin, setTrin] = useState<1 | 2 | 3>(1);
  const [valg, setValg] = useState<GuideValg | null>(null);
  const [maaltal, setMaaltal] = useState("");
  const [udgangspunkt, setUdgangspunkt] = useState("");
  const [enhed, setEnhed] = useState("");
  const [frist, setFrist] = useState("");
  const [titel, setTitel] = useState("");
  const [titelRettet, setTitelRettet] = useState(false);
  const [fejl, setFejl] = useState<string | null>(null);
  const [skridtTitel, setSkridtTitel] = useState("");
  const [skridtFrist, setSkridtFrist] = useState("");
  const [skridtFejl, setSkridtFejl] = useState<string | null>(null);
  const [gemmer, setGemmer] = useState(false);
  const gemmerRef = useRef(false);
  // Fund 1: det oprettede måls id — målet oprettes aldrig to gange fra samme åbning.
  const [oprettetId, setOprettetId] = useState<string | null>(null);
  // Runde 2, fund 3: målet er sat, men id'et kom ikke tilbage — videre oprettelse er låst.
  const [laast, setLaast] = useState(false);
  const idRod = useId();

  const idag = kbhDato(nu);
  const erSkarpt = tilstand.art === "skarpt";

  // Nulstil ved åbning; «Gør målet skarpt» får motorens forslag (skarptForslag) og målets egen frist som startværdier.
  useEffect(() => {
    if (!open) return;
    const idagVedAabning = kbhDato(nu);
    setTrin(1);
    setValg(null);
    setFejl(null);
    setSkridtFejl(null);
    setGemmer(false);
    gemmerRef.current = false;
    setOprettetId(null);
    setLaast(false);
    const foreslaaet = laegMaanederTilDato(idagVedAabning, FORESLAAET_FRIST_MAANEDER);
    if (tilstand.art === "skarpt") {
      // Fund 8: målets egen frist, når den er sat og ligger efter i dag; ellers forslaget.
      setFrist(tilstand.frist && tilstand.frist > idagVedAabning ? tilstand.frist : foreslaaet);
      setTitel(tilstand.titel);
      setTitelRettet(true);
      setMaaltal(danskTalTilFelt(tilstand.forslag.maaltal));
      setUdgangspunkt(danskTalTilFelt(tilstand.forslag.udgangspunkt));
      setEnhed(tilstand.forslag.enhed ?? "");
    } else {
      setFrist(foreslaaet);
      setTitel("");
      setTitelRettet(false);
      setMaaltal("");
      setUdgangspunkt("");
      setEnhed("");
    }
    setSkridtTitel("");
    setSkridtFrist("");
  }, [open, tilstand, nu]);

  // Trin 1: hvert korts nuværende tal — regnet af motoren af de samme måneder som kortene.
  const kort = useMemo(() => {
    return guideKort().map((k) => {
      if (k.valg === "begivenhed") return { ...k, tal: null as TalDom | null, kanVaelges: true };
      if (k.valg === "andet_tal") return { ...k, tal: null as TalDom | null, kanVaelges: true };
      const tal: TalDom = maaneder === null ? { status: "mangler", grund: MAAL_ORD.grund.intet_tal } : nytMaalForslag(k.valg, maaneder, nu).udgangspunkt;
      return { ...k, tal, kanVaelges: tal.status === "ok" };
    });
  }, [maaneder, nu]);

  const noegle: MaalNoegle | null = valg && valg !== "begivenhed" ? valg : null;
  const egenEnhed = noegle === "andet_tal" ? (enhed.trim() || null) : null;
  const maaltalTal = danskTal(maaltal);
  const udgangspunktTal = danskTal(udgangspunkt);

  // Trin 2: den levende linje — motorens kraeverPrMaaned for måltal, frist og (andet_tal) det tastede udgangspunkt.
  const kraever = useMemo(() => {
    if (!noegle || maaltalTal === null || !frist) return null;
    const forslag = nytMaalForslag(noegle, maaneder ?? [], nu, { maaltal: maaltalTal, frist, tastet: udgangspunktTal });
    return kraeverTekst(forslag.kraeverPrMaaned, tekstFor(noegle, egenEnhed));
  }, [noegle, maaltalTal, frist, maaneder, nu, udgangspunktTal, egenEnhed]);

  // Titlen følger tallet, indtil medlemmet retter den.
  useEffect(() => {
    if (titelRettet || !noegle) return;
    const forslag = foreslaaTitel(noegle, maaltalTal, egenEnhed);
    setTitel(forslag ?? "");
  }, [noegle, maaltalTal, egenEnhed, titelRettet]);

  if (!open) return null;

  const input = (): NytMaalInput => {
    if (valg === "begivenhed") return { titel, art: "begivenhed", frist };
    return {
      titel,
      art: "tal",
      noegle: noegle,
      maaltal: maaltalTal,
      udgangspunkt: noegle === "andet_tal" ? udgangspunktTal : undefined,
      enhed: noegle === "andet_tal" ? enhed : undefined,
      frist,
    };
  };
  const nuvaerende = (): TalDom | null => (noegle && noegle !== "andet_tal" && maaneder ? nuvaerendeTal(noegle, maaneder, nu) : null);

  const vaelg = (v: GuideValg) => {
    setValg(v);
    setFejl(null);
    if (!erSkarpt) setTitelRettet(v === "begivenhed");
    setTrin(2);
  };

  const videreFraTrin2 = () => {
    if (gemmerRef.current || laast) return;
    // Runde 2, fund 6: suffikser og tekst i talfelterne får deres egen grund før dommen.
    if (noegle) {
      const mt = danskTalDom(maaltal);
      if (mt.vaerdi === null && mt.grund) { setFejl(mt.grund); return; }
      if (noegle === "andet_tal") {
        const ud = danskTalDom(udgangspunkt);
        if (ud.vaerdi === null && ud.grund) { setFejl(ud.grund); return; }
      }
    }
    const dom = doemNytMaal(input(), nu, nuvaerende());
    if (dom.ok === false) { setFejl(dom.grund); return; }
    setFejl(null);
    if (erSkarpt) { void gem(); return; }
    setSkridtFrist(foreslaaetFristModMaal(nu, frist));
    setTrin(3);
  };

  const gem = async (medSkridt = false) => {
    // Fund 1: et kald, mens der gemmes, gør intet (dobbelt Enter/klik) — synkront gennem ref'en.
    if (gemmerRef.current || laast) return;
    gemmerRef.current = true;
    setGemmer(true);
    setFejl(null);
    setSkridtFejl(null);
    const faerdig = () => { gemmerRef.current = false; setGemmer(false); };
    let maalId = oprettetId;
    if (maalId === null) {
      // Målet oprettes (eller gøres skarpt) KUN første gang; et nyt klik efter et fejlet skridt springer hertil.
      const svar = erSkarpt && tilstand.art === "skarpt" ? await onGoerSkarpt(tilstand.maalId, input()) : await onOpret(input());
      if (svar.ok === false) { faerdig(); setFejl(svar.grund); return; }
      if (svar.id === null) {
        // Runde 2, fund 3: målet FINDES, men vi fik intet id — ingen stille lukning, ingen ny oprettelse.
        faerdig();
        setLaast(true);
        // Grunden skal stå i det trin, der er åbent: trin 3 tegner skridtFejl, trin 2 (gør skarpt) fejl.
        if (trin === 3) setSkridtFejl(MAALET_SAT_IKKE_LAEST_TEKST); else setFejl(MAALET_SAT_IKKE_LAEST_TEKST);
        return;
      }
      maalId = svar.id;
      setOprettetId(maalId);
    }
    if (medSkridt && maalId) {
      const skridtSvar = await onTilfoejSkridt(maalId, skridtTitel.trim(), skridtFrist);
      if (skridtSvar) { faerdig(); setSkridtFejl(`${SKRIDT_FEJL_EFTER_MAAL}: ${skridtSvar}`); return; }
    }
    faerdig();
    onClose();
  };

  const gemMedSkridt = () => {
    if (gemmerRef.current || laast) return;
    const fristDom = doemFrist(skridtFrist, nu);
    if (fristDom.ok === false) { setSkridtFejl(fristDom.grund); return; }
    const modMaal = doemFristModMaal(fristDom.dato, frist, nu);
    if (modMaal.ok === false) { setSkridtFejl(modMaal.grund); return; }
    if (skridtTitel.trim().length < SKRIDT_TITEL_MIN) { setSkridtFejl(`Skriv hvad I vil gøre — mindst ${SKRIDT_TITEL_MIN} tegn`); return; }
    void gem(true);
  };

  const senestFrist = laegMaanederTilDato(idag, MAKS_FRIST_MAANEDER);
  const skridtMaks = senesteSkridtFrist(frist);
  const O = GUIDE_ORD;
  const trinTekst = trin === 1 ? O.trin1 : trin === 2 ? O.trin2 : O.trin3;
  const antalTrin = erSkarpt ? 2 : 3;

  const titelNode = (
    <span className="block">
      <span className={cn(mikro, "block")}>{erSkarpt ? MAAL_ORD.goerSkarpt : GUIDE_TITEL_NY} · trin {trin} af {antalTrin}</span>
      <span className="mt-1 block">{trinTekst}</span>
    </span>
  );

  const fod =
    trin === 1 ? (
      <HbButton variant="secondary" onClick={onClose}>Annuller</HbButton>
    ) : trin === 2 ? (
      <>
        <HbButton variant="secondary" onClick={() => { setFejl(null); setTrin(1); }} disabled={gemmer || laast}>{O.tilbage}</HbButton>
        <HbButton onClick={videreFraTrin2} disabled={gemmer || laast} data-guide-videre>
          {gemmer ? O.gemmer : erSkarpt ? O.gemSkarpt : O.videre}
        </HbButton>
      </>
    ) : (
      <>
        <HbButton variant="secondary" onClick={() => { setSkridtFejl(null); setTrin(2); }} disabled={gemmer || laast || oprettetId !== null} title={oprettetId !== null ? O.maaletErSat : undefined}>{O.tilbage}</HbButton>
        <HbButton variant="secondary" onClick={() => void gem(false)} disabled={gemmer || laast} data-guide-spring-over>{O.springOver}</HbButton>
        <HbButton onClick={gemMedSkridt} disabled={gemmer || laast || !skridtTitel.trim() || !skridtFrist} data-guide-gem>
          {gemmer ? O.gemmer : O.gem}
        </HbButton>
      </>
    );

  return (
    <HbDialog open={open} onClose={onClose} titel={titelNode} beskrivelse={trin === 1 ? MAAL_FORKLARING_TEKST : undefined} bred fod={fod}>
      <div data-guide-trin={trin} data-guide-valg={valg ?? ""} data-guide-laast={laast ? "1" : "0"}>
        {trin === 1 && (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="list">
            {kort.map((k) => {
              const valgt = valg === k.valg;
              return (
                <li key={k.valg}>
                  <button
                    type="button"
                    onClick={() => vaelg(k.valg)}
                    disabled={!k.kanVaelges}
                    data-guide-kort={k.valg}
                    data-guide-kort-kan-vaelges={k.kanVaelges ? "1" : "0"}
                    className={cn(
                      "flex h-full w-full flex-col rounded-hb border p-4 text-left transition-colors",
                      valgt ? "border-hb-evergreen bg-hb-sage/40" : "border-hb-line hover:bg-hb-sage/30",
                      "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
                      fokus,
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-editorial text-base font-medium leading-snug text-hb-ink">{k.titel}</span>
                      {valgt && <Check className="h-4 w-4 shrink-0 text-hb-evergreen" aria-hidden />}
                    </span>
                    <span className="mt-1 text-xs leading-relaxed text-hb-ink-soft">{k.tekst}</span>
                    <span className="mt-2 text-xs" data-guide-kort-tal>
                      {k.valg === "begivenhed" ? null : k.valg === "andet_tal" ? (
                        <span className="text-hb-ink-soft">{O.tastes}</span>
                      ) : k.tal?.status === "ok" ? (
                        <>
                          <span className={mikro}>{O.nuvaerende}</span>{" "}
                          <span className="font-medium tabular-nums text-hb-ink">{vaerdiTekst(k.tal.vaerdi, k.tal.enhed)}</span>
                          {prTekst(k.tal.prMaaned, nu) && <span className="text-hb-ink-soft"> {prTekst(k.tal.prMaaned, nu)}</span>}
                        </>
                      ) : (
                        <span className="text-hb-ink-soft"><span className={mikro}>{O.mangler}</span> {k.tal?.status === "mangler" ? k.tal.grund : ""}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {trin === 1 && <p className="mt-3 text-xs leading-relaxed text-hb-ink-soft" data-guide-eksempler>{maalEksemplerHjaelp()}</p>}

        {trin === 2 && (
          <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); videreFraTrin2(); }}>
            {noegle && (
              <>
                {noegle === "andet_tal" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <HbField label={O.udgangspunkt} htmlFor={`${idRod}-udg`} help="Tallet som det er i dag.">
                      <HbInput id={`${idRod}-udg`} inputMode="decimal" value={udgangspunkt} onChange={(e) => setUdgangspunkt(e.target.value)} autoFocus />
                    </HbField>
                    <HbField label={O.enhed} htmlFor={`${idRod}-enhed`} help="Fx kunder, ansatte, ordrer.">
                      <HbInput id={`${idRod}-enhed`} value={enhed} maxLength={40} onChange={(e) => setEnhed(e.target.value)} />
                    </HbField>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <HbField
                    label={O.maaltal}
                    htmlFor={`${idRod}-maaltal`}
                    help={(() => {
                      const k = kort.find((x) => x.valg === noegle);
                      return k?.tal?.status === "ok" ? `${O.nuvaerende}: ${vaerdiTekst(k.tal.vaerdi, k.tal.enhed)}` : noegle === "db_grad" ? "I procent." : noegle === "likviditet_mdr" ? "I måneder." : noegle === "andet_tal" ? undefined : "I kroner.";
                    })()}
                  >
                    <HbInput id={`${idRod}-maaltal`} inputMode="decimal" value={maaltal} onChange={(e) => setMaaltal(e.target.value)} autoFocus={noegle !== "andet_tal"} />
                  </HbField>
                  <HbField label={O.frist} htmlFor={`${idRod}-frist`} help={O.fristHjaelp}>
                    <HbInput id={`${idRod}-frist`} type="date" value={frist} min={idag} max={senestFrist} required onChange={(e) => setFrist(e.target.value)} />
                  </HbField>
                </div>
                <p className={cn("min-h-5 text-sm", kraever ? "text-hb-ink" : "text-hb-ink-soft")} data-guide-kraever aria-live="polite">
                  {kraever ?? ""}
                </p>
              </>
            )}
            {valg === "begivenhed" && (
              <HbField label={O.frist} htmlFor={`${idRod}-frist`} help={O.fristHjaelp}>
                <HbInput id={`${idRod}-frist`} type="date" value={frist} min={idag} max={senestFrist} required onChange={(e) => setFrist(e.target.value)} />
              </HbField>
            )}
            <HbField label={O.titel} htmlFor={`${idRod}-titel`} help={valg === "begivenhed" ? undefined : O.titelHjaelp}>
              <HbInput
                id={`${idRod}-titel`}
                value={titel}
                maxLength={TITEL_MAX}
                autoFocus={valg === "begivenhed"}
                onChange={(e) => { setTitel(e.target.value); setTitelRettet(true); }}
                placeholder={valg === "begivenhed" ? "Fx «Den første medarbejder er ansat»" : undefined}
              />
            </HbField>
            {fejl && <p className="text-sm text-hb-rust" role="alert" data-guide-fejl>{fejl}</p>}
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">{O.videre}</button>
          </form>
        )}

        {trin === 3 && (
          <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); gemMedSkridt(); }} data-guide-skridt>
            <p className="text-sm leading-relaxed text-hb-ink-soft">Et mål bliver til noget gennem skridt. Hvad er det første, I gør?</p>
            <HbField label={O.skridtTitel} htmlFor={`${idRod}-skridt`} help={`Mindst ${SKRIDT_TITEL_MIN} tegn, højst 200.`}>
              <HbInput id={`${idRod}-skridt`} value={skridtTitel} maxLength={200} autoFocus onChange={(e) => setSkridtTitel(e.target.value)} />
            </HbField>
            <HbField label={O.skridtFrist} htmlFor={`${idRod}-skridt-frist`} help={O.skridtHjaelp}>
              <HbInput id={`${idRod}-skridt-frist`} type="date" value={skridtFrist} min={idag} max={skridtMaks ?? undefined} required onChange={(e) => setSkridtFrist(e.target.value)} />
            </HbField>
            {skridtFejl && <p className="text-sm text-hb-rust" role="alert" data-guide-fejl>{skridtFejl}</p>}
            {oprettetId !== null && !skridtFejl && <p className="text-xs text-hb-ink-soft" data-guide-maalet-sat>{O.maaletErSat}</p>}
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">{O.gem}</button>
          </form>
        )}
      </div>
    </HbDialog>
  );
};
