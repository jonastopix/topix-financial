/**
 * supabase/functions/_shared/ansoegningSkema.ts
 *
 * SPEJL af src/lib/ansoegning/skema.ts — kroppen er byte-ens, kun dette
 * filhoved afviger (paritetstest: src/lib/__tests__/ansoegningSkemaParitet.test.ts).
 * Ret ALTID begge filer. Ingen Deno, ingen fetch — vitest importerer den direkte.
 */
// ── Konstanter der deles af flade, funktion, cron og mail ──────────────────

/** Ruten på app.theboardroom.dk. */
export const ANSOEG_STI = "/ansoeg";
/** URL-parameteren der bærer genoptagelsestokenet (/ansoeg?t=<uuid>). */
export const TOKEN_PARAM = "t";
/** URL-parameteren der bærer kilden (/ansoeg?kilde=webinar). */
export const KILDE_PARAM = "kilde";
/** Mindste længde på de tre svar der filtrerer. Knap, ikke lov: README §6. */
export const TEKST_MIN = 40;
/** Største længde på et fritekstsvar — også et værn mod misbrug af et åbent endpoint. */
export const TEKST_MAKS = 2000;
/** Påmindelsen sendes når ansøgningen har ligget stille i så mange dage … */
export const PAAMINDELSE_EFTER_DAGE = 2;
/** … og aldrig hvis den er ældre end dette (så en gammel ansøgning ikke vækkes). */
export const PAAMINDELSE_SENEST_DAGE = 14;
/** Medlemskabets pris som formularen siger den — ét sted. */
export const MEDLEMSKAB_PRIS_KR_AAR = 50_000;

// ── De faste valg ──────────────────────────────────────────────────────────

/**
 * De syv omsætningsintervaller — de SAMME som Monday-boardet «Ansøgninger»
 * (kolonne dropdown_mm0pacdk «Omsætning (interval)», målt 18/9 via Monday
 * API). `monday` er boardets ordrette label, så motoren kan skrive den
 * uændret; `label` er formularens visning.
 */
export const OMSAETNINGSINTERVALLER = [
  { noegle: "A", monday: "A) 0-499.999 kr.", label: "Under 500.000 kr." },
  { noegle: "B", monday: "B) 500.000-999.999 kr.", label: "500.000 – 999.999 kr." },
  { noegle: "C", monday: "C) 1.000.000-1.999.999 kr.", label: "1 – 2 mio. kr." },
  { noegle: "D", monday: "D) 2.000.000-4.999.999 kr.", label: "2 – 5 mio. kr." },
  { noegle: "E", monday: "E) 5.000.000-9.999.999 kr.", label: "5 – 10 mio. kr." },
  { noegle: "F", monday: "F) 10.000.000-19.999.999 kr.", label: "10 – 20 mio. kr." },
  { noegle: "G", monday: "G) +20.000.000 kr.", label: "Over 20 mio. kr." },
] as const;
export type Omsaetningsnoegle = (typeof OMSAETNINGSINTERVALLER)[number]["noegle"];

/**
 * JONAS 18/9 kl. 10:10 (ordret): «Alle skal jo igennem afklaringssamtale, så
 * alle skal vide mere. Og vi skal gå efter at få folk i gang hurtigst muligt,
 * for hvis først der går tid efter ansøgningen, så bliver de kolde.» Svaret
 * «Senere — jeg vil først vide mere» er derfor UDE; tre svar om TID. Prod-
 * CHECK'en rettes i 20260918230000_ansoegning_start_tidspunkt_uden_senere.sql.
 */
export const START_TIDSPUNKTER = [
  { noegle: "hurtigst_muligt", label: "Hurtigst muligt" },
  { noegle: "inden_1_maaned", label: "Inden for en måned" },
  { noegle: "inden_3_maaneder", label: "Inden for tre måneder" },
] as const;
export type Starttidspunkt = (typeof START_TIDSPUNKTER)[number]["noegle"];

