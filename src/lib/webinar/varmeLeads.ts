/**
 * VARME LEADS (udkast 1/10-2026) — KUN rådgiverens /webinar. ALDRIG den delte.
 *
 * Nicklas (marketingkonsulenten, dokumentet 1/10): «Jonas ringer til alle, der
 * har set mindst 75 % og omsætter over 2 mio., inden for 24 timer.»
 *
 * DETTE ER PERSONDATA: navn og mail på mennesker, der har set et webinar.
 * Listen findes derfor KUN i browseren hos en rådgiver, regnet af de rækker,
 * rådgiveren i forvejen henter (useWebinarDashboard, RLS: rådgivere har
 * SELECT). Den har intet spejl i supabase/functions/_shared, webinar-delt
 * kender den ikke, og `varmeLeads` står i webinarDelingSvar.FORBUDTE_NOEGLER,
 * så et delt-svar, der bar den, ville blive afvist (500 svar_afvist) — og
 * findMailVaerdier afviser ethvert delt-svar med en mail som værdi.
 * Kildeværnet: src/lib/webinar/__tests__/varmeLeads.test.ts.
 *
 * OMSÆTNINGEN FINDES IKKE PÅ EN TILMELDING (målt i koden 1/10):
 * `webinar_tilmeldinger` har ingen CVR- eller omsætningskolonne, og eWebinars
 * tilmelding spørger ikke om det. Nicklas' anden betingelse kan derfor ikke
 * dømmes her — listen er «set ≥ 75 % og ikke ansøgt», og rådgiveren må
 * vurdere omsætningen i samtalen. Husets CVR-opslag (ansoegning-cvr,
 * ansoegning-cvr-opslag, berig-virksomheder — DataCVR, 25 opslag i døgnet) er
 * BEVIDST IKKE brugt: de slår et CVR-nummer op, og en tilmelding har intet.
 *
 * TIDEN: HVORNÅR PERSONEN FORLOD WEBINARET — ELLERS SESSIONENS START (B3).
 * Først (1/10, kodelæsning af types.ts): tabellen har `updated_at` og
 * `sidste_haendelse_at`, men ingen af dem er tidspunktet for procenten.
 * `sidste_haendelse_at` er, hvornår VI modtog den seneste besked — og
 * `ewebinar-import` sætter den til importens kørselstid på HVER række, den
 * skriver; `updated_at` flytter sig ved enhver skrivning. Begge ville få «for 2
 * timer siden» til at betyde «siden importen kørte».
 * MÅLT I PROD 1/10 AFTEN: `raa` bærer eWebinars `leftTime` (ISO, fx
 * «2026-08-25T07:10:19.000Z») og `joinedTime` — 191 af 839 rækker, og ALLE 132
 * med set_procent ≥ 75 har `leftTime`. Rådgiverens hentning beder derfor om
 * PRÆCIS den sti (`FORLOD_KOLONNE`, aldrig hele `raa`) som feltet `forlod`.
 * Det er et felt, vi ikke selv sætter — en OBSERVATION, aldrig en nøgle:
 * `forlodTid` godtager det kun som en ISO-tid med tidszone, SKARPT efter
 * sessionens start og ikke efter `nu`. Ellers (mangler, ugyldig, før start,
 * i fremtiden) falder tiden fail-soft tilbage på sessionens START, og teksten
 * siger hvilken: «så webinaret for N timer siden» (forlod) · «webinaret
 * begyndte for N timer siden» (start). Feltet hentes KUN i rådgiverens hentning
 * (hooks/webinarDashboard.ts) — ikke i `TILMELDING_KOLONNER` (som webinar-delt
 * spejler ordret) og ikke i webinar-delt.
 *
 * DOMMEN `varmeLeads(tilmeldinger, ansoegninger, nu)`:
 *   · kun rækker på en AFHOLDT session MED tidspunkt (session_tid ≤ nu); en
 *     Replay uden tidspunkt kan ikke siges at ligge «inden for 14 dage»;
 *   · sessionen højst VARME_LEADS_DAGE (14) dage gammel — inklusive grænsen:
 *     nu − session_tid ≤ 14 × 24 t;
 *   · rækken dømt «set» af webinarDom.doemSetGrad (≥ SET_GRAENSE_PROCENT) —
 *     ingen egen grænse her;
 *   · IKKE INTERNE ELLER PRØVER (B4c): registrant-id'et starter ikke med
 *     PROEVE_ID_PRAEFIKS («PROEVE-», ewebinar-proeve), og mailen ligger ikke
 *     på et af INTERNE_DOMAENER (topix.dk, theboardroom.dk);
 *   · IKKE ET MEDLEM (B4b): mailen er ikke blandt `medlemsMails` — husets
 *     blevMedlem (underskrevet OG betalt) over de ansøgninger, hooken
 *     allerede henter (mail ELLER kobling). Et medlem, der aldrig har sendt
 *     en ansøgning gennem platformen (fx fra før motoren), er IKKE i den
 *     kilde og udelukkes ikke — det kræver et opslag, hooken ikke laver;
 *   · INGEN ANSØGNING EFTER SESSIONEN (B4a, tragtens grænse): personen er
 *     ikke et lead, hvis hendes seneste indsendte ansøgning (`ansoegerTider`,
 *     mail ELLER kobling) ligger SKARPT EFTER den FØRSTE session i vinduet,
 *     hun så færdigt. Eksempel: så færdigt 22/9 kl. 09, ansøgte 23/9 → ikke
 *     et lead; ansøgte 8/7-2025 (en gammel, lukket ansøgning) → stadig et
 *     lead; så færdigt 22/9 OG 29/9 og ansøgte 25/9 → ikke et lead (grænsen er
 *     22/9, den første «set» i vinduet — hun ER en ansøger fra denne runde);
 *   · ÉN linje pr. person (mail): den NYESTE session, hun så færdigt;
 *   · TIDSPUNKTET = `forlodTid(forlod, session_tid, nu)` når det findes, ellers
 *     sessionens start (se ovenfor); `tidKilde` siger hvilket;
 *   · nyeste først på det VALGTE tidspunkt (faldende, så højeste procent, så mail);
 *   · «inden for 24 timer» = nu − tidspunkt ≤ RING_INDEN_TIMER × 1 t — Nicklas'
 *     frist, målt fra det valgte tidspunkt; flagets ord følger kilden.
 *
 * Ingen skrivning, ingen «ringet»-markering: det kræver en tabel (næste skridt).
 * Ren: ingen I/O; tiden gives ind som `nu`.
 */
