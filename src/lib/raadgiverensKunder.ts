/**
 * src/lib/raadgiverensKunder.ts
 *
 * Er virksomheden en KUNDE — eller vores egen? companies.er_kunde
 * (migration 20260906210000) er falsk for Topix.dk ApS og sand for alle
 * andre. Feltet læses KUN i rådgiverens læsestier (forsidens datalag,
 * /virksomheder, /members og deres tællere), så vores egen virksomhed
 * ikke står i køer og lister som var den en kunde. Det ændrer intet for
 * virksomhedens eget medlem og gater ingen cron og ingen edge function.
 *
 * REGLEN ER FAIL-OPEN: kun et eksplicit `false` betyder «ikke kunde».
 * `true`, `null` og `undefined` giver alle `true`. Begrundelsen: en række
 * hentet uden kolonnen (en select der ikke nævner er_kunde, en ældre
 * cache, et objekt bygget i kode) må aldrig forsvinde fra rådgiverens
 * billede, fordi et manglende felt ikke er en beslutning — kun et
 * skrevet `false` er det. Den modsatte fejl (en kunde der forsvinder
 * uden at nogen har besluttet det) er den der ikke opdages.
 *
 * Ren funktion, samme mønster som afgoerFornyelsestilstand: ingen I/O,
 * ingen Supabase, ingen React. Samme input giver altid samme output.
 */

export function erKunde(c: { er_kunde?: boolean | null }): boolean {
  return c.er_kunde !== false;
}