export const WEBINAR_SVAR = [
  { noegle: "ja", label: "Ja, jeg har set det" },
  { noegle: "nej", label: "Nej, ikke endnu" },
] as const;
export type WebinarSvar = (typeof WEBINAR_SVAR)[number]["noegle"];

/** Hvor ansøgeren kom fra. Afgøres af afgoerKilde ved oprettelsen. */
export const KILDER = ["webinar", "anbefaling", "linkedin", "direkte", "andet"] as const;
export type Kilde = (typeof KILDER)[number];

// ── Felterne og skærmene ───────────────────────────────────────────────────

/** De tolv felter i den rækkefølge de spørges. */
export const FELTER = [
  "cvr",
  "hjemmeside",
  "omsaetningsinterval",
  "antal_ansatte",
  "navn",
  "email",
  "telefon",
  "udfordring",
  "proevet",
  "om_tolv_maaneder",
  "start_tidspunkt",
  "set_webinar",
] as const;
export type FeltId = (typeof FELTER)[number];

export type Gruppe = "virksomheden" | "dig" | "de_tre" | "timing";

/**
 * Elleve skærme — ét spørgsmål ad gangen. «Kontakt» bærer to felter
 * (e-mail og telefon hører sammen og er korte); alle andre skærme ét.
 */
export const SKAERME = [
  { id: "cvr", gruppe: "virksomheden", felter: ["cvr"] },
  { id: "hjemmeside", gruppe: "virksomheden", felter: ["hjemmeside"] },
  { id: "omsaetning", gruppe: "virksomheden", felter: ["omsaetningsinterval"] },
  { id: "ansatte", gruppe: "virksomheden", felter: ["antal_ansatte"] },
  { id: "navn", gruppe: "dig", felter: ["navn"] },
  { id: "kontakt", gruppe: "dig", felter: ["email", "telefon"] },
  { id: "udfordring", gruppe: "de_tre", felter: ["udfordring"] },
  { id: "proevet", gruppe: "de_tre", felter: ["proevet"] },
  { id: "om_tolv_maaneder", gruppe: "de_tre", felter: ["om_tolv_maaneder"] },
  { id: "start", gruppe: "timing", felter: ["start_tidspunkt"] },
  { id: "webinar", gruppe: "timing", felter: ["set_webinar"] },
] as const satisfies readonly { id: string; gruppe: Gruppe; felter: readonly FeltId[] }[];
export type SkaermId = (typeof SKAERME)[number]["id"];

/**
 * Ansøgerens svar som de gemmes. null = ikke besvaret. hjemmeside "" =
 * «vi har ingen hjemmeside» — et svar, ikke et hul (HJEMMESIDE_INGEN).
 */
export interface AnsoegningsSvar {
  cvr: string | null;
  hjemmeside: string | null;
  omsaetningsinterval: string | null;
  antal_ansatte: number | null;
  navn: string | null;
  email: string | null;
  telefon: string | null;
  udfordring: string | null;
  proevet: string | null;
  om_tolv_maaneder: string | null;
  start_tidspunkt: string | null;
  set_webinar: string | null;
}

export const HJEMMESIDE_INGEN = "";

export const TOMME_SVAR: AnsoegningsSvar = {
  cvr: null,
  hjemmeside: null,
  omsaetningsinterval: null,
  antal_ansatte: null,
  navn: null,
  email: null,
  telefon: null,
  udfordring: null,
  proevet: null,
  om_tolv_maaneder: null,
  start_tidspunkt: null,
  set_webinar: null,
};

// ── Validering: én dom pr. felt, normaliseret værdi ved ok ─────────────────

export type FeltDom =
  | { ok: true; vaerdi: string | number }
  | { ok: false; fejl: string };

function tekst(raa: unknown): string {
  return typeof raa === "string" ? raa.trim() : typeof raa === "number" ? String(raa) : "";
}

