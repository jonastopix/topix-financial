import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9-2026): forsidekortet «Ubesvarede opslag» (Jonas, valg B).
// RaadgiverForsideView er react-query + supabase uden ren funktion at kalde
// (samledeLinjerLinker.guard-mønstret), så fire ting læses i kilden:
//   1. Kortet dømmer gennem ubesvaredeOpslag( fra lib/hjemmebane/
//      ubesvaredeOpslag — ingen egen filtrering i fladen.
//   2. Det venter på ALLE tre hentninger: hooken henter tråde, svar og
//      rådgiverne gennem kraevRaekker i ÉN query (én nøgle), og fladen
//      rendrer listen kun under `ubesvaredeQuery.data`.
//   3. Fejlgrenen findes: `ubesvaredeQuery.isError` → raadgiverHentefejlTekst
//      — aldrig en tom liste der ligner «alt besvaret».
//   4. Linjerne linker til /community/{id} (traadSti) og «flere» til /community.
//   5. CommunityTraadView invaliderer UBESVAREDE_OPSLAG_KEY efter et svar
//      (og efter et slettet svar) — ellers står opslaget stadig på kortet
//      når rådgiveren er tilbage på forsiden inden for staleTime.
// Dommene er navngivne og rene over kildetekst; «VÆRNET VIRKER» kører dem på
// kopier med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const HOOK = "src/hooks/ubesvaredeOpslag.ts";
const TRAAD = "src/components/hjemmebane/community/CommunityTraadView.tsx";

/** Kortblokken: fra `{KORT_OVERSKRIFT}` til «Under stregen»-overskriften. */
export function kortBlok(kilde: string): string {
  const start = kilde.indexOf("{KORT_OVERSKRIFT}");
  const slut = kilde.indexOf(">Under stregen<", start);
  if (start === -1 || slut === -1) return "";
  return kilde.slice(start, slut);
}

