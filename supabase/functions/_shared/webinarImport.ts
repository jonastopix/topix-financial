/**
 * webinarImport — dommen bag engangsimporten fra eWebinars REST-API (udkast
 * 19/9-2026, ~/Downloads/udkast-ewebinar-import/README.md).
 *
 * ÉN PLUKKER, TO INDGANGE. Webhooken og importen skriver de SAMME to
 * tabeller, og derfor skal de plukke ens: `plukTilmelding` +
 * `fletTilmelding` i `_shared/webinarDom.ts` (urørt, spejlet i src/lib,
 * paritetstestet) er sandheden begge veje. Denne fil gør kun to ting:
 *
 *   somWebhookForm   REST-objektet oversat til webhookens feltnavne, så
 *                    plukkeren kan læse det. Navnene ER forskellige (målt
 *                    19/9 i api.ewebinar.com/docs/openapi.json, V2Registrant
 *                    vs. help/webhook's registrant-objekt):
 *                      REST `setId`        ≙ webhook `webinarId`
 *                      REST `registeredAt` ≙ webhook `registeredTime`
 *                      REST `optOut: bool` ≙ webhook `subscribed: "Subscribed"`
 *                      REST har firstName/lastName, webhook har også `name`
 *                    Felter REST måtte have UD OVER skemaet («additionalProperties:
 *                    true») røres ikke — de følger med videre til plukkeren og
 *                    til den rå log, så `findProcent` rammer procenten samme
 *                    sted som ved webhooken, uanset hvad den hedder.
 *   feltRapport      MÅLINGEN: hvilke nøgler API'et faktisk sender, med
 *                    typer, hvor mange der har værdi, og et eksempel — plus
 *                    hvilke af dem vi IKKE bruger endnu. Det er den rapport
 *                    README §2 beder Jonas indsætte.
 *
 * INGEN DUBLETTER: nøglen er `ewebinar_id` = registrantens `id`, det samme
 * felt begge veje (webhook-eksemplets `id` og `attendeeId` er ens; REST's
 * `/registrants/{id}` kalder det «Registrant short ID»). Importen læser den
 * eksisterende række og fletter med `fletTilmelding` — den nye værdi vinder,
 * null overskriver aldrig, og procenten går ALDRIG ned. En import efter en
 * webhook-hændelse kan derfor ikke sænke det vi allerede ved. Er id-rummene
 * mod forventning forskellige, opdages det som «alle er nye» i rapporten —
 * README §6 siger hvad Jonas skal se efter.
 *
 * Ingen Deno- eller Supabase-afhængighed: testes i vitest fra
 * src/lib/__tests__/webinarImport.test.ts.
 */
import { plukTilmelding, type Pluk, type WebinarTilmelding } from "./webinarDom.ts";
import { doemSetGrad, type SetGrad } from "./webinarDom.ts";
import { afgoerOvergang, byggFremmoede, type Overgang } from "./webinarHaendelser.ts";
import type { HaendelseInput } from "./klaviyoHaendelser.ts";

/** REST-feltnavne oversat til webhookens, så én plukker kan læse begge. */
export function somWebhookForm(raa: Record<string, unknown>): Record<string, unknown> {
  const ud: Record<string, unknown> = { ...raa };
  if (ud.webinarId === undefined && ud.setId !== undefined) ud.webinarId = ud.setId;
  if (ud.registeredTime === undefined && ud.registeredAt !== undefined) ud.registeredTime = ud.registeredAt;
  if (ud.subscribed === undefined && typeof ud.optOut === "boolean") ud.subscribed = ud.optOut ? "Unsubscribed" : "Subscribed";
  return ud;
}

/** Plukker en REST-registrant med webhookens egen plukker. */
export function plukRestRegistrant(raa: unknown): Pluk {
  if (!raa || typeof raa !== "object" || Array.isArray(raa)) return plukTilmelding(raa);
  return plukTilmelding(somWebhookForm(raa as Record<string, unknown>));
}

