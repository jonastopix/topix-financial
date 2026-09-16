import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KILDE_ORD, sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";

// Kildeværn for de flader tjeklisten fører til (16/9-2026, mangellisten
// «Tavse queryFn'er — de flader tjeklisten fører til», Jonas' prioritet 3;
// forsidenKaster.guard-mønstret). Målt 16/9:
//   * HandoutsView (tjeklistens punkt 6, «Dit første handout»): hentningen
//     gik gennem handoutEngine.loadHandoutSummaries, som læste
//     `const { data } = await query; return data ?? []` — en fejl blev til
//     nul rækker, summaries beholdt sine not_started-defaults, og fladen
//     sagde «Kom godt i gang med handouts». Legat-gaten læste `const { data }`
//     og svarede tavst «alt åbent».
//   * HbVelkomstVideoEmbed (punkt 1, «Se velkomsten»): queryFn'en er
//     akademiApi.getVelkomstVideoEmbed, som KASTER — analysens grep var
//     fil-lokal. Låses som det er.
//   * HbMemberShell: eventsQuery (live-mærket) går gennem
//     listAllUpcomingEvents/throwIfError — kaster. Ved fejl udebliver mærket;
//     menuen får ingen fejltekst (valget 16/9). Skallens ulæst-tal er
//     HbKlokke: useNotifications/useAdvisorNotifications gjorde en fejl til
//     en tom liste og «Intet nyt.». Nu læses error: INTET tal (aldrig et 0),
//     og udfoldningen siger at notifikationerne ikke kunne hentes.
//   * AppLayout.tsx:45-72 (ulæst-tal og puls) er den GAMLE skal — rendret af
//     LegatDashboard, AnnualBaseline og PulseCheckin, ikke af Hjemmebane —
//     og lades være.
// React-kode uden ren funktion at kalde → kildelæsning, og værnet beviser
// sig selv på en KOPI med fejlen indsat (forloeb.guard-formen).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const ENGINE = "src/lib/handoutEngine.ts";
const HANDOUTS = "src/components/hjemmebane/handouts/HandoutsView.tsx";
const VELKOMST = "src/components/hjemmebane/HbVelkomstVideoEmbed.tsx";
const AKADEMI_API = "src/lib/hjemmebane/akademiApi.ts";
const SHELL = "src/components/hjemmebane/HbMemberShell.tsx";
const KLOKKE = "src/components/hjemmebane/HbKlokke.tsx";
const HOOK_MEDLEM = "src/hooks/useNotifications.ts";
const HOOK_RAADGIVER = "src/hooks/useAdvisorNotifications.ts";

/** Udsnittet fra en `export async function <navn>` til næste `export`. */
export const funktion = (kilde: string, navn: string): string => {
  const fra = kilde.indexOf(`export async function ${navn}`);
  if (fra < 0) return "";
  const rest = kilde.slice(fra + 1);
  const til = rest.indexOf("\nexport ");
  return til < 0 ? rest : rest.slice(0, til);
};

/** `const { data } = await …` — formen der gør en fejl til tomt. */
const TAVS_LAESNING = /const \{ data(?::\s*\w+)? \} = await/;

/** Dom 1: motoren kaster med kildens navn og læser ikke tavst. */
export const motorenKaster = (kilde: string): boolean => {
  const fn = funktion(kilde, "loadHandoutSummaries");
  return fn !== "" && /return kraevRaekker\(await query, "handouts"\);/.test(fn) && !TAVS_LAESNING.test(fn);
};

