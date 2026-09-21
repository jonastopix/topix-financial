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
 *
 * ── TRIN 2 (22/9-2026, Jonas 21/9 22:25 — «det ultimative setup», princip (g)) ──
 *  15. TRE NYE HÆNDELSER, alle på ANSØGNINGEN: «Kvalificeret» (rådgiverens tal_med_dem),
 *      «Schedule» (den FØRSTE book) og «Purchase» (medlemskabets første betaling). Samme cron,
 *      samme spor, samme lås, samme alarm — ingen ny function, ingen ny secret, ingen ny cron.
 *      event_id: «<ansoegning_id>:kvalificeret|booket|purchase», som sporets egen CHECK kræver.
 *  16. DE TRE ER IKKE WEBSITE-HÆNDELSER. De sker i VORES system: rådgiveren trykker i fladen,
 *      Calendly-webhooken skriver bookingen, Stripe-webhooken skriver perioden. Vi har ingen
 *      browser at pege på, og ansøgningens user agent hører til et ANDET øjeblik — at sende den
 *      ville være en påstand om noget, vi ikke har målt. Meta dokumenterer præcis denne sag som
 *      CRM-integrationen: action_source «system_generated» + custom_data.event_source «crm» +
 *      lead_event_source. Derfor bærer de tre HVERKEN client_user_agent ELLER event_source_url
 *      (som Meta kun kræver for website-hændelser), og dommen kræver dem ikke.
 *  17. WEBINARETS KLIK-ID PÅ ANSØGNINGEN. fbc-rækkefølgen er nu: (1) URL'ens fbclid, (2) _fbc-
 *      cookien ordret, (3) WEBINARTILMELDINGENS fbclid — den seneste tilmelding på samme mail
 *      FØR ansøgningens created_at, med et klik-id. 655 af 675 tilmeldinger bar ét (målt i prod
 *      21/9 22:12), og webinarvejen bærer intet klik-id i sit eget link. Tidspunktet er
 *      tilmeldingens registreret_at (ellers dens created_at) — Metas egen regel: «If you don't
 *      save the _fbc cookie, use the timestamp when you first observed or received this fbclid
 *      value». GYLDIGHEDEN: Meta angiver INGEN udløbstid for et fbclid, men anbefaler _fbc-
 *      cookien «with the 90 days expiration time». Et klik-id, Metas egen cookie ville have
 *      tabt, bruger vi ikke — derfor WEBINAR_FBCLID_MAKS_DAGE = 90.
 *  18. WEBINARHÆNDELSER BYGGES IKKE (bevidst fravalg 21/9 22:12). eWebinars raa bærer INGEN
 *      user agent — 675 tilmeldinger gennemgået, 0 rækker med «agent» i nøglerne (der er
 *      deviceTypeWhenRegistered og deviceTypeWhenWatching, men ingen UA-streng). En tilmelding
 *      ER en website-hændelse, og Meta kræver client_user_agent for dem; at kalde den
 *      «system_generated» ville være usandt, for et menneske udfyldte en formular i en browser.
 *      Så hellere ingen hændelse end en forkert action_source.
 *  19. PURCHASE'S BELØB er company_perioder.beloeb_oere (art «indgang») omregnet til KRONER.
 *      Målt: kontrakter.pris_eks_moms_oere er SAMME tal (_shared/kontraktRaekke.ts:100 —
 *      «pris_eks_moms_oere: Math.round(input.beloeb_oere)»), men kontraktrækken skrives
 *      fail-soft og kan mangle, mens perioden er den række, der UDLØSER hændelsen og er
 *      «not null». Valutaen bor ikke i koden, men på Stripe-priserne bag lookup_key, og er
 *      MÅLT 21/9 22:33: alle 15 priser på produktet «The Boardroom — medlemskab» er DKK.
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
 *   CRM-hændelser — https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration/
 *     (hentet 22/9-2026) Metas eget krav for hændelser, der kommer ud af virksomhedens system:
 *     action_source «system_generated»; custom_data SKAL bære «event_source»: «crm» og
 *     «lead_event_source»: «The name of the CRM where the events are coming from»; user_data
 *     skal bære mindst ét kundeoplysningsfelt. Metas eget eksempel:
 *       { "event_name": "Lead", "event_time": 1664577963, "action_source": "system_generated",
 *         "user_data": { "lead_id": …, "em": […], "ph": […] },
 *         "custom_data": { "lead_event_source": "Your CRM", "event_source": "crm" } }
 *     Hændelsesnavnene er «advertiser-defined», og siden viser en tragt med trin som «Raw Lead»,
 *     «Marketing Qualified Lead», «Sales Opportunity» og «Converted». client_user_agent og
 *     event_source_url nævnes IKKE for disse hændelser. lead_id er Metas eget id fra Lead Ads —
 *     vi har det ikke (vores leads kommer fra en formular, ikke fra Lead Ads), og det bliver
 *     stående på FORBUDTE_NOEGLER.
 *   action_source — https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event
 *     «email» · «website» — «Conversion was made on your website.» · «app» · «phone_call» ·
 *     «chat» · «physical_store» · «system_generated» — «Conversion happened automatically, for
 *     example, a subscription renewal that's set to auto-pay each month.» · «business_messaging»
 *     · «other» — «Conversion happened in a way not listed.» Samme side om navnet: event_name er
 *     «A standard event or custom event name», og om dedup: «This ID can be any unique string
 *     chosen by the advertiser» · «For deduplication, the eventID from a browser or app event
 *     must match the event_id in the corresponding server event.»
 *   Schedule og Purchase — https://developers.facebook.com/docs/meta-pixel/reference
 *     «Schedule — When a person books an appointment to visit one of your locations.» ·
 *     «Purchase — When a purchase is made or checkout flow is completed.» For Purchase:
 *     «Required: currency and value». Begge er Metas STANDARDhændelser; «Kvalificeret» er en
 *     custom event med vores eget danske navn, så den aldrig kan kollidere med eWebinars egen
 *     pixel — som kører på SAMME datasæt-id 858180112996496 med umålte hændelser.
 *   fbc'ets levetid — https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc/
 *     «If you don't save the _fbc cookie, use the timestamp when you first observed or received
 *     this fbclid value» · cookien anbefales sat «with the 90 days expiration time» · «These
 *     values are subject to change over multiple browser sessions, so we recommend refreshing a
 *     user's profile with the latest value whenever possible.» INGEN udløbstid for selve
 *     fbclid'et står på siden (målt 22/9) — 90 dage er den eneste levetid, Meta dokumenterer,
 *     og den bruges derfor som grænse for et klik-id lånt fra webinartilmeldingen.
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

