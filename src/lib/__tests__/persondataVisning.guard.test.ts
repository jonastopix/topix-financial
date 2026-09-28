import { describe, expect, it } from "vitest";
import { PERSONDATA_AFSNIT } from "@/lib/ansoegning/persondata";

/**
 * Kildeværn for persondatatekstens sætning om sporet før ansøgningen (JA fra
 * Jonas 28/9-2026, ordret). Én dom: sætningen står ORDRET, præcis én gang, under
 * «Hvad vi gemmer», LIGE EFTER afsnittet om dags-nøglen. Bevist nedenfor på kopier.
 */
export const VISNING_TEKST_ORDRET =
  "Åbner du formularen, gemmer vi også — uden at vide, hvem du er — at siden blev vist, om du trykkede «Start», og om du begyndte at skrive dit CVR-nummer, sammen med hvor du kom fra og hvilken slags browser du brugte. Vi bruger det kun til at se, hvor formularen kan blive bedre.";
export const DAGSNOEGLE_TEKST_ORDRET =
  "En anonymiseret dags-nøgle for din internetadresse, som vi kun bruger til at begrænse misbrug af formularen. Selve adressen gemmes ikke her.";

type Afsnit = readonly { titel: string; afsnit: readonly string[] }[];

export const visningsSaetningenStaarRigtigt = (afsnit: Afsnit): boolean => {
  const gemmer = afsnit.find((x) => x.titel === "Hvad vi gemmer")?.afsnit ?? [];
  const dag = gemmer.indexOf(DAGSNOEGLE_TEKST_ORDRET);
  return (
    dag !== -1 &&
    gemmer[dag + 1] === VISNING_TEKST_ORDRET &&
    afsnit.flatMap((x) => x.afsnit).filter((x) => x === VISNING_TEKST_ORDRET).length === 1
  );
};

const med = (fn: (gemmer: string[]) => string[]): Afsnit =>
  PERSONDATA_AFSNIT.map((x) => (x.titel === "Hvad vi gemmer" ? { ...x, afsnit: fn([...x.afsnit]) } : x));

describe("persondatateksten: sporet før ansøgningen", () => {
  it("sætningen står ordret, én gang, lige efter dags-nøglen under «Hvad vi gemmer»", () =>
    expect(visningsSaetningenStaarRigtigt(PERSONDATA_AFSNIT)).toBe(true));
});

describe("persondatateksten: værnet fælder (selvbevis på kopier)", () => {
  it("et ændret ord fælder", () => {
    expect(visningsSaetningenStaarRigtigt(med((g) => g.map((x) => (x === VISNING_TEKST_ORDRET ? x.replace("kun", "blandt andet") : x))))).toBe(false);
  });
  it("sætningen fjernet fælder", () => {
    expect(visningsSaetningenStaarRigtigt(med((g) => g.filter((x) => x !== VISNING_TEKST_ORDRET)))).toBe(false);
  });
  it("sætningen flyttet væk fra dags-nøglen fælder", () => {
    expect(visningsSaetningenStaarRigtigt(med((g) => [VISNING_TEKST_ORDRET, ...g.filter((x) => x !== VISNING_TEKST_ORDRET)]))).toBe(false);
  });
  it("sætningen to gange fælder", () => {
    expect(visningsSaetningenStaarRigtigt(med((g) => [...g, VISNING_TEKST_ORDRET]))).toBe(false);
  });
});
