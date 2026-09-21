/**
 * metaSend — den RENE dom for platformens afsendelse til Metas Conversions API
 * (udkast 21/9-2026 aften, HASTER: webinar 22/9 kl. 09; recon-tracking.md §2, §3.3,
 * §4, §5; genbruger det fra ~/Downloads/udkast-meta-capi/ (19/9), der holder).
 * Deno-fri, så vitest dækker den (src/lib/__tests__/metaSend.test.ts). Afsendelsen
 * (fetch + nøglen) bor i metaSendAfsendelse.ts; kørslen i meta-send-cron.
 *
 * BESLUTTET (Jonas 21/9 aften):
 *   1. Ansøgningens afsendelse rører vi ikke: Meta-afsendelsen er et SELVSTÆNDIGT
 *      cron-job, der læser ansoegninger og sender det, der ikke er sendt. Idempotent
 *      gennem sporet meta_haendelser (event_id unik) og Metas egen dedup på event_id.
 *   2. Browserens user agent gemmes ved «opret» — for ALLE (rettet 22/9; før: kun med fbclid).
 *   3. To hændelser, begge Lead: content_name «application_started» (created_at =
 *      første gem) og «application_submitted» (indsendt_at). event_id
 *      «<ansøgnings-id>:started» / «:submitted».
 *  11. (UDVIDELSEN 22/9-2026, Jonas 21/9 aften — «det ultimative setup») ALLE ANSØGERE,
 *      ikke kun dem med fbclid. Webinarvejen (annonce → topix.dk → mail → /ansoeg?kilde=webinar)
 *      bærer INTET klik-id, og var derfor usynlig for Meta. Kandidaten er nu enhver ansøgning
 *      i 7-dagesvinduet med user agent og landing; klik-id'et er blevet ét signal blandt flere,
 *      ikke adgangsbetingelsen. Derfor er «ingen_fbclid» væk af SPRUNGET_GRUNDE.
 *  12. HASHET E-MAIL, TELEFON OG NAVN i user_data (em, ph, fn, ln) + country, normaliseret
 *      PRÆCIS efter Metas regler (citeret nedenfor) og SHA-256'et. Kun de felter, ansøgningen
 *      HAR: «application_started» sker på skærm 1 (CVR), hvor hverken mail eller navn findes
 *      endnu — så sendes de ikke. ET TOMT ELLER UHASHET FELT SENDES ALDRIG: en tom streng i em
 *      er ikke «ingen e-mail» for Meta, den er en værdi. Vogtet af HASHEDE_NOEGLER (64 hex) og
 *      af scanningen for rå e-mail/telefon i HELE payloaden (findForbudteNoegler).
 *      ALDRIG CVR, svar eller rå værdier.
 *  13. METAS EGNE COOKIER fra theboardroom.dk: _fbp og _fbc læses af fladen ved mount (samme
 *      mønster som GA — én parser, intet gæt, null når de mangler) og gemmes i ansoegninger.fbp
 *      og .fbc_cookie. I payloaden har URL'ens fbclid FORRANG på fbc (vi så det selv og kender
 *      tidspunktet); ellers sendes _fbc-cookien ORDRET. fbp sendes, når den er der.
 *  14. FRAVALG: ansoegninger.meta_fravalg (boolean, default false). Er den true, springes
 *      ansøgningen over med grunden «fravalgt» — FØR alt andet i dommen. Persondatateksten
 *      lover «Vil du helst være fri, så skriv til kontakt@theboardroom.dk», og dette er
 *      håndtaget, der indfrier det løfte.
 *   4. Låsen app_config.meta_send_aktiv (standard false): besluttet af Jonas
 *      21/9-2026 — ingen jurist; låsen er bevisets, ikke juraens. Cronen tørkører
 *      mens den er false; beviset sendes med test_event_code (tilladt uden lås);
 *      derefter slås låsen til med én SQL, og cronen sender for alvor.
 *   7. Princip 1: fejlede afsendelser giver én mail pr. døgn til driftModtager.
 *   8. (rettelse 21/9 aften) INTET LOFT PÅ FORSØG — Metas 7-dagesvindue ER loftet:
 *      «ingen_noegle», «fejl» og «timeout» prøves igen ved hver kørsel, til doem siger
 *      «for_gammel». Kun «sendt» og «ugyldig» prøves aldrig igen. Et forsøgsloft (før: 6 ×
 *      5 min = 30 min) ville smide hændelser væk, som Meta stadig tager imod.
 *   9. (rettelse 21/9 aften) METAS FEJLSVAR DØMMES PÅ FEJLKODEN, ikke kun HTTP-status:
 *      Graph API svarer 400 med error.code også for en ugyldig nøgle (190) og manglende
 *      rettigheder (10, 200–299) — det må ALDRIG blive «ugyldig» (som aldrig prøves igen).
 *      Dommen står i doemMetaSvar: MIDLERTIDIGE_KODER eller is_transient → fejl; NOEGLE_KODER
 *      (uden kode: type OAuthException eller 401/403) → ingen_noegle; øvrige 4xx → ugyldig; 5xx → fejl.
 *  10. (rettelse 21/9 aften, docs/tracking.md §6 punkt 9) EN NØGLE UDEN ADGANG TIL DATASÆTTET
 *      GEMMER SIG BAG KODE 100. Metas fejlreference for 100 med error_subcode 33, ordret:
 *      «Unsupported post request. This error may occur if your access token is not added as a
 *      system user with appropriate permissions to the ad account that owns a Custom Audience.»
 *      (https://developers.facebook.com/docs/marketing-api/error-reference/) — altså
 *      RETTIGHEDER, ikke payload. Kode 100 alene er «Invalid parameter» og bliver «ugyldig»
 *      som før; kun PARRET (100, 33) løftes til ingen_noegle, så hændelsen prøves igen, når
 *      adgangen er givet. «ugyldig» prøves aldrig igen, og en nøglefejl, der lander dér,
 *      ville tabe hændelsen for altid.
 *
 * METAS DOKUMENTATION, citeret (hentet 21/9-2026):
 *   fbc — https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc/
 *     «version.subdomainIndex.creationTime.<fbclid>» · subdomainIndex «which domain the
 *     cookie is defined on ('com' = 0, 'example.com' = 1, 'www.example.com' = 2)» ·
 *     «If you're generating this field on a server, and not saving an _fbc cookie, use the
 *     value 1» · creationTime «the timestamp when you first observed or received this
 *     fbclid value» (ms). → fb.1.<created_at i ms>.<fbclid>. Det gamle udkasts tvivl om «fb.1.»
 *     er afgjort af dokumentationen: server-genereret uden cookie = 1, uanset app.-subdomænet.
 *   7 dage — https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event
 *     «The event_time can be up to 7 days before you send an event to Facebook. If any
 *     event_time in data is greater than 7 days in the past, we return an error for the
 *     entire request and process no events.» · «The event_source_url is required for
 *     website events shared using the Conversions API.»
 *   user agent — https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 *     «The client_user_agent is required for website events shared using the Conversions
 *     API.» (Do not hash) · external_id: «Hashing recommended» · fbc: «Do not hash» ·
 *     «You must provide at least one of the following user_data parameters».
 *   brugerdata (em/ph/fn/ln/country) — samme customer-information-parameters-side (hentet 22/9-2026):
 *     «You must provide at least one of the following user_data parameters with the correct
 *     formatting in your request.» · em: «Hashing required.» «Trim any leading and trailing
 *     spaces. Convert all characters to lowercase.» (eksempel: «john_smith@gmail.com») ·
 *     ph: «Hashing required.» «Remove symbols, letters, and any leading zeros. Phone numbers
 *     must include a country code» · «Always include the country code as part of your customers'
 *     phone numbers.» (eksempel: «(650)555-1212» → «16505551212») · fn/ln: «Hashing required.»
 *     «Lowercase only with no punctuation. If using special characters, the text must be encoded
 *     in UTF-8 format.» (eksempel: «Mary» → «mary») · country: «Hashing required.» «Use the
 *     lowercase, 2-letter country codes in ISO 3166-1 alpha-2.» · external_id: «Hashing
 *     recommended.» · client_user_agent: «Do not hash.» Felternes type er «string or list<string>»
 *     — derfor sendes hvert aftryk som en etliste, som external_id altid har gjort.
 *   fbp/fbc-cookierne — https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc/
 *     «When the Meta Pixel is installed on a website, and the Pixel uses first-party cookies, the
 *     Pixel automatically saves a unique identifier to an _fbp cookie» · fbp-formen:
 *     «version.subdomainIndex.creationTime.randomnumber, where: version is always this prefix: fb» ·
 *     «We recommend that you always send _fbc and _fbp browser cookie values in the fbc and fbp
 *     event parameters, respectively, when available.» — altså cookieværdien SOM DEN ER ·
 *     «ClickID value is case sensitive - do not apply any modifications before using, such as
 *     lower or upper case.» · «If the _fbc cookie is not available because there is no Meta Pixel
 *     running on the website, it is still possible to send the fbc event parameter with the
 *     Conversion API event if an fbclid query parameter is in the URL of the current page request.»
 *   match quality — https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices
 *     «Sending additional customer information parameters may help increase Event Match Quality.» ·
 *     påkrævet for website-hændelser: action_source, event_source_url og client_user_agent ·
 *     «high-quality customer information parameters» nævner «email address (em) … name (fn and ln),
 *     phone number (ph)». IKKE FUNDET på nogen af siderne (målt 22/9): en advarsel mod tomme eller
 *     pladsholder-værdier i user_data. Reglen «aldrig et tomt felt» er derfor VORES (Jonas 21/9),
 *     ikke Metas — og den står, fordi et tomt aftryk er et aftryk af den tomme streng.
 *   test_event_code — https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
 *     «Events sent with test_event_code are not dropped. They flow into Events Manager and
 *     are used for targeting and ads measurement purposes.» · «The test_event_code field
 *     should be used only for testing. You need to remove it when sending your production
 *     payload.» · «you can send us up to 1,000 events at a time» · «If any event you send
 *     in a batch is invalid, we reject the entire batch.» → én hændelse pr. kald, og
 *     bevishændelsen ER en rigtig hændelse (den tæller — derfor sendes den kun én gang og
 *     står i sporet som sendt med sin testkode).
 *   fejlsvar — https://developers.facebook.com/docs/graph-api/guides/error-handling (hentet 21/9 aften)
 *     Svarets form: «{ "error": { "message": "Message describing the error", "type": "OAuthException",
 *     "code": 190, "error_subcode": 460, … "fbtrace_id": "EJplcsCHuLu" } }». «Error Codes — Code or
 *     Type · Name · What To Do»: «OAuthException — If no subcode is present, the login status or access
 *     token has expired, been revoked, or is otherwise invalid. Get a new access token.» · «102 API
 *     Session — [samme ordlyd]» · «1 API Unknown — Possibly a temporary issue due to downtime. Wait and
 *     retry the operation.» · «2 API Service — Temporary issue due to downtime. Wait and retry the
 *     operation.» · «4 API Too Many Calls — Temporary issue due to throttling. Wait and retry the
 *     operation, or examine your API request volume.» · «17 API User Too Many Calls — Temporary issue
 *     due to throttling. Wait and retry …» · «10 API Permission Denied — Permission is either not
 *     granted or has been removed. Handle the missing permissions.» · «190 Access token has expired —
 *     Get a new access token.» · «200-299 API Permission (Multiple values depending on permission) —
 *     Permission is either not granted or has been removed.» · «341 Application limit reached —
 *     Temporary issue due to downtime or throttling. Wait and retry the operation …».
 *   rate limits — https://developers.facebook.com/docs/graph-api/overview/rate-limiting (hentet 21/9 aften)
 *     «Throttle Error Codes: 4 — the app whose token is being used in the request has reached its rate
 *     limit. 17 — the User whose token is being used … 32 — the User or app whose token is being used
 *     in the Pages API request has reached its rate limit. 613 — a custom rate limit has been reached.»
 *     Eksempel: «{ "error": { "message": "(#32) Page request limit reached", "type": "OAuthException",
 *     "code": 32, … } }» — type OAuthException står også på throttling, derfor dømmes de midlertidige
 *     koder FØR typen. Feltet «is_transient» står IKKE på nogen af de to sider (målt 21/9) — det
 *     læses alligevel som «midlertidig», fordi det kun kan gøre et svar til «fejl» (prøves igen),
 *     aldrig til «ugyldig».
 */
