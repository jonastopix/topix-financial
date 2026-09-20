/**
 * _shared/klaviyoHentning.ts — sideløbning gennem Klaviyos hændelser.
 *
 * Bygger OVENPÅ `klaviyo.ts:kald` (lag 2), rører den ikke. Det var hele pointen
 * med at gøre `kald` generisk over sti og metode.
 *
 * ── HISTORIK, IKKE ØJEBLIKSBILLEDE ──────────────────────────────────────────
 * Hver hændelse bliver én række, og rækkerne bliver liggende. Et øjebliksbillede
 * («hvor mange åbnede sidste webinar?») kan ikke regnes bagud, når spørgsmålet
 * tre måneder senere er et andet. En række kan.
 *
 * ── HVORFOR STIGENDE SORTERING ──────────────────────────────────────────────
 * Vi henter `sort=datetime` (stigende) fra et vandmærke og fremad. Faldende
 * sortering ville betyde, at en afbrudt kørsel efterlader et hul i midten, som
 * ingen senere kørsel leder efter. Stigende + vandmærke kan altid genoptages:
 * det værste, en afbrydelse koster, er at samme side hentes igen.
 *
 * ── HVORFOR `greater-or-equal` OG IKKE `greater-than` ───────────────────────
 * To hændelser kan dele sekund. Med `greater-than` ville den anden falde ud
 * mellem to kørsler og aldrig blive hentet. Med `greater-or-equal` hentes den
 * første igen — og afvises på `klaviyo_event_id`, som er unik i basen.
 * **En dublet er til at leve med; et hul er ikke.**
 *
 * ── LOFTET ──────────────────────────────────────────────────────────────────
 * Fra Klaviyos dokumentation (IKKE målt her, fordi MCP-laget ikke viser
 * `RateLimit-*`-headerne): GET /api/events har burst 350/s og 3500/m — rigeligt.
 * Hentningen er alligevel bygget med et tidsbudget og stopper ved 429, fordi
 * et loft, man først opdager i drift, er et loft, man rammer i drift.
 */

import { kald, type KlaviyoSvar } from "./klaviyo.ts";
import { laesHaendelse, erFlowHaendelse, type Mailart, type Mailhaendelsesraekke, METRIK } from "./klaviyoMailhaendelser.ts";

/** 1000 er Klaviyos maksimum pr. side (målt i API'ets egen feltbeskrivelse). */
export const SIDESTOERRELSE = 1000;

/** Samme budget som indgangs-paamindelser-cron. En cron, der ikke stopper selv, bliver stoppet. */
export const STANDARD_BUDGET_MS = 25_000;

/**
 * UDEN VANDMÆRKE STARTES FRA I DAG — IKKE FRA 2025 (Jonas 20/9). Den historiske
 * hentning køres i hånden med «fra» i bodyen, når nogen har besluttet det.
 * En cron, der på egen hånd trækker halvandet års hændelser, er en cron, ingen
 * så starte.
 */
export function startAfIDag(nu: Date): string {
  // Dansk dato → midnat dansk tid → ISO. Uden tidszonen ville «i dag» begynde
  // kl. 02 dansk tid, og en session kl. 01 ville falde i gårsdagen.
  const dk = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" }).format(nu);
  const midnatUtcGaet = new Date(`${dk}T00:00:00Z`);
  // Forskydningen mellem dansk og UTC den dag (1 eller 2 timer).
  const dkKl = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", hour12: false }).format(midnatUtcGaet));
  return new Date(midnatUtcGaet.getTime() - dkKl * 3_600_000).toISOString();
}

export interface HentningsResultat {
  art: Mailart;
  raekker: Mailhaendelsesraekke[];
  /** Nyeste hændelsestid vi nåede. Næste kørsels vandmærke. */
  naaet_til: string | null;
  sider: number;
  /** Alt hentet, eller stoppede vi undervejs? Afgør om vandmærket må rykkes. */
  faerdig: boolean;
  grund: "faerdig" | "budget" | "loft" | "fejl" | "ingen_noegle";
  /** Kampagnehændelser — set, talt, ikke gemt. */
  frasorteret_kampagner: number;
  ubrugelige: number;
}

