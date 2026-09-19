/**
 * webinarDom — dommen bag eWebinar-webhooken (udkast 19/9-2026,
 * ~/Downloads/udkast-ewebinar-webhook/README.md).
 *
 * Spejlet ORDRET i src/lib/webinarDom.ts — enhver ændring her SKAL også
 * laves der (paritetstest src/lib/__tests__/webinarDom.paritet.test.ts,
 * ansoegningMotor.paritet-mønstret). Nul imports, ingen Deno-afhængighed.
 *
 * TRE TING BOR HER:
 *   plukTilmelding   — læs de felter vi kender ud af eWebinars registrant-
 *                      payload (help/webhook), inkl. procenten hvis den er der,
 *                      og HELE ANNONCESPORET (plukAnnoncespor: utm'erne, fbclid
 *                      ud af origin, referrer, by/land/enhed/tidszone, widget-
 *                      kilden) — i egne felter, ikke kun i den rå payload.
 *   doemSetGrad      — «har set / delvist set / mødte ikke op» UDLEDT AF
 *                      TALLET (≥ 75 %), ikke af hvilken hændelse der kom.
 *   webinarTal       — «hvor mange har set webinaret» og «hvor mange er
 *                      tilmeldt det næste», pr. person.
 * Og ordene til rådgiveren (webinarLinje, webinarModSvar).
 *
 * MÅLT 19/9 (ewebinar.com/help/webhook + api.ewebinar.com/docs/openapi.json):
 * payloaden er registrant-objektet med id, email, name, state, action,
 * webinarId, webinarTitle, sessionTime, sessionType, attended, registeredTime,
 * subscribed … — og INGEN dokumenteret procent. Egenskaben «Total watched %»
 * findes (help/properties), men dens tekniske navn er ikke dokumenteret.
 * findProcent leder derfor bredt og gemmer kilden; README §4 siger hvad
 * Jonas skal måle mod første rigtige payload.
 */

// ── Grænsen ────────────────────────────────────────────────────────────────

/** «Har set webinaret» = 75 % eller mere (Jonas 19/9). Under: «delvist set». */
export const SET_GRAENSE_PROCENT = 75;

/**
 * Graden af deltagelse — UDLEDT AF TALLET når vi har det, ellers af
 * eWebinars egen tilstand (state). Se doemSetGrad.
 *   set          ≥ 75 % (eller state Watched uden tal — eWebinars dom ved DENS grænse)
 *   delvist      0 < procent < 75 (eller state Joined uden tal: var der, procent ukendt)
 *   moedte_ikke  state Missed/NotJoined
 *   tilmeldt     sessionen ligger i fremtiden
 *   ukendt       sessionen er forbi og ingen hændelse har sagt noget endnu
 */
export type SetGrad = "set" | "delvist" | "moedte_ikke" | "tilmeldt" | "ukendt";

/** Rækken i webinar_tilmeldinger — det dommene læser og webhooken skriver. */
export interface WebinarTilmelding {
  /** eWebinars registrant-id (payload.id / attendeeId) — én række pr. tilmelding. */
  ewebinar_id: string;
  /** Altid små bogstaver og trimmet — matcher ansoegninger.email (CHECK lower). */
  email: string;
  navn: string | null;
  webinar_id: string;
  webinar_titel: string | null;
  /** ISO. null ved Replay/OnDemand (eWebinar sender «replay» eller intet). */
  session_tid: string | null;
  /** Scheduled · Replay · JustInTime · OnDemand (eWebinars ord). */
  session_type: string | null;
  registreret_at: string | null;
  /** Registered · NotJoined · Joined · Missed · Watched (eWebinars ord). */
  state: string | null;
  /** Registered · Joined · Left · WatchedWebinar · WatchedReplay · MissedWebinar · WebinarFinished · Converted · Unsubscribed. */
  sidste_action: string | null;
  attended: string | null;
  subscribed: string | null;
  /** Den faktiske procent når vi har den — aldrig udledt af en hændelse. */
  set_procent: number | null;
  /** Hvilket felt i payloaden procenten kom fra (måles mod første rigtige payload). */
  set_procent_kilde: string | null;

