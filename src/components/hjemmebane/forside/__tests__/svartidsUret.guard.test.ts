import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Kildeværn (30/9-2026): «Svartids-uret» er KUN for rådgivere. Tallene
// handler om rådgivernes egen svartid og må aldrig blive en SLA over for
// medlemmer (lib/marketing/grundlag.ts: «Ikke en supportkanal med svartid»).
// Fladerne er react-query + supabase uden ren funktion at kalde, så syv domme
// læses i kilden (ubesvaredeOpslag.guard-mønstret):
//   1. INDEX: RaadgiverForsideView renderes kun i grenen
//      `if (isAdvisor && !companyId) {` i src/pages/Index.tsx.
//   2. ÉT STED: <SvartidsUret renderes kun i RaadgiverForsideView — ingen
//      anden fil i src/ monterer kortet.
//   3. QUERY'EN: forsiden henter kun med rollen (`enabled: !!user && isAdvisor`)
//      under SVARTID_KEY, og hooken står i topblokken før første betingede
//      return (React #310).
//   4. KORTET SELV: `useAuth()` og `if (!isAdvisor) return null;`
//      før enhver JSX — også hvis nogen en dag monterer det et andet sted.
//   5. HENTNINGEN: rådgiverens egen klient — ingen service role, ingen
//      user_roles-læsning (rådgiveren må ikke læse andres roller; rollerne
//      kommer fra get_all_advisor_profiles), kun message_type 'user', side
//      for side (tre tabeller gennem hentAlleSider), alle fire kilder
//      gennem kraevRaekker.
//   6. DOMMEN: kortet regner gennem svartidsUret( — ingen egen filtrering.
//   7. TEAMTAL: dommen kender ingen svarer, og kortet får ingen navne —
//      ingen tal pr. rådgiver, ingen rangliste (analysen R1).
// «VÆRNET VIRKER» kører hver dom på kopier med fejlen indsat.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const INDEX = "src/pages/Index.tsx";
const FORSIDE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const KORT = "src/components/hjemmebane/forside/SvartidsUret.tsx";
const HOOK = "src/hooks/svartid.ts";
const LIB = "src/lib/svartid.ts";

function alleKildefiler(mappe: string): string[] {
  const ud: string[] = [];
  for (const navn of readdirSync(mappe)) {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) {
      if (navn === "__tests__" || navn === "node_modules") continue;
      ud.push(...alleKildefiler(sti));
    } else if (/\.(tsx?|jsx?)$/.test(navn) && !/\.test\./.test(navn)) {
      ud.push(sti);
    }
  }
  return ud;
}

/** Dom 1: forsiden står kun i rådgivergrenen. */
export const kunIRaadgivergrenen = (index: string): boolean => {
  const gren = index.indexOf("if (isAdvisor && !companyId) {");
  const forside = index.indexOf("<RaadgiverForsideView />");
  if (gren === -1 || forside === -1) return false;
  if (index.indexOf("<RaadgiverForsideView />", forside + 1) !== -1) return false;
  const grenSlut = index.indexOf("\n  }", gren);
  return forside > gren && forside < grenSlut;
};

/** Dom 2: kun forsiden monterer kortet. `filer` = [sti, kilde]. */
export const monteretEtSted = (filer: [string, string][]): boolean => {
  const med = filer.filter(([, k]) => k.includes("<SvartidsUret")).map(([s]) => s.replace(/\\/g, "/"));
  return med.length === 1 && med[0].endsWith(FORSIDE);
};

/** Dom 3. */
export const queryenKraeverRollen = (forside: string): boolean => {
  const krop = forside.slice(forside.indexOf("export const RaadgiverForsideView = () => {"));
  const q = krop.indexOf("const svartidQuery = useQuery({");
  const blok = q === -1 ? "" : krop.slice(q, krop.indexOf("});", q));
  return (
    krop.includes("const { user, profile, isAdvisor } = useAuth();") &&
    q !== -1 &&
    q < krop.indexOf("\n  if (isError) {") &&
    blok.includes("queryKey: SVARTID_KEY,") &&
    blok.includes("enabled: !!user && isAdvisor,") &&
    krop.includes("<SvartidsUret hentning={svartidQuery} />")
  );
};

/** Dom 4. */
export const kortetTjekkerRollen = (kort: string): boolean => {
  const start = kort.indexOf("export const SvartidsUret = (");
  const krop = start === -1 ? "" : kort.slice(start);
  const auth = krop.indexOf("const { isAdvisor } = useAuth();");
  const vagt = krop.indexOf("if (!isAdvisor) return null;");
  const jsx = krop.indexOf("<div");
  return auth !== -1 && vagt !== -1 && auth < vagt && vagt < jsx;
};

