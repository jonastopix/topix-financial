import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (17/9-2026, rådgivernes forside PR 2 — højre kolonne efter tid;
// Jonas «AA», valg 1; analyse-raadgivernes-forside.md §5, §6 forslag 2).
// Seks domme, læst i kilden:
//   1. RÆKKEFØLGEN i DOM'en (= mobilens): dommen → Under stregen → «I dag»
//      (Sessioner i dag, Online nu, Ubesvarede opslag, Driften) → Jeres liste
//      (<OpgavelisteView paaForsiden />) → «Ugen» (Siden sidst) → «Måneden»
//      (Pulsen, Nye medlemmer).
//   2. GRIDET på lg: fire felter — dommen (col 1, row 1), «I dag» (col 2,
//      row 1), listen (col 1, row 2), Ugen/Måneden (col 2, row 2); Under
//      stregen inde i dommens felt, i venstre.
//   3. DRIFTEN vises KUN når rød (`v.tone === "rust" ? … : null`); fejl siges stadig.
//   4. SESSIONER I DAG: hooken henter session_bookings (status booked, vindue)
//      og companies gennem kraevRaekker; fladen dømmer gennem dagensSessioner(
//      og linker hver session til virksomhedsLink(s.companyId); fejl → husets
//      hentefejltekst, aldrig «Ingen sessioner i dag» ved fejl.
//   5. Hooken sessionerQuery står i topblokken, før første betingede return.
//   6. Ordbogen kender session_bookings → «sessionerne».
// Selvbevis («VÆRNET VIRKER») kører hver dom på kopier med fejlen indsat.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");

const FLADE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const HOOK = "src/hooks/dagensSessioner.ts";
const ORDBOG = "src/lib/raadgiverHentefejl.ts";

const ANKRE = [
  "{dom.linjer.map((l) => (",
  ">Under stregen</p>",
  ">I dag</p>",
  "{SESSIONER_OVERSKRIFT}</p>",
  'if (online.status === "fejl") {',
  "{KORT_OVERSKRIFT}</p>",
  "vagtQuery.isLoading",
  "<OpgavelisteView paaForsiden />",
  ">Ugen</p>",
  "Siden sidst{",
  ">Måneden</p>",
  ">Pulsen</p>",
  "{KOHORTE_OVERSKRIFT}</p>",
] as const;

/** Dom 1: alle ankre findes, i denne rækkefølge, præcis én gang hver. */
export const raekkefoelgenHolder = (flade: string): boolean => {
  let sidst = -1;
  for (const anker of ANKRE) {
    const i = flade.indexOf(anker);
    if (i === -1 || i <= sidst) return false;
    if (flade.indexOf(anker, i + 1) !== -1) return false;
    sidst = i;
  }
  return true;
};

/** Dom 2. */
export const gridetHarFireFelter = (flade: string): boolean =>
  flade.includes('lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-x-12" data-forside-grid') &&
  flade.includes('<div className="min-w-0 lg:col-start-1 lg:row-start-1" data-forside-felt="dommen">') &&
  /lg:col-start-2 lg:row-start-1 [^"]*" data-forside-felt="i-dag"/.test(flade) &&
  flade.includes('<div className="min-w-0 lg:col-start-1 lg:row-start-2" data-forside-felt="liste">') &&
  /lg:col-start-2 lg:row-start-2 [^"]*" data-forside-felt="ugen-maaneden"/.test(flade) &&
  flade.indexOf("data-under-stregen") > flade.indexOf('data-forside-felt="dommen"') &&
  flade.indexOf("data-under-stregen") < flade.indexOf('data-forside-felt="i-dag"');

/** Dom 3. */
export const driftenKunNaarRoed = (flade: string): boolean =>
  flade.includes('return v.tone === "rust" ? <p className="pb-4 text-hb-rust">{v.tekst}</p> : null;') &&
  flade.includes("Driften: vagten kunne ikke hentes lige nu.") &&
  !flade.includes('v.tone === "rust" && "text-hb-rust"');

/** Blokken «Sessioner i dag»: fra overskriften til Online-blokken. */
function sessionerBlok(flade: string): string {
  const start = flade.indexOf("{SESSIONER_OVERSKRIFT}");
  const slut = flade.indexOf("const overskrift = (antal: number) =>", start);
  return start === -1 || slut === -1 ? "" : flade.slice(start, slut);
}

/** Dom 4. */
export const sessionerneDoemmesOgLinker = (flade: string, hook: string): boolean => {
  const b = sessionerBlok(flade);
  const h = udenKommentarer(hook);
  return (
    b.includes("dagensSessioner({ ...sessionerQuery.data, nu: new Date() })") &&
    b.includes("<Link to={virksomhedsLink(s.companyId)} className={TEKSTLINK}>{sessionLinjeTekst(s)}</Link>") &&
    b.includes('raadgiverHentefejlTekst(sessionerQuery.error, "forsiden")') &&
    b.indexOf("sessionerQuery.isError ? (") < b.indexOf("sessionerQuery.data ? (") &&
    b.includes("{INGEN_SESSIONER_TEKST}") &&
    !/\.filter\(/.test(b) &&
    h.includes('.from("session_bookings")') &&
    h.includes('.eq("status", "booked")') &&
    h.includes('kraevRaekker(bookingRes, "session_bookings")') &&
    h.includes('"companies",') &&
    h.includes('.select("id, name").in("id", companyIds)') &&
    (h.match(/useQuery\(/g) ?? []).length === 0 &&
    !h.includes(".limit(")
  );
};

/** Dom 5. */
export const hookenITopblokken = (flade: string): boolean => {
  const krop = flade.slice(flade.indexOf("export const RaadgiverForsideView = () => {"));
  const q = krop.indexOf("const sessionerQuery = useQuery(");
  return q !== -1 && q < krop.indexOf("\n  if (isError) {") && flade.includes("queryKey: DAGENS_SESSIONER_KEY,");
};

/** Dom 6. */
export const ordbogenKenderSessioner = (ordbog: string): boolean => ordbog.includes('session_bookings: "sessionerne",');

describe("forsideHoejreSpalte.guard — højre kolonne efter tid, Under stregen i venstre, Sessioner i dag", () => {
  const flade = udenKommentarer(laes(FLADE));
  const hook = laes(HOOK);
  const ordbog = laes(ORDBOG);

  it("1. rækkefølgen i DOM'en (= mobilen): dommen → Under stregen → I dag (sessioner, online, opslag, driften) → listen → Ugen → Måneden", () => {
    expect(raekkefoelgenHolder(flade)).toBe(true);
  });
  it("2. gridet på lg: fire felter i to kolonner og to rækker; Under stregen i dommens felt", () => {
    expect(gridetHarFireFelter(flade)).toBe(true);
  });
  it("3. Driften vises kun når rød; fejl siges stadig", () => {
    expect(driftenKunNaarRoed(flade)).toBe(true);
  });
  it("4. Sessioner i dag: hentet gennem kraevRaekker (booked, vindue), dømt gennem dagensSessioner, linket til virksomheden, fejl før tom", () => {
    expect(sessionerneDoemmesOgLinker(flade, hook)).toBe(true);
  });
  it("5. sessionerQuery står i topblokken før den første betingede return", () => {
    expect(hookenITopblokken(flade)).toBe(true);
  });
  it("6. ordbogen: session_bookings → «sessionerne»", () => {
    expect(ordbogenKenderSessioner(ordbog)).toBe(true);
  });
});

describe("forsideHoejreSpalte.guard — VÆRNET VIRKER på kopier med fejlen indsat", () => {
  const flade = udenKommentarer(laes(FLADE));
  const hook = laes(HOOK);
  const ordbog = laes(ORDBOG);

  it("1. Pulsen flyttet op i «I dag», eller Under stregen tilbage i højre, fælder dom 1", () => {
    const pulsen = flade.slice(flade.indexOf(">Pulsen</p>"), flade.indexOf("{KOHORTE_OVERSKRIFT}</p>"));
    const flyttet = flade.replace(pulsen, "").replace(">I dag</p>", `>I dag</p>${pulsen}`);
    expect(flyttet).not.toBe(flade);
    expect(raekkefoelgenHolder(flyttet)).toBe(false);
    const under = flade.slice(flade.indexOf(">Under stregen</p>"), flade.indexOf('data-forside-felt="i-dag"'));
    expect(raekkefoelgenHolder(flade.replace(under, "").replace(">Måneden</p>", `>Måneden</p>${under}`))).toBe(false);
  });
  it("2. et felt uden placering, eller Under stregen uden for dommens felt, fælder dom 2", () => {
    expect(gridetHarFireFelter(flade.replace('lg:col-start-1 lg:row-start-2" data-forside-felt="liste"', 'lg:col-start-1" data-forside-felt="liste"'))).toBe(false);
    expect(gridetHarFireFelter(flade.replace("data-under-stregen", "data-x").replace('data-forside-felt="ugen-maaneden"', 'data-forside-felt="ugen-maaneden" data-under-stregen'))).toBe(false);
  });
  it("3. en grøn driftslinje der vises fælder dom 3", () => {
    expect(driftenKunNaarRoed(flade.replace('return v.tone === "rust" ? <p className="pb-4 text-hb-rust">{v.tekst}</p> : null;', 'return <p className={cn("pb-4", v.tone === "rust" && "text-hb-rust")}>{v.tekst}</p>;'))).toBe(false);
  });
  it("4. en egen filtrering i fladen, et link uden virksomhed, eller en hentning uden booked-filter fælder dom 4", () => {
    expect(sessionerneDoemmesOgLinker(flade.replace("dagensSessioner({ ...sessionerQuery.data, nu: new Date() })", "sessionerQuery.data.bookinger.filter((b) => b.status === \"booked\")"), hook)).toBe(false);
    expect(sessionerneDoemmesOgLinker(flade.replace("<Link to={virksomhedsLink(s.companyId)} className={TEKSTLINK}>{sessionLinjeTekst(s)}</Link>", "<span>{sessionLinjeTekst(s)}</span>"), hook)).toBe(false);
    expect(sessionerneDoemmesOgLinker(flade, hook.replace('.eq("status", "booked")', ""))).toBe(false);
    expect(sessionerneDoemmesOgLinker(flade, hook.replace('kraevRaekker(bookingRes, "session_bookings")', "(bookingRes.data ?? [])"))).toBe(false);
  });
  it("5. hooken efter den første betingede return fælder dom 5", () => {
    const q = flade.slice(flade.indexOf("const sessionerQuery = useQuery("), flade.indexOf("const lukning = useMutation("));
    const flyttet = flade.replace(q, "").replace("\n  if (isError) {", `\n  if (isError) {\n  }\n  ${q}\n  if (false) {`);
    expect(hookenITopblokken(flyttet)).toBe(false);
  });
  it("6. en ordbog uden session_bookings fælder dom 6", () => {
    expect(ordbogenKenderSessioner(ordbog.replace('session_bookings: "sessionerne",', ""))).toBe(false);
  });
});
