/**
 * Webinarkoblingen (udkast 1/10-2026 — Jonas 1/10 08:25: «forslag + klik»).
 *
 * PROBLEMET (målt i prod 30/9 nat): Green Solar blev medlem; ansøgningen har
 * `kilde = direkte`, og ingen webinartilmelding har ansøgerens mail. En
 * sandsynlig tilmelding findes under en ANDEN mail (en privat gmail, via fb,
 * tilmeldt 8/9 til 22/9-sessionen). Tragten på /webinar kobler ansøgning ↔
 * tilmelding KUN på `lower(email)`, så hun tæller ikke.
 *
 * LØSNINGEN: platformen FORESLÅR, rådgiveren BEKRÆFTER med ét klik, og først
 * da tæller tragten koblingen (`ansoegning_webinar_kobling`, migration
 * 20261001120000; dashboardets `medWebinarKobling`). Et forslag er ALDRIG en
 * kobling — dommen her skriver intet og tæller intet.
 *
 * DOMMEN `foreslaaWebinarKobling(ansoegning, tilmeldinger, optagne)`:
 *   · kun tilmeldinger, hvis mail IKKE er ansøgningens (mail-match er tragtens
 *     egen kobling og behøver ingen bekræftelse);
 *   · ALDRIG en tilmelding, der allerede er koblet til en ANDEN ansøgning
 *     (`optagne` = deres id'er; rådets fund M2 1/10): tragten tæller ansøgerne
 *     som et sæt af mails, så to ansøgninger på samme tilmelding ville blive
 *     talt som én. Databasen nægter det også (UNIQUE (tilmelding_id));
 *   · kun tilmeldinger FØR ansøgningens oprettelse (`created_at`), højst
 *     KOBLING_MAKS_DAGE før — SKARPT før: en tilmelding i samme millisekund
 *     er ikke «før». Tilmeldingens tid er `registreret_at`, ellers rækkens
 *     `created_at` (webhooken skriver rækken, når tilmeldingen kommer); uden
 *     nogen af dem er den ikke med (vi kan ikke sige, at den kom før);
 *   · NAVN: normaliseret (NFC, små bogstaver, trim, flere mellemrum → ét; æøå
 *     bevares). «fuldt» = hele navnet ens; «for_efter» = første og sidste ord
 *     ens. BEGGE kræver mindst TO ord på begge sider — et fornavn alene
 *     («Lone» = «Lone») er ikke et navn, der kan bære en kobling;
 *   · TELEFON: kun cifre; et foranstillet 0045 eller 45 (når der er 10 cifre)
 *     fjernes; de SIDSTE 8 cifre sammenlignes; færre end 8 cifre er intet nummer;
 *   · RANGERING: navn + telefon (3) > telefon (2) > navn (1); inden for samme
 *     styrke vinder fuldt navn over fornavn+efternavn, derefter den SENESTE
 *     tilmelding (nærmest ansøgningen), derefter id (stabil orden).
 *
 * TELEFONEN PÅ TILMELDINGEN ER UMÅLT (1/10): `webinar_tilmeldinger` har INGEN
 * telefonkolonne (migration 20260919130000), og om eWebinars `raa` bærer et
 * telefonfelt — og under hvilken nøgle — er ikke målt. Dommen kan bruge et
 * nummer, når det gives ind; hooken giver `telefon: null`, indtil feltet er
 * målt. Navnet er derfor det, der bærer forslaget i dag.
 *
 * VINDUET: tragten og annoncesporet har INGEN dagsgrænse (tragtens grænse er
 * `indsendt_at > session_tid`, se dashboard.ts' filhoved). Det eneste vindue i
 * huset for «en webinartilmelding før en ansøgning» er Meta-sendingens
 * fbc-led (CLAUDE.md, «fbc har nu tre led»: højst 90 dage før, Metas eneste
 * dokumenterede levetid — `WEBINAR_FBCLID_MAKS_DAGE` i _shared/metaSend.ts).
 * Samme tal her: 90 dage.
 *
 * Ren: ingen I/O, ingen klokke — `nu` bruges ikke; tiden er ansøgningens egen.
 */