import { kbhDato } from "./hverdage.ts";

/** Pixel/datasæt-id (recon-tracking §5: i begge GTM-containere og eWebinar — offentligt). */
export const META_DATASET_ID = "858180112996496";
export const META_API_VERSION = "v21.0";
/** Secret-navnet for datasættets Conversions API-token — KUN dette navn, læst KUN i metaSendAfsendelse.ts. */
export const META_SEND_TOKEN_NAVN = "META_SEND_TOKEN";
/** app_config-nøglen (låsen). Standard false. */
export const META_SEND_LAAS_NOEGLE = "meta_send_aktiv";
/** Metas vindue: event_time højst 7 dage før afsendelsen. */
export const META_VINDUE_DAGE = 7;
export const META_TIMEOUT_MS = 8000;
/** user agent afkortes som aftale_spor (aftale-underskrift/index.ts). */
export const USER_AGENT_MAKS = 512;

export const ARTER = ["started", "submitted"] as const;
export type Art = (typeof ARTER)[number];

/** Metas standardnavn Lead for begge; content_name som hjemmesidens gamle GTM-tags (recon §0 #2–3). */
export const META_EVENT: Readonly<Record<Art, { event_name: "Lead"; content_name: string }>> = {
  started: { event_name: "Lead", content_name: "application_started" },
  submitted: { event_name: "Lead", content_name: "application_submitted" },
};