import { ansoegerTider, datoKort, medlemsMails, medWebinarKobling, SET_GRAENSE_PROCENT, type AnsoegerMail, type Tilmelding } from "@/lib/webinar/dashboard";
import { doemSetGrad } from "@/lib/webinarDom";

/**
 * Den ENE sti, rådgiverens hentning beder om (PostgREST: alias `forlod`, tekst
 * fra `raa->>leftTime`). Aldrig hele `raa`.
 */
export const FORLOD_KOLONNE = "forlod:raa->>leftTime";

/** Feltet, rådgiverens hentning lægger på rækken. Udeladt/null = ukendt. */
export interface ForlodFelt {
  /** eWebinars `leftTime` (rå tekst fra `raa`) — en observation, dømt af `forlodTid`. */
  forlod?: string | null;
}
export type VarmTilmelding = Tilmelding & ForlodFelt;

/** Hvilket tidspunkt et lead er regnet fra. */
export type TidKilde = "forlod" | "start";

/** ISO 8601 med dato, tid og tidszone (Z eller ±hh:mm) — uden tidszone ville tiden blive browserens lokale. */
const ISO_MED_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * NORMALISERINGEN AF `forlod` — ét sted, ren. Svarer med millisekunderne, når
 * værdien er en gyldig ISO-tid med tidszone, SKARPT efter sessionens start og
 * ikke efter `nuMs`; ellers null (kaldet falder tilbage på sessionens start).
 * Regnestykket: gyldig ⇔ ISO_MED_ZONE ∧ Date.parse ≠ NaN ∧ start < t ≤ nu.
 */
export function forlodTid(forlod: unknown, startMs: number, nuMs: number): number | null {
  if (typeof forlod !== "string") return null;
  const s = forlod.trim();
  if (!ISO_MED_ZONE.test(s)) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  if (!(t > startMs) || t > nuMs) return null;
  return t;
}

