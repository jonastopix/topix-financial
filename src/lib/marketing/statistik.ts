/**
 * statistik — den lille smule matematik, lag 6 må bruge, og ikke mere.
 *
 * VALGET, OG HVORFOR DET ER DETTE (udkast 19/9-2026).
 *
 * Fire veje var mulige, og jeg valgte den tredje:
 *
 *   1. RÅ TAL UDEN NOGET. Altid ærligt, men ubrugeligt: «mail 3: 2 af 14» og
 *      «mail 5: 1 af 13» siger ikke, om forskellen er noget. En agent, der kun
 *      får rå tal, opfinder selv betydningen — og den opfinder forkert.
 *   2. P-VÆRDIER (χ², z-test). Forkerte ved vores tal: normaltilnærmelsen
 *      kræver ~5 hændelser i hver gruppe, og vi har 1–3. Værre: et tal som
 *      «p = 0,04» inviterer til ordet «signifikant», og det ord er præcis den
 *      fejl, hele laget skal forhindre.
 *   3. WILSON-INTERVALLET. Et interval pr. andel. Opfører sig rigtigt ved
 *      n = 0, 1 og 3, hvor normaltilnærmelsen giver negative grænser og
 *      bredder på nul. Det svarer på det, der faktisk spørges om — «hvor
 *      meget ved vi?» — og det er bredt, når vi intet ved. **Valgt.**
 *   4. BAYESIANSK POSTERIOR (Beta). Ville være mindst lige så rigtigt, men
 *      kræver et valg af prior, som ingen her kan efterprøve, og et sprog
 *      ingen læser. Afvist på læsbarhed, ikke på matematik.
 *
 * SAMMENLIGNING SKER PÅ OVERLAP, OG DET ER MED VILJE KONSERVATIVT.
 * To intervaller der ikke overlapper, betyder «forskellen er reel». To der
 * overlapper, betyder IKKE «ingen forskel» — kun «vi kan ikke afgøre det».
 * En formel to-andels-test ville finde nogle flere forskelle end denne regel.
 * Den asymmetri er valgt: laget skal hellere tie end tage fejl, fordi prisen
 * for en forkert konklusion er, at nogen ændrer noget, der virkede.
 *
 * Ren matematik. Ingen imports, ingen IO, ingen datoer.
 */

/** z for 95 % tosidet. Ét sted; ændres det, ændres bredden alle steder. */
export const Z_95 = 1.959963985;

export interface Interval {
  /** Den observerede andel — succes / n. */
  andel: number;
  nedre: number;
  oevre: number;
  succes: number;
  n: number;
  /** oevre − nedre. Bred = vi ved lidt. */
  bredde: number;
}

/**
 * Wilson score-intervallet for en andel.
 *
 * Hvorfor ikke `p ± z·√(p(1−p)/n)`: ved 0 af 3 giver den [0, 0] — altså
 * «vi er sikre på, at ingen konverterer», hvilket er det modsatte af sandt.
 * Wilson giver [0, 0,56]. Ved 3 af 3 giver den [1, 1]; Wilson giver [0,44, 1].
 *
 * `null` ved n = 0: der findes ingen andel af ingenting, og et interval
 * [0, 1] ville se ud som viden.
 */
export function wilson(succes: number, n: number, z: number = Z_95): Interval | null {
  if (!Number.isFinite(succes) || !Number.isFinite(n) || n <= 0) return null;
  const s = Math.max(0, Math.min(Math.floor(succes), Math.floor(n)));
  const antal = Math.floor(n);
  const p = s / antal;
  const z2 = z * z;
  const naevner = 1 + z2 / antal;
  const midte = (p + z2 / (2 * antal)) / naevner;
  const spredning = (z / naevner) * Math.sqrt((p * (1 - p)) / antal + z2 / (4 * antal * antal));
  const nedre = Math.max(0, midte - spredning);
  const oevre = Math.min(1, midte + spredning);
  return { andel: p, nedre, oevre, succes: s, n: antal, bredde: oevre - nedre };
}

export type Sammenligning = "adskilte" | "overlapper" | "kan_ikke";

/**
 * Kan de to andele skelnes?
 *
 *   adskilte    — intervallerne rører ikke hinanden. Forskellen er reel.
 *   overlapper  — vi kan IKKE afgøre det. Ikke «de er ens».
 *   kan_ikke    — mindst én af dem har ingen data.
 */
export function sammenlign(a: Interval | null, b: Interval | null): Sammenligning {
  if (a === null || b === null) return "kan_ikke";
  return a.oevre < b.nedre || b.oevre < a.nedre ? "adskilte" : "overlapper";
}

/** «12 %» · «0,2 %» · «–». Små tal må ikke rundes til nul — de er ikke nul. */
export function pct(andel: number | null): string {
  if (andel === null || !Number.isFinite(andel)) return "–";
  if (andel === 0) return "0 %";
  const p = andel * 100;
  if (p >= 1) return `${Math.round(p)} %`;
  if (p >= 0.05) return `${p.toFixed(1).replace(".", ",")} %`;
  return "<0,1 %";
}

/**
 * «14 % (4–40 %)» — tallet OG hvor lidt vi ved. Aldrig det ene uden det andet.
 * Enheden står ÉN gang pr. tal og én gang i intervallet: «4 %–40 %» er dobbelt,
 * og et interval læses som ét spænd, ikke som to procenter.
 */
export function intervalOrd(i: Interval | null): string {
  if (i === null) return "–";
  const udenEnhed = pct(i.nedre).replace(/\s*%$/, "");
  return `${pct(i.andel)} (${udenEnhed}–${pct(i.oevre)})`;
}

/**
 * Medianen. Valgt frem for gennemsnittet overalt i laget: ét menneske, der
 * ansøger efter 40 dage, flytter et gennemsnit af tolv mere end det fortjener,
 * og medianen svarer på det, der spørges om — «hvornår ansøger de fleste».
 * `null` ved tom liste.
 */
export function median(tal: readonly number[]): number | null {
  if (tal.length === 0) return null;
  const s = [...tal].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Kvartilerne (P25, P50, P75) — spredningen, ikke kun midten. null ved tom liste. */
export function kvartiler(tal: readonly number[]): { p25: number; p50: number; p75: number } | null {
  if (tal.length === 0) return null;
  const s = [...tal].sort((a, b) => a - b);
  const ved = (andel: number): number => {
    const i = andel * (s.length - 1);
    const lav = Math.floor(i);
    const hoej = Math.ceil(i);
    return lav === hoej ? s[lav] : s[lav] + (s[hoej] - s[lav]) * (i - lav);
  };
  return { p25: ved(0.25), p50: ved(0.5), p75: ved(0.75) };
}
