import { DANISH_MONTHS } from "@/lib/financialUtils";

/** "Dine aftaler"-sektionens rene logik (BoardroomView): sortering af
    aktive opgaver og udvælgelsen af det ene forslag. Ingen supabase,
    ingen React — testes i __tests__/aftaler.test.ts. */

/** Aktive opgaver: due_date stigende, så forfaldne står øverst.
    Strengsammenligning er nok — begge sider er "YYYY-MM-DD". En aktiv
    uden due_date kan ikke findes (CHECK-constrainten, design §7), men
    sorteres defensivt sidst. Tie-break: ældste created_at først. */
export function sorterAktive<T extends { due_date?: string | null; created_at?: string }>(aktive: T[]): T[] {
  return [...aktive].sort((a, b) => {
    if (a.due_date !== b.due_date) {
      if (a.due_date == null) return 1;
      if (b.due_date == null) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1;
  });
}

/** Kilderangen følger B10's udløbsfrister — husets egen vurdering af
    hvor tungt et forslag vejer: advisor (30 dage) → reflection (21) →
    ai_weekly/agent (14). En ukendt kilde vejer som 14-dages-klassen,
    samme fallback som B10. */
const KILDE_RANG: Record<string, number> = {
  advisor: 0,
  reflection: 1,
  ai_weekly: 2,
  agent: 2,
};
const KILDE_FALLBACK_RANG = 2;

/** ÉT forslag ad gangen: ti forslag er ikke ti muligheder, det er en
    liste man scroller forbi. Målingen bag: 102 milestones, 8 % fuldført,
    61 uden dato — mens handout-løftestængerne, hvor der er ét sted det
    bliver til noget, står på 74 %. Et ubesvaret forslag er ikke spildt:
    B8 lader det udløbe efter fjorten dage og tælle for rådgiveren.

    Udvælgelsen: KILDE først (KILDE_RANG) — en rådgiver har brugt tid på
    sit forslag, og B10 giver det netop derfor længst levetid; står det
    i kø bag et AI-gæt fra sidste uge, er den vurdering ikke afspejlet
    dér hvor medlemmet ser den. Derefter prioritet (high → medium → low,
    ukendt = medium som i fladens øvrige sortering), og til sidst ældste
    created_at INDEN FOR samme kilde og prioritet — det ældste er
    tættest på at udløbe og skal have sin chance først. */
export function vaelgForslag<
  T extends { source_type?: string | null; priority?: string | null; created_at?: string },
>(forslag: T[]): T | null {
  if (forslag.length === 0) return null;
  const prioRang: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...forslag].sort((a, b) => {
    const kilde =
      (KILDE_RANG[a.source_type ?? ""] ?? KILDE_FALLBACK_RANG) -
      (KILDE_RANG[b.source_type ?? ""] ?? KILDE_FALLBACK_RANG);
    if (kilde !== 0) return kilde;
    const prio = (prioRang[a.priority ?? ""] ?? 1) - (prioRang[b.priority ?? ""] ?? 1);
    if (prio !== 0) return prio;
    return (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1;
  })[0];
}

/** Fristen i klar tekst til aftale-rækken. Splitter selv "YYYY-MM-DD"
    (Date-parsning af en ren dato er UTC og kan skride en kalenderdag);
    forfald er dagen EFTER fristen, samme dom som opgaveEngine.erForfalden
    — idag leveres som "YYYY-MM-DD"-streng, så sammenligningen er
    kalenderdags-ren. */
export function fristTekst(dueDate: string, idag: string): string {
  const [, m, d] = dueDate.split("-").map(Number);
  const dato = `${d}. ${DANISH_MONTHS[m - 1].toLowerCase()}`;
  return dueDate < idag ? `Fristen var ${dato}` : `Frist ${dato}`;
}

// ── Forslagets synlighed (8/9) ─────────────────────────────────────────
// Målt 7/9: 97 forslag, 10 gjorte, 63 udløbne. Et rådgiverforslag lå i
// «Dine aftaler» som «Forslag til dig» + titel — uden hvem, hvornår,
// hvor mange der venter og hvornår det udløber. Jonas 8/9: svarraten er
// designet, ikke medlemmerne. Funktionerne herunder giver forslaget de
// fire oplysninger med husets eget sprog: tællingen i overlinjen som
// «Aktive · 3» (MilestonesView), «i dag / i morgen / om N dage» som
// eventCountdown (BoardroomView) og rådgiverforsidens hast-kolonne, og
// «i dag / i går / 3. september» som chattens datoskillelinje. Ingen
// badge og ingen prik — Hjemmebane har ingen ulæst-markering på
// medlemssiden, og HbProgressBar-reglen er «ingen procenter, ingen
// badges». Ét forslag ad gangen BEVARES (vaelgForslag): flere knapper på
// én skærm gør det sværere at svare; det medlemmet manglede var at VIDE
// at der er flere.

/** Overlinjen: «Forslag til dig», eller «Forslag til dig · 1 af N» når
    flere venter. Tallet er alle ventende (ikke-udløbne) forslag. */
export function forslagOverlinje(antalVentende: number): string {
  return antalVentende > 1 ? `Forslag til dig · 1 af ${antalVentende}` : "Forslag til dig";
}

/** Linjen under forslaget når flere venter; null ved nul og ét. Siger
    også HVORFOR de ikke står her: de kommer frem når dette er svaret. */
export function flereForslagTekst(antalVentende: number): string | null {
  const flere = antalVentende - 1;
  if (flere <= 0) return null;
  return flere === 1
    ? "1 forslag mere venter — det kommer frem når du har svaret på dette."
    : `${flere} forslag mere venter — de kommer frem når du har svaret på dette.`;
}

/** Hvem der foreslog, ud fra source_type (B10-kilderne). proposed_by
    bruges ikke: medlemmet må kun læse profiler i egne samtaler
    (20260227191148), og «din rådgiver» er sandt uanset navn. */
export function forslagKilde(sourceType: string | null | undefined): string {
  switch (sourceType) {
    case "advisor":
      return "Fra din rådgiver";
    case "reflection":
      return "Fra din refleksion";
    case "ai_weekly":
    case "agent":
      return "Fra ugens AI-analyse";
    default:
      return "Forslag";
  }
}

/** Lokal kalenderdag som heltal — samme greb som opgaveEngine.dagVaerdi,
    så «i dag» og «i går» følger medlemmets døgn, ikke UTC. */
function dagVaerdi(d: Date): number {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}

/** Hele kalenderdage fra nu til d (negativ = fortid). Ikke timer: et
    forslag der udløber kl. 06 i morgen er «i morgen», ikke «om 0 dage».
    Eksporteret 10/9: eventPhase.eventNedtaelling bruger samme greb —
    et event kl. 11 set kl. 08.49 samme dag er «I dag», ikke «I morgen». */
export function kalenderdageTil(d: Date, nu: Date): number {
  const start = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  const slut = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((slut.getTime() - start.getTime()) / 86400000);
}

/** «foreslået i dag» / «foreslået i går» / «foreslået 3. september».
    Datoformen er chattens (dateSeparatorLabel) uden år — et forslag
    lever højst 30 dage. null når stemplet ikke kan læses. */
export function foreslaaetHvornaar(createdAt: string | null | undefined, nu: Date): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const dage = kalenderdageTil(d, nu);
  if (dagVaerdi(d) === dagVaerdi(nu) || dage === 0) return "foreslået i dag";
  if (dage === -1) return "foreslået i går";
  return `foreslået ${d.getDate()}. ${DANISH_MONTHS[d.getMonth()].toLowerCase()}`;
}