/** Højst så mange dage før ansøgningens oprettelse (samme som metaSend.WEBINAR_FBCLID_MAKS_DAGE). */
export const KOBLING_MAKS_DAGE = 90;
const DAG_MS = 24 * 60 * 60 * 1000;

/** Ansøgningen, som dommen læser den (felterne i `ansoegninger`, typer.ts). */
export interface KoblingAnsoegning {
  email: string | null;
  navn: string | null;
  telefon: string | null;
  /** Oprettelsen (`ansoegninger.created_at`) — ikke indsendelsen. */
  created_at: string;
}

/** Tilmeldingen, som dommen læser den (felterne i `webinar_tilmeldinger`). */
export interface KoblingTilmelding {
  id: string;
  email: string;
  navn: string | null;
  /** UMÅLT i eWebinar — ingen kolonne i dag; null fra hooken. */
  telefon?: string | null;
  registreret_at: string | null;
  created_at?: string | null;
  session_tid: string | null;
}

export type NavnMatch = "fuldt" | "for_efter";

export interface KoblingsForslag<T extends KoblingTilmelding = KoblingTilmelding> {
  tilmelding: T;
  /** 3 = navn + telefon · 2 = telefon · 1 = navn. */
  styrke: 1 | 2 | 3;
  navn: NavnMatch | null;
  telefon: boolean;
  /** Grunden i ord til rådgiveren. */
  grund: string;
}

// ── Normaliseringen ────────────────────────────────────────────────────────

/** «  Lone   HAVNDRUP  Hoffman » → «lone havndrup hoffman». æøå bevares (NFC). null uden tekst. */
export function normaliserNavn(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
  return s === "" ? null : s;
}

/** «+45 20 30 40 50» · «0045 20304050» · «20 30 40 50» → «20304050». null under 8 cifre. */
export function normaliserTelefon(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  let c = v.replace(/\D/g, "");
  if (c.startsWith("0045")) c = c.slice(4);
  else if (c.startsWith("45") && c.length === 10) c = c.slice(2);
  if (c.length < 8) return null;
  return c.slice(-8);
}

/** Navnedommen: «fuldt», «for_efter» eller null. Begge sider skal have mindst to ord. */
export function navneMatch(a: string | null | undefined, b: string | null | undefined): NavnMatch | null {
  const x = normaliserNavn(a), y = normaliserNavn(b);
  if (x === null || y === null) return null;
  const ox = x.split(" "), oy = y.split(" ");
  if (ox.length < 2 || oy.length < 2) return null;
  if (x === y) return "fuldt";
  if (ox[0] === oy[0] && ox[ox.length - 1] === oy[oy.length - 1]) return "for_efter";
  return null;
}

