/**
 * opkaldDom — «Må vi ringe til dig?» (2/10-2026, docs/samtykke-og-opkald.md del 2):
 * den rene dom bag ring-mig-op og /opkald. Deno-fri, nul imports.
 *
 * SPEJL: src/lib/opkald/dom.ts. Kroppen efter dette filhoved er ORDRET ens
 * (paritetsprøven src/lib/__tests__/opkaldDom.paritet.test.ts sammenligner tegn
 * for tegn OG svarene på samme input). Fladen skal kunne dømme nummerets form og
 * vise den samme ordlyd, som functionen gemmer — og prøverne kører i vitest.
 *
 * JONAS' FEM SVAR (2/10 kl. 07:38–07:39, ordret valg): «Kun dem, der deltog i
 * webinaret — ja» · «Slet nummeret efter 90 dage — ja» · «Klaviyo får hændelsen
 * «Bad om opkald» uden nummer — ja» · «Besked i morgenmailen, ikke straks — ja»
 * · «Både Morten og Jonas får klokken — ja».
 *
 * HVAD DER STÅR HER:
 *   - SAMTYKKE_ORDLYD: krydsets tekst. Den ER samtykket og gemmes ORDRET på rækken
 *     (samtykke_ordlyd) — bevisbyrden ligger hos os (spamvejledningen kap. 12).
 *     Functionen tager kun en anmodning, hvis fladen sender præcis denne tekst
 *     tilbage, så det, der gemmes, er det, der stod på skærmen.
 *   - OPBEVARING_DAGE: 90. Rækken SLETTES (ikke anonymiseres) af cron-jobbet
 *     opkald-opbevaring (migration 20261002270000) — Jonas' ord var «slet
 *     nummeret», og rækken bærer intet andet end nummeret, navnet og samtykket
 *     til dem. Tallet «hvor mange bad om det» overlever i klokkerne.
 *   - harDeltaget: KUN «set» og «delvist» (webinarDom.doemSetGrad) — de to grader,
 *     der betyder «var der» (webinarHaendelser.VAR_DER). «mødte ikke op»,
 *     «tilmeldt» og «ukendt» afvises med ét svar.
 *   - normaliserTelefon: dansk nummer, STRENG form → E.164 «+45XXXXXXXX», ellers
 *     null. Mellemrum, bindestreger og punktummer fjernes; «+45», «0045» og «45»
 *     foran accepteres; første ciffer 2–9 (danske numre begynder aldrig med 0
 *     eller 1). Alt andet er null — aldrig et rået tal i databasen.
 *   - doemAnmodning: body'ens form (navn 1–80 tegn, nummeret, krydset === true,
 *     ordlyden tegn for tegn). Grunden står i svaret, aldrig et felt, vi ikke bad om.
 *   - Loftet: ANMODNINGER_PR_IP_PR_TIME / _I_ALT — samme form som
 *     ansoegningVisning.loftetNaaet: en tælling, der fejlede, er ALTID nået.
 *   - Rådets fund 2/10: tokenUdloebet (session + 30 dage), forSnartIgen (10 min
 *     mellem indsend på samme tilmelding) og indsendVej (ny · for_snart · aaben ·
 *     genaabn — en åben anmodning overskrives aldrig). Regnestykkerne står ved dem.
 */

// ── Ordlyden og konstanterne ─────────────────────────────────────────────────

/** Krydsets tekst — ét sted; gemmes ordret (samtykke_ordlyd). Tomt som standard i fladen. */
export const SAMTYKKE_ORDLYD = "Ja, Morten eller Jonas må ringe til mig om The Boardroom";

/** Nummeret og navnet slettes 90 dage efter samtykket, uanset udfald (Jonas 2/10). */
export const OPBEVARING_DAGE = 90;

/** Anmodninger pr. IP-dagshash pr. time og i alt — et hold bag én IP rammer det aldrig; en bot gør. */
export const ANMODNINGER_PR_IP_PR_TIME = 10;
export const ANMODNINGER_PR_TIME_I_ALT = 200;

export const NAVN_MAKS = 80;

/** Body'ens kendte felter (kendteFelter.ts-reglen): alt andet afvises. */
export const KENDTE_FELTER = ["t", "handling", "navn", "telefon", "samtykke"] as const;
export const HANDLINGER = ["opslag", "indsend"] as const;
export type Handling = (typeof HANDLINGER)[number];

/** Klokkens type (MORGEN_TYPER i klokkeMail.ts) og reference_type (klokke.ts → /opkald). */
export const KLOKKE_TYPE = "opkald_anmodet";
export const KLOKKE_REFERENCE = "opkald";
export const OPKALD_STI = "/opkald";

// ── Deltog? ──────────────────────────────────────────────────────────────────

/** De to grader, der betyder «var der» — samme ord som webinarDom.SetGrad. */
export const DELTOG_GRADER = ["set", "delvist"] as const;