/** Hele kalenderdage til expires_at; null når feltet mangler eller ikke
    kan læses. Negativ betyder udløbet — kalderen filtrerer dem fra FØR
    (filtrerUdloebneForslag), så det er et forsvar, ikke en tilstand. */
export function dageTilUdloeb(expiresAt: string | null | undefined, nu: Date): number | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return kalenderdageTil(d, nu);
}

/** Vises kun når det haster: 7 dage eller færre — samme grænse som
    fornyelsens varsel 2 (7 dage før slutdato). Ordene er husets:
    «udløber i dag» / «udløber i morgen» / «udløber om N dage». null ellers. */
export const UDLOEB_VIS_DAGE = 7;
export function udloebstekst(dage: number | null): string | null {
  if (dage == null || dage > UDLOEB_VIS_DAGE) return null;
  if (dage <= 0) return "udløber i dag";
  if (dage === 1) return "udløber i morgen";
  return `udløber om ${dage} dage`;
}

/** Meta-linjen under forslagets titel, samlet: «Fra din rådgiver ·
    foreslået i går · udløber om 3 dage». `haster` er sandt ved i dag /
    i morgen, så fladen kan give netop det ord rust (rådgiverforsidens
    regel: rust til det der haster). */
export function forslagMetaLinje(
  forslag: { source_type?: string | null; created_at?: string | null; expires_at?: string | null },
  nu: Date,
): { dele: string[]; udloeb: string | null; haster: boolean } {
  const dele: string[] = [forslagKilde(forslag.source_type)];
  const hvornaar = foreslaaetHvornaar(forslag.created_at, nu);
  if (hvornaar) dele.push(hvornaar);
  const dage = dageTilUdloeb(forslag.expires_at, nu);
  const udloeb = udloebstekst(dage);
  return { dele, udloeb, haster: udloeb != null && dage != null && dage <= 1 };
}
