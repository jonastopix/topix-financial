/**
 * _shared/klaviyoMailhaendelser.ts — LAG 5: Klaviyos hændelser TILBAGE til os.
 *
 * Lag 2 sender hændelser TIL Klaviyo. Denne læser dem den anden vej, så
 * kredsløbet lukkes: Klaviyo ser åbninger, Meta ser klik, og kun platformen
 * ved, hvem der blev medlem. Sammenføjningen er hele værdien.
 *
 * ── MÅLT 19/9 MOD KONTOEN, IKKE MOD DOKUMENTATIONEN ─────────────────────────
 *
 * De tre metrikker findes og har faste id'er i DENNE konto:
 *   Received Email  XxZFZq      Opened Email  RxGYRk      Clicked Email  Tk8SmP
 * Id'erne er konto-specifikke. Skifter kontoen, skal de hentes igen — derfor
 * står de ét sted og ikke spredt i kald.
 *
 * HVER HÆNDELSE BÆRER (målt på rigtige rækker):
 *   `$flow`        flowets id         — WFzxH9 · UiECQS · YcBF9f
 *   `$message`     flowbeskedens id   — den ENKELTE mail, ikke flowet
 *   `Campaign Name` beskedens navn
 *   `Subject`      emnelinjen som den blev sendt
 *   `Recipient Email Address` / `$originating_email`
 *   `$internal["Transmission ID"]`  ← DEN STABILE NØGLE mellem modtaget/åbnet/klikket
 *   `machine_open` (åbninger)  ·  `Bot Click` (klik)  ·  `URL` (klik)
 *
 * **`$event_id` DUR IKKE SOM NØGLE.** Målt: på «modtaget» er den
 * «<besked>:<TransmissionID>», på «åbnet» og «klikket» er den
 * «<besked>:<TransmissionID>:<tidsstempel>». Den er altså ikke ens for samme
 * udsendelse. Transmission ID er — og det er derfor den, vi gemmer i
 * `forsendelse_id`. Havde vi brugt `$event_id`, ville ingen åbning nogensinde
 * kunne bindes til sin egen mail, og det ville se ud som om ingen åbnede.
 *
 * **MASKINER OG BOTTER TÆLLES, MEN ER ALDRIG BEVIS.** Målt på UiECQS i
 * september: 1 menneskeklik mod 42 bot-klik. Klaviyos eget Reporting API sagde
 * `clicks_unique: 2` for samme periode, hvor de rå hændelser gav 43 — Klaviyo
 * filtrerer altså allerede. Gemmer vi flagene, kan vores tal stemme med
 * Klaviyos UI. Gemmer vi dem ikke, får vi en uenighed, ingen kan forklare.
 */

export const METRIK = {
  modtaget: "XxZFZq",
  aabnet: "RxGYRk",
  klikket: "Tk8SmP",
} as const;

export type Mailart = keyof typeof METRIK;

export const ARTER: readonly Mailart[] = ["modtaget", "aabnet", "klikket"];

/**
 * INGEN HARDKODET FLOW-LISTE (rettet 20/9). Første udkast tog kun tre navngivne
 * flows — og tirsdag kommer der to nye, metric-udløste («Deltog i webinar»,
 * «Moedte ikke op»). En liste, der skal huskes opdateret, er en tavshed, der
 * venter på at ske: et nyt flow ville blive hentet TAVST IKKE.
 *
 * Reglen er derfor formen, ikke navnet: en hændelse med `$flow` er en flowmail
 * og gemmes; en uden er en kampagne og gemmes ikke. Kampagnerne er de store
 * tal (21.441 i januar mod 186), og de hører ikke til her.
 */

export interface Mailhaendelsesraekke {
  klaviyo_event_id: string;
  art: Mailart;
  sket_ved: string;
  email: string;
  klaviyo_profil_id: string | null;
  flow_id: string | null;
  besked_id: string | null;
  besked_navn: string | null;
  emne: string | null;
  forsendelse_id: string | null;
  maskine: boolean;
  bot: boolean;
  url: string | null;
  raa: Record<string, unknown>;
}

const tekst = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** Klaviyo sender `Bot Click` som bool OG som «1.0» i aggregater. Begge skal forstås. */
const sandt = (v: unknown): boolean =>
  v === true || v === 1 || v === "1" || v === "1.0" || v === "true";

/**
 * Oversætter én hændelse fra Klaviyos svar til en række. Returnerer null, når
 * rækken ikke kan bruges — ALDRIG en halv række med gættede felter.
 *
 * Mailen er den eneste kobling til vores egen base, så uden den er rækken
 * værdiløs. Det samme gælder tiden: en hændelse uden tidsstempel kan ikke
 * placeres før eller efter en ansøgning, og hele dommen er en rækkefølge.
 */
export function laesHaendelse(art: Mailart, h: unknown): Mailhaendelsesraekke | null {
  if (typeof h !== "object" || h === null) return null;
  const o = h as Record<string, unknown>;
  const id = tekst(o.id);
  if (!id) return null;

  const attr = (typeof o.attributes === "object" && o.attributes !== null ? o.attributes : {}) as Record<string, unknown>;
  const p = (typeof attr.event_properties === "object" && attr.event_properties !== null ? attr.event_properties : {}) as Record<string, unknown>;
  const intern = (typeof p.$internal === "object" && p.$internal !== null ? p.$internal : {}) as Record<string, unknown>;

  const email = tekst(p["Recipient Email Address"]) ?? tekst(p.$originating_email);
  if (!email) return null;

  const sket = tekst(attr.datetime)
    ?? (typeof attr.timestamp === "number" ? new Date(attr.timestamp * 1000).toISOString() : null);
  if (!sket) return null;

  const rel = (typeof o.relationships === "object" && o.relationships !== null ? o.relationships : {}) as Record<string, unknown>;
  const profilRel = (rel.profile ?? {}) as Record<string, unknown>;
  const profilData = ((profilRel.data ?? {}) as Record<string, unknown>);

  return {
    klaviyo_event_id: id,
    art,
    sket_ved: new Date(sket).toISOString(),
    email: email.toLowerCase(),
    klaviyo_profil_id: tekst(profilData.id),
    flow_id: tekst(p.$flow),
    besked_id: tekst(p.$message),
    besked_navn: tekst(p["Campaign Name"]),
    emne: tekst(p.Subject),
    forsendelse_id: tekst(intern["Transmission ID"]),
    maskine: sandt(p.machine_open),
    bot: sandt(p["Bot Click"]),
    url: tekst(p.URL),
    raa: p,
  };
}

/** En flowmail har `$flow`. En kampagne har ikke — og skal ikke med. */
export function erFlowHaendelse(r: Mailhaendelsesraekke): boolean {
  return r.flow_id !== null;
}
