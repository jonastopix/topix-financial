import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRAESENTATION_PLADSHOLDER } from "@/lib/hjemmebane/praesentation";
import { byggTjekliste, type TjeklisteInput } from "@/lib/onboardingTjekliste";
import { komIGangTekst } from "@/lib/onboardingRytme";
import { komIGangTekst as komIGangTekstDeno } from "../../../../supabase/functions/_shared/onboardingRytme.ts";

// Kildeværn (16/9-2026, uden foreslået tekst). Jonas: «Jeg synes ikke vi
// skal komme med forslag til tekst. De skal præsentere sig som de har lyst
// til. Det gør det mere personligt.» Fem ting låses:
//   1. Pladsholderen står ÉT sted som konstant (praesentation.ts), ordret.
//   2. CommunityView sender den KUN på præsentationsvejen (praesentationAnmodet)
//      som composerens eksisterende placeholder-prop — og composeren får
//      INTET startIndhold: den starter tom, uden titel og uden afsnit.
//   3. CommunityView læser ikke profilen for vejens skyld: hverken
//      getMyMemberProfile eller byggPraesentationsSkabelon importeres.
//   4. Ordlyden står ikke som streng i nogen komponent; svar-/redigerings-
//      composerne (CommunityTraadView) og CommunityComposer er som i dag.
//   5. Tjeklisten og mail A (begge spejle) lover ikke længere et udkast.
// React/Tiptap-kode uden ren funktion at kalde → kildelæsning
// (agentforslagVenter.guard-mønstret), og værnet beviser sig selv på en KOPI
// af kilden med fejlen indsat (lektionBrugbar.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const PRAESENTATION = "src/lib/hjemmebane/praesentation.ts";
const VIEW = "src/components/hjemmebane/community/CommunityView.tsx";
const TRAAD_VIEW = "src/components/hjemmebane/community/CommunityTraadView.tsx";
const COMPOSER = "src/components/hjemmebane/community/CommunityComposer.tsx";
const TJEKLISTE = "src/lib/onboardingTjekliste.ts";
const SPEJLE = ["src/lib/onboardingRytme.ts", "supabase/functions/_shared/onboardingRytme.ts"];

const PLACEHOLDER_PROP = "placeholder={praesentationAnmodet ? PRAESENTATION_PLADSHOLDER : undefined}";
const KEY_PROP = 'key={praesentationAnmodet ? "praesentation" : "nyt"}';
const KILDE_ARG = "kildeType: praesentationAnmodet ? KILDE_PRAESENTATION : undefined";
const ORDLYD = "Fortæl med dine egne ord";

/** Props-blokken på CommunityViews <CommunityComposer … /> (kilde uden kommentarer). */
export function composerProps(view: string): string {
  const start = view.indexOf("<CommunityComposer");
  if (start === -1) throw new Error("CommunityView: fandt ikke <CommunityComposer");
  return view.slice(start, view.indexOf("/>", start));
}

/** Dom 1: konstanten defineret præcis én gang, med teksten ordret. */
export const konstantEnGangOrdret = (praesentation: string, tekst: string): boolean =>
  (praesentation.match(/export const PRAESENTATION_PLADSHOLDER =/g) ?? []).length === 1 &&
  praesentation.includes(`export const PRAESENTATION_PLADSHOLDER = "${tekst}";`);

/** Dom 2a: pladsholderen sendes på præsentationsvejen alene, via placeholder-proppen — og ingen anden brug. */
export const pladsholderKunPaaVejen = (view: string): boolean =>
  composerProps(view).includes(PLACEHOLDER_PROP) && (view.match(/PRAESENTATION_PLADSHOLDER/g) ?? []).length === 2;

/** Dom 2b: composeren på CommunityView har intet startIndhold — den starter tom. */
export const composerUdenStartIndhold = (view: string): boolean => !/\bstartIndhold\b/.test(composerProps(view));