/** Nøgler plukkeren allerede bruger (begge navnesæt) — resten er «ukendte» i rapporten. */
export const KENDTE_NOEGLER: readonly string[] = [
  "id", "attendeeId", "email", "name", "firstName", "lastName",
  "webinarId", "setId", "webinarTitle",
  "sessionTime", "sessionType",
  "registeredTime", "registeredAt",
  "state", "action", "attended", "subscribed", "optOut",
];

export interface FeltLinje {
  noegle: string;
  /** JSON-typerne set for nøglen: string · number · boolean · object · array · null. */
  typer: string[];
  /** Hvor mange registranter der HAR nøglen. */
  antal: number;
  /** Hvor mange der har en værdi der ikke er null/""/[]. */
  ikkeTomme: number;
  /** Første ikke-tomme værdi, klippet — så rapporten kan læses. */
  eksempel: string | null;
  /** true når `plukTilmelding` ikke bruger nøglen i dag. */
  ukendt: boolean;
  /** true når navnet ligner et procentfelt (samme regel som findProcent). */
  procentKandidat: boolean;
}

export interface FeltRapport {
  registranter: number;
  linjer: FeltLinje[];
  /** Nøglerne der ligner en procent OG bærer et læsbart 0–100-tal. */
  procentFundet: string[];
  /** Nøgler vi ikke bruger endnu — kandidater til næste version af plukkeren. */
  ukendteNoegler: string[];
}

const PROCENT_NOEGLE = /watched|percent|pct/i;
const PROCENT_NOEGLE_IKKE = /link|url|time|date/i;

function typeAf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function erTom(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function tilTekst(v: unknown, maks = 120): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return (s ?? "").length > maks ? `${(s ?? "").slice(0, maks)}…` : (s ?? "");
}

/**
 * MÅLINGEN: hvad sender API'et egentlig? Kører over de hentede registranter
 * (eller én enkelt) og opgør hver nøgle. Kigger også ét niveau ned i
 * objekter — procenten kan ligge i fx `properties.total_watched_percent`.
 */
export function feltRapport(registranter: readonly Record<string, unknown>[]): FeltRapport {
  const samlet = new Map<string, { typer: Set<string>; antal: number; ikkeTomme: number; eksempel: string | null }>();

  const tael = (noegle: string, vaerdi: unknown) => {
    const linje = samlet.get(noegle) ?? { typer: new Set<string>(), antal: 0, ikkeTomme: 0, eksempel: null };
    linje.typer.add(typeAf(vaerdi));
    linje.antal++;
    if (!erTom(vaerdi)) {
      linje.ikkeTomme++;
      if (linje.eksempel === null) linje.eksempel = tilTekst(vaerdi);
    }
    samlet.set(noegle, linje);
  };

  for (const r of registranter) {
    if (!r || typeof r !== "object") continue;
    for (const [k, v] of Object.entries(r)) {
      tael(k, v);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) tael(`${k}.${k2}`, v2);
      }
    }
  }

  const linjer: FeltLinje[] = [...samlet.entries()]
    .map(([noegle, l]) => {
      const sidsteLed = noegle.includes(".") ? noegle.slice(noegle.lastIndexOf(".") + 1) : noegle;
      return {
        noegle,
        typer: [...l.typer].sort(),
        antal: l.antal,
        ikkeTomme: l.ikkeTomme,
        eksempel: l.eksempel,
        ukendt: !KENDTE_NOEGLER.includes(noegle),
        procentKandidat: PROCENT_NOEGLE.test(sidsteLed) && !PROCENT_NOEGLE_IKKE.test(sidsteLed),
      };
    })
    .sort((a, b) => a.noegle.localeCompare(b.noegle));

  return {
    registranter: registranter.length,
    linjer,
    procentFundet: linjer.filter((l) => l.procentKandidat && l.ikkeTomme > 0).map((l) => l.noegle),
    ukendteNoegler: linjer.filter((l) => l.ukendt).map((l) => l.noegle),
  };
}

