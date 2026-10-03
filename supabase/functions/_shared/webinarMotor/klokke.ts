/**
 * webinarMotor/klokke — rådgivernes klokke ved et NYT spørgsmål i webinaret
 * (spec'ens skive 5, 3/10-2026; docs/webinarmotor.md §7.10).
 *
 * Spejlet ORDRET i src/lib/webinarMotor/klokke.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 *
 * HVEM: alle rådgivere MINUS tjenestekonti (I/O-filen _shared/webinarSpoergsmaalKlokke.ts
 * filtrerer med udenTjenestekonti, FØR denne dom får listen).
 * HVOR MANGE: højst ÉN ULÆST klokke pr. (rådgiver, session) — samme regel som
 * husets writer med dedupKunUlaeste (raadgiverBeskedTekst.raadgivereUdenRaekke
 * med kunUlaeste = true; paritetstesten beviser det). Writeren selv bruges
 * IKKE fra pulsen: den logger ved fejl (webinar-puls må kun logge fejlsummen,
 * webinarMotor.guard dom 3), og den kender ikke tjenestekonti.
 * HVOR HEN: reference_type «webinar_session» + reference_id = sessionens id →
 * konsollen /webinar/motor/session/<id> (klokke.ts raadgiverSti ⇄ klokkeMail.ts klokkeSti).
 * MAIL: typen står under MORGEN i _shared/klokkeMail.ts — aldrig en mail pr.
 * spørgsmål under en session (værterne sidder i konsollen); en klokke, ingen har
 * læst før kl. 07, står i næste hverdags morgenmail (et webinar kører også, når
 * ingen vært sidder ved konsollen — så er morgenmailen det eneste signal).
 */

/** Klokkens type. Står på MORGEN-listen i _shared/klokkeMail.ts (klokkeMail.guard dom 1). */
export const TYPE_WEBINAR_SPOERGSMAAL = "webinar_spoergsmaal";

/** reference_type → konsollen for sessionen (reference_id). */
export const REFERENCE_WEBINAR_SESSION = "webinar_session";

const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SpoergsmaalKlokke {
  type: "webinar_spoergsmaal";
  title: string;
  body: string;
  company_id: null;
  reference_type: "webinar_session";
  reference_id: string;
}

/** Titlen bærer webinarets titel — ét kort pr. session; uden titel det generelle ord. */
export function klokkeTitel(webinarTitel: string | null | undefined): string {
  const t = (webinarTitel ?? "").trim();
  return t === "" ? "Nyt spørgsmål i webinaret" : `Nyt spørgsmål i webinaret «${t.slice(0, 120)}»`;
}

/** Brødteksten nævner aldrig seeren eller spørgsmålet — klokken samler alle spørgsmål fra sessionen, til den er læst. */
export const KLOKKE_TEKST = "En seer har stillet et spørgsmål. Spørgsmålskøen og svarfeltet står i konsollen.";

/** Ren dom: klokken for et nyt spørgsmål — null, når sessionens id ikke er et uuid (kolonnen reference_id er uuid). */
export function beskedVedSpoergsmaal(a: { sessionId: string | null | undefined; webinarTitel?: string | null }): SpoergsmaalKlokke | null {
  const id = (a.sessionId ?? "").trim().toLowerCase();
  if (!UUID_FORM.test(id)) return null;
  return {
    type: TYPE_WEBINAR_SPOERGSMAAL,
    title: klokkeTitel(a.webinarTitel),
    body: KLOKKE_TEKST,
    company_id: null,
    reference_type: REFERENCE_WEBINAR_SESSION,
    reference_id: id,
  };
}

export interface KlokkeRaekke {
  advisor_id: string | null;
  reference_id: string | null;
  read_at: string | null;
}

/**
 * De rådgivere, der IKKE allerede har en ULÆST klokke for sessionen. En læst
 * klokke spærrer ikke — læst den, ringer næste spørgsmål igen. Rækkefølgen bevares.
 * Kalderen giver listen UDEN tjenestekonti og rækkerne af typen for sessionen.
 */
export function raadgivereUdenUlaestKlokke(raadgivere: readonly string[], eksisterende: readonly KlokkeRaekke[], sessionId: string): string[] {
  const har = new Set<string>();
  for (const r of eksisterende) {
    if (!r.advisor_id) continue;
    if (r.read_at) continue;
    if (r.reference_id === sessionId) har.add(r.advisor_id);
  }
  return raadgivere.filter((id) => !har.has(id));
}