/** Dom 2: fladen fanger fejlen med kildens navn og viser husets linje — aldrig tom tilstand. */
export const fladenSigerDet = (kilde: string): boolean =>
  /load\(\)\.catch\(\(e: unknown\) => \{\s*setHentefejl\(kildeAf\(e\)\);/.test(kilde) &&
  /\{fejlet && \(/.test(kilde) &&
  /sektionsfejlTekst\(hentefejl\)/.test(kilde) &&
  /!fejlet && summaries\.every\(s => s\.status === "not_started"/.test(kilde) &&
  /\{fejlet \? null : isLoading \?/.test(kilde);

/** Dom 3: legat-gaten kaster (kraevRaekke) og fladen siger det. */
export const legatGatenKaster = (kilde: string): boolean => {
  const fra = kilde.indexOf("const legatQuery = useQuery");
  const til = kilde.indexOf("const legatEnrollment = legatQuery.data;", fra);
  if (fra < 0 || til < 0) return false;
  const udsnit = kilde.slice(fra, til);
  return /kraevRaekke<[^>]*>\(svar, "legat_enrollments"\)/.test(udsnit) && !TAVS_LAESNING.test(udsnit) && /legatQuery\.isError/.test(kilde);
};

/** Dom 5: klokkens hooks læser error, tømmer listen og melder fejlen. */
export const hookenMelderFejl = (kilde: string): boolean =>
  /const \{ data, error \} = await supabase/.test(kilde) &&
  /setHentefejl\(!!error\);/.test(kilde) &&
  /setNotifications\(error \? \[\] :/.test(kilde) &&
  /hentefejl,/.test(kilde) &&
  !TAVS_LAESNING.test(kilde);

/** Dom 6: klokken viser fejl før tom, og pillen kommer stadig kun af tallet. */
export const klokkenSkelner = (kilde: string): boolean =>
  (kilde.match(/fejlet=\{hentefejl\}/g) ?? []).length === 2 &&
  /\{fejlet \? \(\s*<p[^>]*>\{sektionsfejlTekst\("notifications"\)\}<\/p>\s*\) : linjer\.length === 0 \? \(/.test(kilde) &&
  /const pille = pilleTekst\(antal\);/.test(kilde);

describe("tavseFlader.guard — tjeklistens flader og skallen siger det når hentningen fejler", () => {
  const engine = udenKommentarer(laes(ENGINE));
  const handouts = udenKommentarer(laes(HANDOUTS));
  const velkomst = udenKommentarer(laes(VELKOMST));
  const api = udenKommentarer(laes(AKADEMI_API));
  const shell = udenKommentarer(laes(SHELL));
  const klokke = udenKommentarer(laes(KLOKKE));
  const hookMedlem = udenKommentarer(laes(HOOK_MEDLEM));
  const hookRaadgiver = udenKommentarer(laes(HOOK_RAADGIVER));

  it("1. handoutEngine.loadHandoutSummaries kaster gennem kraevRaekker med kilden «handouts»", () => {
    expect(engine).toContain('import { kraevRaekker } from "@/lib/kraevRaekker";');
    expect(motorenKaster(engine)).toBe(true);
  });

  it("2. HandoutsView fanger fejlen, viser husets linje og skjuler grid, fremgang og «Kom godt i gang»", () => {
    expect(handouts).toContain('import { kildeAf, sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";');
    expect(fladenSigerDet(handouts)).toBe(true);
    expect(handouts).toContain("!isAdvisor && !isLoading && !fejlet && summaries.length > 0");
    expect((handouts.match(/!isAdvisor && !isLoading && !fejlet && \(\(\) => \{/g) ?? []).length).toBe(2);
  });

  it("3. legat-gaten kaster (kraevRaekke, «legat_enrollments») og fladen siger det", () => {
    expect(handouts).toContain('import { kraevRaekke } from "@/lib/kraevRaekker";');
    expect(legatGatenKaster(handouts)).toBe(true);
    expect(handouts).toContain('sektionsfejlTekst("legat_enrollments")');
  });

  it("4. velkomsten: queryFn'en er getVelkomstVideoEmbed, som kaster, og fladen læser isError", () => {
    expect(velkomst).toContain("queryFn: getVelkomstVideoEmbed,");
    expect(velkomst).toContain("embed.isError");
    const fn = funktion(api, "getVelkomstVideoEmbed");
    expect(fn).toContain("if (error) throw new Error(error.message);");
  });

  it("5. skallen: eventsQuery går gennem listAllUpcomingEvents/throwIfError — og menuen får ingen fejltekst (valget)", () => {
    expect(shell).toContain("queryFn: listAllUpcomingEvents,");
    expect(funktion(api, "listAllUpcomingEvents")).toContain("throwIfError(");
    expect(shell).not.toContain("sektionsfejlTekst(");
    expect(shell).not.toContain("eventsQuery.isError");
  });

  it("6. skallens ulæst-tal: begge hooks læser error, tømmer listen (intet tal) og melder fejlen", () => {
    expect(hookenMelderFejl(hookMedlem)).toBe(true);
    expect(hookenMelderFejl(hookRaadgiver)).toBe(true);
  });

  it("7. klokken: fejl vises før tom, «Intet nyt.» kun uden fejl, pillen kun af tallet", () => {
    expect(klokke).toContain('import { sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";');
    expect(klokkenSkelner(klokke)).toBe(true);
    expect(klokke).toContain("{KLOKKE_TOM}");
  });

  it("8. ordene: kilderne har medlemmets ord, og fejl lyder aldrig som tom", () => {
    expect(KILDE_ORD.handouts).toBe("dine handouts");
    expect(KILDE_ORD.legat_enrollments).toBe("dit legatforløb");
    expect(KILDE_ORD.notifications).toBe("dine notifikationer");
    expect(sektionsfejlTekst("handouts")).toBe("Dine handouts kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("legat_enrollments")).toBe("Dit legatforløb kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("notifications")).toBe("Dine notifikationer kunne ikke hentes lige nu.");
    expect(handouts).toContain("Kom godt i gang med handouts");
  });

  it("9. AppLayout er den gamle skal — Hjemmebane rendrer den ikke", () => {
    const hjemmebane = ["HbMemberShell.tsx", "HbSidebar.tsx", "HbNav.tsx", "HbKlokke.tsx"].map((f) => laes(`src/components/hjemmebane/${f}`));
    for (const k of hjemmebane) expect(k).not.toContain("<AppLayout");
  });
});

describe("tavseFlader.guard — dommene fanger fejlen på en kopi af kilden", () => {
  const engine = udenKommentarer(laes(ENGINE));
  const handouts = udenKommentarer(laes(HANDOUTS));
  const klokke = udenKommentarer(laes(KLOKKE));
  const hookMedlem = udenKommentarer(laes(HOOK_MEDLEM));

  it("1. motoren før 16/9 (`const { data } = await query; return data ?? []`) fælder dom 1", () => {
    const gammel = engine.replace('return kraevRaekker(await query, "handouts");', "const { data } = await query;\n  return data ?? [];");
    expect(gammel).not.toBe(engine);
    expect(motorenKaster(gammel)).toBe(false);
  });

  it("2. en flade uden catch, eller med «Kom godt i gang» ugated, fælder dom 2", () => {
    const udenCatch = handouts.replace(/load\(\)\.catch\(\(e: unknown\) => \{\s*setHentefejl\(kildeAf\(e\)\);\s*setIsLoading\(false\);\s*\}\);/, "load();");
    expect(udenCatch).not.toBe(handouts);
    expect(fladenSigerDet(udenCatch)).toBe(false);
    const ugated = handouts.replace('!fejlet && summaries.every(s => s.status === "not_started"', 'summaries.every(s => s.status === "not_started"');
    expect(ugated).not.toBe(handouts);
    expect(fladenSigerDet(ugated)).toBe(false);
  });

  it("3. legat-gaten før 16/9 (`const { data } = await …; return data;`) fælder dom 3", () => {
    const gammel = handouts.replace(
      /const svar = await \(supabase as any\)([\s\S]*?)\.maybeSingle\(\);\s*return kraevRaekke<[^>]*>\(svar, "legat_enrollments"\);/,
      "const { data } = await (supabase as any)$1.maybeSingle();\n      return data;",
    );
    expect(gammel).not.toBe(handouts);
    expect(legatGatenKaster(gammel)).toBe(false);
  });

  it("5. en hook der læser `const { data } = await` fælder dom 5", () => {
    const gammel = hookMedlem
      .replace("const { data, error } = await supabase", "const { data } = await supabase")
      .replace("setHentefejl(!!error);\n", "")
      .replace("setNotifications(error ? [] : ((data as any as Notification[]) || []));", "setNotifications((data as any as Notification[]) || []);");
    expect(gammel).not.toBe(hookMedlem);
    expect(hookenMelderFejl(gammel)).toBe(false);
  });

  it("6. en klokke der kun kender «Intet nyt.» fælder dom 6", () => {
    const gammel = klokke
      .replace(/\{fejlet \? \(\s*<p[^>]*>\{sektionsfejlTekst\("notifications"\)\}<\/p>\s*\) : linjer\.length === 0 \? \(/, "{linjer.length === 0 ? (")
      .replace(/\s*fejlet=\{hentefejl\}/g, "");
    expect(gammel).not.toBe(klokke);
    expect(klokkenSkelner(gammel)).toBe(false);
  });
});