/** Dom 5. */
export const hentningenErRaadgiverens = (hook: string): boolean =>
  !/service_?role|SERVICE_ROLE/i.test(hook) &&
  !hook.includes('from("user_roles")') &&
  hook.includes('supabase.rpc("get_all_advisor_profiles")') &&
  hook.includes('.eq("message_type", "user")') &&
  (hook.match(/hentAlleSider</g) ?? []).length === 3 &&
  ['side<SvartidBesked>("messages")', 'side<SvartidSamtale>("conversations")', 'side<SvartidVirksomhed>("companies")', 'kraevRaekker(raadgivereRes, "get_all_advisor_profiles")'].every((s) => hook.includes(s)) &&
  (hook.match(/useQuery\(/g) ?? []).length === 0;

/** Dom 6. */
export const doemmerGennemDommen = (kort: string): boolean =>
  kort.includes("svartidsUret({ ...hentning.data, nu: new Date() })") && !/\.filter\(/.test(kort) && !/\.sort\(/.test(kort);

/** Dom 7. */
export const kunTeamtal = (lib: string, kort: string, hook: string): boolean =>
  !/svarer|prRaadgiver|\bmig\b/.test(lib) && !/full_name|svarer|\bmig\b/.test(kort) && !hook.includes("full_name");

describe("svartidsUret.guard — kun for rådgivere", () => {
  const index = udenKommentarer(laes(INDEX));
  const forside = udenKommentarer(laes(FORSIDE));
  const kort = udenKommentarer(laes(KORT));
  const hook = udenKommentarer(laes(HOOK));
  const lib = udenKommentarer(laes(LIB));

  it("1. forsiden renderes kun i Index' rådgivergren", () => {
    expect(kunIRaadgivergrenen(index)).toBe(true);
  });
  it("2. kortet monteres kun på rådgiverens forside", () => {
    const filer = alleKildefiler(resolve(ROD, "src")).map((s): [string, string] => [s, udenKommentarer(readFileSync(s, "utf8"))]);
    expect(monteretEtSted(filer)).toBe(true);
  });
  it("3. query'en kræver rollen og står i topblokken", () => {
    expect(queryenKraeverRollen(forside)).toBe(true);
  });
  it("4. kortet tegner intet uden rollen", () => {
    expect(kortetTjekkerRollen(kort)).toBe(true);
  });
  it("5. hentningen er rådgiverens egen: ingen service role, ingen user_roles, side for side, kraevRaekker", () => {
    expect(hentningenErRaadgiverens(hook)).toBe(true);
  });
  it("6. kortet regner gennem dommen", () => {
    expect(doemmerGennemDommen(kort)).toBe(true);
  });
  it("7. kun fælles teamtal — ingen svarer, ingen navne", () => {
    expect(kunTeamtal(lib, kort, hook)).toBe(true);
  });
});

describe("svartidsUret.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const index = udenKommentarer(laes(INDEX));
  const forside = udenKommentarer(laes(FORSIDE));
  const kort = udenKommentarer(laes(KORT));
  const hook = udenKommentarer(laes(HOOK));

  it("1. forsiden i medlemsgrenen fælder dom 1", () => {
    const flyttet = index.replace("<BoardroomView />", "<RaadgiverForsideView />").replace("<RaadgiverForsideView />", "<BoardroomView />");
    expect(kunIRaadgivergrenen(index.replace("if (isAdvisor && !companyId) {", "if (!companyId) {"))).toBe(false);
    expect(kunIRaadgivergrenen(flyttet + "\n<RaadgiverForsideView />")).toBe(false);
  });
  it("2. kortet monteret på medlemmets forside fælder dom 2", () => {
    expect(monteretEtSted([[FORSIDE, "<SvartidsUret />"], ["src/components/hjemmebane/boardroom/BoardroomView.tsx", "<SvartidsUret />"]])).toBe(false);
  });
  it("3. en query uden rollekrav fælder dom 3", () => {
    expect(queryenKraeverRollen(forside.replace("enabled: !!user && isAdvisor,", "enabled: !!user,"))).toBe(false);
  });
  it("4. et kort uden rollevagt fælder dom 4", () => {
    expect(kortetTjekkerRollen(kort.replace("if (!isAdvisor) return null;", ""))).toBe(false);
  });
  it("5. user_roles-læsning eller en hentning uden kraevRaekker fælder dom 5", () => {
    expect(hentningenErRaadgiverens(hook + '\nsupabase.from("user_roles").select("user_id");')).toBe(false);
    expect(hentningenErRaadgiverens(hook.replace('side<SvartidVirksomhed>("companies")', "(r) => r"))).toBe(false);
    expect(hentningenErRaadgiverens(hook.replace('.eq("message_type", "user")', ""))).toBe(false);
  });
  it("6. egen filtrering i kortet fælder dom 6", () => {
    expect(doemmerGennemDommen(kort + "\nconst x = [].filter((y) => y);")).toBe(false);
  });
  it("7. et svarer-felt i dommen eller navne i kortet fælder dom 7", () => {
    const lib = udenKommentarer(laes(LIB));
    expect(kunTeamtal(lib + "\nexport const svarer = 1;", kort, hook)).toBe(false);
    expect(kunTeamtal(lib, kort + "\nconst n = r.full_name;", hook)).toBe(false);
  });
});
