/**
 * src/lib/hjemmebane/hoejreKolonne.ts — opsætningen af højre kolonne på
 * rådgivernes forside (30/9-2026). Ren: ingen React, ingen Supabase.
 *
 * JONAS 30/9 (ordret): «højre kolonne … er blevet uoverskuelig. Der er meget
 * almindelig tekst i én lang køre. Det må kunne sættes pænere op og have et
 * lidt bedre design.» Det godkendte design: hver sektion et kort, tal før
 * tekst; «I dag» som fire felter i et 2×2-gitter med prik (grøn = i orden,
 * orange = noget venter); «Mangler at booke» som to foldbare rækker (fem ad
 * gangen + «Vis alle N»); Svartids-uret med en lille tabel og en pille;
 * Pulsen som fremdriftsbjælker og mærker.
 *
 * INGEN DATA, INGEN DOMME HER. Alle tal kommer fra de domme, fladen allerede
 * kører (dagensSessioner, onlineMedlemmer, ubesvaredeOpslag,
 * venterPaaBetaling, svartidsUret, afgoerPulsen/pulsLinjer, kohorteLinje).
 * Denne fil afgør kun, HVORDAN et tal står: hvilken prik, hvilket ord,
 * hvor mange navne der vises, hvilken bjælke. Derfor ingen hentning og
 * ingen filtrering af rækker.
 *
 * FARVE ALDRIG ALENE: hver prik har et ord ved siden af (feltDom.statusTekst),
 * så betydningen står i teksten — prikken gentager den kun.
 */
import { fornyelserTekst, pulsLinjer, staarOeverstTekst, SVAR_VINDUE_DAGE, tavseTekst, type Pulsen, type PulsNoegle } from "@/lib/pulsen";
import { GROEN_TIMER, GUL_TIMER, MIN_N, procentTekst, timerTekst, type Streak, type SvartidTal } from "@/lib/svartid";

// ── «I dag»: de fire felter ───────────────────────────────────────────────

export type FeltSlags = "sessioner" | "online" | "opslag" | "betaling";
/** i_orden = grøn prik; venter = orange prik («noget venter»). */
export type FeltTone = "i_orden" | "venter";

export interface FeltDom {
  tone: FeltTone;
  /** 0 → lille og rolig (mindre tal, dæmpet farve). */
  rolig: boolean;
  /** Ordet ved prikken — betydningen står her, ikke kun i farven. */
  statusTekst: string;
}

/** Ordene pr. felt: [ved 0, ved N]. Online nu venter aldrig på nogen — at
    medlemmer har appen åben, er godt, ikke en opgave. */
const FELT_ORD: Readonly<Record<FeltSlags, { nul: string; flere: string; venterVedFlere: boolean }>> = {
  sessioner: { nul: "Ingen i dag", flere: "Står i kalenderen", venterVedFlere: true },
  online: { nul: "Ingen lige nu", flere: "Har appen åben", venterVedFlere: false },
  opslag: { nul: "Alle besvaret", flere: "Venter på svar", venterVedFlere: true },
  betaling: { nul: "Ingen venter", flere: "Har ikke betalt", venterVedFlere: true },
};

export function feltDom(slags: FeltSlags, antal: number): FeltDom {
  const ord = FELT_ORD[slags];
  if (antal <= 0) return { tone: "i_orden", rolig: true, statusTekst: ord.nul };
  return { tone: ord.venterVedFlere ? "venter" : "i_orden", rolig: false, statusTekst: ord.flere };
}

/** Feltets ord ved en fejl — den fulde hentefejltekst står under gitteret. */
export const FELT_FEJL_TEKST = "Kunne ikke hentes";

/** Online nu i et felt: højst fem profilbilleder (32 px, højst to linjer i
    et halvt gitter, også på en telefon); resten som «+N». Navnet står i
    title/aria-label på hvert billede. */
export const ONLINE_FELT_LOFT = 5;

// ── Foldbare lister: fem ad gangen ───────────────────────────────────────

export const FOLD_LOFT = 5;

/** De navne der vises, og hvor mange der er skjult bag «Vis alle N». */
export function foldUdsnit<T>(liste: readonly T[], visAlle: boolean, loft: number = FOLD_LOFT): { viste: T[]; skjulte: number } {
  const viste = visAlle ? [...liste] : liste.slice(0, loft);
  return { viste, skjulte: liste.length - viste.length };
}

/** «Vis alle 19». */
export const visAlleTekst = (antal: number): string => `Vis alle ${antal}`;

// ── Fremdriftsbjælker ────────────────────────────────────────────────────

/** Andelen 0–1, til bjælkens bredde. y ≤ 0 → 0 (ingen bjælke at fylde);
    x over y (skulle ikke ske) klippes til 1. */
export function andel(x: number, y: number): number {
  if (y <= 0 || x <= 0) return 0;
  return Math.min(1, x / y);
}

/** Bjælkens bredde som CSS-procent, afrundet til hele procent. */
export const bredde = (x: number, y: number): string => `${Math.round(andel(x, y) * 100)}%`;

export interface PulsBjaelke {
  noegle: PulsNoegle;
  etiket: string;
  x: number;
  y: number;
  /** pulsLinjer's eget link (én virksomhed → den; flere → ?puls=); null ved 0. */
  to: string | null;
}

