/**
 * minde — hvad er prøvet før, hvornår, og hvad skete der.
 *
 * UDEN DET FORESLÅR AGENTEN DET SAMME HVER MÅNED, og Jonas holder op med at
 * læse den. Det er ikke en pænhed: en agent uden hukommelse er en agent, der
 * gentager sin egen afviste idé, indtil nogen slukker den.
 *
 * INGEN NY TABEL — OG DET ER POINTEN. `klaviyo_spor` (migration
 * 20260919210000, lag 3) gemmer allerede HVER skrivning til Klaviyo med
 * `handling`, `klaviyo_id`, `foer`, `efter`, `aendringer`, `toerkoersel` og
 * `created_at`. Det er præcis «hvad blev prøvet og hvornår».
 *
 * «HVAD SKETE DER» GEMMES DERIMOD IKKE — DET REGNES. En gemt dom ville være
 * forældet i samme øjeblik næste webinar kom ind, og to kilder til samme
 * sandhed ville før eller siden være uenige. Udfaldet af en ændring er
 * målingen EFTER den, og den regnes hver gang af `doemMinde`.
 *
 * Ren dom. Sporrækkerne gives ind; hentningen hører til lag 5.
 */
import { doemNiveau, SESSIONER_FOR_MOENSTER, type Niveau } from "./maalingsdom";

/** Rækken fra klaviyo_spor, reduceret til det mindet bruger. */
export interface Sporraekke {
  id: string;
  created_at: string;
  handling: string;
  klaviyo_id: string | null;
  klaviyo_type: string;
  toerkoersel: boolean;
  /** 'toerkoersel' | 'skrevet' | 'afvist' | 'fejl' — kun 'skrevet' nåede frem. */
  udfald: string;
  /** Hvad der faktisk blev ændret. Tom liste = ingenting blev rørt. */
  aendringer: readonly { felt: string; foer?: unknown; efter?: unknown }[];
}

/** En session, med sin tid — så «efter ændringen» kan tælles. */
export interface SessionTid {
  session_id: string;
  session_tid: string;
}

export interface Aendring {
  id: string;
  /** Hvornår den blev skrevet, i dansk kalenderdag. */
  dato: string;
  hvad: string;
  klaviyo_id: string | null;
  felter: string[];
  /** Sessioner afholdt EFTER ændringen. Under tærsklen kan intet aflæses. */
  sessionerEfter: number;
  /** Kan der siges noget om VIRKNINGEN endnu? */
  kanAflaeses: boolean;
  saetning: string;
}

