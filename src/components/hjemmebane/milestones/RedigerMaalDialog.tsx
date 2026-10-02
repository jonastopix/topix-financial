import { useEffect, useId, useRef, useState } from "react";
import { doemMaalFrist, MAKS_FRIST_MAANEDER, TITEL_MAX, type MaalKort } from "@/lib/hjemmebane/maalTal";
import { danskTalDom, danskTalTilFelt } from "@/lib/hjemmebane/dineMaalFlade";
import { kbhDato, laegMaanederTilDato } from "@/lib/hverdage";
import { HbButton } from "../HbButton";
import { HbField, HbInput } from "../admin/HbField";
import { HbDialog } from "./HbOverlejring";

/**
 * «Redigér» på et målkort (fladen 1/10-2026): titlen, fristen og — for et
 * tastet tal (andet_tal) — tallet nu. Ikke mere: kategori, beskrivelse og
 * baseline er data fra før designet og vises ikke på kortet; de står urørt i
 * databasen. Skyderen og «nuværende ÷ mål» findes ikke her (Jonas 1/10:
 * «skyderen og den blandede procent forsvinder»).
 *
 * Fristen dømmes TO gange, begge fail-closed: (1) for et mål MED art (tal/
 * begivenhed) kræves en frist efter i dag og højst 36 måneder frem — SAMME dom
 * som guiden (maalTal.doemMaalFrist, rådets fund 5); et gammelt mål (art null)
 * må som før stå uden frist; (2) mod målets åbne skridt af kalderen (doemFrist
 * — SAMME dom som maal-skriv «rediger»: doemMaalFristModSkridt). Grunden vises
 * i feltet, intet gemmes. Tallet læses af danskTal (fund 4: «1.500» er 1500).
 *
 * Startværdierne låses ved ÅBNING (fund 2): effekten afhænger kun af open og
 * målets id — kortet er et nyt objekt hvert minut (hookets ur) og ved hver
 * genhentning, og en effekt på `kort` nulstillede medlemmets indtastning.
 * Skrivningen er useMilestones.opdaterFelt (medlemmets klientvej, uændret RLS);
 * et nej (fund 13) holder dialogen åben med grunden.
 *
 * Rådets runde 2:
 *   - (1) Tallet forudfyldes af danskTalTilFelt («2,125» — ikke String(2.125) =
 *     «2.125», som danskTal læste som 2125), og KUN felter, medlemmet faktisk har
 *     ændret, gemmes: hvert felt sammenlignes med sin STARTVÆRDI SOM TEKST
 *     (`start`), så et uberørt felt aldrig parses og aldrig skrives.
 *   - (4) try/finally om onGem — et kast låser ikke «Gemmer…».
 *   - (6) danskTalDom's egen grund («Skriv kun tallet — uden kr., % eller mio.»)
 *     vises, når den findes.
 *   - (8) Også for et GAMMELT mål (art null) afvises en TASTET frist før i dag;
 *     en uændret frist i fortiden blokerer ikke en titelrettelse.
 */
export const FRIST_FOER_I_DAG = "Fristen kan ikke ligge før i dag";
export const TALLET_NU_MANGLER = "Skriv tallet som det er nu";

export const REDIGER_TITEL = "Redigér målet";
export const REDIGER_TALLET_NU = "Tallet nu";

type Felter = { title?: string; deadline?: Date | null; current_value?: number };

type Props = {
  kort: MaalKort | null;
  open: boolean;
  onClose: () => void;
  /** Grunden til, at fristen ikke må være denne dato («YYYY-MM-DD») — mod målets åbne skridt; null = ok. */
  doemFrist: (dato: string | null) => string | null;
  /** Det tastede tal i dag (kun andet_tal); null ellers. */
  tastetTal: number | null;
  /** Enheden («kunder») for et tastet tal. */
  enhed: string | null;
  /** Gemmer; svarer med fejlteksten ordret, eller null ved ja (fund 13). */
  onGem: (felter: Felter) => Promise<string | null>;
  nu: Date;
};