/** Rapporten som en markdown-tabel — klar til at klistre ind i README §2. */
export function feltRapportSomMarkdown(rapport: FeltRapport): string {
  const linjer = [
    `| felt | type(r) | har værdi | eksempel | bruges i dag |`,
    `|---|---|---|---|---|`,
    ...rapport.linjer.map((l) =>
      `| \`${l.noegle}\` | ${l.typer.join(" / ")} | ${l.ikkeTomme}/${rapport.registranter} | ${(l.eksempel ?? "—").replace(/\|/g, "\\|")} | ${l.ukendt ? (l.procentKandidat ? "**NEJ — procent-kandidat**" : "nej") : "ja"} |`,
    ),
  ];
  return linjer.join("\n");
}

// ── Importens rapport ──────────────────────────────────────────────────────

export type RaekkeUdfald = "ny" | "opdateret" | "uaendret" | "sprunget_over";

export interface ImportRaekke {
  ewebinarId: string | null;
  email: string | null;
  webinarId: string | null;
  udfald: RaekkeUdfald;
  /** Kun ved sprunget_over: uden_id · uden_email · uden_webinar_id · ikke_et_objekt. */
  grund?: string;
  procent?: number | null;
}

/**
 * Er den flettede række forskellig fra den vi havde? Afgør «opdateret» vs.
 * «uaendret» i rapporten — så en anden kørsel af importen kan vise at den
 * ikke ændrede noget (idempotensen, bevist i tallene og ikke bare påstået).
 */
export function erForskellig(foer: WebinarTilmelding | null, efter: WebinarTilmelding): boolean {
  if (!foer) return true;
  for (const noegle of Object.keys(efter) as Array<keyof WebinarTilmelding>) {
    if (foer[noegle] !== efter[noegle]) return true;
  }
  return false;
}

/** Nøglerne sorteret, så to ens objekter altid giver samme tekst (og samme aftryk). */
export function kanoniskJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(kanoniskJson).join(",")}]`;
  const poster = Object.entries(v as Record<string, unknown>)
    .filter(([, vv]) => vv !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${poster.map(([k, vv]) => `${JSON.stringify(k)}:${kanoniskJson(vv)}`).join(",")}}`;
}

// ── Fremmøde for ÉN session (udkast 21/9-2026, recon-no-show-sender / recon-import-fremmoede) ──
//
// HVORFOR: melder eWebinar ikke selv no-shows via webhooken, kan importen
// hente sessionens registranter bagefter og sende fremmøde-hændelserne ad
// SAMME vej som webhooken — samme dom (doemSetGrad), samme overgang
// (afgoerOvergang), samme krop (byggFremmoede) og dermed samme unique_id
// `${ewebinar_id}:${grad}`. Sender eWebinar alligevel signalet senere,
// kasserer Klaviyo dubletten (klaviyo.ts filhoved: «only the first processed
// event will be recorded»).
//
// «Mødte ikke op» sendes IKKE ud fra stilhed: dommen er eWebinars eget
// `state` (Missed/NotJoined) efter sessionen, som ved webhooken. En registrant,
// eWebinar stadig kalder «Registered», dømmes «ukendt» og sender intet.
//
// Rene funktioner — testet i src/lib/__tests__/webinarImport.test.ts.

/** Formen på `session_dato` i body'en: dansk kalenderdato. */
export const SESSION_DATO_FORM = /^\d{4}-\d{2}-\d{2}$/;

/** «2026-09-22» og en dato, der findes. «2026-02-30» og «22/9» afvises. */
export function gyldigSessionDato(v: unknown): v is string {
  if (typeof v !== "string" || !SESSION_DATO_FORM.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** Kalenderdatoen i Europe/Copenhagen for et ISO-tidspunkt; null uden tid eller ved ugyldig tid. */
export function danskDato(iso: string | null): string | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const dele = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(t));
  const hent = (type: string) => dele.find((d) => d.type === type)?.value ?? "";
  return `${hent("year")}-${hent("month")}-${hent("day")}`;
}

