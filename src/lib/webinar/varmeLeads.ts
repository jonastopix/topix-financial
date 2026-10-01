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
 * TIDEN REGNES FRA SESSIONENS START (B3, målt i types.ts 1/10): tabellen har
 * `updated_at` og `sidste_haendelse_at`, men ingen af dem er tidspunktet for
 * procenten. `sidste_haendelse_at` er, hvornår VI modtog den seneste besked —
 * og `ewebinar-import` sætter den til importens kørselstid på HVER række, den
 * skriver (index.ts: `sidste_haendelse_at: nu.toISOString()`); `updated_at`
 * flytter sig ved enhver skrivning. Begge ville få «for 2 timer siden» til at
 * betyde «siden importen kørte». eWebinar giver os ikke et sluttidspunkt pr.
 * seer, så teksten siger sandheden: «webinaret begyndte for N timer siden».
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
 *   · nyeste først (sessionstid faldende, så højeste procent, så mail);
 *   · «begyndte inden for 24 timer» = nu − session_tid ≤ RING_INDEN_TIMER × 1 t —
 *     Nicklas' frist, målt fra sessionens START (se ovenfor).
 *
 * Ingen skrivning, ingen «ringet»-markering: det kræver en tabel (næste skridt).
 * Ren: ingen I/O; tiden gives ind som `nu`.
 */
import { ansoegerTider, datoKort, medlemsMails, medWebinarKobling, SET_GRAENSE_PROCENT, type AnsoegerMail, type Tilmelding } from "@/lib/webinar/dashboard";
import { doemSetGrad } from "@/lib/webinarDom";

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
  /** Hele timer siden sessionen BEGYNDTE. */
  timerSiden: number;
  /** «webinaret begyndte for 3 timer siden» · «webinaret begyndte for 2 dage siden». */
  sidenOrd: string;
  /** Nicklas' frist: sessionen begyndte inden for 24 timer. */
  begyndtInden24Timer: boolean;
}

const tid = (iso: string | null | undefined): number | null => {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** «webinaret begyndte for under en time siden» · «… for 1 time siden» · «… for 3 dage siden». Tiden er fra sessionens START. */
export function sidenOrd(ms: number): string {
  const timer = Math.floor(ms / TIME_MS);
  if (timer < 1) return "webinaret begyndte for under en time siden";
  if (ms < DAG_MS) return `webinaret begyndte for ${timer} ${timer === 1 ? "time" : "timer"} siden`;
  const dage = Math.floor(ms / DAG_MS);
  return `webinaret begyndte for ${dage} ${dage === 1 ? "dag" : "dage"} siden`;
}

export function varmeLeads(
  tilmeldinger: readonly Tilmelding[],
  ansoegninger: readonly AnsoegerMail[],
  nu: Date,
): VarmtLead[] {
  const koblet = medWebinarKobling(ansoegninger);
  const indsendt = ansoegerTider(koblet);
  const medlemmer = medlemsMails(koblet);
  const nuMs = nu.getTime();
  const nyeste = new Map<string, { r: Tilmelding; t: number }>();
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
      const ms = nuMs - t;
      return {
        navn: typeof r.navn === "string" && r.navn.trim() !== "" ? r.navn.trim() : null,
        email: r.email,
        sessionTid: new Date(t).toISOString(),
        dato: datoKort(new Date(t).toISOString()),
        titel: typeof r.webinar_titel === "string" && r.webinar_titel.trim() !== "" ? r.webinar_titel : null,
        procent: r.set_procent !== null && r.set_procent > 0 ? Math.round(r.set_procent) : null,
        timerSiden: Math.floor(ms / TIME_MS),
        sidenOrd: sidenOrd(ms),
        begyndtInden24Timer: ms <= RING_INDEN_TIMER * TIME_MS,
      };
    })
    .sort((a, b) =>
      Date.parse(b.sessionTid) - Date.parse(a.sessionTid)
      || (b.procent ?? -1) - (a.procent ?? -1)
      || a.email.localeCompare(b.email));
}

export const VARME_EYEBROW = "Varme leads";
export const VARME_TITEL = `Ring inden for ${RING_INDEN_TIMER} timer`;
export const VARME_FLAG_INDEN = `begyndte inden for ${RING_INDEN_TIMER} timer`;
export const VARME_FLAG_SENERE = `begyndte for over ${RING_INDEN_TIMER} timer siden`;
export const VARME_FORKLARING =
  `De, der har set mindst ${SET_GRAENSE_PROCENT} % af et webinar inden for de seneste ${VARME_LEADS_DAGE} dage, som ikke har indsendt en ansøgning efter det, og som ikke er medlemmer (mailen eller en bekræftet kobling). Husets egne adresser og prøverne er taget ud. Tiden regnes fra webinarets start — eWebinar fortæller ikke, hvornår den enkelte så det færdigt. Nicklas' anden betingelse — omsætning over 2 mio. — kan platformen ikke se: en tilmelding har intet CVR-nummer. Vurdér den i samtalen. Kun rådgivere ser listen; den deles aldrig.`;
export const VARME_TOM_TEKST =
  `Ingen lige nu: ingen uden for huset har set mindst ${SET_GRAENSE_PROCENT} % af et webinar de seneste ${VARME_LEADS_DAGE} dage uden at have ansøgt bagefter eller være medlem.`;
