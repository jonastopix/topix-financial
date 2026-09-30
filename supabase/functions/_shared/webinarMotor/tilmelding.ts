/**
 * webinarMotor/tilmelding — formularens felter og dubletdommen (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i src/lib/webinarMotor/tilmelding.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 *
 * `webinar-tilmeld` er offentlig. Alt, hvad kroppen må bære, står i
 * KENDTE_FELTER; et ukendt felt afvises (kendteFelter.ts), og hvert kendt felt
 * dømmes her — så formularen på topix.dk og functionen afviser det samme.
 */

export const TILMELD_HANDLINGER = ["tilmeld", "sessioner"] as const;
export type TilmeldHandling = (typeof TILMELD_HANDLINGER)[number];

/** DE ENESTE felter, kroppen må bære (bodyFelter.guard: STRIKS). «hjemmeside» er honningfeltet. */
export const TILMELD_KENDTE_FELTER = [
  "handling", "slug", "session_id", "fornavn", "email", "samtykke_nyhedsbrev",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid",
  "landing", "referrer", "fbp", "fbc", "ga_client_id", "hjemmeside",
] as const;

/** Samme form som metaSend.ts:EMAIL_FORM — én mailregel i huset. */
export const EMAIL_FORM = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SLUG_FORM = /^[a-z0-9-]{3,60}$/;

export interface TilmeldInput {
  slug: string;
  sessionId: string;
  fornavn: string;
  /** Trimmet og med små bogstaver — webinar_tilmeldinger.email har CHECK (email = lower(email)). */
  email: string;
  samtykkeNyhedsbrev: boolean;
  spor: {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    utm_term: string | null;
    fbclid: string | null;
    origin: string | null;
    referrer: string | null;
    fbp: string | null;
    fbc_cookie: string | null;
    ga_client_id: string | null;
  };
}

const KONTROLTEGN = /[\u0000-\u001f\u007f]/;

/** En valgfri kort streng: null når tom/fraværende, afvist når den er for lang eller bærer kontroltegn. */
function valgfri(v: unknown, maks: number): { ok: true; v: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, v: null };
  if (typeof v !== "string" || v.length > maks || KONTROLTEGN.test(v)) return { ok: false };
  const t = v.trim();
  return { ok: true, v: t === "" ? null : t };
}

export type Inputdom = { ok: true; input: TilmeldInput } | { ok: false; fejl: string[] };

/** Dommen over en «tilmeld»-krop. Honningfeltet dømmes IKKE her — det er værnets (svar som om alt gik godt). */
export function laesTilmeldInput(body: Record<string, unknown>): Inputdom {
  const fejl: string[] = [];
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!SLUG_FORM.test(slug)) fejl.push("slug");
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim().toLowerCase() : "";
  if (!UUID_FORM.test(sessionId)) fejl.push("session_id");
  const fornavnRaa = typeof body.fornavn === "string" ? body.fornavn.replace(/\s+/g, " ").trim() : "";
  if (fornavnRaa.length < 1 || fornavnRaa.length > 80 || KONTROLTEGN.test(fornavnRaa) || /[<>@]/.test(fornavnRaa)) fejl.push("fornavn");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_FORM.test(email)) fejl.push("email");
  const samtykke = body.samtykke_nyhedsbrev;
  if (samtykke !== undefined && typeof samtykke !== "boolean") fejl.push("samtykke_nyhedsbrev");

  const felter: Array<[keyof TilmeldInput["spor"], unknown, number]> = [
    ["utm_source", body.utm_source, 200], ["utm_medium", body.utm_medium, 200], ["utm_campaign", body.utm_campaign, 200],
    ["utm_content", body.utm_content, 200], ["utm_term", body.utm_term, 200], ["fbclid", body.fbclid, 500],
    ["origin", body.landing, 1000], ["referrer", body.referrer, 1000], ["fbp", body.fbp, 200],
    ["fbc_cookie", body.fbc, 600], ["ga_client_id", body.ga_client_id, 100],
  ];
  const spor = {} as TilmeldInput["spor"];
  for (const [navn, v, maks] of felter) {
    const d = valgfri(v, maks);
    if (d.ok) spor[navn] = d.v;
    else fejl.push(navn === "origin" ? "landing" : navn === "fbc_cookie" ? "fbc" : navn);
  }
  if (fejl.length > 0) return { ok: false, fejl };
  return { ok: true, input: { slug, sessionId, fornavn: fornavnRaa, email, samtykkeNyhedsbrev: samtykke === true, spor } };
}

