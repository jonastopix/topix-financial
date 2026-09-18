/**
 * hverdage — dansk kalender for rykkerkøen: hverdag, helligdag, sendevindue
 * og «hvornår er dag N regnet fra et anker». Spejl: src/lib/hverdage.ts
 * (kroppen efter filhovedet er ordret ens; pariteten låses af
 * src/lib/__tests__/ansoegningMotor.paritet.test.ts).
 *
 * HVORFOR DEN FINDES (18/9-2026, ansøgningsmotoren): huset havde ingen
 * hverdagsdom — målt 18/9: nul træffere på helligdag/hverdag/weekend som
 * dom i src/lib og _shared; kun ISO-uge, «næste fredag» og ugedagsnavne.
 * Rykkerkøens regel «hverdage, aldrig efter 16 eller i weekenden» (Jonas
 * 18/9) kræver én dom, som både planlæggeren (hvornår står rækken) og
 * senderen (må den gå NU) læser. Alt regnes i Europe/Copenhagen; kun
 * Intl (som copenhagenHour i notificationEmailSelection.ts) — ingen
 * biblioteker.
 *
 * SAGT HØJT — husets valg, som Jonas kan flytte:
 *   - Sendevinduet er 07:00–16:00 dansk tid (16:00 EKSKLUSIV: kl. 16:00 er
 *     «efter 16»). Undergrænsen 07 er husets: reglen siger kun «aldrig
 *     efter 16», men ingen skal have en rykker kl. 03. Samme undergrænse
 *     som notifikationskøens SEND_WINDOW_START_HOUR.
 *   - Rykkere planlægges kl. 10:00 (RYKKER_KLOKKE) — midt i formiddagen,
 *     efter indgangs-paamindelser (10 UTC) er der luft, og en hverdag der
 *     flyttes (fra lørdag til mandag) lander samme klokkeslæt.
 *   - Helligdage tæller IKKE som hverdage: nytårsdag, skærtorsdag,
 *     langfredag, påskedag, 2. påskedag, Kristi himmelfartsdag, pinsedag,
 *     2. pinsedag, juledag, 2. juledag. Store bededag er afskaffet fra
 *     2024 og er ikke med. Dertil tre lukkedage hvor ingen læser
 *     arbejdsmail: grundlovsdag (5/6), juleaftensdag (24/12) og
 *     nytårsaftensdag (31/12). Påsken regnes (Meeus/Jones/Butcher), ikke
 *     slået op — ingen tabel der udløber.
 *   - «Dag N» regnes på den DANSKE kalenderdag: ankerets danske dato + N
 *     dage, rykket FREM til første hverdag (N ≥ 0) eller TILBAGE til
 *     nærmeste hverdag (N < 0, «dagen før» en samtale mandag er fredag).
 */

export const TZ = "Europe/Copenhagen";

/** Sendevinduet, dansk tid. TIL er eksklusiv: sidste lovlige minut er 15:59. */
export const SENDEVINDUE_FRA_TIME = 7;
export const SENDEVINDUE_TIL_TIME = 16;

/** Standardklokken for en planlagt rykker. */
export const RYKKER_KLOKKE = 10;

const MINUT_MS = 60_000;
const DOEGN_MS = 86_400_000;

export interface KbhDele {
  aar: number;
  /** 1–12 */
  maaned: number;
  dag: number;
  /** 0–23 */
  time: number;
  minut: number;
  /** 0 = søndag … 6 = lørdag (som Date#getDay) */
  ugedag: number;
}

const UGEDAGE: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Ugedag (0 = søndag) for en UTC-dag regnet fra epoken (1/1-1970 var en torsdag) — regnet selv, fordi isoUge-kildeværnet forbyder Dates ugedagsmetode i edge-koden. */
function ugedagAfUtcMs(ms: number): number {
  return ((Math.floor(ms / DOEGN_MS) % 7) + 4 + 7) % 7;
}

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