/** Hvor langt tilbage et lead regnes som varmt. Nicklas' 24 timer er fristen; 14 dage er listens hukommelse. */
export const VARME_LEADS_DAGE = 14;
/** Nicklas: «inden for 24 timer». */
export const RING_INDEN_TIMER = 24;

/**
 * HVEM DER ALDRIG ER ET LEAD (B4c) — ét sted, med begrundelse:
 *   · PROEVE_ID_PRAEFIKS: `ewebinar-proeve` (#1036) bygger sin egen registrant
 *     med id «PROEVE-…» for at bevise fremmødehændelsen i drift. Den række er
 *     en maskine, ikke en seer.
 *   · INTERNE_DOMAENER: husets egne adresser (Topix.dk ApS og The Boardroom) —
 *     rådgivere og testkonti, der ser webinaret for at prøve det. Et domæne
 *     matcher kun hele domænet (`…@topix.dk`), ikke `…@nottopix.dk`.
 */
export const PROEVE_ID_PRAEFIKS = "PROEVE-";
export const INTERNE_DOMAENER = ["topix.dk", "theboardroom.dk"] as const;

/** Er tilmeldingen intern eller en prøve? Små bogstaver; mailen er allerede normaliseret (CHECK lower). */
export function erInternEllerProeve(r: Pick<Tilmelding, "ewebinar_id" | "email">): boolean {
  if (typeof r.ewebinar_id === "string" && r.ewebinar_id.startsWith(PROEVE_ID_PRAEFIKS)) return true;
  const mail = (r.email ?? "").trim().toLowerCase();
  const at = mail.lastIndexOf("@");
  if (at < 0) return false;
  const domaene = mail.slice(at + 1);
  return (INTERNE_DOMAENER as readonly string[]).includes(domaene);
}

const TIME_MS = 3_600_000;
const DAG_MS = 24 * TIME_MS;

export interface VarmtLead {
  navn: string | null;
  email: string;
  sessionTid: string;
  /** «22/9». */
  dato: string | null;
  titel: string | null;
  /** Den målte procent, når den findes — ellers null («set» af eWebinars egen tilstand). */
  procent: number | null;
  /** ISO for det valgte tidspunkt: da personen forlod webinaret, ellers sessionens start. */
  tidspunkt: string;
  /** Hvilket tidspunkt `tidspunkt` er. */
  tidKilde: TidKilde;
  /** Hele timer siden det valgte tidspunkt. */
  timerSiden: number;
  /** «så webinaret for 3 timer siden» (forlod) · «webinaret begyndte for 2 dage siden» (start). */
  sidenOrd: string;
  /** Nicklas' frist: det valgte tidspunkt ligger inden for 24 timer. */
  inden24Timer: boolean;
  /** Flagets ord — følger kilden (VARME_FLAG). */
  flagOrd: string;
}