const tid = (iso: string | null | undefined): number | null => {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

const dansk = (iso: string): string =>
  new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", timeZone: "Europe/Copenhagen" }).format(new Date(iso));

/**
 * Hvad der er prøvet, nyeste først — og for hver: om virkningen kan aflæses.
 *
 * KUN DET, DER FAKTISK BLEV ÆNDRET, TÆLLER. Tre slags rækker holdes ude:
 *   · tørkørsler (`toerkoersel`) — intet blev sendt;
 *   · alt hvor `udfald` ikke er «skrevet» — afvist eller fejlet undervejs;
 *   · skrivninger med tom `aendringer`-liste — intet flyttede sig.
 * En agent, der tror den har prøvet noget, den kun simulerede eller fik afvist,
 * gentager sig selv uden at vide det. Og en afvist ændring er ikke et forsøg,
 * der skal måles — grunden til afvisningen står i sporets `grund` og hører til
 * lag 4, ikke her.
 */
export function doemMinde(spor: readonly Sporraekke[], sessioner: readonly SessionTid[]): Aendring[] {
  const tider = sessioner.map((s) => tid(s.session_tid)).filter((t): t is number => t !== null);
  return spor
    .filter((r) => r.toerkoersel === false && r.udfald === "skrevet" && r.aendringer.length > 0 && tid(r.created_at) !== null)
    // Nyeste FØRST — sorteret på skrivetidspunktet, før dommen regnes. Rækkefølgen
    // er ikke pynt: `doemBudget` tager den første, der ikke kan aflæses, og den
    // skal være den SENESTE af dem.
    .sort((a, b) => (tid(b.created_at) as number) - (tid(a.created_at) as number))
    .map((r) => {
      const t = tid(r.created_at) as number;
      const efter = tider.filter((s) => s > t).length;
      const kan = efter >= SESSIONER_FOR_MOENSTER;
      const felter = [...new Set(r.aendringer.map((a) => a.felt).filter((f) => typeof f === "string" && f !== ""))];
      const hvad = `${r.handling.replace(/_/g, " ")}${r.klaviyo_id ? ` (${r.klaviyo_type} ${r.klaviyo_id})` : ""}`;
      return {
        id: r.id,
        dato: dansk(r.created_at),
        hvad,
        klaviyo_id: r.klaviyo_id,
        felter,
        sessionerEfter: efter,
        kanAflaeses: kan,
        saetning: kan
          ? `${hvad} — ændret ${dansk(r.created_at)}, ${efter} webinarer siden. Virkningen kan aflæses.`
          : `${hvad} — ændret ${dansk(r.created_at)}, kun ${efter} ${efter === 1 ? "webinar" : "webinarer"} siden. FOR TIDLIGT AT SIGE NOGET; der skal være ${SESSIONER_FOR_MOENSTER}.`,
      };
    });
}

// ── Grænsen for hvor meget der må ændres ad gangen ─────────────────────────

export interface Aendringsbudget {
  /** Hvor mange ændringer der må laves nu. 0 eller 1. */
  tilbage: number;
  /** Den seneste ændring, der endnu ikke kan aflæses. */
  venterPaa: Aendring | null;
  saetning: string;
}

/**
 * Må der ændres noget nu?
 *
 * ÉN AD GANGEN, og reglen håndhæves af ventetiden, ikke af en optælling:
 * findes der en ændring, hvis virkning endnu ikke kan aflæses, er budgettet
 * brugt. Det er strengere end «højst én åben ad gangen» og enklere at forstå
 * — og det gør det umuligt at stable to ændringer oven på hinanden og bagefter
 * skulle gætte, hvilken der flyttede tallet.
 *
 * Bemærk hvad det IKKE forbyder: at rette en åbenlys fejl (et forkert link, en
 * stavefejl). Den slags er ikke et forsøg og hører ikke under budgettet — men
 * den skal skrives i sporet alligevel, så den ikke bagefter forveksles med en
 * ændring, der skulle måles.
 */
export function doemBudget(minde: readonly Aendring[], niveau: Niveau): Aendringsbudget {
  const aaben = minde.find((a) => !a.kanAflaeses) ?? null;
  if (aaben !== null) {
    return {
      tilbage: 0,
      venterPaa: aaben,
      saetning: `INGEN NYE ÆNDRINGER NU. «${aaben.hvad}» blev ændret ${aaben.dato}, og der er kun gået ${aaben.sessionerEfter} ${aaben.sessionerEfter === 1 ? "webinar" : "webinarer"}. Ændres noget mere nu, kan ingen bagefter sige hvilken ændring der flyttede tallet.`,
    };
  }
  if (niveau === "observation") {
    return {
      tilbage: 0,
      venterPaa: null,
      saetning: "INGEN NYE ÆNDRINGER NU. Der er ikke webinarer nok til at vide, hvad der virker — en ændring truffet nu rammer lige så ofte det, der virkede.",
    };
  }
  return {
    tilbage: 1,
    venterPaa: null,
    saetning: `Der må ændres ÉN ting. Derefter skal der gå ${SESSIONER_FOR_MOENSTER} webinarer, før den næste.`,
  };
}

/**
 * Er forslaget prøvet før? Sammenligner på de FELTER, der blev rørt — ikke på
 * en fri tekst, som to formuleringer af samme idé aldrig ville matche på.
 */
export function erProevetFoer(felter: readonly string[], minde: readonly Aendring[]): Aendring | null {
  if (felter.length === 0) return null;
  const soegt = new Set(felter);
  return minde.find((a) => a.felter.length > 0 && a.felter.every((f) => soegt.has(f)) && a.felter.length === soegt.size) ?? null;
}
