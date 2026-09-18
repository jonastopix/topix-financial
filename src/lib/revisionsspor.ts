/**
 * src/lib/revisionsspor.ts
 *
 * Spejlet ordret i supabase/functions/_shared/revisionsspor.ts — enhver
 * ændring her SKAL også laves der (paritetstest i
 * src/lib/__tests__/revisionssporParitet.test.ts). Nul imports.
 *
 * Revisionssporet for e-underskriften, læseligt for et MENNESKE (Jonas 18/9,
 * punkt 2): hver hændelse bliver én dansk sætning med tidspunkt i dansk
 * tid OG UTC-offset, IP-adresse og en læselig browserbeskrivelse. Samme
 * linjer står i PDF'ens sidste side, i kvitteringsmailen og på
 * rådgiverfladen — én kilde til formen.
 *
 * Tidszonen er ALTID med. «14:03» uden zone er et tal, ikke et tidspunkt;
 * en tvist om hvornår der blev skrevet under, afgøres på sekundet og på
 * zonen. Sommertid/vintertid læses af Intl fra IANA-zonen, aldrig af os.
 */

export const TIDSZONE = "Europe/Copenhagen";

export type Haendelse =
  | "link_sendt"
  | "link_aabnet"
  | "afvist_udloebet"
  | "kode_sendt"
  | "kode_forkert"
  | "kode_laast"
  | "kode_udloebet"
  | "underskrevet"
  | "kvittering_sendt"
  | "annulleret";

export const HAENDELSER: readonly Haendelse[] = [
  "link_sendt",
  "link_aabnet",
  "afvist_udloebet",
  "kode_sendt",
  "kode_forkert",
  "kode_laast",
  "kode_udloebet",
  "underskrevet",
  "kvittering_sendt",
  "annulleret",
];

export interface Sporraekke {
  tidspunkt: string;
  haendelse: Haendelse;
  ip: string | null;
  user_agent: string | null;
  detaljer: Record<string, unknown> | null;
}

const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/**
 * «18. september 2026 kl. 14:03:12 (dansk tid, UTC+02:00)». Offset læses
 * af Intl for netop det tidspunkt, så sommer- og vintertid er rigtige.
 * Ulæseligt tidspunkt → «ukendt tidspunkt» — aldrig et gæt.
 */
export function formaterDanskTid(iso: string, tidszone: string = TIDSZONE): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "ukendt tidspunkt";
  // Tal og offset læses med en-US, så tegnsætningen er kendt («GMT+02:00»
  // — da-DK skriver «GMT+02.00»); månedsnavnet og ordene er vores egne.
  const dele = new Intl.DateTimeFormat("en-US", {
    timeZone: tidszone,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(d);
  const v = (t: string) => dele.find((p) => p.type === t)?.value ?? "";
  const maaned = MAANEDER[Number(v("month")) - 1] ?? v("month");
  const offset = v("timeZoneName").replace(/^GMT/, "UTC").replace(/^UTC$/, "UTC+00:00");
  const zone = tidszone === TIDSZONE ? "dansk tid" : tidszone;
  return `${Number(v("day"))}. ${maaned} ${v("year")} kl. ${v("hour")}:${v("minute")}:${v("second")} (${zone}, ${offset})`;
}

/** «Safari på iPhone», «Chrome på Windows», «ukendt browser». Groft med vilje — det er et spor, ikke statistik. */
export function beskrivBrowser(userAgent: string | null): string {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "ukendt browser";
  let browser = "ukendt browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let enhed: string | null = null;
  if (/iPhone/.test(ua)) enhed = "iPhone";
  else if (/iPad/.test(ua)) enhed = "iPad";
  else if (/Android/.test(ua)) enhed = "Android";
  else if (/Windows/.test(ua)) enhed = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) enhed = "Mac";
  else if (/Linux/.test(ua)) enhed = "Linux";
  return enhed ? `${browser} på ${enhed}` : browser;
}

function tal(d: Record<string, unknown> | null, felt: string): number | null {
  const v = d?.[felt];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function streng(d: Record<string, unknown> | null, felt: string): string | null {
  const v = d?.[felt];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Hændelsen som sætning — uden tid, IP og browser (dem lægger sporLinje på). */
export function haendelseTekst(h: Haendelse, detaljer: Record<string, unknown> | null): string {
  switch (h) {
    case "link_sendt": {
      const til = streng(detaljer, "til");
      return `Link til aftalegrundlaget sendt${til ? ` til ${til}` : ""}`;
    }
    case "link_aabnet":
      return "Linket åbnet, aftalegrundlaget vist";
    case "afvist_udloebet":
      return "Linket åbnet efter udløb — afvist";
    case "kode_sendt": {
      const til = streng(detaljer, "til");
      return `Engangskode sendt${til ? ` til ${til}` : ""}`;
    }
    case "kode_forkert": {
      const tilbage = tal(detaljer, "forsoeg_tilbage");
      return `Forkert kode tastet${tilbage !== null ? ` (${tilbage} forsøg tilbage)` : ""}`;
    }
    case "kode_laast":
      return "Forkert kode tastet — koden er låst efter for mange forsøg";
    case "kode_udloebet":
      return "Kode tastet efter udløb — afvist";
    case "underskrevet": {
      const navn = streng(detaljer, "navn");
      const aftryk = streng(detaljer, "aftryk");
      return `Underskrevet${navn ? ` af ${navn}` : ""} — navn skrevet, «Jeg har læst aftalegrundlaget og accepterer det» krydset af, kode fra mailen tastet${aftryk ? `; dokumentets aftryk ${aftryk}` : ""}`;
    }
    case "kvittering_sendt": {
      const til = streng(detaljer, "til");
      return `Kvittering med det underskrevne dokument sendt${til ? ` til ${til}` : ""}`;
    }
    case "annulleret": {
      const grund = streng(detaljer, "grund");
      return `Aftalen annulleret${grund ? ` — ${grund}` : ""}`;
    }
  }
}

/** Én linje pr. hændelse: tid — hvad — fra IP — browser. */
export function sporLinje(r: Sporraekke): string {
  const dele = [`${formaterDanskTid(r.tidspunkt)} — ${haendelseTekst(r.haendelse, r.detaljer)}`];
  if (r.ip) dele.push(`fra ${r.ip}`);
  if (r.user_agent) dele.push(beskrivBrowser(r.user_agent));
  return dele.join(" · ");
}

/** Alle linjer i tidsorden (stabil: ens tidspunkter beholder rækkefølgen). */
export function sporTilLinjer(raekker: readonly Sporraekke[]): string[] {
  return raekker
    .map((r, i) => ({ r, i, t: new Date(r.tidspunkt).getTime() }))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i))
    .map(({ r }) => sporLinje(r));
}
