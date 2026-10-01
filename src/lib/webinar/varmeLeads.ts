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
 * så et delt-svar, der bar den, ville blive afvist (500 svar_afvist).
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
 * DOMMEN `varmeLeads(tilmeldinger, ansoegninger, nu)`:
 *   · kun rækker på en AFHOLDT session MED tidspunkt (session_tid ≤ nu); en
 *     Replay uden tidspunkt kan ikke siges at ligge «inden for 14 dage»;
 *   · sessionen højst VARME_LEADS_DAGE (14) dage gammel — inklusive grænsen:
 *     nu − session_tid ≤ 14 × 24 t;
 *   · rækken dømt «set» af webinarDom.doemSetGrad (≥ SET_GRAENSE_PROCENT) —
 *     ingen egen grænse her;
 *   · personen har INGEN indsendt ansøgning — koblet på mailen ELLER den
 *     rådgiverbekræftede webinarkobling. Koblingen rejser på ansøgningen som
 *     `webinar_email` (dashboard.ts `medWebinarKobling`); derfor er den ikke en
 *     fjerde parameter. Ingen grænse i tid her: har hun EN ansøgning, er hun
 *     ikke et lead — hun er en ansøger;
 *   · ÉN linje pr. person (mail): den NYESTE session, hun så færdigt;
 *   · nyeste først (sessionstid faldende, så højeste procent, så mail);
 *   · «inden for 24 timer» = nu − session_tid ≤ RING_INDEN_TIMER × 1 t —
 *     Nicklas' frist. Tiden regnes fra sessionens START; eWebinar giver os
 *     ikke et sluttidspunkt pr. seer, og starten er det tidligste, hun kan
 *     have set det.
 *
 * Ingen skrivning, ingen «ringet»-markering: det kræver en tabel (næste skridt).
 * Ren: ingen I/O; tiden gives ind som `nu`.
 */
import { ansoegerMails, datoKort, medWebinarKobling, SET_GRAENSE_PROCENT, type AnsoegerMail, type Tilmelding } from "@/lib/webinar/dashboard";
import { doemSetGrad } from "@/lib/webinarDom";

/** Hvor langt tilbage et lead regnes som varmt. Nicklas' 24 timer er fristen; 14 dage er listens hukommelse. */
export const VARME_LEADS_DAGE = 14;
/** Nicklas: «inden for 24 timer». */
export const RING_INDEN_TIMER = 24;

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
  /** Hele timer siden sessionen begyndte. */
  timerSiden: number;
  /** «set for 3 timer siden» · «set for 2 dage siden». */
  sidenOrd: string;
  /** Nicklas' frist: inden for 24 timer fra sessionens start. */
  inden24Timer: boolean;
}

const tid = (iso: string | null | undefined): number | null => {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** «set for under en time siden» · «set for 1 time siden» · «set for 3 dage siden». */
export function sidenOrd(ms: number): string {
  const timer = Math.floor(ms / TIME_MS);
  if (timer < 1) return "set for under en time siden";
  if (ms < DAG_MS) return `set for ${timer} ${timer === 1 ? "time" : "timer"} siden`;
  const dage = Math.floor(ms / DAG_MS);
  return `set for ${dage} ${dage === 1 ? "dag" : "dage"} siden`;
}

export function varmeLeads(
  tilmeldinger: readonly Tilmelding[],
  ansoegninger: readonly AnsoegerMail[],
  nu: Date,
): VarmtLead[] {
  const ansoegere = ansoegerMails(medWebinarKobling(ansoegninger));
  const nuMs = nu.getTime();
  const bedste = new Map<string, { r: Tilmelding; t: number }>();
  for (const r of tilmeldinger) {
    const t = tid(r.session_tid);
    if (t === null || t > nuMs || nuMs - t > VARME_LEADS_DAGE * DAG_MS) continue;
    if (ansoegere.has(r.email)) continue;
    if (doemSetGrad(r, nu) !== "set") continue;
    const haves = bedste.get(r.email);
    const p = r.set_procent ?? -1;
    if (haves === undefined || t > haves.t || (t === haves.t && p > (haves.r.set_procent ?? -1))) bedste.set(r.email, { r, t });
  }
  return [...bedste.values()]
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
        inden24Timer: ms <= RING_INDEN_TIMER * TIME_MS,
      };
    })
    .sort((a, b) =>
      Date.parse(b.sessionTid) - Date.parse(a.sessionTid)
      || (b.procent ?? -1) - (a.procent ?? -1)
      || a.email.localeCompare(b.email));
}

export const VARME_EYEBROW = "Varme leads";
export const VARME_TITEL = `Ring inden for ${RING_INDEN_TIMER} timer`;
export const VARME_FORKLARING =
  `De, der har set mindst ${SET_GRAENSE_PROCENT} % af et webinar inden for de seneste ${VARME_LEADS_DAGE} dage, og som ikke har ansøgt (mailen eller en bekræftet kobling). Nicklas' anden betingelse — omsætning over 2 mio. — kan platformen ikke se: en tilmelding har intet CVR-nummer. Vurdér den i samtalen. Kun rådgivere ser listen; den deles aldrig.`;
export const VARME_TOM_TEKST =
  `Ingen lige nu: ingen har set mindst ${SET_GRAENSE_PROCENT} % af et webinar de seneste ${VARME_LEADS_DAGE} dage uden at have ansøgt.`;