export const ARTER = ["started", "submitted", "kvalificeret", "booket", "purchase"] as const;
export type Art = (typeof ARTER)[number];

/**
 * DE TO SLAGS HÆNDELSER (trin 2, pkt. 16).
 *   WEBSITE: ansøgeren sad selv i en browser på app.theboardroom.dk. Meta kræver
 *     client_user_agent og event_source_url for dem — og vi HAR dem.
 *   CRM: hændelsen skete i VORES system (rådgiverens klik, Calendly-webhooken,
 *     Stripe-webhooken). Ingen browser at pege på. Metas CRM-integration er den
 *     dokumenterede vej: action_source «system_generated» + event_source «crm».
 */
export const ARTER_WEBSITE = ["started", "submitted"] as const;
export const ARTER_CRM = ["kvalificeret", "booket", "purchase"] as const;
export const erCrmArt = (art: Art): boolean => (ARTER_CRM as readonly string[]).includes(art);

/** Metas navn for CRM-kilden — custom_data.lead_event_source: «The name of the CRM where the events are coming from». */
export const LEAD_EVENT_SOURCE = "The Boardroom";
/** custom_data.event_source, ordret af Metas CRM-vejledning. */
export const EVENT_SOURCE_CRM = "crm";
/**
 * Valutaen for Purchase. MÅLT 21/9-2026 kl. 22:33 i Stripes dashboard: produktet
 * «The Boardroom — medlemskab» (prod_VBBXP0VYDpEtek) har 15 priser, og ALLE 15 er DKK
 * (fx «50,000.00kr DKK» og «4,375.00kr DKK Per month»). Den bor ikke i koden — kun på
 * Stripe-priserne bag lookup_key — så den står her som ÉT sted, og en ny måling er én
 * linje at rette. Et forkert currency kan ikke kaldes tilbage fra Metas rapporter.
 */