export function eventId(ansoegningId: string, art: Art): string {
  return `${ansoegningId}:${art}`;
}

/** fb.1.<ms da fbclid blev set>.<fbclid> — indeks 1 er Metas regel for server-genereret uden cookie. */
export function bygFbc(fbclid: string, setTid: Date): string {
  return `fb.1.${setTid.getTime()}.${fbclid}`;
}

const somTid = (v: string | null | undefined): Date | null => {
  if (typeof v !== "string" || v.trim() === "") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
};

/** Inden for Metas vindue: 0 ≤ nu − tid ≤ 7 dage. */
export function erIVindue(tid: Date, nu: Date): boolean {
  const alder = nu.getTime() - tid.getTime();
  return alder >= 0 && alder <= META_VINDUE_DAGE * 86_400_000;
}

/**
 * Rækken, cronen læser. E-mail, navn og telefon står her for ÉT formål: at blive
 * normaliseret og HASHET (normaliserBrugerdata + hashBrugerdata). De forlader aldrig
 * huset råt — værnet findForbudteNoegler prøver den færdige payload for netop det.
 * CVR, svar, hjemmeside og ip_hash læses ikke (RAEKKE_FELTER i cronen).
 */
export interface AnsoegningTilMeta {
  id: string;
  created_at: string;
  indsendt_at: string | null;
  fbclid: string | null;
  landing: string | null;
  user_agent: string | null;
  /** Hashes til em — «application_started» sker på skærm 1 (CVR), hvor den endnu er null. */
  email: string | null;
  /** Hashes til fn + ln (ét felt i formularen; første ord er fornavnet). */
  navn: string | null;
  /** Hashes til ph. */
  telefon: string | null;
  /** Metas egen _fbp-cookie fra theboardroom.dk, ordret. */
  fbp: string | null;
  /** Metas egen _fbc-cookie, ordret — bruges kun når URL'en ikke bar et fbclid. */
  fbc_cookie: string | null;
  /** Fravalget (pkt. 14): true → der sendes intet om denne ansøgning, nogensinde. */
  meta_fravalg: boolean | null;
}

