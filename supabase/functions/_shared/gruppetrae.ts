/**
 * gruppetrae.ts — grupperne i en e-conomic-udskrift som TRÆ (17/9-2026).
 *
 * e-conomic skriver en gruppe som: en OVERSKRIFTSLINJE (navnet, ingen tal) → kontolinjerne (kontonummer
 * først) → en SUMLINJE (samme navn, evt. med « i alt», og tallene). Grupper ligger inde i grupper:
 * «Kapacitetsomkostninger» rummer «Salgsfremmende omk.», «Personaleudgifter» (som rummer «Løn i alt»),
 * «Udlejning af fast ejendom» (som rummer «Sekundære lejeindtægter» og «Personbil») … (KJ AUTO,
 * Jonas' fil 17/9 ~22:00). Uden træet tælles løn to gange (inde i Personaleudgifter) og en indtægt
 * i en omkostningsgruppe som en negativ omkostning.
 *
 * Reglen: en linje uden tal og uden kontonummer er en overskrift HVIS der senere findes en sumlinje
 * med samme navn (evt. + « i alt»); en sumlinje lukker den nærmeste åbne overskrift med det navn og
 * bliver en gruppe med de grupper der blev lukket imellem som børn; en sumlinje uden overskrift er en
 * gruppe uden børn på det sted den står («Dækningsbidrag», «Resultat», «AKTIVER I ALT»). Kontolinjer
 * (kontonummer i første kolonne) er ALDRIG grupper — det er skellet mellem konto og gruppesum.
 * Nul imports.
 */

export interface Gruppelinje {
  label: string;
  /** Periodens beløb (første talkolonne); null på en overskriftslinje. */
  value: number | null;
  /** År til dato (anden talkolonne) når den findes. */
  ytd: number | null;
  /** Kontonummer i første kolonne → aldrig en gruppe. */
  erKonto: boolean;
  index: number;
}

export interface Gruppe {
  label: string;
  norm: string;
  value: number;
  ytd: number | null;
  index: number;
  depth: number;
  parent: Gruppe | null;
  children: Gruppe[];
}

/** «Løn i alt » → «løn i alt»; kolon og punktum i enden fjernes; mellemrum foldes. */
export function normGruppeLabel(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[:.\s]+$/g, "").trim();
}

/** Er `sum` sumlinjen til overskriften `header`? Samme navn, eller navnet + « i alt» / « ialt». */
export function erSumAf(header: string, sum: string): boolean {
  if (sum === header) return true;
  return sum === `${header} i alt` || sum === `${header} ialt`;
}

export function bygGruppetrae(linjer: readonly Gruppelinje[]): Gruppe[] {
  const sumNorms = linjer.filter((l) => !l.erKonto && l.value !== null).map((l) => normGruppeLabel(l.label));
  const harSum = (norm: string) => sumNorms.some((s) => erSumAf(norm, s));
  const roots: Gruppe[] = [];
  const stack: { norm: string; label: string; index: number; children: Gruppe[] }[] = [];
  const parentChildren = () => (stack.length > 0 ? stack[stack.length - 1].children : roots);
  const dybde = () => stack.length;
  for (const l of linjer) {
    if (l.erKonto) continue;
    const norm = normGruppeLabel(l.label);
    if (!norm) continue;
    if (l.value === null) {
      if (harSum(norm)) stack.push({ norm, label: l.label, index: l.index, children: [] });
      continue;
    }
    // sumlinje: find den nærmeste åbne overskrift den lukker
    let h = -1;
    for (let i = stack.length - 1; i >= 0; i--) if (erSumAf(stack[i].norm, norm)) { h = i; break; }
    if (h >= 0) {
      const aabne = stack.splice(h); // overskriften + alt over den (ulukkede overskrifter kasseres, deres børn beholdes)
      const children: Gruppe[] = [];
      for (const a of aabne) children.push(...a.children);
      const g: Gruppe = { label: l.label, norm, value: l.value, ytd: l.ytd, index: l.index, depth: dybde(), parent: null, children };
      for (const c of children) { c.parent = g; c.depth = g.depth + 1; }
      parentChildren().push(g);
    } else {
      parentChildren().push({ label: l.label, norm, value: l.value, ytd: l.ytd, index: l.index, depth: dybde(), parent: null, children: [] });
    }
  }
  // Uafsluttede overskrifter i bunden: deres børn løftes op til roden.
  for (const s of stack) roots.push(...s.children);
  for (const r of roots) { r.parent = null; }
  return roots;
}

/** Alle grupper i dokumentets rækkefølge (dybde-først). */
export function alleGrupper(roots: readonly Gruppe[]): Gruppe[] {
  const ud: Gruppe[] = [];
  const gaa = (g: Gruppe) => { ud.push(g); for (const c of g.children) gaa(c); };
  for (const r of roots) gaa(r);
  return ud.sort((a, b) => a.index - b.index);
}

/** Første gruppe (i dokumentets rækkefølge) hvis normaliserede navn matcher. */
export function findGruppe(grupper: readonly Gruppe[], pattern: RegExp): Gruppe | null {
  return grupper.find((g) => pattern.test(g.norm)) ?? null;
}