export interface PulsMaerke {
  noegle: string;
  tekst: string;
  to: string | null;
  /** Rust: kun de tavse, som før (en tavs kunde er en advarsel). */
  advarsel: boolean;
}

/**
 * Pulsen sat op: to bjælker (rapporteret, svaret på forslag — X af porteføljen)
 * og mærkerne (tavse med fordelingen, fornyelser). Tallene er afgoerPulsens;
 * linkene er pulsLinjers — de regnes ikke igen her. Fordelingens nul-grupper
 * udelades, som i tavseLinjeTekst.
 */
export function pulsVisning(p: Pulsen): { bjaelker: PulsBjaelke[]; maerker: PulsMaerke[] } {
  const to = new Map(pulsLinjer(p).map((l) => [l.noegle, l.to]));
  const f = p.tavseFordeling;
  const maerker: PulsMaerke[] = [
    { noegle: "tavse", tekst: tavseTekst(p.tavse.antal), to: to.get("tavse") ?? null, advarsel: p.tavse.antal > 0 },
    ...(f.oeverst > 0 ? [{ noegle: "oeverst", tekst: `${f.oeverst} står øverst`, to: null, advarsel: false }] : []),
    ...(f.ikkeKommetInd > 0 ? [{ noegle: "ikke_kommet_ind", tekst: `${f.ikkeKommetInd} ikke kommet ind`, to: null, advarsel: false }] : []),
    ...(f.udloebet > 0 ? [{ noegle: "udloebet", tekst: `${f.udloebet} ${f.udloebet === 1 ? "udløbet" : "udløbne"}`, to: null, advarsel: false }] : []),
    ...(f.lukket > 0 ? [{ noegle: "lukket", tekst: `${f.lukket} ${f.lukket === 1 ? "lukket" : "lukkede"}`, to: null, advarsel: false }] : []),
    {
      noegle: "fornyelser",
      tekst: `${fornyelserTekst(p.fornyelser.antal)}${staarOeverstTekst(p.oeverst.fornyelser)}`,
      to: to.get("fornyelser") ?? null,
      advarsel: false,
    },
  ];
  return {
    bjaelker: [
      { noegle: "rapporterer", etiket: `Har rapporteret ${p.maanedNavn}`, x: p.rapporterer.antal, y: p.iAlt, to: to.get("rapporterer") ?? null },
      { noegle: "svarer", etiket: `Har svaret på et forslag (${SVAR_VINDUE_DAGE} dage)`, x: p.svarer.antal, y: p.iAlt, to: to.get("svarer") ?? null },
    ],
    maerker,
  };
}

/** Kohortens bjælke: «Kom igen efter dag 1», n af m (kohorteLinje). */
export const KOHORTE_BJAELKE_ETIKET = "Kom igen efter dag 1";

// ── Svartids-uret: tabellen og pillen ────────────────────────────────────

export interface SvartidRaekke {
  etiket: string;
  uge: string;
  maaned: string;
}

const STREG = "—";

function celle(t: SvartidTal, felt: "median" | "4t" | "24t" | "n"): string {
  if (felt === "n") return String(t.n);
  // For få svar: tallene er ikke tal (lib/svartid MIN_N) — som før, hvor
  // vindueTekst kun sagde «for få svar».
  if (t.forFaa) return STREG;
  if (felt === "median") return t.medianHverdagstimer === null ? STREG : timerTekst(t.medianHverdagstimer);
  const a = felt === "4t" ? t.andelInden4t : t.andelInden24t;
  return a === null ? STREG : procentTekst(a);
}

/** Tabellens fire rækker, kolonnerne 7 og 30 dage — dommens tal, kun sat op. */
export function svartidRaekker(uge: SvartidTal, maaned: SvartidTal): SvartidRaekke[] {
  return [
    { etiket: "Median", uge: celle(uge, "median"), maaned: celle(maaned, "median") },
    { etiket: `Andel < ${GROEN_TIMER} t`, uge: celle(uge, "4t"), maaned: celle(maaned, "4t") },
    { etiket: `Andel < ${GUL_TIMER} t`, uge: celle(uge, "24t"), maaned: celle(maaned, "24t") },
    { etiket: "Antal svar", uge: celle(uge, "n"), maaned: celle(maaned, "n") },
  ];
}

/** «For få svar (3 af mindst 5)» under tabellen, når en kolonne er streger. */
export function forFaaNote(uge: SvartidTal, maaned: SvartidTal): string | null {
  const dele = [
    uge.forFaa ? `7 dage: ${uge.n} af mindst ${MIN_N}` : null,
    maaned.forFaa ? `30 dage: ${maaned.n} af mindst ${MIN_N}` : null,
  ].filter((d): d is string => d !== null);
  return dele.length === 0 ? null : `For få svar til tal (${dele.join(" · ")}).`;
}

/** Pillens korte tekst — hele sætningen (streakTekst) står i title. */
export function streakPille(s: Streak): string {
  if (s.brudtNu) return "Streak brudt";
  const dage = s.dage === 1 ? "1 dag" : `${s.dage} dage`;
  return `${s.mindst ? "Mindst " : ""}${dage} i træk`;
}

/** Knappen på «Ældste ubesvarede»: «Svar Floren Engros →». */
export const svarKnapTekst = (navn: string | null): string => `Svar ${navn ?? "samtalen"} →`;