// ── Brugerdata: normaliseringen efter Metas regler (citeret i filhovedet) ────

/** Metas land for alle vores ansøgere: «Use the lowercase, 2-letter country codes in ISO 3166-1 alpha-2.» */
export const META_LAND = "dk";
/** Landekoden, der sættes foran et otte-cifret (dansk) nummer. */
export const META_LANDEKODE = "45";
/** En e-mail, vi tør sende et aftryk af: præcis ét snabel-a og mindst ét punktum i domænet. */
export const EMAIL_FORM = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** em: «Trim any leading and trailing spaces. Convert all characters to lowercase.» Duer den ikke som e-mail, sendes den ikke. */
export function normaliserEmail(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return EMAIL_FORM.test(s) ? s : null;
}

/**
 * ph: «Remove symbols, letters, and any leading zeros. Phone numbers must include a country
 * code» — Metas eget eksempel «(650)555-1212» → «16505551212».
 * VORES ANTAGELSE, skrevet frem: præcis 8 cifre er et dansk nummer og får 45 foran (formularen
 * beder om et dansk nummer, og ansøgerne er danske SMV'er). 9–15 cifre bærer allerede sin
 * landekode og sendes, som de står. Alt andet er ikke et nummer → null, og så sendes ph slet ikke.
 */
