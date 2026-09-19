/**
 * supabase/functions/_shared/kendteFelter.ts
 *
 * EN BODY, MAN IKKE FORSTÅR, MÅ ALDRIG BLIVE TIL EN STANDARDKØRSEL.
 *
 * ── HVORFOR DEN FINDES (19/9-2026, målt to gange) ───────────────────────────
 * FØRSTE GANG: meta-annoncer-cron læste kun «dry_run». Et kald med
 * {"since": …, "until": …} hentede de sidste syv dage og svarede 200. Tallene
 * så rigtige ud og dækkede den forkerte periode.
 *
 * ANDEN GANG, efter rettelsen: kaldet var
 * {"dry_run": false, "vindue": {"since": …, "until": …}} — datoerne pakket ind
 * i et objekt. Koden læser dem fladt, så begge var `undefined`, og den gren
 * betyder «ingen datoer givet → brug standarden». Igen syv dage. Igen 200.
 *
 * Rettelsen efter første gang lukkede DØREN (forkerte datoer afvises) og lod
 * VINDUET stå åbent (ukendte nøgler ignoreres). De to fejl er den samme fejl:
 * et felt, systemet ikke forstår, forsvinder i tavshed, og kalderen får et svar,
 * der ligner et rigtigt svar.
 *
 * ── REGLEN ──────────────────────────────────────────────────────────────────
 * Læser en function felter af en body, skal den AFVISE felter, den ikke kender.
 * Enten bruger den det, den får, eller også siger den fra. Der er ingen tredje
 * mulighed, og «jeg ignorerede det» er ikke en af dem.
 *
 * ── DEN ENE UNDTAGELSE: EKSTERNE WEBHOOKS ───────────────────────────────────
 * Stripe, Monday, Calendly, eWebinar, Slack og Supabases auth-hook sender
 * payloads, VI ikke bestemmer formen på. De tilføjer felter uden at spørge, og
 * en afvisning ville lukke integrationen ned ved deres næste opdatering. Dem
 * gælder reglen IKKE for — se listen i src/lib/__tests__/bodyFelter.guard.test.ts,
 * hvor hver enkelt står med en begrundelse.
 */

/** Felter i body'en, som ikke står på listen over kendte. Tom = alt forstået. */
export function ukendteFelter(
  body: Record<string, unknown> | null | undefined,
  kendte: readonly string[],
): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const kendtSaet = new Set(kendte);
  return Object.keys(body).filter((n) => !kendtSaet.has(n));
}

/**
 * Hjælp til den, der skrev forkert. Nøglen er den fejl, et menneske faktisk
 * begår; værdien er sætningen, der sparer en runde.
 *
 * «vindue» står her, fordi det ER den form, man naturligt skriver — og fordi
 * det kostede en måling i drift 19/9 kl. 17:43.
 */
export const FELT_HINTS: Record<string, string> = {
  vindue: "datoerne skal stå direkte i body'en: {\"since\": \"YYYY-MM-DD\", \"until\": \"YYYY-MM-DD\"} — ikke pakket ind i «vindue»",
  window: "brug «since» og «until» direkte i body'en",
  periode: "brug «since» og «until» direkte i body'en",
  fra: "feltet hedder «since»",
  til: "feltet hedder «until»",
  from: "feltet hedder «since»",
  to: "feltet hedder «until»",
  dryrun: "feltet hedder «dry_run»",
  dry: "feltet hedder «dry_run»",
};

/**
 * Beskeden til kalderen: hvad blev ikke forstået, hvad kendes, og — hvis vi kan
 * gætte det — hvad der formentlig var ment.
 */
export function ukendteFelterBesked(ukendte: readonly string[], kendte: readonly string[]): string {
  const hints = ukendte.map((n) => FELT_HINTS[n]).filter(Boolean);
  const kendtTekst = `Kendte felter: ${[...kendte].sort().join(", ")}.`;
  const hintTekst = hints.length > 0 ? ` ${hints.join(" ")}` : "";
  return `Ukendt felt i body: ${ukendte.join(", ")}. ${kendtTekst}${hintTekst}`;
}