/** Ligger tilmeldingens session på den danske dato? Replay/OnDemand (session_tid null) aldrig. */
export function erISessionen(t: Pick<WebinarTilmelding, "session_tid">, sessionDato: string): boolean {
  return t.session_tid !== null && danskDato(t.session_tid) === sessionDato;
}

export interface FremmoedeDom {
  ewebinar_id: string;
  email: string;
  grad_foer: SetGrad | null;
  grad: SetGrad;
  overgang: Overgang;
  /** Præcis den hændelse, webhooken ville have bygget — null ved «ingen». */
  haendelse: HaendelseInput | null;
}

/**
 * Webhookens trin 155–185 som én ren funktion: gradFoer af den kendte række,
 * grad af den flettede, overgangen, og hændelsen med PRÆCIS webhookens felter
 * (ewebinar-webhook/index.ts:176–185). `nu` er importens ur — det bliver
 * hændelsens `time` og grundlaget for `frisk`, som ved webhooken.
 */
export function doemFremmoedeForImport(foer: WebinarTilmelding | null, flettet: WebinarTilmelding, nu: Date): FremmoedeDom {
  const gradFoer = foer ? doemSetGrad(foer, nu) : null;
  const grad = doemSetGrad(flettet, nu);
  const overgang = afgoerOvergang(gradFoer, grad);
  const haendelse = byggFremmoede(overgang, {
    ewebinarId: flettet.ewebinar_id,
    email: flettet.email,
    grad,
    setProcent: flettet.set_procent ?? null,
    webinarId: flettet.webinar_id,
    webinarTitel: flettet.webinar_titel ?? null,
    sessionTid: flettet.session_tid,
    tid: nu,
  });
  return { ewebinar_id: flettet.ewebinar_id, email: flettet.email, grad_foer: gradFoer, grad, overgang, haendelse };
}

/** Én linje i svaret pr. hændelse, der ville blive / blev sendt. */
export interface FremmoedeLinje {
  email: string;
  ewebinar_id: string;
  grad_foer: SetGrad | null;
  grad: SetGrad;
  overgang: Overgang;
  unique_id: string;
  frisk: "ja" | null;
  /** Kun efter en rigtig kørsel: klaviyo.ts' udfald (ok · timeout · loft · …). */
  udfald?: string;
}

export function somFremmoedeLinje(d: FremmoedeDom): FremmoedeLinje {
  const frisk = d.haendelse?.egenskaber?.frisk;
  return {
    email: d.email,
    ewebinar_id: d.ewebinar_id,
    grad_foer: d.grad_foer,
    grad: d.grad,
    overgang: d.overgang,
    unique_id: d.haendelse?.uniktId ?? `${d.ewebinar_id}:${d.grad}`,
    frisk: frisk === "ja" ? "ja" : null,
  };
}

/** Beviset i svaret: det, KUN den nye kode kan svare. */
export interface FremmoedeRapport {
  session_dato: string;
  /** Registranter, hvis session ligger på datoen (dansk tid). */
  i_sessionen: number;
  overgange: Record<Overgang, number>;
  /** Tørkørsel: det, der VILLE blive sendt. */
  ville_sende?: FremmoedeLinje[];
  /** Rigtig kørsel: det, der blev forsøgt sendt, med udfald pr. linje. */
  sendt?: FremmoedeLinje[];
  /** Antal pr. udfald (ok · timeout · fejl · loft · ingen_noegle · ingen_mail · …). Tom i tørkørsel. */
  udfald: Record<string, number>;
  fejl: string[];
  /** Rigtig kørsel: tidsbudgettet var brugt, før alle var sendt — INTET er skrevet; kør igen. */
  afbrudt?: boolean;
  /** Antal hændelser, der ikke nåede at blive sendt (kun når afbrudt). */
  udsat?: number;
}

export function tomFremmoedeRapport(sessionDato: string): FremmoedeRapport {
  return { session_dato: sessionDato, i_sessionen: 0, overgange: { deltog: 0, moedte_ikke: 0, ingen: 0 }, udfald: {}, fejl: [] };
}