export function normaliserTelefon(v: string | null | undefined): string | null {
  const cifre = (v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (cifre.length === 8) return `${META_LANDEKODE}${cifre}`;
  return cifre.length >= 9 && cifre.length <= 15 ? cifre : null;
}

/**
 * fn/ln: «Lowercase only with no punctuation. If using special characters, the text must be
 * encoded in UTF-8 format.» Tegnsætningen FJERNES (den erstattes ikke af mellemrum):
 * «Anne-Marie» → «annemarie». æ, ø og å er bogstaver (\p{L}) og bliver stående — UTF-8 er
 * netop det, Meta tillader.
 */
export function normaliserNavnedel(v: string): string | null {
  const s = v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return s === "" ? null : s;
}

/** Ét navnefelt → fornavn + efternavn: første ord er fornavnet, resten efternavnet. Ét ord alene → intet ln. */
export function normaliserNavn(v: string | null | undefined): { fn: string | null; ln: string | null } {
  const ord = (v ?? "").trim().split(/\s+/).filter((o) => o !== "");
  if (ord.length === 0) return { fn: null, ln: null };
  return { fn: normaliserNavnedel(ord[0]), ln: ord.length > 1 ? normaliserNavnedel(ord.slice(1).join(" ")) : null };
}

export const BRUGERDATA_NOEGLER = ["em", "ph", "fn", "ln", "country"] as const;
export type BrugerdataNoegle = (typeof BRUGERDATA_NOEGLER)[number];
export type BrugerdataRaa = Record<BrugerdataNoegle, string | null>;
export type HashetBrugerdata = Partial<Record<BrugerdataNoegle, string[]>>;

/** Ansøgningens felter, normaliseret efter Metas regler — stadig i klartekst, aldrig sendt sådan. */
export function normaliserBrugerdata(r: AnsoegningTilMeta): BrugerdataRaa {
  const navn = normaliserNavn(r.navn);
  return { em: normaliserEmail(r.email), ph: normaliserTelefon(r.telefon), fn: navn.fn, ln: navn.ln, country: META_LAND };
}

/** Hvilke nøgler ville blive sendt — til tørkørslen og beviset. ALDRIG værdierne. */
export function brugerdataNoegler(raa: BrugerdataRaa): BrugerdataNoegle[] {
  return BRUGERDATA_NOEGLER.filter((n) => typeof raa[n] === "string" && raa[n] !== "");
}

/**
 * Hasher KUN de felter, ansøgningen HAR (Jonas 21/9): et tomt eller uhashet felt sendes
 * aldrig — en tom streng i em er ikke «ingen e-mail» for Meta, den er en værdi, og aftrykket
 * af den tomme streng er et gyldigt aftryk, der matcher ingen. Hasheren gives ind
 * (sha256Hex fra aftryk.ts), så denne fil forbliver Deno-fri og crypto-fri.
 */
export async function hashBrugerdata(raa: BrugerdataRaa, hash: (s: string) => Promise<string>): Promise<HashetBrugerdata> {
  const ud: HashetBrugerdata = {};
  for (const n of brugerdataNoegler(raa)) ud[n] = [await hash(raa[n] as string)];
  return ud;
}

// ── Metas egne cookier ──────────────────────────────────────────────────────

/** _fbc: «version.subdomainIndex.creationTime.<fbclid>», version altid «fb». */
export const FBC_FORM = /^fb\.\d{1,3}\.\d{1,20}\.[A-Za-z0-9_-]{1,400}$/;
/** _fbp: «version.subdomainIndex.creationTime.randomnumber». */
export const FBP_FORM = /^fb\.\d{1,3}\.\d{1,20}\.\d{1,30}$/;

/**
 * fbc: URL'ens klik-id har FORRANG — vi så det selv og kender tidspunktet (created_at).
 * Ellers Metas egen _fbc-cookie ORDRET: «We recommend that you always send _fbc and _fbp
 * browser cookie values in the fbc and fbp event parameters, respectively, when available.»
 * og «ClickID value is case sensitive - do not apply any modifications before using».
 * Serveren dømmer formen igen; en cookie uden Metas form sendes ikke. Er der ingen af delene,
 * sendes fbc slet ikke — og hændelsen sendes stadig, nu på em/ph/fn/ln/external_id.
 */
export function bygFbcFelt(fbclid: string | null | undefined, fbcCookie: string | null | undefined, setTid: Date): string | null {
  const klik = (fbclid ?? "").trim();
  if (klik !== "") return bygFbc(klik, setTid);
  const c = (fbcCookie ?? "").trim();
  return FBC_FORM.test(c) ? c : null;
}

/** Hvor fbc kom fra — til tørkørslen og sporet. Aldrig værdien. */
export function fbcKilde(fbclid: string | null | undefined, fbcCookie: string | null | undefined): "klik_id" | "cookie" | "ingen" {
  if ((fbclid ?? "").trim() !== "") return "klik_id";
  return FBC_FORM.test((fbcCookie ?? "").trim()) ? "cookie" : "ingen";
}

/** _fbp ordret, når den har Metas form; ellers sendes fbp ikke. */
export function bygFbpFelt(fbp: string | null | undefined): string | null {
  const v = (fbp ?? "").trim();
  return FBP_FORM.test(v) ? v : null;
}

/**
 * Sprunget over, med grund. «ingen_fbclid» UDGIK 22/9 (pkt. 11): klik-id'et er ikke længere
 * adgangsbetingelsen, og webinarvejen har intet. «fravalgt» kom til (pkt. 14).
 */
export const SPRUNGET_GRUNDE = ["fravalgt", "ingen_user_agent", "ingen_landing", "ikke_indsendt", "ingen_tidspunkt", "for_gammel"] as const;
export type SprungetGrund = (typeof SPRUNGET_GRUNDE)[number];

export type Dom = { ok: true; tid: Date } | { ok: false; grund: SprungetGrund };

/**
 * Dommen pr. (ansøgning, art): må den sendes, og med hvilket event_time?
 * FRAVALGET STÅR FØRST — en ansøger, der har bedt sig fri, prøves ikke af på noget andet.
 * Meta kræver client_user_agent og event_source_url for website-hændelser; mangler en af dem,
 * sendes der intet. Klik-id'et er IKKE et krav længere.
 */
export function doem(r: AnsoegningTilMeta, art: Art, nu: Date): Dom {
  if (r.meta_fravalg === true) return { ok: false, grund: "fravalgt" };
  if (!r.user_agent || r.user_agent.trim() === "") return { ok: false, grund: "ingen_user_agent" };
  if (!r.landing || r.landing.trim() === "") return { ok: false, grund: "ingen_landing" };
  if (art === "submitted" && !r.indsendt_at) return { ok: false, grund: "ikke_indsendt" };
  const tid = somTid(art === "started" ? r.created_at : r.indsendt_at);
  if (tid === null) return { ok: false, grund: "ingen_tidspunkt" };
  if (!erIVindue(tid, nu)) return { ok: false, grund: "for_gammel" };
  return { ok: true, tid };
}

export interface MetaPayload {
  event_name: "Lead";
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  /** external_id og client_user_agent altid; em/ph/fn/ln/country og fbc/fbp KUN når de findes. */
  user_data: HashetBrugerdata & { external_id: string[]; client_user_agent: string; fbc?: string; fbp?: string };
  custom_data: { content_name: string };
}

/**
 * Payloaden — præcis de tilladte felter, og INTET felt uden værdi. externalIdAftryk er
 * sha256Hex(ansøgnings-id) og `hashet` er hashBrugerdata(normaliserBrugerdata(r)); begge
 * regnes af kalderen, så dommen her er synkron og ren.
 * fbc's tidspunkt er created_at — første gang vi så fbclid'et (Metas regel), ikke hændelsens tid.
 * SPREDNINGEN ER MED VILJE: `...hashet` lægger kun de nøgler ind, der findes, og fbc/fbp
 * kommer kun med, når de ikke er null. Et `fbc: null` ville være en værdi, ikke et fravær.
 */
export function bygPayload(
  r: AnsoegningTilMeta,
  art: Art,
  tid: Date,
  externalIdAftryk: string,
  hashet: HashetBrugerdata,
): MetaPayload {
  const set = somTid(r.created_at) ?? tid;
  const fbc = bygFbcFelt(r.fbclid, r.fbc_cookie, set);
  const fbp = bygFbpFelt(r.fbp);
  return {
    event_name: META_EVENT[art].event_name,
    event_time: Math.floor(tid.getTime() / 1000),
    event_id: eventId(r.id, art),
    action_source: "website",
    event_source_url: (r.landing ?? "").trim(),
    user_data: {
      ...hashet,
      external_id: [externalIdAftryk],
      client_user_agent: (r.user_agent ?? "").trim().slice(0, USER_AGENT_MAKS),
      ...(fbc !== null ? { fbc } : {}),
      ...(fbp !== null ? { fbp } : {}),
    },
    custom_data: { content_name: META_EVENT[art].content_name },
  };
}

/**
 * Nøgler, der ALDRIG må stå i det, vi sender. em, ph, fn, ln og country STOD her indtil 22/9
 * — de sendes nu HASHET og vogtes i stedet af HASHEDE_NOEGLER nedenfor, som kræver et
 * 64-tegns aftryk. Det samme gælder fbp, der nu er et tilladt felt med Metas egen form.
 * Tilbage står Metas øvrige kontaktfelter, som vi hverken har eller vil sende, og vores egne
 * ord for ansøgerens oplysninger — de må ikke kunne snige sig ind som en nøgle.
 */
export const FORBUDTE_NOEGLER = [
  "ge", "db", "ct", "st", "zp", "client_ip_address", "subscription_id", "lead_id",
  "email", "navn", "telefon", "cvr", "svar", "ip", "ip_hash", "udfordring", "hjemmeside", "virksomhedsnavn",
  // GA's id'er (21/9 aften) hører til Google, aldrig til Metas payload.
  "ga_client_id", "ga_session_id",
] as const;

/** Nøgler, hvis værdi SKAL være et 64-tegns SHA-256-aftryk (Metas «Hashing required»). */
export const HASHEDE_NOEGLER = ["em", "ph", "fn", "ln", "country", "external_id"] as const;
export const AFTRYK_FORM = /^[0-9a-f]{64}$/;

/** En rå e-mail — hvor som helst i payloaden, også midt i en landing-URL. */
export const RAA_EMAIL_FORM = /[^\s@,;"']+@[^\s@,;"']+\.[A-Za-z]{2,}/;
/** Tegnene, et telefonnummer/CVR kan være skrevet med. */
const TAL_TEGN_FORM = /^\+?[\d\s()./-]+$/;
/** Et landepræfiks midt i en streng — «+45 12 34 56 78» i en URL er lige så meget et læk. */
export const RAA_LANDEKODE_FORM = /\+45[\s-]?(?:\d[\s-]?){8}/;

/**
 * Er HELE strengen et telefonnummer eller et CVR (8–15 cifre)? Kun hele strenge, med vilje:
 * fbc og fbp indeholder lange cifferrækker («fb.1.1790017200000.…»), men også bogstaver og
 * punktummer, så de rammes ikke — og et aftryk er 64 tegn og dermed uden for grænsen.
 */
export function erRaaTal(v: string): boolean {
  const t = v.trim();
  if (t === "" || t.length > 20 || !TAL_TEGN_FORM.test(t)) return false;
  const cifre = t.replace(/\D/g, "").length;
  return cifre >= 8 && cifre <= 15;
}

/** Er værdien et aftryk — eller en ikke-tom liste af aftryk? */
export function erKunAftryk(v: unknown): boolean {
  if (typeof v === "string") return AFTRYK_FORM.test(v);
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && AFTRYK_FORM.test(x));
}

/**
 * Værnet, kørt på DET FAKTISKE OBJEKT lige før afsendelsen. Tre ting fælder en payload:
 *   1. en forbudt nøgle, hvor som helst;
 *   2. en hashet nøgle, hvis værdi ikke er et 64-tegns aftryk (tom streng, uhashet værdi,
 *      tom liste) — «send ALDRIG et tomt eller uhashet felt» (Jonas 21/9);
 *   3. en rå e-mail eller et rået tal (telefon/CVR) som VÆRDI, hvor som helst.
 * Hvert fund bærer sin sti og sin grund. Tom liste = payloaden er ren.
 */
export function findForbudteNoegler(obj: unknown, sti = ""): string[] {
  if (typeof obj === "string") {
    const ud: string[] = [];
    if (RAA_EMAIL_FORM.test(obj)) ud.push(`${sti}: rå e-mail`);
    if (erRaaTal(obj) || RAA_LANDEKODE_FORM.test(obj)) ud.push(`${sti}: rå telefon/CVR`);
    return ud;
  }
  if (obj === null || typeof obj !== "object") return [];
  const ud: string[] = [];
  if (Array.isArray(obj)) { obj.forEach((v, i) => ud.push(...findForbudteNoegler(v, `${sti}[${i}]`))); return ud; }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const her = sti ? `${sti}.${k}` : k;
    if ((FORBUDTE_NOEGLER as readonly string[]).includes(k)) ud.push(`${her}: forbudt nøgle`);
    if ((HASHEDE_NOEGLER as readonly string[]).includes(k) && !erKunAftryk(v)) ud.push(`${her}: ikke et 64-tegns aftryk`);
    ud.push(...findForbudteNoegler(v, her));
  }
  return ud;
}