export interface HentValg {
  noegle: string | null | undefined;
  art: Mailart;
  /** ISO. Hentes fra og med dette tidspunkt. */
  fra: string;
  budgetMs?: number;
  nu?: () => number;
  fetchImpl?: typeof fetch;
  /** Til prøver: maksimalt antal sider, så en løbsk løkke ikke kan blive en regning. */
  maksSider?: number;
}

interface Side {
  data?: unknown[];
  links?: { next?: string | null };
}

const cursorAf = (next: string | null | undefined): string | null => {
  if (!next) return null;
  const m = /[?&]page%5Bcursor%5D=([^&]+)/.exec(next) ?? /[?&]page\[cursor\]=([^&]+)/.exec(next);
  return m ? decodeURIComponent(m[1]) : null;
};

/**
 * Henter én arts hændelser fra `fra` og fremad. KASTER ALDRIG — `kald` gør det
 * ikke, og denne lægger ikke en ny kastende sti oven på.
 */
export async function hentArt(v: HentValg): Promise<HentningsResultat> {
  const ur = v.nu ?? (() => Date.now());
  const start = ur();
  const budget = v.budgetMs ?? STANDARD_BUDGET_MS;
  const maksSider = v.maksSider ?? 200;

  const raekker: Mailhaendelsesraekke[] = [];
  let cursor: string | null = null;
  let sider = 0;
  let naaetTil: string | null = null;
  let frasorteret = 0;
  let ubrugelige = 0;

  while (sider < maksSider) {
    if (ur() - start > budget) {
      return { art: v.art, raekker, naaet_til: naaetTil, sider, faerdig: false, grund: "budget", frasorteret_kampagner: frasorteret, ubrugelige };
    }

    const filter = `and(equals(metric_id,"${METRIK[v.art]}"),greater-or-equal(datetime,${v.fra}))`;
    const sti = `/events/?filter=${encodeURIComponent(filter)}&sort=datetime&page%5Bsize%5D=${SIDESTOERRELSE}`
      + (cursor ? `&page%5Bcursor%5D=${encodeURIComponent(cursor)}` : "");

    const svar: KlaviyoSvar<Side> = await kald<Side>(v.noegle, sti, { metode: "GET", fetchImpl: v.fetchImpl, nu: v.nu });
    sider += 1;

    if (!svar.ok) {
      const grund = svar.spor.udfald === "loft" ? "loft" : svar.spor.udfald === "ingen_noegle" ? "ingen_noegle" : "fejl";
      return { art: v.art, raekker, naaet_til: naaetTil, sider, faerdig: false, grund, frasorteret_kampagner: frasorteret, ubrugelige };
    }

    const data = Array.isArray(svar.krop?.data) ? svar.krop!.data : [];
    for (const h of data) {
      const r = laesHaendelse(v.art, h);
      if (!r) { ubrugelige += 1; continue; }
      // Vandmærket følger ALT, vi har set — også det, vi sorterede fra. Ellers
      // ville hver kørsel hente kampagnehændelserne forfra i det uendelige.
      if (naaetTil === null || r.sket_ved > naaetTil) naaetTil = r.sket_ved;
      if (!erFlowHaendelse(r)) { frasorteret += 1; continue; }
      raekker.push(r);
    }

    cursor = cursorAf(svar.krop?.links?.next);
    if (!cursor) {
      return { art: v.art, raekker, naaet_til: naaetTil, sider, faerdig: true, grund: "faerdig", frasorteret_kampagner: frasorteret, ubrugelige };
    }
  }

  return { art: v.art, raekker, naaet_til: naaetTil, sider, faerdig: false, grund: "budget", frasorteret_kampagner: frasorteret, ubrugelige };
}