/** Dom 2c: key og kildeType bæres af samme flag som pladsholderen. */
export const vejenBaeresAfAnmodet = (view: string): boolean =>
  composerProps(view).includes(KEY_PROP) && view.includes(KILDE_ARG) && !/\budkast\b/.test(view);

/** Dom 3: CommunityView læser ikke profilen for vejens skyld. */
export const importererProfilTilUdkast = (view: string): boolean =>
  /\bgetMyMemberProfile\b/.test(view) || /\bbyggPraesentationsSkabelon\b/.test(view) || /\bPRAESENTATION_INSPIRATION\b/.test(view);

/** Dom 5: lover teksten et udkast? */
export const loverUdkast = (tekst: string): boolean => /udkast/i.test(tekst);

const TOM: TjeklisteInput = {
  har_velkomstvideo: true,
  velkomstvideo_set_at: null,
  kan_oprette_traad: true,
  har_praesentation: false,
  ask_me_about: null,
  website: null,
  industry_label: null,
  cvr_number: null,
  antal_rapporter: 0,
  antal_godkendte: 0,
  antal_udfyldte_handouts: 0,
  last_member_message_at: null,
};
const NU = new Date(2026, 8, 16, 9, 0);

describe("praesentationPladsholder.guard — ét sted, én vej, tom composer", () => {
  const praesentation = udenKommentarer(laes(PRAESENTATION));
  const view = udenKommentarer(laes(VIEW));
  const traadView = udenKommentarer(laes(TRAAD_VIEW));
  const composer = udenKommentarer(laes(COMPOSER));

  it("1. konstanten er defineret præcis én gang, i praesentation.ts, med teksten ordret", () => {
    expect(PRAESENTATION_PLADSHOLDER).toBe("Fortæl med dine egne ord, hvem du er.");
    expect(konstantEnGangOrdret(praesentation, PRAESENTATION_PLADSHOLDER)).toBe(true);
    // Det gamle navn og udkastets funktioner findes ikke længere som kode.
    expect(praesentation).not.toContain("PRAESENTATION_INSPIRATION");
    expect(praesentation).not.toContain("byggPraesentationsSkabelon");
    expect(praesentation).not.toContain("praesentationsTitel");
    expect(praesentation).not.toContain("PROFIL_FELTER");
  });

  it("2. CommunityView sender pladsholderen KUN når præsentationen er anmodet, via placeholder-proppen — og composeren har intet startIndhold", () => {
    expect(pladsholderKunPaaVejen(view)).toBe(true);
    expect(composerUdenStartIndhold(view)).toBe(true);
    expect(vejenBaeresAfAnmodet(view)).toBe(true);
  });

  it("3. CommunityView importerer hverken getMyMemberProfile eller byggPraesentationsSkabelon — profilen læses ikke for vejens skyld", () => {
    expect(importererProfilTilUdkast(view)).toBe(false);
    expect(view).not.toContain('from "@/integrations/supabase/client"');
    expect(view).not.toContain('from "@/lib/hjemmebane/memberProfile"');
    expect(view).not.toContain("companies");
  });

  it("4. ordlyden står ikke som streng i komponenterne; CommunityTraadView og CommunityComposer er som i dag", () => {
    for (const kilde of [view, traadView, composer]) expect(kilde).not.toContain(ORDLYD);
    expect(traadView).not.toContain("PRAESENTATION_PLADSHOLDER");
    expect(traadView.match(/placeholder=/g) ?? []).toHaveLength(1);
    expect(traadView).toContain('placeholder="Skriv et svar"');
    expect(composer).toContain("Placeholder.configure({ placeholder }),");
    expect(composer).toContain('placeholder = "Hvad arbejder du med lige nu?",');
    expect(composer).toContain('content: (startIndhold ?? "") as Content,');
  });

  it("5. tjeklistens beskrivelse og mail A's linje lover ikke et udkast — i motoren og i kilden, begge spejle", () => {
    const punkt = byggTjekliste(TOM, NU).punkter.find((p) => p.id === "praesentation")!;
    expect(punkt.beskrivelse).toBe("Et opslag om hvem du er.");
    expect(loverUdkast(punkt.beskrivelse)).toBe(false);
    for (const tekst of [komIGangTekst, komIGangTekstDeno]) {
      const linje = tekst("Mette", true, NU).punkter.find((p) => p.startsWith("Præsentér dig i fællesskabet"))!;
      expect(linje).toBe("Præsentér dig i fællesskabet — et opslag om hvem du er.");
      expect(loverUdkast(linje)).toBe(false);
    }
    for (const sti of [TJEKLISTE, ...SPEJLE]) {
      const kilde = udenKommentarer(laes(sti));
      expect(kilde, sti).not.toContain("udkast ud fra din profil");
      expect(kilde, sti).not.toContain("vi har skrevet");
      expect(loverUdkast(kilde), sti).toBe(false);
    }
  });
});