  // ── ANNONCESPORET (målt 19/9 i et rigtigt API-svar) ──────────────────────
  // Hele vejen fra en bestemt Meta-annonce til et medlem, gemt i EGNE kolonner
  // — ikke kun i den rå payload, så den kan søges og tælles uden at bygge noget.
  // Læses både fra felter på objektet og fra query-parametrene i origin/
  // firstOrigin/registrationLink (plukAnnoncespor), så det er ligegyldigt hvor
  // eWebinar lægger dem.
  /** fx «fb». */
  utm_source: string | null;
  /** fx «paid». */
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  /** Metas klik-id — plukket UD af origin som sit eget felt. Meta-opsætningen skal bruge præcis det. */
  fbclid: string | null;
  /** Siden tilmeldingen kom fra (bærer typisk utm'erne og fbclid). */
  origin: string | null;
  first_origin: string | null;
  referrer: string | null;
  first_referrer: string | null;
  /** eWebinars «Widget Source» — fx «topix-webinar-side». */
  widget_source: string | null;
  by: string | null;
  land: string | null;
  /** deviceTypeWhenRegistered — fx «Desktop». */
  enhed: string | null;
  /** IANA-tidszone som eWebinar skriver den. */
  tidszone: string | null;
}

export type PlukGrund = "ikke_et_objekt" | "uden_id" | "uden_email" | "uden_webinar_id";
export type Pluk = { ok: true; tilmelding: WebinarTilmelding } | { ok: false; grund: PlukGrund };

// ── Læsning af payloaden ───────────────────────────────────────────────────

const somTekst = (v: unknown): string | null => {
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? null : s;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
};

const somTid = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;

/** Procenten: et tal 0–100, eller en streng «62», «62.5», «62,5», «62 %». Alt andet → null. */
export function somProcent(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,3}(?:[.,]\d+)?)\s*%?$/);
    if (!m) return null;
    const n = Number(m[1].replace(",", "."));
    return n >= 0 && n <= 100 ? n : null;
  }
  return null;
}

/**
 * Procenten i en FRITEKST — «78 %», «Watched 78%», «78% of webinar».
 * Bruges KUN på `attended` (målt 19/9: feltet findes og stod på «Hasn't
 * started» for en der ikke havde set noget; hvad det siger for en der HAR
 * set noget, kan først måles efter webinaret 22/9). Et procenttegn kræves,
 * når strengen ikke er et rent tal — ellers ville «45 minutes» blive til
 * 45 %.
 */
export function procentFraTekst(v: unknown): number | null {
  const helt = somProcent(v);
  if (helt !== null) return helt;
  if (typeof v !== "string") return null;
  const m = v.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return n >= 0 && n <= 100 ? n : null;
}

/** Nøgler sammenlignes uden store bogstaver, bindestreger og understreger: utm_source ≡ utmSource ≡ UTM-Source. */
function normaliserNoegle(k: string): string {
  return k.toLowerCase().replace(/[-_\s]/g, "");
}

/** Query-parametrene i en URL, med normaliserede nøgler. Ikke-URL'er giver et tomt kort. */
export function parametreFra(url: unknown): Record<string, string> {
  if (typeof url !== "string" || url.trim() === "") return {};
  try {
    const ud: Record<string, string> = {};
    for (const [k, v] of new URL(url).searchParams.entries()) {
      if (v !== "") ud[normaliserNoegle(k)] = v;
    }
    return ud;
  } catch {
    return {};
  }
}

/** Annoncesporets felter — hentet fra objektet selv ELLER fra URL'erne i det. */
export type Annoncespor = Pick<
  WebinarTilmelding,
  "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "fbclid" |
  "origin" | "first_origin" | "referrer" | "first_referrer" | "widget_source" | "by" | "land" | "enhed" | "tidszone"
>;

