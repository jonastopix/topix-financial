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
