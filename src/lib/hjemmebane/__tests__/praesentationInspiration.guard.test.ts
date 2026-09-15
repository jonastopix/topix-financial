import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRAESENTATION_INSPIRATION } from "@/lib/hjemmebane/praesentation";

// Kildeværn (16/9, DE TYVE (18)): inspirationslinjen står ÉT sted som
// konstant (praesentation.ts) og sendes KUN på præsentationsvejen — som
// CommunityComposers eksisterende `placeholder`-prop, der går i Tiptaps
// Placeholder.configure({ placeholder }). Alle andre composere (almindelige
// opslag, svar, redigering) får composerens default. React/Tiptap-kode uden
// ren funktion at kalde → kildelæsning (agentforslagVenter.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

describe("praesentationInspiration.guard — ét sted, én vej", () => {
  const praesentation = udenKommentarer(laes("src/lib/hjemmebane/praesentation.ts"));
  const view = udenKommentarer(laes("src/components/hjemmebane/community/CommunityView.tsx"));
  const traadView = udenKommentarer(laes("src/components/hjemmebane/community/CommunityTraadView.tsx"));
  const composer = udenKommentarer(laes("src/components/hjemmebane/community/CommunityComposer.tsx"));

  it("konstanten er defineret præcis én gang, i praesentation.ts, med teksten ordret", () => {
    expect(praesentation.match(/export const PRAESENTATION_INSPIRATION =/g) ?? []).toHaveLength(1);
    expect(praesentation).toContain(`"${PRAESENTATION_INSPIRATION}"`);
    // Ordlyden står ikke som streng nogen andre steder — kun konstanten bærer den.
    for (const kilde of [view, traadView, composer]) expect(kilde).not.toContain("Fortæl med dine egne ord");
  });

  it("CommunityView sender den KUN når udkastet findes (præsentationsvejen), via den eksisterende placeholder-prop", () => {
    expect(view).toContain("placeholder={udkast ? PRAESENTATION_INSPIRATION : undefined}");
    expect(view.match(/PRAESENTATION_INSPIRATION/g) ?? []).toHaveLength(2); // importen + den ene brug
    // Den ene brug står på præsentations-composeren (key «praesentation», startIndhold = udkastet).
    const start = view.indexOf("<CommunityComposer");
    const slut = view.indexOf("/>", start);
    const props = view.slice(start, slut);
    expect(props).toContain('key={udkast ? "praesentation" : "nyt"}');
    expect(props).toContain("startIndhold={udkast?.indholdJson}");
    expect(props).toContain("placeholder={udkast ? PRAESENTATION_INSPIRATION : undefined}");
  });

  it("svar-/redigeringscomposerne (CommunityTraadView) kender ikke inspirationen — deres eneste placeholder er svarets egen «Skriv et svar», som før", () => {
    expect(traadView).not.toContain("PRAESENTATION_INSPIRATION");
    expect(traadView.match(/placeholder=/g) ?? []).toHaveLength(1);
    expect(traadView).toContain('placeholder="Skriv et svar"');
  });

  it("composeren: placeholder-proppen går i Placeholder.configure, defaulten er uændret, og udkastet går ind som startIndhold", () => {
    expect(composer).toContain("Placeholder.configure({ placeholder }),");
    expect(composer).toContain('placeholder = "Hvad arbejder du med lige nu?",');
    expect(composer).toContain("content: (startIndhold ?? \"\") as Content,");
  });

  it("skabelonen bygger ingen overskrifter: praesentation.ts kender ikke «heading»", () => {
    expect(praesentation).not.toContain('"heading"');
    expect(praesentation).not.toContain("attrs: { level");
  });
});