export function plukAnnoncespor(r: Record<string, unknown>): Annoncespor {
  const top: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) top[normaliserNoegle(k)] = v;
  // Landingssidens URL bærer typisk utm'erne og fbclid; rækkefølgen er
  // «hvor personen faktisk kom ind» før «første gang vi så dem».
  const urler = [parametreFra(r.origin), parametreFra(r.firstOrigin), parametreFra(r.registrationLink)];
  const hent = (navn: string): string | null => {
    const n = normaliserNoegle(navn);
    const fraTop = somTekst(top[n]);
    if (fraTop) return fraTop;
    for (const u of urler) {
      const v = somTekst(u[n]);
      if (v) return v;
    }
    return null;
  };
  return {
    utm_source: hent("utm_source"),
    utm_medium: hent("utm_medium"),
    utm_campaign: hent("utm_campaign"),
    utm_content: hent("utm_content"),
    utm_term: hent("utm_term"),
    fbclid: hent("fbclid"),
    origin: somTekst(r.origin),
    first_origin: somTekst(r.firstOrigin),
    referrer: somTekst(r.referrer),
    first_referrer: somTekst(r.firstReferrer),
    widget_source: somTekst(r.source),
    by: somTekst(r.city),
    land: somTekst(r.country),
    enhed: somTekst(r.deviceTypeWhenRegistered),
    tidszone: somTekst(r.timezone),
  };
}

/**
 * Nøglerne der KAN bære procenten. Dokumentationen (ewebinar.com/help/webhook,
 * målt 19/9) viser INGEN procent i payloaden; egenskabsartiklen kalder
 * egenskaben «Total watched %» uden teknisk navn. Så vi leder bredt — på
 * topniveau og ét niveau ned — efter en nøgle med watched/percent/pct og en
 * procent-læselig værdi. Nøgler med link/url/time/date springes over (de
 * bærer aldrig et tal). Kilden gemmes, så vi kan se hvad der ramte.
 */
const PROCENT_NOEGLE = /watched|percent|pct/i;
const PROCENT_NOEGLE_IKKE = /link|url|time|date/i;

export function findProcent(raa: Record<string, unknown>): { procent: number; kilde: string } | null {
  const kandidater: Array<{ kilde: string; noegle: string; vaerdi: unknown }> = [];
  for (const [k, v] of Object.entries(raa)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) kandidater.push({ kilde: `${k}.${k2}`, noegle: k2, vaerdi: v2 });
    } else {
      kandidater.push({ kilde: k, noegle: k, vaerdi: v });
    }
  }
  const passende = kandidater.filter((c) => PROCENT_NOEGLE.test(c.noegle) && !PROCENT_NOEGLE_IKKE.test(c.noegle));
  // «watched» før «percent»: «Total watched %» er egenskabens navn.
  const sorteret = [...passende].sort((a, b) => Number(/watched/i.test(b.noegle)) - Number(/watched/i.test(a.noegle)));
  for (const c of sorteret) {
    const p = somProcent(c.vaerdi);
    if (p !== null) return { procent: p, kilde: c.kilde };
  }
  return null;
}

/**
 * Pluk de felter vi kender ud af eWebinars registrant-payload (formen i
 * help/webhook). Fejler kun når id, email eller webinarId mangler — alt
 * andet må mangle. Hele payloaden gemmes ALTID rå ved siden af (haendelser.raa),
 * så et felt vi ikke plukkede i dag kan plukkes i morgen.
 */
