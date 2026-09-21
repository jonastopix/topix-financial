/**
 * klaviyoDato — datoen og den danske tekst til Klaviyo-profilen, ÉT sted
 * (udkast 21/9-2026, recon-profilmodel §1.1 og §6 pkt. 3).
 *
 * KLAVIYO LÆSER EN DATO KUN I TO FORMATER (hjælpeartiklen 115005074627, ordret):
 * «If you are uploading a date property, you must format dates as either
 * YYYY-MM-DD or MM/DD/YYYY. To set a time, you can use the format HH:MM:SS
 * (e.g., 00:00:00 for midnight).» Vores `session_tid` blev en STRENG hos
 * Klaviyo, fordi `…T17:00:00.000Z` ikke er et af dem (målt 20/9,
 * `inferred_type: string`). Derfor: `YYYY-MM-DD HH:MM:SS` — aldrig `T`, aldrig
 * `Z`, aldrig toISOString(). Kildeværnet klaviyoProfil.guard fælder begge.
 *
 * TIDSZONEN: formatet bærer ingen. Klaviyo læser en tid uden zone i KONTOENS
 * tidszone (Europe/Copenhagen, målt på flowenes `timezone`). Så tallet SKAL
 * være dansk tid — «09:00:00» for webinaret 22/9 kl. 9, ikke «07:00:00».
 *
 * TEKSTEN til mailene («tirsdag 13. oktober kl. 11.00») bygges her også, af
 * samme øjeblik, så de to felter aldrig kan sige to forskellige tider. Dansk
 * form: ugedag og måned med små bogstaver, «kl. 9.00» uden foranstillet nul,
 * minutter altid to cifre (Sprognævnets form, som eventMails.ts' tidOrd
 * bruger «09:00» — den bruges ikke her, fordi mailen skal sige «kl. 9.00»).
 *
 * REN OG DENO-FRI: kun Intl. Ingen Dates ugedagsmetode (isoUge-værnet
 * forbyder den i edge-koden) — ugedagen kommer fra Intl.
 *
 * Prøvet i src/lib/__tests__/klaviyoDato.test.ts over sommertid/vintertid
 * (25/10-2026), midnat, kl. 9.00, alle ugedage og alle måneder.
 */

export const TZ = "Europe/Copenhagen";

/** Profilens to felter — altid skrevet SAMMEN af samme kode (klaviyoProfil.ts). */
export const PROFIL_FELT_DATO = "tb_naeste_webinar";
export const PROFIL_FELT_TEKST = "tb_naeste_webinar_tekst";
export const PROFIL_FELTER = [PROFIL_FELT_DATO, PROFIL_FELT_TEKST] as const;

/** Klaviyos datoform med tid: «2026-10-13 11:00:00». Præcis 19 tegn, intet T, intet Z. */
export const KLAVIYO_DATO_FORM = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const DATO_FORMAT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const TEKST_FORMAT = new Intl.DateTimeFormat("da-DK", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

function dele(fmt: Intl.DateTimeFormat, d: Date): Record<string, string> {
  const ud: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) ud[p.type] = p.value;
  return ud;
}

/** «2026-10-13 11:00:00» i dansk tid. Kaster på en ugyldig dato — kalderen skal have sorteret den fra. */
export function klaviyoDato(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new Error("klaviyoDato: ugyldig dato");
  const p = dele(DATO_FORMAT, d);
  // sv-SE giver «2026-10-13 11:00:00» direkte, men delene samles selv, så formen ikke afhænger af en locale-streng.
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** «tirsdag 13. oktober kl. 11.00» / «tirsdag 22. september kl. 9.00» / «… kl. 0.00» ved midnat. */
export function webinarTekst(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new Error("webinarTekst: ugyldig dato");
  const p = dele(TEKST_FORMAT, d);
  const time = String(Number(p.hour) % 24);
  return `${p.weekday.toLocaleLowerCase("da-DK")} ${p.day}. ${p.month.toLocaleLowerCase("da-DK")} kl. ${time}.${p.minute}`;
}

/** Er strengen Klaviyos datoform med tid? Bruges fail-closed, før noget sendes. */
export function erKlaviyoDato(s: unknown): s is string {
  return typeof s === "string" && KLAVIYO_DATO_FORM.test(s) && !/[TZ]/.test(s);
}

export interface Profilvaerdier {
  tb_naeste_webinar: string;
  tb_naeste_webinar_tekst: string;
}

/** De to felter for ét tidspunkt — altid sammen. null ind = ingen kommende session → felterne skal væk. */
export function profilVaerdier(naeste: Date | null): Profilvaerdier | null {
  if (naeste === null) return null;
  return { tb_naeste_webinar: klaviyoDato(naeste), tb_naeste_webinar_tekst: webinarTekst(naeste) };
}

/** Så meget af webinar_tilmeldinger, som dommen behøver. */
export interface TilmeldingTid {
  email: string;
  /** ISO. null ved Replay/OnDemand — tæller ikke. */
  session_tid: string | null;
}

/**
 * Personens TIDLIGSTE kommende session (session_tid > nu) blandt alle rækker på
 * samme mail. Rækker uden session_tid (replay/on demand) og passerede sessioner
 * tæller ikke. Mailen normaliseres (trim, små bogstaver), så to skrivemåder er én
 * person. Kun personer MED en kommende session står i svaret — de andre er ikke
 * i kortet, og det er kalderens tegn på «felterne skal fjernes».
 */
export function naesteSessionPrMail(raekker: readonly TilmeldingTid[], nu: Date): Map<string, Date> {
  const ud = new Map<string, Date>();
  const nuMs = nu.getTime();
  for (const r of raekker) {
    if (r.session_tid === null) continue;
    const ms = Date.parse(r.session_tid);
    if (!Number.isFinite(ms) || ms <= nuMs) continue;
    const email = r.email.trim().toLowerCase();
    if (!email) continue;
    const har = ud.get(email);
    if (!har || ms < har.getTime()) ud.set(email, new Date(ms));
  }
  return ud;
}

/** Det, platformen sidst skrev for en mail — som klaviyo_profil husker det. null-værdier = felterne er fjernet (eller aldrig sat). */
export interface SidstSkrevet {
  tb_naeste_webinar: string | null;
  tb_naeste_webinar_tekst: string | null;
}

/**
 * Skal der skrives? Kun når den ønskede værdi afviger fra det, platformen sidst
 * skrev (ingen række = aldrig skrevet). Ønsket null mod «aldrig skrevet» er
 * IKKE en afvigelse — der er intet at fjerne.
 */
export function afviger(oensket: Profilvaerdier | null, sidst: SidstSkrevet | null): boolean {
  if (oensket === null) return sidst !== null && (sidst.tb_naeste_webinar !== null || sidst.tb_naeste_webinar_tekst !== null);
  if (sidst === null) return true;
  return sidst.tb_naeste_webinar !== oensket.tb_naeste_webinar || sidst.tb_naeste_webinar_tekst !== oensket.tb_naeste_webinar_tekst;
}