/** Klokken og datoen i Danmark for et tidspunkt. */
export function kbhDele(d: Date): KbhDele {
  const dele: Record<string, string> = {};
  for (const p of FORMAT.formatToParts(d)) dele[p.type] = p.value;
  return {
    aar: Number(dele.year),
    maaned: Number(dele.month),
    dag: Number(dele.day),
    time: Number(dele.hour) % 24,
    minut: Number(dele.minute),
    ugedag: UGEDAGE[dele.weekday] ?? ugedagAfUtcMs(d.getTime() + 2 * 3_600_000), // fallback: Intl gav intet weekday (sker ikke); dansk tid ≈ UTC+2
  };
}

const to = (n: number) => String(n).padStart(2, "0");

/** «YYYY-MM-DD» set fra Danmark. */
export function kbhDato(d: Date): string {
  const p = kbhDele(d);
  return `${p.aar}-${to(p.maaned)}-${to(p.dag)}`;
}

function delDato(dato: string): { aar: number; maaned: number; dag: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) throw new Error(`hverdage: ugyldig dato «${dato}»`);
  return { aar: Number(dato.slice(0, 4)), maaned: Number(dato.slice(5, 7)), dag: Number(dato.slice(8, 10)) };
}

/** Den danske tidszones forskydning (ms) fra UTC på et tidspunkt: vægtid − instant. */
function forskydningMs(d: Date): number {
  const p = kbhDele(d);
  const vaegtid = Date.UTC(p.aar, p.maaned - 1, p.dag, p.time, p.minut);
  return vaegtid - Math.floor(d.getTime() / MINUT_MS) * MINUT_MS;
}

/**
 * Tidspunktet for en dansk vægtid: «den 21/9-2026 kl. 10:00 i Danmark» som
 * Date. To gennemløb, så et gæt på den forkerte side af et sommertidsskift
 * rettes.
 */
export function kbhTilUtc(dato: string, time = 0, minut = 0): Date {
  const { aar, maaned, dag } = delDato(dato);
  const gaet = Date.UTC(aar, maaned - 1, dag, time, minut);
  const f1 = forskydningMs(new Date(gaet));
  let instant = gaet - f1;
  const f2 = forskydningMs(new Date(instant));
  if (f2 !== f1) instant = gaet - f2;
  return new Date(instant);
}

