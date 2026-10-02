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
//
// RETTET 30/9-2026 (Jonas' godkendte redesign af højre kolonne: «I dag» som
// fire felter i et 2×2-gitter, listerne under gitteret). Dommen
// ubesvaredeOpslag( køres nu ÉN gang før JSX'en — feltet (tallet) og listen
// læser samme værdi — så dom 1–3 læser udledningen i stedet for en blok i
// JSX'en: «kun under data» = `ubesvaredeQuery.data ? ubesvaredeOpslag(…)`,
// og listen får dommen KUN når feltet står med et tal; «fejlgrenen» =
// hjælperen felt(ubesvaredeQuery, …) med husets hentefejltekst før tallet.
// Den tomme tilstand er feltets «0 · Alle besvaret» (lib/hjemmebane/
// hoejreKolonne), ikke ALLE_BESVARET_TEKST. Dom 4 læser listen under
// gitteret. Ingen dom er fjernet.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const HOOK = "src/hooks/ubesvaredeOpslag.ts";
const TRAAD = "src/components/hjemmebane/community/CommunityTraadView.tsx";

/** Kortblokken: fra `{KORT_OVERSKRIFT}` til Driften (vagtQuery).
    17/9 (PR 2, højre efter tid): var «til «Under stregen»-overskriften» —
    Under stregen står nu i venstre kolonne, og kortet følges af Driften. */
export function kortBlok(kilde: string): string {
  // 30/9: listen under gitteret — fra dens overskrift til «Venter på betaling».
  const start = kilde.indexOf("{KORT_OVERSKRIFT}</p>");
  const slut = kilde.indexOf("{VENTER_OVERSKRIFT}</p>", start);
  if (start === -1 || slut === -1) return "";
  return kilde.slice(start, slut);
}

/** 30/9: udledningen før JSX'en — fra fejllisten til og med objektet iDag. */
export function udledning(kilde: string): string {
  const start = kilde.indexOf("const iDagFejl");
  const slut = kilde.indexOf("const iDag = {", start);
  if (start === -1 || slut === -1) return "";
  return kilde.slice(start, kilde.indexOf("};", slut) + 2);
}

export const doemmerGennemDommen = (flade: string): boolean =>
  /import \{[^}]*\bubesvaredeOpslag\b[^}]*\} from "@\/lib\/hjemmebane\/ubesvaredeOpslag"/.test(flade) &&
  udledning(flade).includes("ubesvaredeOpslag({ ...ubesvaredeQuery.data, nu })") &&
  !/\.filter\(\(t\) => t\.status/.test(udledning(flade)) &&
  !/\.filter\(\(t\) => t\.status/.test(kortBlok(flade));

export const venterPaaAlleTre = (flade: string, hook: string): boolean =>
  udledning(flade).includes("const opslagDom = ubesvaredeQuery.data ? ubesvaredeOpslag({ ...ubesvaredeQuery.data, nu }) : null;") &&
  udledning(flade).includes('opslag: { felt: opslagFelt, dom: opslagFelt.art === "tal" ? opslagDom : null },') &&
  flade.includes("{iDag.opslag.dom && iDag.opslag.dom.ialt > 0 && (() => {") &&
  flade.includes("queryKey: UBESVAREDE_OPSLAG_KEY,") &&
  hook.includes('kraevRaekker(traadeRes, "community_traade")') &&
  hook.includes('kraevRaekker(raadgivereRes, "get_all_advisor_profiles")') &&
  hook.includes('kraevRaekker(svarRes, "community_svar")') &&
  (hook.match(/useQuery\(/g) ?? []).length === 0; // hooken henter; fladen ejer den ene query

export const harFejlgren = (flade: string): boolean => {
  const u = udledning(flade);
  const fejl = u.indexOf("if (q.isError) {");
  const tekst = u.indexOf('iDagFejl.push({ noegle, tekst: raadgiverHentefejlTekst(q.error, "forsiden") });');
  const tal = u.indexOf('{ art: "tal", antal }');
  return (
    u.includes('const opslagFelt = felt(ubesvaredeQuery, "opslag", opslagDom ? opslagDom.ialt : null);') &&
    fejl !== -1 && fejl < tekst && tekst < tal &&
    flade.includes("{iDag.fejl.map((f) => <li key={f.noegle}>{f.tekst}</li>)}")
  );
};

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
    // Den tomme tilstand er feltets tal (0 · «Alle besvaret»), 30/9.
    expect(flade).toContain('<TalFelt slags="opslag" etiket={KORT_OVERSKRIFT} tilstand={iDag.opslag.felt} />');
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
    expect(venterPaaAlleTre(flade.replace("ubesvaredeQuery.data ? ubesvaredeOpslag", "true ? ubesvaredeOpslag"), hook)).toBe(false);
    expect(venterPaaAlleTre(flade.replace('dom: opslagFelt.art === "tal" ? opslagDom : null', "dom: opslagDom"), hook)).toBe(false);
  });
  it("3. en flade uden fejlgren (feltet uden om felt(…), eller fejl efter tal) fælder dom 3", () => {
    const udenom = flade.replace('const opslagFelt = felt(ubesvaredeQuery, "opslag", opslagDom ? opslagDom.ialt : null);', 'const opslagFelt: FeltTilstand = { art: "tal", antal: opslagDom ? opslagDom.ialt : 0 };');
    expect(udenom).not.toBe(flade);
    expect(harFejlgren(udenom)).toBe(false);
    expect(harFejlgren(flade.replace("if (q.isError) {", "if (false) {"))).toBe(false);
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