const tid = (iso: string | null | undefined): number | null => {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

const SIDEN_FORLED: Record<TidKilde, string> = {
  forlod: "så webinaret for",
  start: "webinaret begyndte for",
};

/**
 * «så webinaret for 3 timer siden» (kilde forlod) · «webinaret begyndte for 3
 * timer siden» (kilde start) · «… for under en time siden» · «… for 2 dage siden».
 */
export function sidenOrd(ms: number, kilde: TidKilde): string {
  const forled = SIDEN_FORLED[kilde];
  const timer = Math.floor(ms / TIME_MS);
  if (timer < 1) return `${forled} under en time siden`;
  if (ms < DAG_MS) return `${forled} ${timer} ${timer === 1 ? "time" : "timer"} siden`;
  const dage = Math.floor(ms / DAG_MS);
  return `${forled} ${dage} ${dage === 1 ? "dag" : "dage"} siden`;
}

export function varmeLeads(
  tilmeldinger: readonly VarmTilmelding[],
  ansoegninger: readonly AnsoegerMail[],
  nu: Date,
): VarmtLead[] {
  const koblet = medWebinarKobling(ansoegninger);
  const indsendt = ansoegerTider(koblet);
  const medlemmer = medlemsMails(koblet);
  const nuMs = nu.getTime();
  const nyeste = new Map<string, { r: VarmTilmelding; t: number }>();
  const foersteSet = new Map<string, number>();
  for (const r of tilmeldinger) {
    const t = tid(r.session_tid);
    if (t === null || t > nuMs || nuMs - t > VARME_LEADS_DAGE * DAG_MS) continue;
    if (erInternEllerProeve(r)) continue;
    if (medlemmer.has(r.email)) continue;
    if (doemSetGrad(r, nu) !== "set") continue;
    const f = foersteSet.get(r.email);
    if (f === undefined || t < f) foersteSet.set(r.email, t);
    const haves = nyeste.get(r.email);
    const p = r.set_procent ?? -1;
    if (haves === undefined || t > haves.t || (t === haves.t && p > (haves.r.set_procent ?? -1))) nyeste.set(r.email, { r, t });
  }
  return [...nyeste.values()]
    .filter(({ r }) => {
      // Tragtens grænse: en indsendelse SKARPT efter den første «set»-session i vinduet.
      const a = indsendt.get(r.email);
      const g = foersteSet.get(r.email);
      return a === undefined || g === undefined || !(a > g);
    })
    .map(({ r, t }) => {
      const f = forlodTid(r.forlod, t, nuMs);
      const kilde: TidKilde = f === null ? "start" : "forlod";
      const valgt = f ?? t;
      const ms = nuMs - valgt;
      const inden = ms <= RING_INDEN_TIMER * TIME_MS;
      return {
        navn: typeof r.navn === "string" && r.navn.trim() !== "" ? r.navn.trim() : null,
        email: r.email,
        sessionTid: new Date(t).toISOString(),
        dato: datoKort(new Date(t).toISOString()),
        titel: typeof r.webinar_titel === "string" && r.webinar_titel.trim() !== "" ? r.webinar_titel : null,
        procent: r.set_procent !== null && r.set_procent > 0 ? Math.round(r.set_procent) : null,
        tidspunkt: new Date(valgt).toISOString(),
        tidKilde: kilde,
        timerSiden: Math.floor(ms / TIME_MS),
        sidenOrd: sidenOrd(ms, kilde),
        inden24Timer: inden,
        flagOrd: inden ? VARME_FLAG[kilde].inden : VARME_FLAG[kilde].senere,
      };
    })
    .sort((a, b) =>
      Date.parse(b.tidspunkt) - Date.parse(a.tidspunkt)
      || (b.procent ?? -1) - (a.procent ?? -1)
      || a.email.localeCompare(b.email));
}

export const VARME_EYEBROW = "Varme leads";
export const VARME_TITEL = `Ring inden for ${RING_INDEN_TIMER} timer`;
/** Flagets ord pr. kilde: tiden er enten da personen forlod webinaret, eller sessionens start. */
export const VARME_FLAG: Record<TidKilde, { inden: string; senere: string }> = {
  forlod: { inden: `så det inden for ${RING_INDEN_TIMER} timer`, senere: `så det for over ${RING_INDEN_TIMER} timer siden` },
  start: { inden: `begyndte inden for ${RING_INDEN_TIMER} timer`, senere: `begyndte for over ${RING_INDEN_TIMER} timer siden` },
};
export const VARME_FORKLARING =
  `De, der har set mindst ${SET_GRAENSE_PROCENT} % af et webinar inden for de seneste ${VARME_LEADS_DAGE} dage, som ikke har indsendt en ansøgning efter det, og som ikke er medlemmer (mailen eller en bekræftet kobling). Husets egne adresser og prøverne er taget ud. Tiden regnes fra, hvornår personen forlod webinaret (eWebinars «leftTime»); mangler det, fra webinarets start — og linjen siger hvilken. Nicklas' anden betingelse — omsætning over 2 mio. — kan platformen ikke se: en tilmelding har intet CVR-nummer. Vurdér den i samtalen. Kun rådgivere ser listen; den deles aldrig.`;
export const VARME_TOM_TEKST =
  `Ingen lige nu: ingen uden for huset har set mindst ${SET_GRAENSE_PROCENT} % af et webinar de seneste ${VARME_LEADS_DAGE} dage uden at have ansøgt bagefter eller være medlem.`;