export function plukTilmelding(raa: unknown): Pluk {
  if (!raa || typeof raa !== "object" || Array.isArray(raa)) return { ok: false, grund: "ikke_et_objekt" };
  const r = raa as Record<string, unknown>;
  const ewebinarId = somTekst(r.id) ?? somTekst(r.attendeeId);
  if (!ewebinarId) return { ok: false, grund: "uden_id" };
  const email = somTekst(r.email)?.toLowerCase() ?? null;
  if (!email) return { ok: false, grund: "uden_email" };
  const webinarId = somTekst(r.webinarId);
  if (!webinarId) return { ok: false, grund: "uden_webinar_id" };
  const navn = somTekst(r.name) ?? [somTekst(r.firstName), somTekst(r.lastName)].filter((s): s is string => !!s).join(" ") ?? null;
  // Procenten: først de navngivne felter (findProcent), derefter `attended`
  // som fritekst — feltet findes (målt 19/9) og bærer formentlig tallet eller
  // en status, når nogen HAR set noget. Bevises tirsdag 22/9.
  const fundet = findProcent(r);
  const fraAttended = fundet === null ? procentFraTekst(r.attended) : null;
  const procent = fundet ?? (fraAttended !== null ? { procent: fraAttended, kilde: "attended" } : null);
  return {
    ok: true,
    tilmelding: {
      ewebinar_id: ewebinarId,
      email,
      navn: navn || null,
      webinar_id: webinarId,
      webinar_titel: somTekst(r.webinarTitle),
      session_tid: somTid(r.sessionTime),
      session_type: somTekst(r.sessionType),
      registreret_at: somTid(r.registeredTime),
      state: somTekst(r.state),
      sidste_action: somTekst(r.action),
      attended: somTekst(r.attended),
      subscribed: somTekst(r.subscribed),
      set_procent: procent?.procent ?? null,
      set_procent_kilde: procent?.kilde ?? null,
      ...plukAnnoncespor(r),
    },
  };
}

/**
 * Fletning ved næste hændelse for samme registrant: den nye hændelses felter
 * vinder, MEN null overskriver aldrig en kendt værdi, og procenten går
 * ALDRIG ned (en «Left»-hændelse efter «Watched» må ikke slette 78 %).
 */
export function fletTilmelding(eksisterende: WebinarTilmelding | null, ny: WebinarTilmelding): WebinarTilmelding {
  if (!eksisterende) return ny;
  const flettet: WebinarTilmelding = { ...eksisterende };
  for (const noegle of Object.keys(ny) as Array<keyof WebinarTilmelding>) {
    const v = ny[noegle];
    if (v !== null && v !== undefined) (flettet as unknown as Record<string, unknown>)[noegle] = v;
  }
  const gammel = eksisterende.set_procent;
  const nyP = ny.set_procent;
  if (gammel !== null && (nyP === null || nyP < gammel)) {
    flettet.set_procent = gammel;
    flettet.set_procent_kilde = eksisterende.set_procent_kilde;
  }
  return flettet;
}

// ── Dommen ─────────────────────────────────────────────────────────────────

export type TilDom = Pick<WebinarTilmelding, "set_procent" | "state" | "session_tid"> & Partial<Pick<WebinarTilmelding, "attended">>;

/**
 * TALLET FØRST (Jonas 19/9): har vi en procent over nul, afgør den alt —
 * ≥ 75 set, ellers delvist. 0 % læses som «intet tal endnu» (eWebinar kan
 * sende 0 som udgangspunkt før sessionen), så state afgør. Uden tal: eWebinars
 * state — Watched (dens egen grænse; README beder Jonas sætte den til 75),
 * Joined (var der, procent ukendt → delvist), Missed/NotJoined (mødte ikke).
 * Ellers: fremtidig session → tilmeldt; forbi → ukendt.
 */
export function doemSetGrad(t: TilDom, nu: Date): SetGrad {
  // Tallet vi gemte — ellers et tal i `attended` (fundet 19/9: feltet findes;
  // hvad det siger for en der HAR set noget, måles 22/9). Rækker gemt FØR
  // attended blev læst ved plukket, dømmes derfor også rigtigt.
  const procent = t.set_procent !== null && t.set_procent !== undefined && t.set_procent > 0
    ? t.set_procent
    : procentFraTekst(t.attended);
  if (procent !== null && procent > 0) {
    return procent >= SET_GRAENSE_PROCENT ? "set" : "delvist";
  }
  const state = (t.state ?? "").toLowerCase();
  if (state === "watched") return "set";
  if (state === "joined") return "delvist";
  if (state === "missed" || state === "notjoined") return "moedte_ikke";
  if (t.session_tid !== null && Date.parse(t.session_tid) > nu.getTime()) return "tilmeldt";
  return "ukendt";
}