export const RedigerMaalDialog = ({ kort, open, onClose, doemFrist, tastetTal, enhed, onGem, nu }: Props) => {
  // Hooks i TOPBLOKKEN, før enhver betinget return (React #310).
  const [titel, setTitel] = useState("");
  const [frist, setFrist] = useState("");
  const [tal, setTal] = useState("");
  const [fejl, setFejl] = useState<string | null>(null);
  const [fristFejl, setFristFejl] = useState<string | null>(null);
  const [gemmer, setGemmer] = useState(false);
  // Runde 2, fund 1: startværdierne som TEKST — et felt, der står som ved åbningen, gemmes aldrig.
  const [start, setStart] = useState({ titel: "", frist: "", tal: "" });
  const gemmerRef = useRef(false);
  const idRod = useId();
  // Startværdierne læses gennem en ref, så effekten kun kører ved åbning og ved et andet mål (fund 2).
  const startRef = useRef({ kort, tastetTal });
  startRef.current = { kort, tastetTal };
  const kortId = kort?.id ?? null;

  useEffect(() => {
    if (!open || kortId === null) return;
    const s = startRef.current;
    const startVaerdier = { titel: s.kort?.titel ?? "", frist: s.kort?.frist ?? "", tal: danskTalTilFelt(s.tastetTal) };
    setStart(startVaerdier);
    setTitel(startVaerdier.titel);
    setFrist(startVaerdier.frist);
    setTal(startVaerdier.tal);
    setFejl(null);
    setFristFejl(null);
    setGemmer(false);
    gemmerRef.current = false;
  }, [open, kortId]);

  if (!open || !kort) return null;
  const erTastet = kort.art === "tal" && kort.noegle === "andet_tal";
  const kraeverFrist = kort.art !== null;
  const idag = kbhDato(nu);
  const senest = laegMaanederTilDato(idag, MAKS_FRIST_MAANEDER);

  const gem = async () => {
    if (gemmerRef.current) return;
    const t = titel.trim();
    if (!t) { setFejl("Skriv målet som én sætning"); return; }
    // Runde 2, fund 1: ændret = teksten i feltet er en anden end ved åbningen.
    const titelAendret = titel !== start.titel;
    const fristAendret = frist.trim() !== start.frist;
    const talAendret = tal !== start.tal;
    let nyFrist = frist.trim() || null;
    if (kraeverFrist) {
      const fristDom = doemMaalFrist(nyFrist, nu);
      if (fristDom.ok === false) { setFristFejl(fristDom.grund); return; }
      nyFrist = fristDom.dato;
    } else if (fristAendret && nyFrist !== null) {
      // Runde 2, fund 8: et gammelt mål må stå uden frist, men en TASTET frist må ikke ligge før i dag.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nyFrist)) { setFristFejl("Vælg en frist"); return; }
      if (nyFrist < idag) { setFristFejl(FRIST_FOER_I_DAG); return; }
    }
    const grund = doemFrist(nyFrist);
    if (grund) { setFristFejl(grund); return; }
    const felter: Felter = {};
    if (titelAendret && t !== kort.titel) felter.title = t;
    if (fristAendret && nyFrist !== (kort.frist ?? null)) {
      if (nyFrist) {
        const [y, m, d] = nyFrist.split("-").map(Number);
        felter.deadline = new Date(y, m - 1, d);
      } else {
        felter.deadline = null;
      }
    }
    if (erTastet && talAendret) {
      const d = danskTalDom(tal);
      if (d.vaerdi === null) { setFejl(d.grund ?? TALLET_NU_MANGLER); return; }
      if (d.vaerdi !== tastetTal) felter.current_value = d.vaerdi;
    }
    setFejl(null);
    setFristFejl(null);
    if (Object.keys(felter).length === 0) { onClose(); return; }
    gemmerRef.current = true;
    setGemmer(true);
    let svar: string | null;
    try {
      // Runde 2, fund 4: et kast fra skriveren låser ikke «Gemmer…».
      svar = await onGem(felter);
    } catch (e) {
      svar = e instanceof Error && e.message ? e.message : "Målet blev ikke gemt — prøv igen";
    } finally {
      gemmerRef.current = false;
      setGemmer(false);
    }
    if (svar) { setFejl(svar); return; }
    onClose();
  };

  return (
    <HbDialog
      open={open}
      onClose={onClose}
      titel={REDIGER_TITEL}
      fod={
        <>
          <HbButton variant="secondary" onClick={onClose} disabled={gemmer}>Annuller</HbButton>
          <HbButton onClick={() => void gem()} disabled={gemmer} data-rediger-gem>{gemmer ? "Gemmer…" : "Gem"}</HbButton>
        </>
      }
    >
      <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); void gem(); }} data-rediger-maal={kort.id}>
        <HbField label="Målet som én sætning" htmlFor={`${idRod}-titel`}>
          <HbInput id={`${idRod}-titel`} value={titel} maxLength={TITEL_MAX} autoFocus onChange={(e) => setTitel(e.target.value)} />
        </HbField>
        {erTastet && (
          <HbField label={REDIGER_TALLET_NU} htmlFor={`${idRod}-tal`} help={enhed ? `I ${enhed}.` : undefined}>
            <HbInput id={`${idRod}-tal`} inputMode="decimal" value={tal} onChange={(e) => setTal(e.target.value)} />
          </HbField>
        )}
        <HbField label="Frist" htmlFor={`${idRod}-frist`} error={fristFejl} help={kraeverFrist ? "Efter i dag, højst 36 måneder frem — og ikke før et åbent skridts frist." : "Ikke før et åbent skridts frist."}>
          <HbInput id={`${idRod}-frist`} type="date" value={frist} min={idag} max={senest} required={kraeverFrist} onChange={(e) => { setFrist(e.target.value); setFristFejl(null); }} />
        </HbField>
        {fejl && <p className="text-sm text-hb-rust" role="alert" data-rediger-fejl>{fejl}</p>}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">Gem</button>
      </form>
    </HbDialog>
  );
};
