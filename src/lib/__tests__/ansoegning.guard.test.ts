import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for ansøgningsformularen (18/9-2026). Kildelæsning
// (cvrKilde.guard-/betalKvittering.guard-mønstret): fladen er React, funktionerne
// er Deno; hver dom er en navngiven ren funktion over kildeteksten, og værnet
// beviser sig selv på KOPIER med fejlen indsat — filerne røres ikke.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const FLADE = "src/pages/Ansoeg.tsx";
const APP = "src/App.tsx";
const GEM = "supabase/functions/ansoegning-gem/index.ts";
const CVR = "supabase/functions/ansoegning-cvr/index.ts";
const TOKEN = "supabase/functions/_shared/ansoegningToken.ts";
const CONFIG = "supabase/config.toml";
const CI = "scripts/check-edge-function-auth.ts";
const OPRETTELSE = "supabase/functions/_shared/virksomhedsOprettelse.ts";

// ── Dommene ──────────────────────────────────────────────────────────────

/** Ruten er uguardet — ingen MemberRoute/ProtectedRoute om <Ansoeg />. */
export const rutenErUguardet = (app: string): boolean => /<Route path="\/ansoeg" element=\{<Ansoeg \/>\} \/>/.test(app);

const SKAERM = "src/components/ansoegning/AnsoegSkaerm.tsx";

/** Honningfeltet (Jonas 18/9): i DOM'en, men aria-hidden, tabIndex -1, ude af skærmen — og sendt med «opret» som `firma`. */
export const honningfeltErSkjult = (skaerm: string): boolean =>
  /<div aria-hidden="true" style=\{HONNING_STIL\}>[\s\S]*?name="firma"[\s\S]*?tabIndex=\{-1\}/.test(skaerm) && skaerm.includes('left: "-10000px"');
