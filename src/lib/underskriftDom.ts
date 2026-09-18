/**
 * src/lib/underskriftDom.ts
 *
 * Spejlet ordret i supabase/functions/_shared/underskriftDom.ts — enhver
 * ændring her SKAL også laves der. Pariteten håndhæves af
 * src/lib/__tests__/underskriftDomParitet.test.ts (kroppen er byte-ens,
 * filhovedet er den eneste forskel). Nul imports, så filen kan loades af
 * både Vite/Vitest (Node) og Deno.
 *
 * Rene domme for husets egen e-underskrift af aftalegrundlaget (18/9-2026,
 * udkast). Ingen IO, ingen Supabase, ingen React — samme input giver altid
 * samme output, og `now` gives altid udefra (aldrig Date.now() herinde).
 *
 * REGLERNE (Jonas 18/9: «mailkode er nok, ingen sms»; chattens design 17/9):
 *   - Linket udløber LINK_GYLDIG_DAGE = 21 dage efter afsendelsen —
 *     aftalegrundlagets levetid. Efter udløb kan der hverken bestilles kode
 *     eller underskrives; siden siger at fristen er passeret.
 *   - Koden er KODE_CIFRE = 6 cifre, gyldig KODE_GYLDIG_MINUTTER = 15
 *     minutter, højst KODE_MAX_FORSOEG = 5 forsøg. Femte forkerte forsøg
 *     låser koden; en ny kan bestilles. Ny kode erstatter den gamle.
 *   - En ny kode kan tidligst bestilles NY_KODE_PAUSE_SEKUNDER efter den
 *     forrige — værn mod at nogen fylder en fremmed indbakke.
 *   - NAVNET OG KRYDSET ER UNDERSKRIFTEN; koden beviser hvem (adgang til
 *     postkassen), sporet beviser hvornår. Navnet skal derfor være et
 *     navn: mindst to tegn, mindst ét bogstav, højst 120 tegn.
 *   - Dokumentet FASTFRYSES ved afsendelsen: teksten gøres kanonisk
 *     (kanoniskTekst) FØR aftrykket regnes, så et linjeskift af den
 *     forkerte slags aldrig giver et andet aftryk af den samme tekst.
 *
 * ADGANG VED BETALING — AFGJORT (Jonas 18/9, ordret: «De får adgang ved
 * betaling, hvilket er bygget.»). Udkastet havde et flag med begge veje;
 * «underskrift» (invitation ved underskriften, kontraktår fra
 * underskriftsdagen) blev overvejet og FRAVALGT. Underskriften rører
 * derfor hverken invitationen eller kontraktåret: begge skrives af
 * stripe-webhook ved betalingen, som i dag (docs/indgangen-design.md §3,
 * §21). Denne fil kender ingen adgangsdom.
 */

export const KODE_CIFRE = 6;
export const KODE_GYLDIG_MINUTTER = 15;
export const KODE_MAX_FORSOEG = 5;
export const NY_KODE_PAUSE_SEKUNDER = 30;
export const LINK_GYLDIG_DAGE = 21;

const MS_PR_DAG = 86_400_000;
const MS_PR_MINUT = 60_000;