const GRAD_RANG: Record<SetGrad, number> = { set: 4, delvist: 3, moedte_ikke: 2, ukendt: 1, tilmeldt: 0 };

export const SET_GRAD_ORD: Record<SetGrad, string> = {
  set: "har set webinaret",
  delvist: "har set en del af webinaret",
  moedte_ikke: "mødte ikke op",
  tilmeldt: "tilmeldt",
  ukendt: "deltagelse ukendt",
};

// ── Ord til rådgiveren ─────────────────────────────────────────────────────

/** «22/9» i dansk tid; null når der ingen sessionstid er (optagelsen). */
export function datoKort(iso: string | null): string | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  const dele = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "numeric", timeZone: "Europe/Copenhagen" }).formatToParts(new Date(iso));
  const dag = dele.find((d) => d.type === "day")?.value;
  const maaned = dele.find((d) => d.type === "month")?.value;
  return dag && maaned ? `${dag}/${maaned}` : null;
}

function procentTekst(p: number): string {
  return `${Number.isInteger(p) ? p : Math.round(p)} %`;
}

/** Én tilmelding i ord: «så 62 % af webinaret 22/9 (delvist)». */
export function tilmeldingTekst(t: WebinarTilmelding, nu: Date): string {
  const grad = doemSetGrad(t, nu);
  const dato = datoKort(t.session_tid);
  const hvad = dato ? `webinaret ${dato}` : (t.session_type ?? "").toLowerCase() === "replay" || (t.session_type ?? "").toLowerCase() === "ondemand" ? "optagelsen" : "webinaret";
  const p = t.set_procent !== null && t.set_procent > 0 ? procentTekst(t.set_procent) : null;
  switch (grad) {
    case "set":
      return p ? `så ${p} af ${hvad}` : `så ${hvad} (procent ukendt)`;
    case "delvist":
      return p ? `så ${p} af ${hvad} (delvist)` : `deltog i ${hvad} (procent ukendt)`;
    case "moedte_ikke":
      return `tilmeldt ${hvad}, mødte ikke op`;
    case "tilmeldt":
      return `tilmeldt ${hvad}`;
    case "ukendt":
      return `tilmeldt ${hvad} (deltagelse ukendt)`;
  }
}

/** Linjen til rådgiveren: alle tilmeldinger på mailen, seneste session først; null uden tilmeldinger. */
export function webinarLinje(tilmeldinger: readonly WebinarTilmelding[], nu: Date): string | null {
  if (tilmeldinger.length === 0) return null;
  const sorteret = [...tilmeldinger].sort((a, b) => (Date.parse(b.session_tid ?? "") || 0) - (Date.parse(a.session_tid ?? "") || 0));
  return sorteret.map((t) => tilmeldingTekst(t, nu)).join(" · ");
}

export type ModSvar = "stemmer" | "sagde_ja_ingen_tilmelding" | "sagde_nej_men_set" | "sagde_ja_moedte_ikke" | "sagde_ja_ikke_maalt";

export const MOD_SVAR_ORD: Record<ModSvar, string> = {
  stemmer: "stemmer med eWebinar",
  sagde_ja_ingen_tilmelding: "sagde ja, men mailen er ikke tilmeldt i eWebinar",
  sagde_nej_men_set: "sagde nej, men eWebinar har set mailen se webinaret",
  sagde_ja_moedte_ikke: "sagde ja, men eWebinar siger mødte ikke op",
  sagde_ja_ikke_maalt: "sagde ja — eWebinar har ikke målt deltagelse endnu",
};

/** Bedste grad over tilmeldingerne (set > delvist > moedte_ikke > ukendt > tilmeldt); null uden tilmeldinger. */
export function bedsteGrad(tilmeldinger: readonly WebinarTilmelding[], nu: Date): SetGrad | null {
  let bedst: SetGrad | null = null;
  for (const t of tilmeldinger) {
    const g = doemSetGrad(t, nu);
    if (bedst === null || GRAD_RANG[g] > GRAD_RANG[bedst]) bedst = g;
  }
  return bedst;
}