describe("praesentationPladsholder.guard — dommene fanger fejlen på en kopi af kilden", () => {
  const praesentation = udenKommentarer(laes(PRAESENTATION));
  const view = udenKommentarer(laes(VIEW));

  it("1. en anden ordlyd, eller konstanten defineret to gange, fælder dom 1", () => {
    expect(konstantEnGangOrdret(praesentation.replace("hvem du er.", "hvem du er — fx hvad I laver."), PRAESENTATION_PLADSHOLDER)).toBe(false);
    expect(konstantEnGangOrdret(praesentation + `\nexport const PRAESENTATION_PLADSHOLDER = "${PRAESENTATION_PLADSHOLDER}";\n`, PRAESENTATION_PLADSHOLDER)).toBe(false);
  });

  it("2a. den gamle udkast-betingelse eller en anden brug af konstanten fælder dom 2a", () => {
    expect(pladsholderKunPaaVejen(view.replace(PLACEHOLDER_PROP, "placeholder={udkast ? PRAESENTATION_PLADSHOLDER : undefined}"))).toBe(false);
    expect(pladsholderKunPaaVejen(view.replace(PLACEHOLDER_PROP, "placeholder={PRAESENTATION_PLADSHOLDER}"))).toBe(false);
    expect(pladsholderKunPaaVejen(view + "\nconst x = PRAESENTATION_PLADSHOLDER;\n")).toBe(false);
  });

  it("2b. et startIndhold på composeren fælder dom 2b", () => {
    expect(composerUdenStartIndhold(view.replace(PLACEHOLDER_PROP, `startIndhold={udkast?.indholdJson}\n${PLACEHOLDER_PROP}`))).toBe(false);
  });

  it("2c. en key eller en kildeType båret af noget andet end praesentationAnmodet fælder dom 2c", () => {
    expect(vejenBaeresAfAnmodet(view.replace(KEY_PROP, 'key={udkast ? "praesentation" : "nyt"}'))).toBe(false);
    expect(vejenBaeresAfAnmodet(view.replace(KILDE_ARG, "kildeType: udkast ? KILDE_PRAESENTATION : undefined"))).toBe(false);
  });

  it("3. en import af profilen eller skabelonen fælder dom 3", () => {
    expect(importererProfilTilUdkast(view + '\nimport { getMyMemberProfile } from "@/lib/hjemmebane/memberProfile";\n')).toBe(true);
    expect(importererProfilTilUdkast(view + "\nconst s = byggPraesentationsSkabelon({});\n")).toBe(true);
  });

  it("5. den gamle tjekliste- og mail-tekst fælder dom 5", () => {
    expect(loverUdkast("Et opslag om hvem du er — vi har skrevet et udkast ud fra din profil.")).toBe(true);
    expect(loverUdkast("Præsentér dig i fællesskabet — et opslag om hvem du er, med et udkast ud fra din profil.")).toBe(true);
    expect(loverUdkast("Et opslag om hvem du er.")).toBe(false);
  });
});