export const doemmerGennemDommen = (flade: string): boolean =>
  /import \{[^}]*\bubesvaredeOpslag\b[^}]*\} from "@\/lib\/hjemmebane\/ubesvaredeOpslag"/.test(flade) &&
  kortBlok(flade).includes("ubesvaredeOpslag({ ...ubesvaredeQuery.data, nu })") &&
  !/\.filter\(\(t\) => t\.status/.test(kortBlok(flade));

export const venterPaaAlleTre = (flade: string, hook: string): boolean =>
  kortBlok(flade).includes("ubesvaredeQuery.data ? (") &&
  flade.includes("queryKey: UBESVAREDE_OPSLAG_KEY,") &&
  hook.includes('kraevRaekker(traadeRes, "community_traade")') &&
  hook.includes('kraevRaekker(raadgivereRes, "get_all_advisor_profiles")') &&
  hook.includes('kraevRaekker(svarRes, "community_svar")') &&
  (hook.match(/useQuery\(/g) ?? []).length === 0; // hooken henter; fladen ejer den ene query

export const harFejlgren = (flade: string): boolean =>
  kortBlok(flade).includes("ubesvaredeQuery.isError ? (") &&
  kortBlok(flade).includes('raadgiverHentefejlTekst(ubesvaredeQuery.error, "forsiden")');

export const linkerTilTraaden = (flade: string): boolean =>
  kortBlok(flade).includes("<Link to={traadSti(t.id)}") && kortBlok(flade).includes('<Link to="/community"');

/** Mutationsblokken `const <navn> = useMutation({` frem til `\n  });`. */
export function mutationsBlok(kilde: string, navn: string): string {
  const start = kilde.indexOf(`const ${navn} = useMutation({`);
  if (start === -1) return "";
  const slut = kilde.indexOf("\n  });", start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut);
}

/** Dom 5: trådsiden invaliderer nøglen i onSuccess for svar og slettet svar. */
export const traadenInvalidererKortet = (traad: string): boolean =>
  traad.includes('import { UBESVAREDE_OPSLAG_KEY } from "@/hooks/ubesvaredeOpslag";') &&
  traad.includes("queryClient.invalidateQueries({ queryKey: UBESVAREDE_OPSLAG_KEY });") &&
  ["svarMutation", "sletSvarMutation"].every((navn) => {
    const blok = mutationsBlok(traad, navn);
    const onSuccess = blok.indexOf("onSuccess:");
    return onSuccess !== -1 && blok.slice(onSuccess).includes("invaliderUbesvarede();");
  });

describe("ubesvaredeOpslag.guard — forsidekortet", () => {
  const flade = udenKommentarer(laes(FLADE));
  const hook = udenKommentarer(laes(HOOK));

  it("1. kortet dømmer gennem ubesvaredeOpslag( — ingen egen filtrering i fladen", () => {
    expect(doemmerGennemDommen(flade)).toBe(true);
  });
  it("2. venter på alle tre hentninger: én nøgle, kraevRaekker på tråde/svar/rådgivere, listen kun under data", () => {
    expect(venterPaaAlleTre(flade, hook)).toBe(true);
    expect(hook).toContain('kraevRaekker(profilRes, "profiles")');
  });
  it("3. fejlgrenen findes — husets hentefejltekst", () => {
    expect(harFejlgren(flade)).toBe(true);
    expect(kortBlok(flade)).toContain("{ALLE_BESVARET_TEKST}");
  });
  it("4. linjerne linker til /community/{id}, «flere» til /community; præsentationer mærkes", () => {
    expect(linkerTilTraaden(flade)).toBe(true);
    expect(kortBlok(flade)).toContain("t.kilde_type === KILDE_PRAESENTATION && <HbTag");
    expect(kortBlok(flade)).toContain("{flereTekst(flere)}");
  });
  it("5. CommunityTraadView invaliderer UBESVAREDE_OPSLAG_KEY efter et svar og efter et slettet svar", () => {
    expect(traadenInvalidererKortet(udenKommentarer(laes(TRAAD)))).toBe(true);
  });
  it("hooken er i topblokken: ubesvaredeQuery står før den første betingede return", () => {
    const krop = flade.slice(flade.indexOf("export const RaadgiverForsideView = () => {"));
    expect(krop.indexOf("const ubesvaredeQuery = useQuery(")).toBeLessThan(krop.indexOf("\n  if (isError) {"));
  });
});

describe("ubesvaredeOpslag.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const flade = udenKommentarer(laes(FLADE));
  const hook = udenKommentarer(laes(HOOK));

  it("1. en egen filtrering i fladen, eller dommen væk, fælder dom 1", () => {
    expect(doemmerGennemDommen(flade.replace("ubesvaredeOpslag({ ...ubesvaredeQuery.data, nu })", "({ liste: ubesvaredeQuery.data.traade.filter((t) => t.status === 'aktiv'), ialt: 0 })"))).toBe(false);
  });
  it("2. en hentning uden kraevRaekker på svarene, eller listen uden for data-grenen, fælder dom 2", () => {
    expect(venterPaaAlleTre(flade, hook.replace('kraevRaekker(svarRes, "community_svar")', "(svarRes.data ?? [])"))).toBe(false);
    expect(venterPaaAlleTre(flade.replace("ubesvaredeQuery.data ? (", "true ? ("), hook)).toBe(false);
  });
  it("3. en fladen uden fejlgren fælder dom 3", () => {
    expect(harFejlgren(flade.replace("ubesvaredeQuery.isError ? (", "false ? ("))).toBe(false);
  });
  it("4. et link til virksomhedssiden i stedet for tråden fælder dom 4", () => {
    expect(linkerTilTraaden(flade.replace("<Link to={traadSti(t.id)}", "<Link to={`/virksomhed/${t.id}`}"))).toBe(false);
  });
  it("5. en svar-mutation der kun invaliderer tråd og feed (den gamle form) fælder dom 5", () => {
    const traad = udenKommentarer(laes(TRAAD));
    const blok = mutationsBlok(traad, "svarMutation");
    const gammel = traad.replace(blok, blok.replace("onSuccess: () => {\n      invaliderTraadOgFeed();\n      invaliderUbesvarede();\n    },", "onSuccess: invaliderTraadOgFeed,"));
    expect(gammel).not.toBe(traad);
    expect(traadenInvalidererKortet(gammel)).toBe(false);
    expect(traadenInvalidererKortet(traad.replace('import { UBESVAREDE_OPSLAG_KEY } from "@/hooks/ubesvaredeOpslag";', ""))).toBe(false);
  });
});