// ── Dubletdommen ─────────────────────────────────────────────────────────────

export interface EksisterendeTilmelding {
  id: string;
  sessionId: string | null;
  sessionStarterMs: number | null;
}

export interface MaalSession {
  id: string;
  status: string;
  starterMs: number;
  /** Exitrummets slut — efter den kan man ikke længere tilmelde sig. */
  slutMs: number;
  kapacitet: number | null;
  tilmeldte: number;
}

export type Tilmelddom =
  | { art: "samme"; id: string }
  | { art: "flyt"; id: string; fraSessionId: string }
  | { art: "ny" }
  | { art: "afvis"; grund: "aflyst" | "forbi" | "fuld" };

/**
 * DEN TOKEN-BEVISTE DOM — KUN webinar-rum «gen_tilmeld», hvor kalderen har et
 * gyldigt deltagertoken til samme mail og derfor ER personen selv.
 *
 * Samme mail og samme session → samme tilmelding (idempotent), også efter
 * sessionen. Ellers skal sessionen være åben for tilmelding: ikke aflyst, ikke
 * forbi (sen indgang er tilladt, indtil exitrummet lukker), ikke fuld.
 * Samme mail tilmeldt en ANDEN session af samme webinar, som ikke er begyndt →
 * tilmeldingen FLYTTES (færre mails, ren data). En allerede begyndt eller
 * afholdt session flyttes aldrig: den er historik — så bliver det en ny.
 *
 * ALDRIG i den offentlige webinar-tilmeld (rådets fund 30/9, HØJ): dér kan
 * enhver taste en andens mail, og en flytning uden legitimation ville lade en
 * fremmed flytte en andens tilmelding. Den offentlige vej er offentligTilmeldDom.
 *
 * `eksisterende` er platformens rækker for samme mail og SAMME webinar.
 */
export function tilmeldDom(sessionId: string, eksisterende: readonly EksisterendeTilmelding[], session: MaalSession, nuMs: number): Tilmelddom {
  const samme = eksisterende.find((e) => e.sessionId === sessionId);
  if (samme) return { art: "samme", id: samme.id };
  if (session.status === "aflyst") return { art: "afvis", grund: "aflyst" };
  if (session.status === "afholdt" || nuMs >= session.slutMs) return { art: "afvis", grund: "forbi" };
  if (session.kapacitet !== null && session.tilmeldte >= session.kapacitet) return { art: "afvis", grund: "fuld" };
  const kommende = eksisterende
    .filter((e) => e.sessionId !== null && e.sessionStarterMs !== null && e.sessionStarterMs > nuMs)
    .sort((a, b) => (a.sessionStarterMs as number) - (b.sessionStarterMs as number) || a.id.localeCompare(b.id));
  if (kommende.length > 0) return { art: "flyt", id: kommende[0].id, fraSessionId: kommende[0].sessionId as string };
  return { art: "ny" };
}

export type OffentligTilmelddom =
  | { art: "ny" }
  | { art: "kendt"; id: string }
  | { art: "afvis"; grund: "aflyst" | "forbi" | "fuld" };

/**
 * DEN OFFENTLIGE DOM — webinar-tilmeld, hvor kalderen INTET har bevist (rådets
 * fund 30/9: HØJ «flyt uden legitimation», MELLEM «enumeration»).
 *
 *   1. Sessionens egne afvisninger FØRST (aflyst · forbi · fuld) — for alle,
 *      tilmeldt eller ej. Ellers svarede en kendt mail 200 på en afholdt
 *      session, hvor en ukendt fik 409 «forbi»: et orakel for «er X tilmeldt».
 *   2. Samme mail + samme session → «kendt» (rækken røres ikke; svaret er det
 *      ensartede «ok — linket kommer på mail»).
 *   3. Alt andet → «ny» — OGSÅ når mailen står på en anden session. Der
 *      flyttes ALDRIG her: en flytning kræver tokenet (webinar-rum gen_tilmeld).
 *      To rækker på to sessioner får ikke dobbelte påmindelser: mailcronens
 *      dubletværn giver kun den NÆRMESTE session påmindelser pr. mail.
 *
 * `eksisterende` er platformens rækker for samme mail og SAMME webinar.
 */