/** Kalenderdage lagt til en dato (ren kalender, uden tidszone). */
export function laegDageTilDato(dato: string, dage: number): string {
  const { aar, maaned, dag } = delDato(dato);
  const t = Date.UTC(aar, maaned - 1, dag) + dage * DOEGN_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Måneder lagt til en dato; dagen klippes til månedens længde (31/1 + 1 md. = 28/2). */
export function laegMaanederTilDato(dato: string, maaneder: number): string {
  const { aar, maaned, dag } = delDato(dato);
  const maalIndeks = maaned - 1 + maaneder;
  const maalAar = aar + Math.floor(maalIndeks / 12);
  const maalMaaned = ((maalIndeks % 12) + 12) % 12; // 0–11
  const sidsteDag = new Date(Date.UTC(maalAar, maalMaaned + 1, 0)).getUTCDate();
  return new Date(Date.UTC(maalAar, maalMaaned, Math.min(dag, sidsteDag))).toISOString().slice(0, 10);
}

/** Påskedag for et år (Meeus/Jones/Butcher, gregoriansk). */
export function paaskedag(aar: number): string {
  const a = aar % 19;
  const b = Math.floor(aar / 100);
  const c = aar % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maaned = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${aar}-${to(maaned)}-${to(dag)}`;
}

/** Danske helligdage + husets tre lukkedage for et år, som «YYYY-MM-DD». */
export function danskeHelligdage(aar: number): string[] {
  const p = paaskedag(aar);
  return [
    `${aar}-01-01`, // nytårsdag
    laegDageTilDato(p, -3), // skærtorsdag
    laegDageTilDato(p, -2), // langfredag
    p, // påskedag
    laegDageTilDato(p, 1), // 2. påskedag
    laegDageTilDato(p, 39), // Kristi himmelfartsdag
    laegDageTilDato(p, 49), // pinsedag
    laegDageTilDato(p, 50), // 2. pinsedag
    `${aar}-06-05`, // grundlovsdag (lukkedag)
    `${aar}-12-24`, // juleaftensdag (lukkedag)
    `${aar}-12-25`, // juledag
    `${aar}-12-26`, // 2. juledag
    `${aar}-12-31`, // nytårsaftensdag (lukkedag)
  ];
}

export function erHelligdag(dato: string): boolean {
  return danskeHelligdage(delDato(dato).aar).includes(dato);
}

export function erWeekendDato(dato: string): boolean {
  const { aar, maaned, dag } = delDato(dato);
  const ugedag = ugedagAfUtcMs(Date.UTC(aar, maaned - 1, dag));
  return ugedag === 0 || ugedag === 6;
}

/** Hverdag = hverken weekend, helligdag eller lukkedag. */
export function erHverdagDato(dato: string): boolean {
  return !erWeekendDato(dato) && !erHelligdag(dato);
}

export function erHverdag(d: Date): boolean {
  return erHverdagDato(kbhDato(d));
}

/** Første hverdag fra og med (inklusiv) eller efter (eksklusiv) datoen. */
export function naesteHverdagFra(dato: string, inklusiv = true): string {
  let d = inklusiv ? dato : laegDageTilDato(dato, 1);
  for (let i = 0; i < 20; i++) {
    if (erHverdagDato(d)) return d;
    d = laegDageTilDato(d, 1);
  }
  throw new Error(`hverdage: ingen hverdag inden for 20 dage fra ${dato}`);
}

/** Nærmeste hverdag på eller før datoen. */
export function forrigeHverdagFra(dato: string, inklusiv = true): string {
  let d = inklusiv ? dato : laegDageTilDato(dato, -1);
  for (let i = 0; i < 20; i++) {
    if (erHverdagDato(d)) return d;
    d = laegDageTilDato(d, -1);
  }
  throw new Error(`hverdage: ingen hverdag inden for 20 dage før ${dato}`);
}

/** Er tidspunktet i sendevinduet: hverdag og 07:00 ≤ klokken < 16:00 dansk tid? */
export function erISendevindue(d: Date): boolean {
  if (!erHverdag(d)) return false;
  const { time } = kbhDele(d);
  return time >= SENDEVINDUE_FRA_TIME && time < SENDEVINDUE_TIL_TIME;
}

/**
 * Første tidspunkt ≥ d der ligger i sendevinduet. Er d selv i vinduet, er
 * svaret d. Før 07 på en hverdag → samme dag 07:00. Ellers → næste hverdag
 * 07:00.
 */
export function naesteSendevindue(d: Date): Date {
  if (erISendevindue(d)) return d;
  const dato = kbhDato(d);
  const { time } = kbhDele(d);
  if (erHverdagDato(dato) && time < SENDEVINDUE_FRA_TIME) return kbhTilUtc(dato, SENDEVINDUE_FRA_TIME, 0);
  return kbhTilUtc(naesteHverdagFra(dato, false), SENDEVINDUE_FRA_TIME, 0);
}

/** Midnat dansk tid på dagen efter d. */
export function startAfNaesteDag(d: Date): Date {
  return kbhTilUtc(laegDageTilDato(kbhDato(d), 1), 0, 0);
}

/**
 * «Dag N fra ankeret, kl. klokke»: ankerets danske dato + N dage, rykket til
 * en hverdag (frem for N ≥ 0, tilbage for N < 0), kl. klokke:00 dansk tid.
 * Klokken skal ligge i sendevinduet, ellers kastes — en planlægger må ikke
 * kunne lægge en mail kl. 17.
 */
export function planlagtTidspunkt(anker: Date, dagOffset: number, klokke: number = RYKKER_KLOKKE): Date {
  if (klokke < SENDEVINDUE_FRA_TIME || klokke >= SENDEVINDUE_TIL_TIME) {
    throw new Error(`hverdage: klokken ${klokke} ligger uden for sendevinduet ${SENDEVINDUE_FRA_TIME}–${SENDEVINDUE_TIL_TIME}`);
  }
  const raa = laegDageTilDato(kbhDato(anker), dagOffset);
  const dato = dagOffset >= 0 ? naesteHverdagFra(raa, true) : forrigeHverdagFra(raa, true);
  return kbhTilUtc(dato, klokke, 0);
}