const tid = (iso: string | null | undefined): number | null => {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Tilmeldingens tidspunkt: `registreret_at`, ellers rækkens `created_at`. */
export function tilmeldingsTid(t: Pick<KoblingTilmelding, "registreret_at" | "created_at">): number | null {
  return tid(t.registreret_at) ?? tid(t.created_at ?? null);
}

function grundTekst(navn: NavnMatch | null, telefon: boolean): string {
  const n = navn === "fuldt" ? "samme fulde navn" : navn === "for_efter" ? "samme fornavn og efternavn" : null;
  if (n && telefon) return `${n[0].toUpperCase()}${n.slice(1)} og samme telefonnummer — men en anden mail`;
  if (telefon) return "Samme telefonnummer — men en anden mail";
  return `${n![0].toUpperCase()}${n!.slice(1)} — men en anden mail og intet telefonnummer at holde op imod`;
}

// ── Dommen ─────────────────────────────────────────────────────────────────

/** Ingen optagne tilmeldinger (standard — prøverne; fladen giver altid sin egen mængde). */
const INGEN_OPTAGNE: ReadonlySet<string> = new Set<string>();

export function foreslaaWebinarKobling<T extends KoblingTilmelding>(
  ansoegning: KoblingAnsoegning,
  tilmeldinger: readonly T[],
  /** Id'erne på tilmeldinger, der allerede er koblet til en ANDEN ansøgning. */
  optagne: ReadonlySet<string> = INGEN_OPTAGNE,
): KoblingsForslag<T>[] {
  const oprettet = tid(ansoegning.created_at);
  if (oprettet === null) return [];
  const fra = oprettet - KOBLING_MAKS_DAGE * DAG_MS;
  const mail = (ansoegning.email ?? "").trim().toLowerCase();
  const tlf = normaliserTelefon(ansoegning.telefon);

  const ud: KoblingsForslag<T>[] = [];
  for (const t of tilmeldinger) {
    if (mail !== "" && t.email.trim().toLowerCase() === mail) continue;
    if (optagne.has(t.id)) continue;
    const tt = tilmeldingsTid(t);
    if (tt === null || tt >= oprettet || tt < fra) continue;
    const navn = navneMatch(ansoegning.navn, t.navn);
    const tTlf = normaliserTelefon(t.telefon ?? null);
    const telefon = tlf !== null && tTlf !== null && tlf === tTlf;
    if (navn === null && !telefon) continue;
    const styrke: 1 | 2 | 3 = navn !== null && telefon ? 3 : telefon ? 2 : 1;
    ud.push({ tilmelding: t, styrke, navn, telefon, grund: grundTekst(navn, telefon) });
  }
  return ud.sort((a, b) =>
    b.styrke - a.styrke
    || (a.navn === b.navn ? 0 : a.navn === "fuldt" ? -1 : b.navn === "fuldt" ? 1 : 0)
    || (tilmeldingsTid(b.tilmelding)! - tilmeldingsTid(a.tilmelding)!)
    || (a.tilmelding.id < b.tilmelding.id ? -1 : a.tilmelding.id > b.tilmelding.id ? 1 : 0));
}

// ── Hvad fladen viser ──────────────────────────────────────────────────────

export type KoblingsVisning<T extends KoblingTilmelding = KoblingTilmelding> =
  | { art: "koblet" }
  | { art: "mail_match" }
  | { art: "forslag"; forslag: KoblingsForslag<T>[] }
  | { art: "intet" };

/**
 * Én dom for afsnittet på ansøgningen: en bekræftet kobling vises altid (den
 * skal kunne fjernes); ellers intet forslag, når mailen allerede matcher en
 * tilmelding (tragten tæller hende i forvejen); ellers forslagene.
 */
export function koblingsVisning<T extends KoblingTilmelding>(
  harKobling: boolean,
  mailMatcher: number,
  forslag: KoblingsForslag<T>[],
): KoblingsVisning<T> {
  if (harKobling) return { art: "koblet" };
  if (mailMatcher > 0) return { art: "mail_match" };
  return forslag.length > 0 ? { art: "forslag", forslag } : { art: "intet" };
}

/** Højst så mange forslag på fladen — resten er støj. */
export const KOBLING_FORSLAG_MAKS = 3;

export const KOBLING_FORSLAG_TITEL = "Mulig webinartilmelding";
export const KOBLING_FORSLAG_FORKLARING =
  "Ansøgerens mail står ikke i eWebinar, men en tilmelding under en anden mail ligner. Et forslag tæller ikke — først når I kobler, tæller ansøgningen med i tragten på /webinar.";
export const KOBLING_KNAP = "Kobl til webinaret";
export const KOBLING_FJERN_KNAP = "Fjern koblingen";

/**
 * Loftet i ord (rådets fund L5 1/10): hooken gennemser højst `loft` tilmeldinger
 * i vinduet, nyeste først. Rammes det, kan et ældre match mangle — det skal stå.
 */
export function loftTekst(loft: number): string {
  return `Kun de ${String(loft).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} nyeste tilmeldinger i vinduet er gennemset — en ældre tilmelding kan mangle blandt forslagene.`;
}

/** «Koblet til webinaret 22/9 af Jonas Herlev» — dato og navn kan mangle. */
export function koblingLinje(sessionDato: string | null, raadgiver: string | null): string {
  return `Koblet til webinaret${sessionDato ? ` ${sessionDato}` : ""}${raadgiver ? ` af ${raadgiver}` : ""}`;
}