/**
 * Ansøgerens eget svar («har du set webinaret?») mod eWebinars måling.
 * Kun det der er værd at sige: null når der intet er at bemærke.
 */
export function webinarModSvar(setWebinar: string | null, tilmeldinger: readonly WebinarTilmelding[], nu: Date): ModSvar | null {
  const grad = bedsteGrad(tilmeldinger, nu);
  if (grad === null) return setWebinar === "ja" ? "sagde_ja_ingen_tilmelding" : null;
  if (grad === "set" || grad === "delvist") {
    if (setWebinar === "nej") return "sagde_nej_men_set";
    if (setWebinar === "ja") return "stemmer";
    return null;
  }
  if (grad === "moedte_ikke") return setWebinar === "ja" ? "sagde_ja_moedte_ikke" : null;
  return setWebinar === "ja" ? "sagde_ja_ikke_maalt" : null;
}

// ── Tallene ────────────────────────────────────────────────────────────────

export interface WebinarTalGruppe {
  /** Personer (mails), ikke rækker. */
  personer: number;
  harSet: number;
  delvistSet: number;
  moedteIkke: number;
  ukendt: number;
  /** Personer med mindst én session i fremtiden. */
  kommende: number;
}

export interface WebinarTal extends WebinarTalGruppe {
  /** Den nærmeste fremtidige session og hvor mange personer der er tilmeldt PRÆCIS den. */
  naeste: { sessionTid: string; personer: number } | null;
  perWebinar: Array<WebinarTalGruppe & { webinarId: string; titel: string | null }>;
}

function taelGruppe(tilmeldinger: readonly WebinarTilmelding[], nu: Date): WebinarTalGruppe {
  const perPerson = new Map<string, { fortid: SetGrad | null; kommende: boolean }>();
  for (const t of tilmeldinger) {
    const p = perPerson.get(t.email) ?? { fortid: null, kommende: false };
    const g = doemSetGrad(t, nu);
    if (g === "tilmeldt") p.kommende = true;
    else if (p.fortid === null || GRAD_RANG[g] > GRAD_RANG[p.fortid]) p.fortid = g;
    perPerson.set(t.email, p);
  }
  const tal: WebinarTalGruppe = { personer: perPerson.size, harSet: 0, delvistSet: 0, moedteIkke: 0, ukendt: 0, kommende: 0 };
  for (const p of perPerson.values()) {
    if (p.kommende) tal.kommende++;
    if (p.fortid === "set") tal.harSet++;
    else if (p.fortid === "delvist") tal.delvistSet++;
    else if (p.fortid === "moedte_ikke") tal.moedteIkke++;
    else if (p.fortid === "ukendt") tal.ukendt++;
  }
  return tal;
}

/**
 * «Hvor mange har set webinaret» og «hvor mange er tilmeldt det næste» —
 * pr. person (én mail tæller én gang, bedste grad vinder), i alt og pr.
 * webinar. Det næste = den nærmeste session efter nu.
 */
export function webinarTal(tilmeldinger: readonly WebinarTilmelding[], nu: Date): WebinarTal {
  const fremtid = tilmeldinger.filter((t) => t.session_tid !== null && Date.parse(t.session_tid) > nu.getTime());
  let naeste: WebinarTal["naeste"] = null;
  if (fremtid.length > 0) {
    const tid = fremtid.map((t) => new Date(t.session_tid!).toISOString()).sort()[0];
    naeste = { sessionTid: tid, personer: new Set(fremtid.filter((t) => new Date(t.session_tid!).toISOString() === tid).map((t) => t.email)).size };
  }
  const perId = new Map<string, WebinarTilmelding[]>();
  for (const t of tilmeldinger) perId.set(t.webinar_id, [...(perId.get(t.webinar_id) ?? []), t]);
  const perWebinar = [...perId.entries()]
    .map(([webinarId, liste]) => ({ webinarId, titel: liste.find((t) => t.webinar_titel)?.webinar_titel ?? null, ...taelGruppe(liste, nu) }))
    .sort((a, b) => b.personer - a.personer);
  return { ...taelGruppe(tilmeldinger, nu), naeste, perWebinar };
}