export const META_VALUTA = "DKK";

/**
 * Hændelsesnavnene. Lead, Schedule og Purchase er Metas STANDARDhændelser;
 * «Kvalificeret» er en custom event med vores eget danske navn, så den aldrig kan
 * kollidere med eWebinars egen pixel på SAMME datasæt (858180112996496, hændelser umålte).
 */
export const META_EVENT: Readonly<Record<Art, { event_name: string; content_name: string }>> = {
  started: { event_name: "Lead", content_name: "application_started" },
  submitted: { event_name: "Lead", content_name: "application_submitted" },
  kvalificeret: { event_name: "Kvalificeret", content_name: "application_qualified" },
  booket: { event_name: "Schedule", content_name: "application_scheduled" },
  purchase: { event_name: "Purchase", content_name: "membership_purchase" },
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
  /** Hashes til fn + ln (ét felt i formularen; FØRSTE ord er fornavnet, SIDSTE er efternavnet). */
  navn: string | null;
  /** Hashes til ph. */
  telefon: string | null;
  /** Metas egen _fbp-cookie fra theboardroom.dk, ordret. */
  fbp: string | null;
  /** Metas egen _fbc-cookie, ordret — bruges kun når URL'en ikke bar et fbclid. */
  fbc_cookie: string | null;
  /** Fravalget (pkt. 14): true → der sendes intet om denne ansøgning, nogensinde. */
  meta_fravalg: boolean | null;

  // ── Trin 2: tidspunkter, cronen slår op ét sted og rækker ind hertil ──
  /** Første «tal_med_dem» (ansoegning_beslutninger.truffet_at). Null = ikke kvalificeret endnu. */
  kvalificeret_at: string | null;
  /** Første «book» (ansoegning_beslutninger.truffet_at). Null = aldrig booket. */
  booket_at: string | null;
  /** Medlemskabets første betaling (company_perioder.created_at, art «indgang»). */
  purchase_at: string | null;
  /** Samme rækkes beloeb_oere — Purchase'ens value. Null = intet beløb at sende. */
  purchase_beloeb_oere: number | null;
  /** Webinartilmeldingens klik-id (pkt. 17): seneste tilmelding på samme mail FØR created_at. */
  webinar_fbclid: string | null;
  /** Tilmeldingens registreret_at (ellers dens created_at) — tidspunktet vi først SÅ klik-id'et. */
  webinar_fbclid_at: string | null;
}

/** Metas eneste dokumenterede levetid for et klik-id: _fbc-cookien anbefales «with the 90 days expiration time». */
export const WEBINAR_FBCLID_MAKS_DAGE = 90;

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

/**
 * Ét navnefelt → fornavn + efternavn: FØRSTE ord er fornavnet, SIDSTE ord er efternavnet
 * (Jonas 21/9 22:40). Mellemnavne springes over — «Jonas Breum Herlev» er «jonas» + «herlev»,
 * ikke «jonas» + «breumherlev». Grunden er Metas match: det er fornavn og efternavn, en profil
 * hos Meta bærer, og et sammenskrevet mellemnavn+efternavn matcher ingen.
 * Ét ord alene → intet ln; hellere et felt mindre end et forkert.
 */