function tid(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

// ── Aftalens tilstand ─────────────────────────────────────────────────

export type Aftalestatus = "sendt" | "underskrevet" | "annulleret";

export interface AftaleInput {
  status: Aftalestatus;
  /** aftale_underskrift.sendt_at — ankeret for de 21 dage. */
  sendt_at: string;
  underskrevet_at: string | null;
}

export type Aftaletilstand =
  | { tilstand: "kan_underskrives"; udloeber_at: string; dage_tilbage: number }
  | { tilstand: "underskrevet"; underskrevet_at: string }
  | { tilstand: "udloebet"; udloeb_at: string }
  | { tilstand: "annulleret" }
  /** Ulæseligt stempel: fail-closed — hverken kode eller underskrift. */
  | { tilstand: "ugyldig" };

/** Udløbet som præcist tidsstempel: sendt_at + 21 × 24 timer. Null ved ulæselig sendt_at. */
export function linkUdloeb(sendtAt: string): Date | null {
  const t = tid(sendtAt);
  return t === null ? null : new Date(t + LINK_GYLDIG_DAGE * MS_PR_DAG);
}

export function afgoerAftaletilstand(a: AftaleInput, now: Date): Aftaletilstand {
  // Det der ER sket, vinder over det der kunne ske: en underskrevet aftale
  // er underskrevet, også efter dag 21; en annulleret er annulleret.
  if (a.status === "underskrevet") {
    return { tilstand: "underskrevet", underskrevet_at: a.underskrevet_at ?? a.sendt_at };
  }
  if (a.status === "annulleret") return { tilstand: "annulleret" };

  const udloeb = linkUdloeb(a.sendt_at);
  if (udloeb === null) return { tilstand: "ugyldig" };
  if (now.getTime() >= udloeb.getTime()) return { tilstand: "udloebet", udloeb_at: udloeb.toISOString() };

  const dage_tilbage = Math.ceil((udloeb.getTime() - now.getTime()) / MS_PR_DAG);
  return { tilstand: "kan_underskrives", udloeber_at: udloeb.toISOString(), dage_tilbage };
}

// ── Koden ─────────────────────────────────────────────────────────────

export interface KodeInput {
  oprettet_at: string;
  /** Antal FORKERTE forsøg indtil nu. */
  forsoeg: number;
  brugt_at: string | null;
  /** Sat når en nyere kode er bestilt — den gamle gælder ikke længere. */
  erstattet_at: string | null;
}

export type Kodedom = "gyldig" | "brugt" | "erstattet" | "laast" | "udloebet" | "ugyldig";

export function afgoerKode(k: KodeInput, now: Date): Kodedom {
  if (k.brugt_at) return "brugt";
  if (k.erstattet_at) return "erstattet";
  if (k.forsoeg >= KODE_MAX_FORSOEG) return "laast";
  const t = tid(k.oprettet_at);
  if (t === null) return "ugyldig";
  if (now.getTime() >= t + KODE_GYLDIG_MINUTTER * MS_PR_MINUT) return "udloebet";
  return "gyldig";
}

export type Indtastningsudfald =
  | { udfald: "ok" }
  | { udfald: "forkert"; forsoeg_tilbage: number }
  | { udfald: "laast" }
  | { udfald: "udloebet" }
  | { udfald: "brugt" }
  | { udfald: "erstattet" }
  | { udfald: "ingen_kode" };

/**
 * Dommen over én indtastning. `matcher` er sammenligningen af hash'ene
 * (gjort udenfor, i konstant tid) — dommen ved intet om selve koden.
 * Rækkefølgen: findes → brugt/erstattet/låst/udløbet → matcher.
 * Et forkert forsøg tæller kun mens koden er gyldig; det femte forkerte
 * låser (forsoeg_tilbage 0 → «laast»), og et forsøg mod en låst kode
 * tæller ikke yderligere.
 */
export function afgoerIndtastning(kode: KodeInput | null, matcher: boolean, now: Date): Indtastningsudfald {
  if (!kode) return { udfald: "ingen_kode" };
  const dom = afgoerKode(kode, now);
  if (dom === "brugt") return { udfald: "brugt" };
  if (dom === "erstattet") return { udfald: "erstattet" };
  if (dom === "laast") return { udfald: "laast" };
  if (dom === "udloebet" || dom === "ugyldig") return { udfald: "udloebet" };
  if (matcher) return { udfald: "ok" };
  const forsoeg_tilbage = KODE_MAX_FORSOEG - (kode.forsoeg + 1);
  return forsoeg_tilbage <= 0 ? { udfald: "laast" } : { udfald: "forkert", forsoeg_tilbage };
}

/** Må der bestilles en ny kode nu? Pausen regnes fra den seneste kodes oprettelse. */
export function maaBestilleNyKode(
  sidsteOprettetAt: string | null,
  now: Date,
): { ok: true } | { ok: false; vent_sekunder: number } {
  const t = tid(sidsteOprettetAt);
  if (t === null) return { ok: true };
  const klarVed = t + NY_KODE_PAUSE_SEKUNDER * 1000;
  if (now.getTime() >= klarVed) return { ok: true };
  return { ok: false, vent_sekunder: Math.ceil((klarVed - now.getTime()) / 1000) };
}

/**
 * Seks cifre fra en injiceret ciffer-kilde (0–9). I drift gives
 * crypto.getRandomValues-baseret kilde; i test en deterministisk. Førende
 * nuller er lovlige — «004217» er en kode, ikke tallet 4217.
 */
export function nyKode(tilfaeldigtCiffer: () => number): string {
  let kode = "";
  for (let i = 0; i < KODE_CIFRE; i++) {
    const c = Math.floor(tilfaeldigtCiffer());
    if (!Number.isInteger(c) || c < 0 || c > 9) throw new Error(`ciffer-kilden gav ${String(c)} — skal være 0–9`);
    kode += String(c);
  }
  return kode;
}

/** Det medlemmet taster, renset: kun cifre, mellemrum fjernet. Null når det ikke er seks cifre. */
export function rensKode(indtastet: string): string | null {
  const cifre = indtastet.replace(/\s+/g, "");
  return new RegExp(`^\\d{${KODE_CIFRE}}$`).test(cifre) ? cifre : null;
}

// ── Navnet ────────────────────────────────────────────────────────────

export type Navnedom = { ok: true; navn: string } | { ok: false; grund: "tomt" | "for_kort" | "for_langt" | "uden_bogstav" };

/** Navnet som underskrift: trimmet, indre mellemrum samlet, 2–120 tegn, mindst ét bogstav. */
export function afgoerNavn(indtastet: string): Navnedom {
  const navn = indtastet.replace(/\s+/g, " ").trim();
  if (!navn) return { ok: false, grund: "tomt" };
  if (navn.length < 2) return { ok: false, grund: "for_kort" };
  if (navn.length > 120) return { ok: false, grund: "for_langt" };
  if (!/\p{L}/u.test(navn)) return { ok: false, grund: "uden_bogstav" };
  return { ok: true, navn };
}

// ── Dokumentet ────────────────────────────────────────────────────────

/**
 * Kanonisk tekst FØR aftrykket: CRLF/CR → LF, efterstillede blanktegn pr.
 * linje væk, tomme linjer i start og slut væk, INGEN afsluttende linjeskift.
 * Samme tekst → samme aftryk, uanset hvilken editor den kom fra.
 */
export function kanoniskTekst(tekst: string): string {
  return tekst
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/**
 * Udfylder {{felt}}-pladsholdere i skabelonen. Ukendte pladsholdere
 * efterlades og meldes i `manglende`, så en aftale aldrig sendes med et
 * «{{pris}}» stående i teksten. Feltnavne: bogstaver, tal, underscore.
 */
export function udfyldSkabelon(skabelon: string, felter: Record<string, string>): { tekst: string; manglende: string[] } {
  const manglende = new Set<string>();
  const tekst = skabelon.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (hele, navn: string) => {
    if (Object.prototype.hasOwnProperty.call(felter, navn)) return felter[navn];
    manglende.add(navn);
    return hele;
  });
  return { tekst, manglende: [...manglende].sort() };
}

// ── Småting til fladen ────────────────────────────────────────────────

/** «j***@topix.dk» — nok til at genkende postkassen, ikke nok til at skrive til den. */
export function maskerEmail(email: string): string {
  const [lokal, domaene] = email.trim().toLowerCase().split("@");
  if (!domaene) return "***";
  return `${lokal.slice(0, 1)}***@${domaene}`;
}