export function harDeltaget(grad: string | null | undefined): boolean {
  return (DELTOG_GRADER as readonly string[]).includes(grad ?? "");
}

// ── Nummeret ─────────────────────────────────────────────────────────────────

const DK_8 = /^[2-9]\d{7}$/;

/**
 * «+45 12 34 56 78» · «12345678» · «0045 12345678» · «45 12 34 56 78» → «+4512345678».
 * Alt andet → null. Kun danske numre: et opkald fra Morten eller Jonas er dansk.
 */
export function normaliserTelefon(raa: unknown): string | null {
  if (typeof raa !== "string") return null;
  let s = raa.replace(/[\s.\-()]/g, "");
  if (s === "") return null;
  if (s.startsWith("+45")) s = s.slice(3);
  else if (s.startsWith("0045")) s = s.slice(4);
  else if (s.length === 10 && s.startsWith("45")) s = s.slice(2);
  if (!DK_8.test(s)) return null;
  return `+45${s}`;
}

/** Til fladen og rådgiverlisten: «+4512345678» → «12 34 56 78». */
export function visTelefon(e164: string | null | undefined): string {
  if (!e164) return "";
  const s = e164.startsWith("+45") ? e164.slice(3) : e164;
  return s.length === 8 ? `${s.slice(0, 2)} ${s.slice(2, 4)} ${s.slice(4, 6)} ${s.slice(6)}` : e164;
}

// ── Body'en ──────────────────────────────────────────────────────────────────

export type AnmodningGrund = "navn" | "telefon" | "samtykke" | "ordlyd";

export type AnmodningDom =
  | { ok: true; navn: string; telefon: string; ordlyd: string }
  | { ok: false; grund: AnmodningGrund };

/**
 * Formen på «indsend»: samtykke = { kryds: true, ordlyd: "<teksten>" }.
 * Krydset skal være boolean true, og ordlyden skal være SAMTYKKE_ORDLYD tegn
 * for tegn — ellers ved vi ikke, hvad personen sagde ja til. Fladen sender
 * den tekst, den VISTE; functionen gemmer den, den FIK. Afviger de, gemmes intet.
 */
export function doemAnmodning(body: Record<string, unknown>): AnmodningDom {
  const navn = typeof body.navn === "string" ? body.navn.trim().replace(/\s+/g, " ") : "";
  if (navn.length < 1 || navn.length > NAVN_MAKS) return { ok: false, grund: "navn" };
  const telefon = normaliserTelefon(body.telefon);
  if (telefon === null) return { ok: false, grund: "telefon" };
  const s = body.samtykke;
  if (!s || typeof s !== "object" || Array.isArray(s)) return { ok: false, grund: "samtykke" };
  const kryds = (s as { kryds?: unknown }).kryds;
  if (kryds !== true) return { ok: false, grund: "samtykke" };
  const ordlyd = (s as { ordlyd?: unknown }).ordlyd;
  if (ordlyd !== SAMTYKKE_ORDLYD) return { ok: false, grund: "ordlyd" };
  return { ok: true, navn, telefon, ordlyd };
}

export function erHandling(v: unknown): v is Handling {
  return (HANDLINGER as readonly string[]).includes(typeof v === "string" ? v : "");
}

// ── Loftet ───────────────────────────────────────────────────────────────────

/** Rate-dommen: er loftet nået? Et ukendt antal (tællingen fejlede) er ALTID nået. */
export function loftetNaaet(antalIp: number | null, antalIAlt: number | null): boolean {
  if (antalIp === null || antalIAlt === null) return true;
  return antalIp >= ANMODNINGER_PR_IP_PR_TIME || antalIAlt >= ANMODNINGER_PR_TIME_I_ALT;
}

// ── Linkets levetid (rådets fund 2/10, punkt 2) ─────────────────────────────

/** Linket i «Deltog»-mailen virker til 30 dage efter sessionens start. */
export const TOKEN_GYLDIG_DAGE = 30;
const DAG_MS = 86_400_000;

/**
 * Er linket udløbet? Tokenet bærer ingen tid (HMAC over ewebinar_id); tiden er
 * TILMELDINGENS session_tid, læst på serveren.
 * REGNESTYKKET: udløb = Date.parse(session_tid) + TOKEN_GYLDIG_DAGE × 86 400 000 ms
 *   = session_tid + 30 × 86 400 000 = session_tid + 2 592 000 000 ms (absolut UTC-tid,
 *   ingen sommertid i regnestykket); udløbet ⇔ nu > udløb.
 *   Eksempel: session 2026-09-22T09:00:00.000Z → udløb 2026-10-22T09:00:00.000Z;
 *   præcis dét millisekund er stadig gyldigt, ét millisekund senere ikke.
 * Ukendt eller ulæselig session_tid = UDLØBET (fail-closed): uden en tid kan vi ikke
 * sige, at linket stadig gælder. Functionen svarer 403 «ukendt» — samme svar som et
 * forkert token, så et udløbet link ikke afslører, at tilmeldingen findes.
 */