export const honningSendesMedOpret = (flade: string): boolean => /opretAnsoegning\(\{[^}]*firma: honning/.test(flade);

/** Samtykkelinjen står KUN på sidste skærm og linker til persondata-siden, som er uguardet. */
export const samtykkePaaSidsteSkaerm = (skaerm: string): boolean =>
  /\{sidste && \([\s\S]*?\{SAMTYKKE_LINJE\}[\s\S]*?<Link to=\{PERSONDATA_STI\}/.test(skaerm);
export const persondataRutenErUguardet = (app: string): boolean => /<Route path="\/ansoeg\/persondata" element=\{<AnsoegPersondata \/>\} \/>/.test(app);

/** Fladen dømmer gennem skema.ts — ingen egen regex på cvr/email i fladen. */
export const fladenBrugerDommene = (flade: string): boolean =>
  flade.includes("validerFelt(") && flade.includes("afgoerFremdrift(") && flade.includes("afgoerKilde(") && !/\\d\{8\}/.test(flade) && !flade.includes("@[^");

/** Kun handler-kroppen — hjælpefunktioner defineret over Deno.serve dømmes ikke på plads, men på hvor de KALDES. */
const serveKrop = (kilde: string): string => kilde.slice(Math.max(0, kilde.indexOf("Deno.serve(")));

/** Tokenet verificeres FØR første skrivning/læsning med service-role (ud over opret) — i handler-kroppen. */
export function tokenFoerSkrivning(kilde: string): boolean {
  const krop = serveKrop(kilde);
  const verify = krop.indexOf("verifyAnsoegningstoken(");
  const foersteBrug = krop.search(/adminClient\s*\.\s*from\("ansoegninger"\)\s*\.\s*(update|select\("id, token)/);
  const cvrCache = krop.indexOf('.from("cvr_opslag_cache")');
  const cacheKald = krop.search(/\b(fraCache|opslagIDag)\(/);
  const foerste = [foersteBrug, cvrCache, cacheKald].filter((i) => i >= 0);
  return verify >= 0 && foerste.every((i) => i > verify);
}

/** Opret-grenen tæller FØR insert (fail-closed) og kender honningfeltet. */
export const opretErBegraenset = (gem: string): boolean =>
  gem.indexOf("antalSidsteTime(") < gem.indexOf('.insert({ kilde') && gem.includes("Number.MAX_SAFE_INTEGER") && gem.includes("honningfelt");

/** IP'en gemmes aldrig rå: kun sha256 af ip + dag går i rækken. */
export const ipKunSomHash = (gem: string): boolean =>
  gem.includes("ip_hash: ipHash") && !/ip_hash:\s*ip\b/.test(gem) && gem.includes('sha256Hex(`${ip}:${dag}`)');

/** CVR-funktionen slår op gennem husets kilde — aldrig sin egen fetch. */
/**
 * NY PRÆMIS 19/9: `udfaldAf` kaldes ikke længere her — rækken bygges af den
 * DELTE `cacheRaekkeAf` (_shared/cvrCache.ts), som alle tre skrivere bruger.
 * Invarianten er uændret: hentningen går gennem husets `hentDataCvrRaa`, og
 * functionen har ingen egen fetch.
 *
 * NY PRÆMIS 22/9: også FRISKHEDEN kommer nu fra cvrCache (`erFriskCache`) —
 * rådgiverens manuelle opslag (ansoegning-cvr-opslag) læser samme cache, og to
 * kopier af «30 dage» ville før eller siden blive uenige. Dommen er derfor
 * skærpet: den kræver nu, at de lokale CACHE_DAGE-konstanter er VÆK herfra.
 */
export const cvrGennemHusetsKilde = (cvr: string): boolean =>
  cvr.includes('import { hentDataCvrRaa } from "../_shared/virksomhedsOprettelse.ts"') &&
  /import \{[^}]*\bcacheRaekkeAf\b[^}]*\berFriskCache\b[^}]*\} from "\.\.\/_shared\/cvrCache\.ts"/.test(cvr) &&
  !/const CACHE_DAGE_/.test(cvr) &&
  !/\bfetch\s*\(/.test(cvr);

/** Cachen bærer aldrig den rå body — upsert'en skriver kun svar + visning. */
export const cachenUdenRaaBody = (cvr: string): boolean => !/upsert\([^)]*\bbody\b/.test(cvr) && !/raa\.body/.test(cvr.split("tolkCvrTilAnsoeger(raa.body)").join(""));

/**
 * Dagsloftet tjekkes før opslaget — i handler-kroppen.
 *
 * NY PRÆMIS 19/9: loftet LÆSES nu også pr. kald (hentLoft → app_config),
 * og læsningen skal ske før opslaget, ikke bare tællingen. Ellers kunne et
 * hævet loft først gælde fra næste ansøger.
 */
export function dagsloftFoerOpslag(cvr: string): boolean {
  const krop = serveKrop(cvr);
  const taelling = krop.indexOf("opslagIDag(");
  const laesning = krop.indexOf("hentLoft(");
  const opslag = krop.indexOf("hentDataCvrRaa(");
  return taelling > 0 && laesning > 0 && opslag > 0 && taelling < opslag && laesning < opslag;
}

/**
 * Kladde-påmindelsen er en TRAPPE i den fælles rykkerkø (Jonas D6, 18/9) —
 * ikke en cron for sig: gem planlægger den efter opret-insert'en og efter
 * hver gem-update (planlaegKladde, A's motor), og ingen fil hedder
 * ansoegning-paamindelse-cron. Ankeret er rækkens updated_at (sidste gem).
 */
export function kladdenPlanlaeggesEfterSkrivning(gem: string): boolean {
  const krop = serveKrop(gem);
  const insert = krop.indexOf('.insert({ kilde');
  const insertKald = krop.indexOf("await planlaegKladde(adminClient, data, new Date())");
  const update = krop.indexOf(".update(opdatering)");
  const updateKald = krop.indexOf("await planlaegKladde(adminClient, gemt, new Date())");
  // NY PRÆMIS 19/9 kl. 22.30: gem-grenens select bærer nu også `kilde`, fordi
  // «Ansoegning paabegyndt» flyttede hertil og skal kende kilden. Værnet
  // krævede før den NØJAGTIGE streng og faldt på en tilføjet kolonne — det
  // målte formen, ikke behovet. Nu kræves de FELTER, planlægningen bruger:
  // en ekstra kolonne er harmløs, en manglende falder stadig.
  const selects = [...krop.matchAll(/\.select\("([^"]+)"\)/g)].map((m) => m[1].split(",").map((f) => f.trim()));
  const baerer = (kraevede: string[]) => selects.some((felter) => kraevede.every((f) => felter.includes(f)));
  return insert >= 0 && insertKald > insert && update >= 0 && updateKald > update &&
    baerer(["id", "token", "email", "updated_at", "indsendt_at"]) &&
    baerer(["id", "email", "updated_at", "indsendt_at"]);
}
export const ingenEgenCron = (funktioner: string[]): boolean => !funktioner.includes("ansoegning-paamindelse-cron");

/** config.toml: gem/cvr false med begrundelse i kommentar; ingen blok for en kladde-cron. */
export function configErRigtig(config: string): boolean {
  const blok = (navn: string) => config.match(new RegExp(`\\[functions\\.${navn}\\]\\s*\\n\\s*verify_jwt = (true|false)`))?.[1] ?? null;
  return blok("ansoegning-gem") === "false" && blok("ansoegning-cvr") === "false" && blok("ansoegning-paamindelse-cron") === null &&
    /# Ansøgningsformularen[\s\S]*verify_jwt = FALSE, bevidst[\s\S]*\[functions\.ansoegning-gem\]/.test(config);
}

/** CI-værnet kender prædikatet. */
export const ciKenderPraedikatet = (ci: string): boolean => /name: "verifyAnsoegningstoken\(\)",\s*pattern: \/\\bverifyAnsoegningstoken\\s\*\\\(\//.test(ci);

/** Tokenhjælperen (A's mønster, ingen SECURITY DEFINER): uuid-tjek FØR opslaget, service-role-select på token KUN hvor indsendt_at er null, aldrig rpc, aldrig kast, fejl → null. */
export const tokenHjaelperenErLukket = (t: string): boolean =>
  /if \(!UUID\.test\(t\)\) return null;[\s\S]*\.from\("ansoegninger"\)[\s\S]*\.eq\("token", t\)[\s\S]*\.is\("indsendt_at", null\)/.test(t) &&
  !t.includes(".rpc(") && t.includes("return null;") && !t.includes("throw ");

/** Intet log-kald i gem/cvr nævner tokenet. */
export function logKald(kilde: string): string[] {
  const ud: string[] = [];
  let fra = 0;
  for (;;) {
    const start = kilde.indexOf("console.", fra);
    if (start === -1) break;
    const slut = kilde.indexOf(");", start);
    ud.push(kilde.slice(start, slut === -1 ? kilde.length : slut + 2));
    fra = slut === -1 ? kilde.length : slut + 2;
  }
  return ud;
}
export const logKaldMedToken = (kilde: string): string[] => logKald(kilde).filter((k) => /\btoken\b/.test(k));

/** slaaCvrOp findes stadig med samme signatur, og fetch'en er blevet i virksomhedsOprettelse.ts (cvrKilde.guard dømmer den). */
export const opslagetErUroert = (o: string): boolean =>
  o.includes("export async function slaaCvrOp(cvr: string): Promise<CvrOpslag>") && o.includes("export async function hentDataCvrRaa(cvr: string): Promise<DataCvrRaa>") && o.includes("udfaldAf(await hentDataCvrRaa(cvr))");

// ── Værnet ───────────────────────────────────────────────────────────────

describe("ansoegning.guard — fladen", () => {
  it("ruten /ansoeg er uguardet som /betal", () => {
    expect(rutenErUguardet(udenKommentarer(laes(APP)))).toBe(true);
  });
  it("fladen dømmer gennem skema.ts og har ingen egne felt-regexer", () => {
    expect(fladenBrugerDommene(udenKommentarer(laes(FLADE)))).toBe(true);
  });
  it("honningfeltet er skjult for mennesker og sendes med «opret»", () => {
    expect(honningfeltErSkjult(udenKommentarer(laes(SKAERM)))).toBe(true);
    expect(honningSendesMedOpret(udenKommentarer(laes(FLADE)))).toBe(true);
  });
  it("samtykkelinjen står på sidste skærm og linker til den uguardede persondata-side", () => {
    expect(samtykkePaaSidsteSkaerm(udenKommentarer(laes(SKAERM)))).toBe(true);
    expect(persondataRutenErUguardet(udenKommentarer(laes(APP)))).toBe(true);
  });
});

describe("ansoegning.guard — ansoegning-gem", () => {
  const gem = udenKommentarer(laes(GEM));
  it("tokenet verificeres før enhver læsning/skrivning på rækken", () => expect(tokenFoerSkrivning(gem)).toBe(true));
  it("opret tæller før insert (fail-closed) og kender honningfeltet", () => expect(opretErBegraenset(gem)).toBe(true));
  it("IP'en gemmes kun som dagshash", () => expect(ipKunSomHash(gem)).toBe(true));
  it("intet log-kald nævner tokenet", () => {
    expect(logKald(gem).length).toBeGreaterThan(0);
    expect(logKaldMedToken(gem)).toEqual([]);
  });
});

describe("ansoegning.guard — ansoegning-cvr", () => {
  const cvr = udenKommentarer(laes(CVR));
  it("tokenet verificeres før cache og opslag", () => expect(tokenFoerSkrivning(cvr)).toBe(true));
  it("opslaget går gennem hentDataCvrRaa — ingen egen fetch", () => expect(cvrGennemHusetsKilde(cvr)).toBe(true));
  it("cachen skriver aldrig den rå body", () => expect(cachenUdenRaaBody(cvr)).toBe(true));
  it("dagsloftet tjekkes før opslaget", () => expect(dagsloftFoerOpslag(cvr)).toBe(true));
  it("intet log-kald nævner tokenet", () => expect(logKaldMedToken(cvr)).toEqual([]));
});

describe("ansoegning.guard — kladde-trappen, token-hjælper, config, CI, opslag", () => {
  it("kladde-påmindelsen planlægges i den fælles kø efter opret og efter gem — og der er ingen cron for sig", () => {
    expect(kladdenPlanlaeggesEfterSkrivning(udenKommentarer(laes(GEM)))).toBe(true);
    expect(ingenEgenCron(readdirSync(resolve(process.cwd(), "supabase/functions")))).toBe(true);
  });
  it("token-hjælperen slår op med service role på token KUN hvor indsendt_at er null, uden rpc, og svarer null ved fejl", () => expect(tokenHjaelperenErLukket(udenKommentarer(laes(TOKEN)))).toBe(true));
  it("VÆRNET VIRKER: uden indsendt_at-filter → falsk; en rpc smuglet ind → falsk; uuid-tjekket væk → falsk", () => {
    const t = udenKommentarer(laes(TOKEN));
    expect(tokenHjaelperenErLukket(t.replace('.is("indsendt_at", null)', ""))).toBe(false);
    expect(tokenHjaelperenErLukket(t + '\nawait adminClient.rpc("x");\n')).toBe(false);
    expect(tokenHjaelperenErLukket(t.replace("if (!UUID.test(t)) return null;", ""))).toBe(false);
  });
  it("config.toml: gem/cvr false med begrundelse, ingen kladde-cron", () => expect(configErRigtig(laes(CONFIG))).toBe(true));
  it("CI-værnet kender verifyAnsoegningstoken", () => expect(ciKenderPraedikatet(laes(CI))).toBe(true));
  it("slaaCvrOp har samme signatur, og fetch'en bor stadig i virksomhedsOprettelse.ts", () => expect(opslagetErUroert(udenKommentarer(laes(OPRETTELSE)))).toBe(true));
});

describe("ansoegning.guard — VÆRNET VIRKER: kopier med fejlen indsat fanges (filerne er ikke rørt)", () => {
  const app = udenKommentarer(laes(APP));
  const flade = udenKommentarer(laes(FLADE));
  const gem = udenKommentarer(laes(GEM));
  const cvr = udenKommentarer(laes(CVR));
  const config = laes(CONFIG);
  const ci = laes(CI);

  it("ruten pakket i MemberRoute → falsk", () => {
    const kopi = app.replace('<Route path="/ansoeg" element={<Ansoeg />} />', '<Route path="/ansoeg" element={<MemberRoute><Ansoeg /></MemberRoute>} />');
    expect(kopi).not.toBe(app);
    expect(rutenErUguardet(kopi)).toBe(false);
  });

  it("honningfeltet uden aria-hidden/tabIndex → falsk; ikke sendt med opret → falsk; samtykke uden link → falsk", () => {
    const skaerm = udenKommentarer(laes(SKAERM));
    expect(honningfeltErSkjult(skaerm.replace("tabIndex={-1}", "tabIndex={0}"))).toBe(false);
    expect(honningfeltErSkjult(skaerm.replace('<div aria-hidden="true" style={HONNING_STIL}>', "<div>"))).toBe(false);
    expect(honningSendesMedOpret(flade.replace("firma: honning", "firma: \"\""))).toBe(false);
    expect(samtykkePaaSidsteSkaerm(skaerm.replace("<Link to={PERSONDATA_STI}", "<span"))).toBe(false);
    expect(persondataRutenErUguardet(app.replace("<AnsoegPersondata />", "<ProtectedRoute><AnsoegPersondata /></ProtectedRoute>"))).toBe(false);
  });

  it("en egen cvr-regex i fladen → falsk; validerFelt fjernet → falsk", () => {
    expect(fladenBrugerDommene(flade + '\nconst ok = /^\\d{8}$/.test(x);\n')).toBe(false);
    const kopi = flade.replace("validerFelt(", "minEgenDom(");
    expect(kopi).not.toBe(flade);
    expect(fladenBrugerDommene(kopi)).toBe(false);
  });

  it("en update før verify → falsk (gem); cache-opslag før verify → falsk (cvr)", () => {
    const kopiGem = gem.replace("const ansoegning = await verifyAnsoegningstoken(token, adminClient);", 'await adminClient.from("ansoegninger").update({ set: 1 }).eq("id", token);\n    const ansoegning = await verifyAnsoegningstoken(token, adminClient);');
    expect(kopiGem).not.toBe(gem);
    expect(tokenFoerSkrivning(kopiGem)).toBe(false);
    const kopiCvr = cvr.replace("const ansoegning = await verifyAnsoegningstoken(token, adminClient);", 'await adminClient.from("cvr_opslag_cache").select("cvr");\n    const ansoegning = await verifyAnsoegningstoken(token, adminClient);');
    expect(kopiCvr).not.toBe(cvr);
    expect(tokenFoerSkrivning(kopiCvr)).toBe(false);
  });

  it("tællingen fail-open (0 ved fejl) → falsk; honningfeltet væk → falsk; rå IP i rækken → falsk", () => {
    expect(opretErBegraenset(gem.replace("Number.MAX_SAFE_INTEGER", "0"))).toBe(false);
    expect(opretErBegraenset(gem.replace("honningfelt", "felt"))).toBe(false);
    expect(ipKunSomHash(gem.replace("ip_hash: ipHash", "ip_hash: ip"))).toBe(false);
  });

  it("en egen fetch i cvr-funktionen → falsk; rå body i upsert → falsk; loftet efter opslaget → falsk", () => {
    expect(cvrGennemHusetsKilde(cvr + "\nconst r = await fetch(url);\n")).toBe(false);
    expect(cachenUdenRaaBody(cvr.replace("{ onConflict: \"cvr\" }", "{ body: raa.body, onConflict: \"cvr\" }"))).toBe(false);
    // Loftet flyttet EFTER opslaget (den nye form, 19/9): både tællingen og
    // læsningen skal stå før hentDataCvrRaa, ellers er kvoten allerede brugt.
    const flyttet = cvr.replace(
      '} else if ((dom = doemLoft(await opslagIDag(adminClient), (loft = await hentLoft(adminClient)))).tilstand === "ramt") {',
      "} else if (false) {",
    );
    expect(flyttet, "mutationen ramte ikke — linjen har skiftet form").not.toBe(cvr);
    expect(dagsloftFoerOpslag(flyttet + "\nif ((await opslagIDag(adminClient)) >= (await hentLoft(adminClient))) {}\n")).toBe(false);
  });

  it("et log-kald med tokenet → fanges", () => {
    expect(logKaldMedToken(gem + '\nconsole.log("token", token);\n')).toHaveLength(1);
    expect(logKaldMedToken(cvr + "\nconsole.error(`fejl for ${token}`);\n")).toHaveLength(1);
  });

  it("kladde-kaldet væk efter opret → falsk; efter gem → falsk; en cron-mappe igen → falsk", () => {
    expect(kladdenPlanlaeggesEfterSkrivning(gem.replace("await planlaegKladde(adminClient, data, new Date());", ""))).toBe(false);
    expect(kladdenPlanlaeggesEfterSkrivning(gem.replace("await planlaegKladde(adminClient, gemt, new Date());", ""))).toBe(false);
    expect(ingenEgenCron(["ansoegning-gem", "ansoegning-paamindelse-cron"])).toBe(false);
  });

  it("config: gem sat til true → falsk; cron sat til false → falsk; begrundelsen væk → falsk", () => {
    expect(configErRigtig(config.replace("[functions.ansoegning-gem]\n    verify_jwt = false", "[functions.ansoegning-gem]\n    verify_jwt = true"))).toBe(false);
    expect(configErRigtig(config + "\n  [functions.ansoegning-paamindelse-cron]\n    verify_jwt = true\n")).toBe(false);
    // split/join, ikke replace: opret-indgangs-checkout bærer samme ordlyd tidligere i filen, og replace rammer kun den første.
    expect(configErRigtig(config.split("verify_jwt = FALSE, bevidst").join("verify_jwt = false"))).toBe(false);
  });

  it("prædikatet fjernet fra CI-værnet → falsk", () => {
    const kopi = ci.replace(/\s*\{ name: "verifyAnsoegningstoken\(\)",[^\n]*\n/, "\n");
    expect(kopi).not.toBe(ci);
    expect(ciKenderPraedikatet(kopi)).toBe(false);
  });
});