/** Låsen: kun boolean true eller strengen "true" åbner. Alt andet (null, "ja", 1) er lukket. */
export function laasErAktiv(configValue: unknown): boolean {
  return configValue === true || configValue === "true";
}

/**
 * Sender kørslen for alvor? Kræver dry_run: false OG (låsen ELLER en testkode).
 * Testkoden er beviset: tilladt uden lås, og hændelsen sendes med koden — Meta dropper den ikke.
 */
export function senderRigtigt(a: { dryRun: boolean; laasAktiv: boolean; testEventCode: string | null }): boolean {
  if (a.dryRun) return false;
  return a.laasAktiv || a.testEventCode !== null;
}

export const TEST_EVENT_CODE_FORM = /^[A-Za-z0-9]{4,40}$/;
export function erTestEventCode(v: unknown): v is string {
  return typeof v === "string" && TEST_EVENT_CODE_FORM.test(v);
}

// ── Sporet (meta_haendelser) ─────────────────────────────────────────────────

export const SPOR_UDFALD = ["sendt", "fejl", "timeout", "ugyldig", "ingen_noegle"] as const;
export type SporUdfald = (typeof SPOR_UDFALD)[number];

export interface SporRaekke {
  event_id: string;
  udfald: SporUdfald;
  forsoeg: number;
}