export function offentligTilmeldDom(sessionId: string, eksisterende: readonly EksisterendeTilmelding[], session: MaalSession, nuMs: number): OffentligTilmelddom {
  if (session.status === "aflyst") return { art: "afvis", grund: "aflyst" };
  if (session.status === "afholdt" || nuMs >= session.slutMs) return { art: "afvis", grund: "forbi" };
  if (session.kapacitet !== null && session.tilmeldte >= session.kapacitet) return { art: "afvis", grund: "fuld" };
  const samme = eksisterende.find((e) => e.sessionId === sessionId);
  if (samme) return { art: "kendt", id: samme.id };
  return { art: "ny" };
}

/** eWebinars registrant-id for en platform-række (beslutning G7): «P-» + rækkens uuid. */
export const platformEwebinarId = (id: string): string => `P-${id}`;

// ── Den interne prøvesession (skive 3, beslutning D2.7) ──────────────────────

/**
 * Husets egne domæner. KUN adresser på præcis disse (ikke underdomæner) kan
 * tilmelde sig en INTERN session — prøvesessionen, der kører før nogen
 * offentlig session (Jonas 30/9: «ingen offentlig parallelkørsel»).
 */
export const INTERNE_DOMAENER = ["topix.dk", "theboardroom.dk"] as const;

/** Er mailen en af husets egne? Domænet efter det SIDSTE @, med små bogstaver, præcis lig. */
export function erInternAdresse(email: string): boolean {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return false;
  return (INTERNE_DOMAENER as readonly string[]).includes(e.slice(at + 1));
}

export type Interndom = { ok: true } | { ok: false; grund: "intern" };

/**
 * Må denne mail tilmelde sig denne session? En offentlig session: alle. En
 * intern: kun husets egne adresser. Dømt FØR tilmeldDom, så en fremmed
 * adresse aldrig når dubletdommen (og aldrig kan flyttes ind i en intern session).
 */
export function internDom(sessionIntern: boolean, email: string): Interndom {
  if (!sessionIntern) return { ok: true };
  return erInternAdresse(email) ? { ok: true } : { ok: false, grund: "intern" };
}

// ── Låsen for de offentlige sessioner (rådets fund 30/9, MELLEM) ─────────────

/**
 * app_config-nøglen. FRAVÆRENDE = false (fail-closed), som webinar_mail_aktiv.
 * Migrationen 20260930160000 lægger den som false (ON CONFLICT DO NOTHING).
 * Så længe den er lukket, findes motoren kun for den INTERNE prøvesession
 * (D2.7): ingen offentlig session vises, og ingen kan tilmelde sig en.
 */
export const OFFENTLIG_LAAS_NOEGLE = "webinarmotor_offentlig_aktiv";

/** Kun boolean true eller strengen "true" åbner. Alt andet (null, "ja", 1, fraværende) er lukket. */
export const offentligLaasAaben = (configValue: unknown): boolean => configValue === true || configValue === "true";

export type Laasdom = { ok: true } | { ok: false; grund: "ikke_aaben" };

/**
 * Må der tilmeldes til denne session? En intern: ja (internDom dømmer
 * adressen). En offentlig: kun når låsen er åben. Dømt FØR dubletdommen —
 * for ALLE, også en kendt mail, så svaret ikke afslører, hvem der står på listen.
 */
export function laasDom(sessionIntern: boolean, laasAaben: boolean): Laasdom {
  if (sessionIntern || laasAaben) return { ok: true };
  return { ok: false, grund: "ikke_aaben" };
}