export function normaliserNavn(v: string | null | undefined): { fn: string | null; ln: string | null } {
  const ord = (v ?? "").trim().split(/\s+/).filter((o) => o !== "");
  if (ord.length === 0) return { fn: null, ln: null };
  return { fn: normaliserNavnedel(ord[0]), ln: ord.length > 1 ? normaliserNavnedel(ord[ord.length - 1]) : null };
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

/** Hvor fbc'et kommer fra — tre led, i den rækkefølge. */
export type FbcKilde = "klik_id" | "cookie" | "webinar" | "ingen";

/**
 * Er webinarets lånte klik-id stadig brugbart? Tilmeldingen skal ligge FØR ansøgningen
 * (ellers er det ikke det klik, der førte hertil) og højst WEBINAR_FBCLID_MAKS_DAGE før.
 * Meta angiver ingen udløbstid for et fbclid; 90 dage er den eneste levetid, Meta
 * dokumenterer (_fbc-cookiens anbefalede udløb), og et klik-id, Metas egen cookie ville
 * have tabt, låner vi ikke.
 */
export function webinarKlikIdGaelder(webinarTid: Date | null, ansoegningTid: Date | null): boolean {
  if (webinarTid === null || ansoegningTid === null) return false;
  const alder = ansoegningTid.getTime() - webinarTid.getTime();
  return alder >= 0 && alder <= WEBINAR_FBCLID_MAKS_DAGE * 86_400_000;
}

/** Webinartilmeldingens klik-id, hvis det gælder — ellers null. Tiden er den, vi først SÅ id'et. */
function webinarFbc(r: AnsoegningTilMeta): string | null {
  const klik = (r.webinar_fbclid ?? "").trim();
  if (klik === "") return null;
  const set = somTid(r.webinar_fbclid_at);
  return webinarKlikIdGaelder(set, somTid(r.created_at)) ? bygFbc(klik, set as Date) : null;
}

/**
 * fbc i TRE LED (trin 2, pkt. 17):
 *   1. URL'ens klik-id — vi så det selv, og tidspunktet er ansøgningens created_at.
 *   2. Metas egen _fbc-cookie, ORDRET: «We recommend that you always send _fbc and _fbp
 *      browser cookie values in the fbc and fbp event parameters, respectively, when
 *      available.» og «ClickID value is case sensitive - do not apply any modifications
 *      before using». Serveren dømmer formen igen; en cookie uden Metas form sendes ikke.
 *   3. WEBINARTILMELDINGENS klik-id, med tilmeldingens registreret_at som tidspunkt —
 *      Metas regel: «If you don't save the _fbc cookie, use the timestamp when you first
 *      observed or received this fbclid value». Det er dette led, der gør webinarvejen
 *      (annonce → topix.dk → mail → /ansoeg?kilde=webinar) synlig: linket bærer intet
 *      klik-id, men tilmeldingen gør — 655 af 675, målt i prod 21/9 22:12.
 * Er der ingen af delene, sendes fbc slet ikke, og hændelsen sendes stadig på em/ph/fn/ln.
 */
export function bygFbcFelt(r: AnsoegningTilMeta, setTid: Date): string | null {
  const klik = (r.fbclid ?? "").trim();
  if (klik !== "") return bygFbc(klik, setTid);
  const c = (r.fbc_cookie ?? "").trim();
  if (FBC_FORM.test(c)) return c;
  return webinarFbc(r);
}

/** Hvilket led fbc'et kom fra — til tørkørslen og beviset. Aldrig værdien. */
export function fbcKilde(r: AnsoegningTilMeta): FbcKilde {
  if ((r.fbclid ?? "").trim() !== "") return "klik_id";
  if (FBC_FORM.test((r.fbc_cookie ?? "").trim())) return "cookie";
  return webinarFbc(r) !== null ? "webinar" : "ingen";
}

/** _fbp ordret, når den har Metas form; ellers sendes fbp ikke. */
export function bygFbpFelt(fbp: string | null | undefined): string | null {
  const v = (fbp ?? "").trim();
  return FBP_FORM.test(v) ? v : null;
}

/**
 * Sprunget over, med grund. «ingen_fbclid» UDGIK 22/9 (pkt. 11): klik-id'et er ikke længere
 * adgangsbetingelsen, og webinarvejen har intet. «fravalgt» kom til (pkt. 14).
 * TRIN 2: tre grunde mere, én pr. ny art — «ikke_kvalificeret», «ikke_booket», «ikke_betalt» —
 * plus «ingen_beloeb», fordi en Purchase uden value og currency afvises af Meta («Required:
 * currency and value») og derfor aldrig skal sendes.
 */
export const SPRUNGET_GRUNDE = [
  "fravalgt", "ingen_user_agent", "ingen_landing", "ikke_indsendt",
  "ikke_kvalificeret", "ikke_booket", "ikke_betalt", "ingen_beloeb",
  "ingen_tidspunkt", "for_gammel",
] as const;
export type SprungetGrund = (typeof SPRUNGET_GRUNDE)[number];

export type Dom = { ok: true; tid: Date } | { ok: false; grund: SprungetGrund };

/** Hændelsens tidspunkt pr. art — ÉT sted, så dommen og payloaden aldrig kan blive uenige. */
export function raaTidFor(r: AnsoegningTilMeta, art: Art): string | null {
  switch (art) {
    case "started": return r.created_at;
    case "submitted": return r.indsendt_at;
    case "kvalificeret": return r.kvalificeret_at;
    case "booket": return r.booket_at;
    case "purchase": return r.purchase_at;
  }
}

/** Grunden, når hændelsen slet ikke er sket endnu. */
const IKKE_SKET: Readonly<Record<Art, SprungetGrund>> = {
  started: "ingen_tidspunkt",
  submitted: "ikke_indsendt",
  kvalificeret: "ikke_kvalificeret",
  booket: "ikke_booket",
  purchase: "ikke_betalt",
};

/**
 * Dommen pr. (ansøgning, art): må den sendes, og med hvilket event_time?
 *
 * FRAVALGET STÅR FØRST — en ansøger, der har bedt sig fri, prøves ikke af på noget andet.
 *
 * USER AGENT OG LANDING KRÆVES KUN AF WEBSITE-HÆNDELSERNE (trin 2, pkt. 16). Meta kræver
 * client_user_agent og event_source_url for website-hændelser, og de to findes kun for
 * started/submitted. De tre CRM-hændelser bærer dem ikke og skal derfor ikke måles på dem —
 * ellers ville hver eneste ansøgning fra FØR 21/9 aften (user agent-kolonnen fandtes ikke)
 * være udelukket fra Kvalificeret, Schedule og Purchase for altid.
 *
 * PURCHASE KRÆVER ET BELØB: «Required: currency and value».
 */
export function doem(r: AnsoegningTilMeta, art: Art, nu: Date): Dom {
  if (r.meta_fravalg === true) return { ok: false, grund: "fravalgt" };
  if (!erCrmArt(art)) {
    if (!r.user_agent || r.user_agent.trim() === "") return { ok: false, grund: "ingen_user_agent" };
    if (!r.landing || r.landing.trim() === "") return { ok: false, grund: "ingen_landing" };
  }
  const raa = raaTidFor(r, art);
  if (!raa) return { ok: false, grund: IKKE_SKET[art] };
  if (art === "purchase" && !(typeof r.purchase_beloeb_oere === "number" && r.purchase_beloeb_oere > 0)) {
    return { ok: false, grund: "ingen_beloeb" };
  }
  const tid = somTid(raa);
  if (tid === null) return { ok: false, grund: "ingen_tidspunkt" };
  if (!erIVindue(tid, nu)) return { ok: false, grund: "for_gammel" };
  return { ok: true, tid };
}

export interface MetaPayload {
  event_name: string;
  event_time: number;
  event_id: string;
  /** «website» for de to ansøgningshændelser, «system_generated» for de tre CRM-hændelser. */
  action_source: "website" | "system_generated";
  /** Kun website-hændelser: Meta kræver den for dem — og kun for dem. */
  event_source_url?: string;
  /** external_id altid; em/ph/fn/ln/country og fbc/fbp KUN når de findes; client_user_agent kun website. */
  user_data: HashetBrugerdata & { external_id: string[]; client_user_agent?: string; fbc?: string; fbp?: string };
  /** content_name altid; event_source/lead_event_source kun CRM; value/currency kun Purchase. */
  custom_data: { content_name: string; event_source?: string; lead_event_source?: string; value?: number; currency?: string };
}

/**
 * Payloaden — præcis de tilladte felter, og INTET felt uden værdi. externalIdAftryk er
 * sha256Hex(ansøgnings-id) og `hashet` er hashBrugerdata(normaliserBrugerdata(r)); begge
 * regnes af kalderen, så dommen her er synkron og ren.
 *
 * fbc's tidspunkt for led 1 er created_at — første gang vi så fbclid'et (Metas regel), ikke
 * hændelsens tid. Led 3 (webinaret) bærer sit eget tidspunkt, jf. bygFbcFelt.
 *
 * SPREDNINGEN ER MED VILJE: `...hashet` lægger kun de nøgler ind, der findes, og fbc/fbp
 * kommer kun med, når de ikke er null. Et `fbc: null` ville være en værdi, ikke et fravær.
 *
 * DE TO SLAGS (trin 2, pkt. 16):
 *   website  → action_source «website» + event_source_url + client_user_agent (Metas krav).
 *   CRM      → action_source «system_generated» + custom_data { event_source: «crm»,
 *              lead_event_source } og HVERKEN url ELLER user agent: Meta kræver dem ikke,
 *              og ansøgningens user agent hører til et andet øjeblik end rådgiverens klik,
 *              Calendly-bookingen eller Stripe-betalingen. Vi påstår ikke en browser, vi
 *              ikke har set.
 *   Purchase → dertil value (KRONER) og currency, som Meta kræver: «Required: currency and value».
 */
export function bygPayload(
  r: AnsoegningTilMeta,
  art: Art,
  tid: Date,
  externalIdAftryk: string,
  hashet: HashetBrugerdata,
): MetaPayload {
  const set = somTid(r.created_at) ?? tid;
  const fbc = bygFbcFelt(r, set);
  const fbp = bygFbpFelt(r.fbp);
  const crm = erCrmArt(art);
  const ua = (r.user_agent ?? "").trim().slice(0, USER_AGENT_MAKS);
  return {
    event_name: META_EVENT[art].event_name,
    event_time: Math.floor(tid.getTime() / 1000),
    event_id: eventId(r.id, art),
    action_source: crm ? "system_generated" : "website",
    ...(crm ? {} : { event_source_url: (r.landing ?? "").trim() }),
    user_data: {
      ...hashet,
      external_id: [externalIdAftryk],
      ...(crm || ua === "" ? {} : { client_user_agent: ua }),
      ...(fbc !== null ? { fbc } : {}),
      ...(fbp !== null ? { fbp } : {}),
    },
    custom_data: {
      content_name: META_EVENT[art].content_name,
      ...(crm ? { event_source: EVENT_SOURCE_CRM, lead_event_source: LEAD_EVENT_SOURCE } : {}),
      ...(art === "purchase" ? { value: oereTilKroner(r.purchase_beloeb_oere ?? 0), currency: META_VALUTA } : {}),
    },
  };
}

/**
 * Øre → kroner med to decimaler. Meta vil have beløbet i valutaens hovedenhed
 * («"currency": "USD", "value": 100.00»), og huset regner i øre overalt.
 */
export function oereTilKroner(oere: number): number {
  return Math.round(oere) / 100;
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