/**
 * Idempotensen: sendt → aldrig igen; ugyldig (4xx med en rigtig fejl i payloaden) → aldrig igen
 * (retter sig ikke selv). ALT ANDET (ingen_noegle, fejl, timeout) prøves igen ved hver kørsel —
 * INTET forsøgsloft: Metas 7-dagesvindue (doem → «for_gammel») er loftet (rettelse 21/9 aften).
 */
export function maaForsoeges(spor: SporRaekke | null): { ok: true } | { ok: false; grund: "allerede_sendt" | "ugyldig" } {
  if (!spor) return { ok: true };
  if (spor.udfald === "sendt") return { ok: false, grund: "allerede_sendt" };
  if (spor.udfald === "ugyldig") return { ok: false, grund: "ugyldig" };
  return { ok: true };
}

/** Nøgle/rettighed (Graph API error-handling, citeret i filhovedet): 190, 102, 10 og 200–299 → ingen_noegle. */
export const NOEGLE_KODER: readonly number[] = [190, 102, 10];
export const erNoegleKode = (kode: number): boolean => NOEGLE_KODER.includes(kode) || (kode >= 200 && kode <= 299);
/** Midlertidigt (downtime/throttling — «Wait and retry»): 1, 2, 4, 17, 32, 341, 613 → fejl (prøves igen). */
export const MIDLERTIDIGE_KODER: readonly number[] = [1, 2, 4, 17, 32, 341, 613];

/**
 * Nøgle/rettighed, der gemmer sig bag en ANDEN kode — parret (code, error_subcode).
 * (100, 33) er Metas måde at sige «objektet findes ikke, eller din nøgle må det ikke»:
 * «Unsupported post request. This error may occur if your access token is not added as a
 * system user with appropriate permissions to the ad account …» (error-reference).
 * Uden dette par ville en nøgle uden adgang til datasættet blive dømt «ugyldig» — og
 * «ugyldig» prøves ALDRIG igen. Listen er parvis med vilje: kode 100 alene er en
 * payloadfejl og skal blive ved med at være det.
 */
export const NOEGLE_SUBKODER: readonly (readonly [number, number])[] = [[100, 33]];
export const erNoegleSubkode = (kode: number | null, subkode: number | null): boolean =>
  kode !== null && subkode !== null && NOEGLE_SUBKODER.some(([k, s]) => k === kode && s === subkode);

interface MetaFejl { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean }

/**
 * Metas svar: { events_received, fbtrace_id } ved 2xx; { error: { message, type, code, … } } ellers.
 * Dømmes på FEJLKODEN (rettelse 21/9 aften), i denne rækkefølge:
 *   1. midlertidig (MIDLERTIDIGE_KODER eller is_transient: true) → «fejl» — FØR typen, fordi
 *      throttling også bærer type OAuthException (Metas eget eksempel på kode 32);
 *   2. nøgle/rettighed → «ingen_noegle»: KODEN afgør, når der er en (NOEGLE_KODER, 200–299),
 *      og PARRET (kode, error_subcode) afgør for dem, der gemmer sig bag kode 100 —
 *      (100, 33) er en manglende rettighed på datasættet, ikke en payloadfejl (NOEGLE_SUBKODER).
 *      Uden kode afgør typen (OAuthException — Metas ord: «If no subcode is present, the login
 *      status or access token has expired …») eller HTTP 401/403. Kode 100 UDEN subkode 33
 *      er «Invalid parameter» og bærer i praksis også type OAuthException — en payloadfejl;
 *   3. andre 4xx (fx kode 100) → «ugyldig» — den eneste, der aldrig prøves igen;
 *   4. 5xx og alt andet → «fejl».
 */
export function doemMetaSvar(status: number, tekst: string): { udfald: SporUdfald; events_received: number | null; fejl: string | null; kode: number | null } {
  let krop: Record<string, unknown> | null = null;
  try { krop = JSON.parse(tekst) as Record<string, unknown>; } catch { krop = null; }
  if (status >= 200 && status < 300) {
    const n = typeof krop?.events_received === "number" ? krop.events_received : null;
    return { udfald: "sendt", events_received: n, fejl: n === null ? "svar uden events_received" : null, kode: null };
  }
  const e = (krop?.error ?? null) as MetaFejl | null;
  const kode = typeof e?.code === "number" ? e.code : null;
  const subkode = typeof e?.error_subcode === "number" ? e.error_subcode : null;
  const fejl = e?.message ? `${e.message}${kode !== null ? ` (kode ${kode}${subkode !== null ? `/${subkode}` : ""})` : ""}` : tekst.slice(0, 300);
  if ((kode !== null && MIDLERTIDIGE_KODER.includes(kode)) || e?.is_transient === true) return { udfald: "fejl", events_received: null, fejl, kode };
  if (kode !== null ? (erNoegleKode(kode) || erNoegleSubkode(kode, subkode)) : (e?.type === "OAuthException" || status === 401 || status === 403)) return { udfald: "ingen_noegle", events_received: null, fejl, kode };
  if (status >= 400 && status < 500) return { udfald: "ugyldig", events_received: null, fejl, kode };
  return { udfald: "fejl", events_received: null, fejl, kode };
}

// ── Alarmen (princip 1) ──────────────────────────────────────────────────────

export const ALARM_NOEGLE_PRAEFIKS = "meta-send-alarm:";
export const ALARM_MAIL_LABEL = "meta-send-alarm";
export const ALARM_KLOKKE_TYPE = "drift";
/** Én mail pr. dansk kalenderdøgn. */
export function alarmNoegle(nu: Date): string {
  return `${ALARM_NOEGLE_PRAEFIKS}${kbhDato(nu)}`;
}

export interface FejletAfsendelse { event_id: string; udfald: SporUdfald; fejl: string | null; forsoeg: number }

export function alarmTekst(fejlede: readonly FejletAfsendelse[], nu: Date): { emne: string; titel: string; afsnit: string[]; blokke: { overskrift: string; tekst: string }[]; tekst: string } {
  const n = fejlede.length;
  const hvad = n === 1 ? "1 Meta-hændelse" : `${n} Meta-hændelser`;
  const emne = `${hvad} kunne ikke sendes — Conversions API har brug for et menneske`;
  const titel = `Meta: ${hvad} kunne ikke sendes (${kbhDato(nu)})`;
  const noegle = fejlede.some((f) => f.udfald === "ingen_noegle");
  const afsnit = [
    `meta-send-cron kunne ikke sende ${hvad} til Metas Conversions API. Ansøgningerne er urørte — kun målingen mangler.`,
    noegle
      ? `Mindst én fejlede på nøglen eller rettigheden (Metas fejlkode 190/102/10/200–299 eller OAuthException): ${META_SEND_TOKEN_NAVN} mangler, er udløbet eller har ikke adgang til datasættet ${META_DATASET_ID}. Ret secret'en i Lovable — den prøves igen ved hver kørsel, så længe hændelsen er under 7 dage gammel.`
      : "fejl/timeout prøves igen ved hver kørsel, så længe hændelsen er under 7 dage gammel; «ugyldig» (4xx med en rigtig fejl i payloaden, fx kode 100) prøves ikke igen — payloaden skal rettes.",
  ];
  const blokke = fejlede.slice(0, 5).map((f) => ({ overskrift: f.event_id, tekst: `${f.udfald} · forsøg ${f.forsoeg}${f.fejl ? ` — ${f.fejl}` : ""}` }));
  const tekst = [emne, ...afsnit, "", ...blokke.map((b) => `${b.overskrift}: ${b.tekst}`), "", "Sporet: meta_haendelser. Tørkørsel: SELECT public.kald_edge('meta-send-cron');"].join("\n");
  return { emne, titel, afsnit, blokke, tekst };
}