function erValg(raa: unknown, valg: readonly { noegle: string }[]): raa is string {
  return typeof raa === "string" && valg.some((v) => v.noegle === raa);
}

/** «DK 12 34 56 78» → «12345678». Kun cifre; alt andet fjernes. */
export function normaliserCvr(raa: string): string {
  return raa.replace(/^\s*dk/i, "").replace(/\D/g, "");
}

/** «Nordicbyg.dk/om», «http://www.x.dk» → «https://nordicbyg.dk/om». */
export function normaliserHjemmeside(raa: string): string | null {
  let s = raa.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  const m = s.match(/^([a-z0-9æøå-]+(?:\.[a-z0-9æøå-]+)+)(\/[^\s]*)?$/);
  if (!m) return null;
  return `https://${m[1]}${m[2] ?? ""}`.replace(/\/$/, "");
}

/** Mellemrum, bindestreger og parenteser væk; «0045»/«+45» → «+45»; danske otte cifre → «+45…». */
export function normaliserTelefon(raa: string): string | null {
  let s = raa.replace(/[\s\-().]/g, "");
  if (s.startsWith("0045")) s = `+${s.slice(2)}`;
  if (/^\d{8}$/.test(s)) return `+45${s}`;
  if (/^\+45\d{8}$/.test(s)) return s;
  if (/^\+\d{8,15}$/.test(s) && !s.startsWith("+45")) return s;
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function ordAntal(s: string): number {
  return s.split(/\s+/).filter((o) => o.length > 0).length;
}

export const FEJL = {
  cvr: "Et CVR-nummer har otte cifre.",
  hjemmeside: "Skriv adressen som fx nordicbyg.dk — eller vælg «vi har ingen».",
  omsaetningsinterval: "Vælg det interval der passer bedst.",
  antal_ansatte: "Skriv et helt tal — 1 hvis det kun er dig.",
  navn: "Skriv dit navn.",
  email: "Det ligner ikke en e-mailadresse.",
  telefon: "Skriv otte cifre — eller med landekode, fx +46.",
  tekst_kort: `Skriv lidt mere — mindst ${TEKST_MIN} tegn. Det er de her svar, vi læser grundigst.`,
  tekst_lang: `Højst ${TEKST_MAKS} tegn.`,
  start_tidspunkt: "Vælg hvornår du kan starte.",
  set_webinar: "Vælg ja eller nej.",
} as const;

export function validerFelt(id: FeltId, raa: unknown): FeltDom {
  switch (id) {
    case "cvr": {
      const s = normaliserCvr(tekst(raa));
      return /^\d{8}$/.test(s) ? { ok: true, vaerdi: s } : { ok: false, fejl: FEJL.cvr };
    }
    case "hjemmeside": {
      if (raa === HJEMMESIDE_INGEN) return { ok: true, vaerdi: HJEMMESIDE_INGEN };
      const s = tekst(raa);
      if (!s) return { ok: false, fejl: FEJL.hjemmeside };
      const n = normaliserHjemmeside(s);
      return n ? { ok: true, vaerdi: n } : { ok: false, fejl: FEJL.hjemmeside };
    }
    case "omsaetningsinterval":
      return erValg(raa, OMSAETNINGSINTERVALLER) ? { ok: true, vaerdi: raa } : { ok: false, fejl: FEJL.omsaetningsinterval };
    case "antal_ansatte": {
      const s = tekst(raa).replace(/\./g, "");
      // Jonas 18/9 (valg A): ejeren tælles med, så 1 er «alene» og 0 er ikke et svar.
      if (!/^\d{1,6}$/.test(s) || Number(s) < 1) return { ok: false, fejl: FEJL.antal_ansatte };
      return { ok: true, vaerdi: Number(s) };
    }
    case "navn": {
      const s = tekst(raa).replace(/\s+/g, " ");
      return s.length >= 2 && s.length <= 120 ? { ok: true, vaerdi: s } : { ok: false, fejl: FEJL.navn };
    }
    case "email": {
      const s = tekst(raa).toLowerCase();
      return EMAIL.test(s) && s.length <= 254 ? { ok: true, vaerdi: s } : { ok: false, fejl: FEJL.email };
    }
    case "telefon": {
      const n = normaliserTelefon(tekst(raa));
      return n ? { ok: true, vaerdi: n } : { ok: false, fejl: FEJL.telefon };
    }
    case "udfordring":
    case "proevet":
    case "om_tolv_maaneder": {
      const s = tekst(raa).replace(/\r\n/g, "\n");
      if (s.length > TEKST_MAKS) return { ok: false, fejl: FEJL.tekst_lang };
      if (s.length < TEKST_MIN || ordAntal(s) < 5) return { ok: false, fejl: FEJL.tekst_kort };
      return { ok: true, vaerdi: s };
    }
    case "start_tidspunkt":
      return erValg(raa, START_TIDSPUNKTER) ? { ok: true, vaerdi: raa } : { ok: false, fejl: FEJL.start_tidspunkt };
    case "set_webinar":
      return erValg(raa, WEBINAR_SVAR) ? { ok: true, vaerdi: raa } : { ok: false, fejl: FEJL.set_webinar };
  }
}

/** Alle felter dømt på én gang — til indsendelsen. Ved ok er svarene normaliserede. */
export type AlleDom =
  | { ok: true; svar: AnsoegningsSvar }
  | { ok: false; fejl: Partial<Record<FeltId, string>> };

export function validerAlle(svar: AnsoegningsSvar): AlleDom {
  const fejl: Partial<Record<FeltId, string>> = {};
  const rene: Record<string, string | number | null> = { ...svar };
  for (const id of FELTER) {
    const d = validerFelt(id, svar[id]);
    // strict er false i tsconfig.app.json — «=== false» indsnævrer, «!d.ok» gør ikke.
    if (d.ok === false) fejl[id] = d.fejl;
    else rene[id] = d.vaerdi;
  }
  return Object.keys(fejl).length === 0
    ? { ok: true, svar: rene as unknown as AnsoegningsSvar }
    : { ok: false, fejl };
}

/**
 * En delmængde af svar (et enkelt skærmbillede) dømt og normaliseret —
 * til «gem undervejs». Ukendte nøgler ignoreres; et felt der er null
 * bliver null (ansøgeren har ryddet det), og et ugyldigt felt AFVISES,
 * så der aldrig gemmes noget der ikke ville kunne indsendes.
 */
export type DelDom =
  | { ok: true; svar: Partial<AnsoegningsSvar> }
  | { ok: false; fejl: Partial<Record<FeltId, string>> };

export function validerDel(raa: unknown): DelDom {
  if (typeof raa !== "object" || raa === null || Array.isArray(raa)) return { ok: false, fejl: {} };
  const ind = raa as Record<string, unknown>;
  const svar: Partial<AnsoegningsSvar> = {};
  const fejl: Partial<Record<FeltId, string>> = {};
  for (const id of FELTER) {
    if (!(id in ind)) continue;
    if (ind[id] === null) {
      (svar as Record<string, unknown>)[id] = null;
      continue;
    }
    const d = validerFelt(id, ind[id]);
    if (d.ok === false) fejl[id] = d.fejl;
    else (svar as Record<string, unknown>)[id] = d.vaerdi;
  }
  return Object.keys(fejl).length === 0 ? { ok: true, svar } : { ok: false, fejl };
}

// ── Fremdrift ──────────────────────────────────────────────────────────────

export interface Fremdrift {
  /** Felter der er gyldigt besvaret. */
  besvarede: number;
  ialt: number;
  /** 0–100, afrundet. */
  procent: number;
  /** Indeks i SKAERME på den første skærm med et ubesvaret eller ugyldigt felt; SKAERME.length når alt er besvaret. */
  naesteSkaerm: number;
  faerdig: boolean;
}

export function erSkaermBesvaret(skaerm: (typeof SKAERME)[number], svar: AnsoegningsSvar): boolean {
  return skaerm.felter.every((f) => validerFelt(f, svar[f]).ok);
}

export function afgoerFremdrift(svar: AnsoegningsSvar): Fremdrift {
  let besvarede = 0;
  for (const id of FELTER) if (validerFelt(id, svar[id]).ok) besvarede += 1;
  let naesteSkaerm: number = SKAERME.length;
  for (let i = 0; i < SKAERME.length; i += 1) {
    if (!erSkaermBesvaret(SKAERME[i], svar)) {
      naesteSkaerm = i;
      break;
    }
  }
  return {
    besvarede,
    ialt: FELTER.length,
    procent: Math.round((besvarede / FELTER.length) * 100),
    naesteSkaerm,
    faerdig: besvarede === FELTER.length,
  };
}

// ── Kilden ─────────────────────────────────────────────────────────────────

export interface KildeInput {
  /** ?kilde= — det vi selv sætter i links (webinar-mailen, LinkedIn-opslag, theboardroom.dk). */
  kilde: string | null | undefined;
  /** ?utm_source= — hvis et værktøj har sat det i stedet. */
  utmSource: string | null | undefined;
  /** document.referrer — tom når man kommer direkte. */
  referrer: string | null | undefined;
}

export interface KildeDom {
  kilde: Kilde;
  /** Det rå spor (parameter, utm eller værtsnavn), højst 120 tegn — til rådgiverens øje. */
  raa: string | null;
}

function vaert(referrer: string): string | null {
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const RAA_MAKS = 120;
const raaAf = (s: string): string => s.trim().slice(0, RAA_MAKS);

/**
 * Parameteren vinder over utm, som vinder over referrer. Et eksplicit
 * ?kilde= vi ikke kender, bliver «andet» med parameteren som spor — aldrig
 * kastet væk, aldrig gættet til noget bedre.
 */
/**
 * Aliasser for ?kilde= — ord, et link kan sende, som BETYDER en kendt kilde.
 * `website` (21/9-2026): theboardroom.dk's syv «Ansøg»-knapper sendte
 * `?kilde=website`, og det ord kendte vi ikke, så den første rigtige ansøgning
 * fra sitet ville være landet som «andet». Sitet rettes til `direkte`; aliaset
 * er sikkerhedsnettet for et gammelt link i en mail eller en knap, nogen glemmer.
 * Det rå ord bevares i `raa`, så man kan se, hvad linket faktisk sagde.
 */
export const KILDE_ALIAS: Readonly<Record<string, Kilde>> = { website: "direkte" };

export function afgoerKilde(input: KildeInput): KildeDom {
  const k = (input.kilde ?? "").trim().toLowerCase();
  if (k) {
    const kendt = (KILDER as readonly string[]).includes(k) ? (k as Kilde) : KILDE_ALIAS[k];
    return kendt ? { kilde: kendt, raa: raaAf(k) } : { kilde: "andet", raa: raaAf(k) };
  }
  const utm = (input.utmSource ?? "").trim().toLowerCase();
  if (utm) {
    if (utm.includes("linkedin")) return { kilde: "linkedin", raa: raaAf(utm) };
    if (utm.includes("webinar")) return { kilde: "webinar", raa: raaAf(utm) };
    return { kilde: "andet", raa: raaAf(utm) };
  }
  const ref = (input.referrer ?? "").trim();
  if (!ref) return { kilde: "direkte", raa: null };
  const h = vaert(ref);
  if (!h) return { kilde: "andet", raa: raaAf(ref) };
  if (h.endsWith("linkedin.com") || h === "lnkd.in") return { kilde: "linkedin", raa: h };
  if (h.endsWith("theboardroom.dk")) return { kilde: "direkte", raa: h };
  return { kilde: "andet", raa: h };
}

// ── CVR-svaret som en sætning ──────────────────────────────────────────────

/** Det formularen viser tilbage — udledt af DataCVR-svaret i _shared/cvrAnsoeger.ts. */
export interface CvrVisning {
  navn: string;
  stiftet_aar: number | null;
  /** DataCVR's `employees` er et INTERVAL som tekst («10-19», «10000+»), aldrig et tal. */
  antal_ansatte: string | null;
  selskabsform: string | null;
  branche: string | null;
  /** «Aktiv», «Ophørt», … — som registret siger det. */
  status: string | null;
  /** Registrets website-felt, normaliseret med normaliserHjemmeside; null når tomt/ulæseligt. */
  hjemmeside: string | null;
  /**
   * 18/9: hvor navnet kommer fra. Udeladt/«datacvr» = DataCVR; «ansoeger» = ansøgeren tastede
   * selv navnet, fordi opslaget fejlede (fallback i ansoegning-gem). Motoren og fladen skelner.
   */
  kilde?: "datacvr" | "ansoeger";
}

/**
 * Er ansøgningen TYND — altså regnet uden CVR-registrets oplysninger?
 * (19/9-2026, recon-boelgen-2 §3.)
 *
 * Sandt når der aldrig blev slået op (`cvr_opslag` er null), eller når
 * ansøgeren selv tastede navnet, fordi opslaget ikke kunne foretages
 * (`kilde: "ansoeger"` — dagsloftet, DataCVR's grænse eller en fejl).
 *
 * KONSEKVENSEN, som er hele grunden til at det har et navn: anbefalingen
 * regnes UDEN branche, stiftelsesår, selskabsform og status. Den er ikke
 * forkert — den er regnet på mindre. Motoren skriver det i grundlaget, og
 * listen viser det på den lukkede række, så det kan ses uden at folde ud.
 *
 * ÉN DOM, TO STEDER: denne fil er spejlet (src/lib/ansoegning/skema.ts ↔
 * supabase/functions/_shared/ansoegningSkema.ts) med paritetstest, så
 * motoren og fladen ikke kan blive uenige om hvad «tynd» betyder.
 */
export function cvrMangler(cvrOpslag: { kilde?: "datacvr" | "ansoeger" } | null | undefined): boolean {
  return !cvrOpslag || cvrOpslag.kilde === "ansoeger";
}

/** «2019-05-01» → 2019; ulæseligt → null. Splitter selv (aldrig new Date()). */
export function stiftetAarAf(dato: string | null | undefined): number | null {
  const m = (dato ?? "").match(/^(\d{4})-\d{2}-\d{2}/);
  return m ? Number(m[1]) : null;
}

/** «10-19» → «10–19 ansatte»; «1» → «1 ansat»; «10000+» → «over 10.000 ansatte». */
export function ansatteTekst(interval: string | null): string | null {
  if (!interval) return null;
  const s = interval.trim();
  if (/^\d+$/.test(s)) return Number(s) === 1 ? "1 ansat" : `${tusind(Number(s))} ansatte`;
  const plus = s.match(/^(\d+)\+$/);
  if (plus) return `over ${tusind(Number(plus[1]))} ansatte`;
  const spaend = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (spaend) return `${tusind(Number(spaend[1]))}–${tusind(Number(spaend[2]))} ansatte`;
  return `${s} ansatte`;
}

function tusind(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** «Nordic Byg ApS, stiftet 2019, 10–19 ansatte.» — det der vises tilbage til ansøgeren. */
export function cvrSaetning(v: CvrVisning): string {
  const dele = [v.navn];
  if (v.stiftet_aar) dele.push(`stiftet ${v.stiftet_aar}`);
  const a = ansatteTekst(v.antal_ansatte);
  if (a) dele.push(a);
  return `${dele.join(", ")}.`;
}