export function tokenUdloebet(sessionTid: string | null | undefined, nu: Date): boolean {
  if (!sessionTid) return true;
  const start = Date.parse(sessionTid);
  if (Number.isNaN(start)) return true;
  return nu.getTime() > start + TOKEN_GYLDIG_DAGE * DAG_MS;
}

// ── Gentaget «indsend» og den åbne anmodning (rådets fund 2/10, punkt 1 og 3) ─

/** Et nyt «indsend» på SAMME tilmelding afvises inden for 10 minutter. */
export const INDSEND_PAUSE_MIN = 10;

/**
 * For snart igen? Tællingen bor i RÆKKEN (opkaldsanmodninger.sidst_indsendt_at, sat
 * ved HVERT indsend, der når rækken — også et afvist på en åben anmodning).
 * REGNESTYKKET: for snart ⇔ nu − sidst_indsendt_at < INDSEND_PAUSE_MIN × 60 000 ms
 *   = 10 × 60 000 = 600 000 ms. Præcis 600 000 ms efter er IKKE for snart.
 * null = ingen række endnu = ikke for snart. En ulæselig tid = for snart (fail-closed).
 */
export function forSnartIgen(sidstIndsendtAt: string | null | undefined, nu: Date): boolean {
  if (sidstIndsendtAt === null || sidstIndsendtAt === undefined) return false;
  const sidst = Date.parse(sidstIndsendtAt);
  if (Number.isNaN(sidst)) return true;
  return nu.getTime() - sidst < INDSEND_PAUSE_MIN * 60_000;
}

/**
 * Hvad et «indsend» gør med rækken (dommen før enhver skrivning):
 *   ny        — ingen række: INSERT, klokke og Klaviyo (én gang).
 *   for_snart — en række, indsendt for under 10 min siden: 429, intet skrives, intet sendes.
 *   aaben     — en ÅBEN anmodning (ringet_at null): OVERSKRIVES ALDRIG — et videresendt
 *               link må ikke kunne skifte nummeret. Kun sidst_indsendt_at røres; 409,
 *               ingen klokke, ingen Klaviyo.
 *   genaabn   — en LUKKET (ringet) anmodning: personen beder igen. Nyt navn/nummer/samtykke,
 *               ringet nulstilles, og runde_id skiftes, så klokken (reference_id) og
 *               Klaviyo («Bad om opkald», unikt id) er NYE — ikke en dublet af den gamle.
 */
export type IndsendVej = "ny" | "for_snart" | "aaben" | "genaabn";

export function indsendVej(
  findes: { ringet_at: string | null; sidst_indsendt_at: string | null } | null,
  nu: Date,
): IndsendVej {
  if (!findes) return "ny";
  if (forSnartIgen(findes.sidst_indsendt_at, nu)) return "for_snart";
  return findes.ringet_at === null ? "aaben" : "genaabn";
}

// ── Klokken ──────────────────────────────────────────────────────────────────

/** «22/9» i dansk tid — uden Intl-ugedag (isoUge-værnet). */
function datoKort(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "numeric" }).formatToParts(d)) p[x.type] = x.value;
  return p.day && p.month ? `${p.day}/${p.month}` : null;
}

/**
 * Klokkens titel: «Mette Hansen bad om et opkald — så webinaret 22/9».
 * ALDRIG nummeret: det står på /opkald, bag rådgiverens login.
 */
export function klokkeTitel(navn: string, sessionTid: string | null): string {
  const dato = datoKort(sessionTid);
  return `${navn} bad om et opkald${dato ? ` — så webinaret ${dato}` : ""}`;
}

export const KLOKKE_BODY = "Nummeret står på /opkald. Ring én gang, om The Boardroom.";

// ── Rådgiverlisten ───────────────────────────────────────────────────────────

export interface Anmodning {
  id: string;
  navn: string;
  telefon: string;
  samtykke_at: string;
  oprettet_at: string;
  ringet_at: string | null;
  ringet_af: string | null;
  /** Fra tilmeldingen (join): sessionens tid, hvis kendt. */
  session_tid?: string | null;
}

export const erAaben = (a: Pick<Anmodning, "ringet_at">): boolean => a.ringet_at === null;

/** Åbne først, nyeste øverst; ringede nederst. */
export function sorterAnmodninger<T extends Pick<Anmodning, "ringet_at" | "oprettet_at">>(liste: readonly T[]): T[] {
  return [...liste].sort((a, b) => {
    const aa = erAaben(a) ? 0 : 1, bb = erAaben(b) ? 0 : 1;
    if (aa !== bb) return aa - bb;
    return b.oprettet_at.localeCompare(a.oprettet_at);
  });
}

/** Hvornår rækken forsvinder (cron-jobbet): samtykke_at + OPBEVARING_DAGE. */
export function slettesAt(samtykkeAt: string): string {
  return new Date(Date.parse(samtykkeAt) + OPBEVARING_DAGE * 86_400_000).toISOString();
}
