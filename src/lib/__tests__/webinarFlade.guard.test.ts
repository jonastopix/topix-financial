import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANNONCESPOR_KOLONNER } from "@/lib/webinar/kolonner";

/**
 * Kildeværn for webinarfladen (udkast 19/9-2026). Syv domme låser det der
 * ikke kan testes som en ren funktion, og hver beviser sig selv på en kopi
 * med fejlen indsat (ansoegningerFlade.guard-mønstret):
 *
 *   1. Ruten /webinar er lazy og bag AdvisorRoute — aldrig MemberRoute,
 *      aldrig uguardet. Tilmeldtelisten er rådgiverdata.
 *   2. Fladen REGNER INTET: WebinarView grupperer ikke, filtrerer ikke og
 *      fælder ingen dom — ingen .filter/.reduce/new Set/Date.parse/
 *      doemSetGrad. Tallene kommer færdige fra webinarDashboard.
 *   3. Fladen HENTER INTET: ingen supabase i WebinarView eller siden; ét
 *      kald, useWebinarDashboard.
 *   4. Graden er webinarDom's: dashboard.ts importerer doemSetGrad og
 *      SET_GRAENSE_PROCENT og opfinder ALDRIG sin egen 75-grænse. Ellers
 *      ville «så det færdigt» kunne betyde to ting i samme hus.
 *   5. Annoncespor-kolonnerne i lib/webinar/kolonner.ts er præcis
 *      migrationens `add column`-liste — hverken flere eller færre.
 *   6. Hentningen falder KUN tilbage uden annoncesporet på 42703, og enhver
 *      anden fejl kaster gennem kraevRaekker/HentningsFejl. Et halvt svar
 *      der ligner et helt er den værste fejl på en talflade.
 *   7. Menupunktet er alle rådgiveres (ikke bag isPartner som Økonomi), og
 *      HbAktiv kender «webinar».
 *   8. Fordelingssøjlen tegnes af DOMMENS andelAfHelhed — fladen regner
 *      aldrig selv en total ud af rækkerne. (Prod-tallene 19/9: syv rækker
 *      kan ikke læses som en fordeling uden en søjle.)
 *   9. fbclid slår referrer i kildeAf, og tallet vises på fladen. Uden
 *      reglen ville 12 Facebook-klik stå som «direkte»; uden tallet kunne
 *      tilskrivningen ikke efterprøves.
 *  10. OVERSKRIFT OG RÆKKE DELER ÉN GRID-SKABELON (Jonas 19/9, punkt 1).
 *      Fejlen der var: hver havde sit eget grid med en `auto`-kolonne, og
 *      `auto` måles pr. grid — så tallene stod under den forkerte titel.
 *      Værnet nægter `auto` i skabelonerne og kræver at begge bruger den
 *      samme konstant.
 *  12. DE SMÅ BOKSE ER DOMMENS: rækken under den store tegner
 *      naeste.efterfoelgende; grænsen på tre bor i dashboard.ts, ikke i fladen;
 *      ingen graf i de små; tom liste tegner ingenting.
 *  11. «Blev medlem» er HUSETS dom (blevMedlem i ansoegningVisning), ikke
 *      en ny betingelse skrevet her — ellers ville to tal i samme hus
 *      kunne betyde det samme ord forskelligt.
 *  14. TRAGTENS GRÆNSE I TID BOR I DOMMEN: «ansøgt» og «blev medlem» tæller
 *      kun ansøgninger indsendt EFTER sessionen (indsendt_at > session_tid,
 *      skarpt). Grænsen regnes i faellesEfter — ikke i fladen, som hverken må
 *      kende indsendt_at eller filtrere paa tid. Hooken og webinar-delt skal
 *      hente indsendt_at, ellers har dommen intet at maale mod.
 *      (Fejlen 22/9-2026: 6 i «ansoegt», hvoraf én ansoegte 8/7-2025.)
 *  13. BEDØMMELSEN ER DOMMENS: stjernen, tallet og de fem søjler tegnes af
 *      afholdte[].bedoemmelse; skalaen bor i dashboard.ts; fladen dividerer
 *      aldrig med stemmerne, og «ingen stemmer» tegner INTET — ikke «0».
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const APP = "src/App.tsx";
const VIEW = "src/components/hjemmebane/webinar/WebinarView.tsx";
const SIDE = "src/pages/Webinar.tsx";
const DOM = "src/lib/webinar/dashboard.ts";
const KOLONNER = "src/lib/webinar/kolonner.ts";
const HOOK = "src/hooks/webinarDashboard.ts";
const NAV = "src/lib/hjemmebane/hbNav.ts";
const MIGRATION = "supabase/migrations/20260919150000_webinar_annoncespor.sql";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const rutenErRigtig = (app: string): boolean =>
  /<Route path="\/webinar" element=\{<AdvisorRoute><Webinar \/><\/AdvisorRoute>\} \/>/.test(app) &&
  app.includes('const Webinar = lazy(() => import("./pages/Webinar"));') &&
  !/<MemberRoute><Webinar/.test(app) &&
  !/<Route path="\/webinar" element=\{<Webinar/.test(app);

// ── 2 ──────────────────────────────────────────────────────────────────────
/** Ord der betyder «her grupperes eller dømmes» — de hører til i dommen. */
const REGNEORD = [".filter(", ".reduce(", "new Set(", "Date.parse(", "doemSetGrad", "taelDeltagelse("];
export const fladenRegnerIntet = (view: string): boolean => {
  const kode = udenKommentarer(view);
  return REGNEORD.every((o) => !kode.includes(o));
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const fladenHenterIntet = (view: string, side: string): boolean =>
  !view.includes("supabase") && !side.includes("supabase") &&
  view.includes("useWebinarDashboard()") &&
  (view.split("useWebinarDashboard()").length - 1) === 1;

// ── 4 ──────────────────────────────────────────────────────────────────────
export const gradenErWebinarDoms = (dom: string): boolean => {
  const kode = udenKommentarer(dom);
  return kode.includes("doemSetGrad") &&
    /from "@\/lib\/webinarDom"/.test(kode) &&
    kode.includes("SET_GRAENSE_PROCENT") &&
    // Ingen egen grænse: tallet 75 må ikke stå i koden uden for importen.
    !/\b75\b/.test(kode.replace(/SET_GRAENSE_PROCENT/g, ""));
};

// ── 5 ──────────────────────────────────────────────────────────────────────
/** Kolonnenavnene i migrationens `add column if not exists`-linjer. */
export const kolonnerIMigration = (sql: string): string[] =>
  [...sql.matchAll(/add column if not exists\s+"?([a-z_]+)"?\s+text/gi)].map((m) => m[1]);

export const kolonnelistenStemmer = (sql: string, liste: readonly string[]): boolean => {
  const i = [...kolonnerIMigration(sql)].sort();
  const j = [...liste].sort();
  return i.length > 0 && i.length === j.length && i.every((k, n) => k === j[n]);
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const hentningenErForsigtig = (hook: string): boolean => {
  const kode = udenKommentarer(hook);
  // `.data ?? []` gør en FEJL til et TOMT svar (recon-tavse-fejl.md) og er
  // forbudt på de opslag siden ikke kan undvære. ÉN undtagelse er tilladt
  // og navngivet: berigelsen med companies.contract_end_date til «blev
  // medlem» — den MÅ fejle uden at vælte tallene, præcis som
  // hooks/ansoegninger.ts gør det, og den skal så logge fejlen. Alt andet
  // end netop den ene, med netop den log, falder værnet på.
  const bloede = kode.match(/\.data\s*(?:\?\?|\|\|)\s*\[\]/g) ?? [];
  const beriget = bloede.length === 0 ||
    (bloede.length === 1 &&
      /\(vRes\.data \?\? \[\]\)/.test(kode) &&
      /if \(vRes\.error\) console\.error\(/.test(kode));
  return kode.includes("if (!erUkendtKolonne(fuld.error)) throw new HentningsFejl(") &&
    kode.includes("erUkendtKolonne") &&
    // De to opslag siden ikke kan undvære, går gennem kraevRaekker.
    (kode.split("kraevRaekker(").length - 1) >= 3 &&
    beriget &&
    kode.includes('.not("indsendt_at", "is", null)');
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const navpunktetErRigtigt = (nav: string): boolean => {
  const kode = udenKommentarer(nav);
  return kode.includes('| "webinar"') &&
    kode.includes('{ label: "Webinar", to: "/webinar", active: active === "webinar" }') &&
    // Ikke bag isPartner — det er ikke omsætningstal.
    !/isPartner[^\n]*\{ label: "Webinar"/.test(kode);
};

// ── 8 ──────────────────────────────────────────────────────────────────────
export const soejlenErDommens = (view: string, dom: string): boolean => {
  const v = udenKommentarer(view);
  const d = udenKommentarer(dom);
  return v.includes("l.andelAfHelhed") &&
    v.includes("data-spor-andel") &&
    d.includes("andelAfHelhed: andel(d.tilmeldte, helhed)") &&
    // Fladen må ikke selv lægge rækkerne sammen til en nævner.
    !/\.reduce\(/.test(v) &&
    !/tilmeldte\s*\/\s*/.test(v);
};

// ── 9 ──────────────────────────────────────────────────────────────────────
export const fbclidSlaarReferrer = (dom: string, view: string): boolean => {
  const d = udenKommentarer(dom);
  const fb = d.indexOf('if (tekst(r.fbclid) !== null) return "Facebook";');
  const utm = d.indexOf("const kilde = tekst(r.utm_source);");
  const ref = d.indexOf("const henvisning = vaertsnavn(r.referrer)");
  return fb !== -1 && utm !== -1 && ref !== -1 &&
    utm < fb && fb < ref &&
    d.includes("kunFbclid: personRaekker.filter(kunPaaFbclid).length") &&
    udenKommentarer(view).includes("spor.kunFbclid");
};

// ── 10 ─────────────────────────────────────────────────────────────────────
export const opstillingenFlugter = (view: string): boolean => {
  const v = udenKommentarer(view);
  // Skabelonerne findes, er faste (ingen `auto`), og bruges af BÅDE
  // overskrifterne og rækkerne.
  for (const navn of ["TAL_GRID", "SPOR_GRID"]) {
    const m = new RegExp(`const ${navn} =\\s*\n?\\s*"([^"]+)"`).exec(v);
    if (!m) return false;
    if (/\bauto\b/.test(m[1])) return false;
    if (!/repeat\(\d+,/.test(m[1])) return false;
    // Mindst to brugssteder ud over selve erklæringen: header + række.
    if ((v.split(navn).length - 1) < 3) return false;
  }
  return v.includes("<Overskrifter grid={TAL_GRID}") && v.includes("<Overskrifter grid={SPOR_GRID}");
};

// ── 11 ─────────────────────────────────────────────────────────────────────
export const medlemsdommenErHusets = (dom: string): boolean => {
  const d = udenKommentarer(dom);
  return d.includes('import { blevMedlem } from "@/lib/ansoegninger/ansoegningVisning"') &&
    d.includes("blevMedlem(a)") &&
    // Ingen egen betingelse: hverken trinnet eller slutdatoen må sammenlignes her.
    !/trin\s*===\s*["']underskrevet["']/.test(d) &&
    !/virksomhed_slutdato\s*!==\s*null/.test(d);
};

// ── Dommene mod de rigtige filer, og mod en kopi med fejlen indsat ─────────

// ── 12 ─────────────────────────────────────────────────────────────────────
/**
 * DE SMÅ BOKSE ER DOMMENS (21/9-2026). Rækken under den store boks tegner
 * `naeste.efterfoelgende` og intet andet: tallet, tidspunktet og den relative
 * tid er allerede regnet i dashboard.ts, og grænsen på tre bor DÉR — ikke i
 * fladen. Ellers ville /webinar og /delt/webinar kunne vise hver sit antal
 * bokse, for den delte visning tegner den samme dom fra serveren.
 * Ingen graf i de små, og tom liste tegner ingenting.
 */
export const smaaBokseErDommens = (view: string, dom: string): boolean => {
  const v = udenKommentarer(view), d = udenKommentarer(dom);
  const boks = v.slice(v.indexOf("const EfterNaeste = "), v.indexOf("const Naeste = "));
  return (
    d.includes("export const KOMMENDE_EFTER_NAESTE_MAKS = 3;") &&
    /\.slice\(1, 1 \+ KOMMENDE_EFTER_NAESTE_MAKS\)/.test(d) &&
    !v.includes("KOMMENDE_EFTER_NAESTE_MAKS") && !/\.slice\(/.test(boks) &&
    v.includes("sessioner={naeste.efterfoelgende}") &&
    boks.includes("sessioner.map((s) => (") &&
    boks.includes("if (sessioner.length === 0) return null;") &&
    boks.includes('{datoLang(s.sessionTid) ?? "tidspunkt ukendt"}') &&
    boks.includes("{s.omHvorLaenge}") &&
    !boks.includes("TilmeldtKurve") && !boks.includes("prDag") &&
    /<Naeste naeste=\{naeste\} \/>\s*\n\s*\{naeste !== null && <EfterNaeste sessioner=\{naeste\.efterfoelgende\} \/>\}/.test(v) &&
    v.includes("<NaesteAfsnit naeste={dom.naeste} />")
  );
};

// ── 13 ─────────────────────────────────────────────────────────────────────
/**
 * BEDØMMELSEN ER DOMMENS (22/9-2026). Elementet ved hver afholdt session
 * tegner `s.bedoemmelse` og intet andet: gennemsnittet er formateret i
 * dommen (`gennemsnitTekst`), ordet «stemmer» bøjes i dommen (`stemmerOrd`),
 * søjlernes højde er dommens `andel`, og skalaen (BEDOEMMELSE_MAKS) står i
 * dashboard.ts — ikke i fladen, for /webinar og /delt/webinar tegner det
 * SAMME dom, og to skalaer ville give to billeder af samme session.
 *
 * Og: ingen stemmer tegner INTET. En tom bedømmelse ville stå som «0 · 0
 * stemmer» og ligne en måling, hvor der ikke er nogen.
 */
export const bedoemmelsenErDommens = (view: string, dom: string): boolean => {
  const v = udenKommentarer(view), d = udenKommentarer(dom);
  const i = v.indexOf("const Bedoemmelsen = "), j = v.indexOf("const AfholdtRaekke = ");
  if (i === -1 || j === -1 || i > j) return false;
  const boks = v.slice(i, j);
  return (
    // Dommen: skalaen, tallet pr. session, og at «ingen stemmer» er null.
    d.includes("export const BEDOEMMELSE_MAKS = 5;") &&
    d.includes("bedoemmelse: bedoemmelse(liste),") &&
    d.includes("if (stemmer === 0) return null;") &&
    d.includes("andel: andel(a, stemmer)") &&
    // Fladen: dommens fordeling, dommens tekst, dommens bøjning.
    boks.includes("b.fordeling.map((t) => (") &&
    boks.includes("{b.gennemsnitTekst}") &&
    boks.includes("{stemmerOrd(b.stemmer)}") &&
    boks.includes("(t.andel ?? 0) * 100") &&
    // Tom bedømmelse tegner intet.
    v.includes("{s.bedoemmelse !== null && (") &&
    // Ingen skala og ingen regning i fladen.
    !boks.includes("BEDOEMMELSE_MAKS") &&
    !/\/\s*b\.stemmer/.test(v) &&
    !v.includes("stemmer === 0") &&
    !/"0 stemmer"|'0 stemmer'/.test(v)
  );
};

// ── 14 ──────────────────────────────────────────────────────────────────────
/**
 * Graensen er dommens. Tre ting skal holde paa én gang:
 *   a) dommen HAR graensen, skarp, ét sted (faellesEfter med t > g),
 *   b) begge led bruger den (ansoegte OG blevMedlem i afholdteSessioner),
 *   c) begge hentere beder om indsendt_at — uden den er maengden tom.
 * Og fladen maa hverken kende feltet eller filtrere paa tid.
 */
export const graensenBorIDommen = (dom: string, view: string, hook: string, delt: string): boolean => {
  const d = udenKommentarer(dom);
  const v = udenKommentarer(view);
  return (
    d.includes("function faellesEfter(") &&
    d.includes("if (g === null || t > g) n++;") &&
    !/t >= g/.test(d) &&
    d.includes("const a = faellesEfter(mails, ansoegte, graense);") &&
    d.includes("const m = faellesEfter(mails, medlemmer, graense);") &&
    /select\("email, indsendt_at, trin, company_id"\)/.test(udenKommentarer(hook)) &&
    /select\("email, indsendt_at, trin, company_id"\)/.test(udenKommentarer(delt)) &&
    !v.includes("indsendt_at") &&
    !/session_tid[\s\S]{0,40}[<>]/.test(v)
  );
};

const DELT = "supabase/functions/webinar-delt/index.ts";

describe("webinarfladens kildeværn", () => {
  it("1. ruten /webinar er lazy og bag AdvisorRoute", () => {
    const app = laes(APP);
    expect(rutenErRigtig(app)).toBe(true);
    expect(rutenErRigtig(app.replace("<AdvisorRoute><Webinar /></AdvisorRoute>", "<MemberRoute><Webinar /></MemberRoute>"))).toBe(false);
    expect(rutenErRigtig(app.replace('const Webinar = lazy(() => import("./pages/Webinar"));', ""))).toBe(false);
  });

  it("2. fladen grupperer ikke og fælder ingen dom", () => {
    const view = laes(VIEW);
    expect(fladenRegnerIntet(view)).toBe(true);
    for (const ord of REGNEORD) {
      expect(fladenRegnerIntet(`${view}\nconst snyd = raekker${ord}x);`), ord).toBe(false);
    }
  });

  it("3. fladen henter intet selv — ét kald, ingen supabase", () => {
    const view = laes(VIEW), side = laes(SIDE);
    expect(fladenHenterIntet(view, side)).toBe(true);
    expect(fladenHenterIntet(`${view}\nsupabase.from("webinar_tilmeldinger");`, side)).toBe(false);
    expect(fladenHenterIntet(view, `${side}\nsupabase.from("ansoegninger");`)).toBe(false);
    expect(fladenHenterIntet(view.replace("useWebinarDashboard()", "useWebinarDashboard() ?? useWebinarDashboard()"), side)).toBe(false);
  });

  it("4. graden er webinarDom's — dommen opfinder ikke sin egen 75-grænse", () => {
    const dom = laes(DOM);
    expect(gradenErWebinarDoms(dom)).toBe(true);
    expect(gradenErWebinarDoms(dom.replace(/doemSetGrad/g, "egenDom"))).toBe(false);
    expect(gradenErWebinarDoms(`${dom}\nconst egenGraense = 75;`)).toBe(false);
  });

  it("5. annoncespor-kolonnerne er ordret migrationens", () => {
    const sql = laes(MIGRATION);
    expect(kolonnerIMigration(sql)).toHaveLength(15);
    expect(kolonnelistenStemmer(sql, ANNONCESPOR_KOLONNER)).toBe(true);
    expect(kolonnelistenStemmer(sql, [...ANNONCESPOR_KOLONNER, "gclid"])).toBe(false);
    expect(kolonnelistenStemmer(sql, ANNONCESPOR_KOLONNER.slice(1))).toBe(false);
    // Og listen i lib er den fladen faktisk henter på.
    expect(laes(KOLONNER)).toContain('"fbclid"');
  });

  it("6. hentningen falder kun tilbage på 42703 og kaster ellers", () => {
    const hook = laes(HOOK);
    expect(hentningenErForsigtig(hook)).toBe(true);
    expect(hentningenErForsigtig(hook.replace("if (!erUkendtKolonne(fuld.error)) throw new HentningsFejl(", "if (false) throw new HentningsFejl("))).toBe(false);
    // Et EKSTRA blødt opslag — ud over den ene navngivne berigelse — falder.
    expect(hentningenErForsigtig(`${hook}\nconst r = res.data ?? [];`)).toBe(false);
    // Berigelsen uden sin fejllog falder også: et tavst fald er det værnet findes for.
    expect(hentningenErForsigtig(hook.replace("if (vRes.error) console.error(", "if (false) noop("))).toBe(false);
    expect(hentningenErForsigtig(hook.replace('.not("indsendt_at", "is", null)', ""))).toBe(false);
  });

  it("8. fordelingssøjlen tegnes af dommens andel, ikke af fladens egen sum", () => {
    const view = laes(VIEW), dom = laes(DOM);
    expect(soejlenErDommens(view, dom)).toBe(true);
    expect(soejlenErDommens(view.replace(/l\.andelAfHelhed/g, "0.5"), dom)).toBe(false);
    expect(soejlenErDommens(`${view}\nconst total = raekker.reduce((a, b) => a + b, 0);`, dom)).toBe(false);
    expect(soejlenErDommens(view, dom.replace("andelAfHelhed: andel(d.tilmeldte, helhed)", "andelAfHelhed: null"))).toBe(false);
  });

  it("9. fbclid slår referrer, og de tilskrevne kan efterprøves på fladen", () => {
    const dom = laes(DOM), view = laes(VIEW);
    expect(fbclidSlaarReferrer(dom, view)).toBe(true);
    // Fjernes reglen, falder værnet.
    expect(fbclidSlaarReferrer(dom.replace('if (tekst(r.fbclid) !== null) return "Facebook";', ""), view)).toBe(false);
    // Flyttes den EFTER referreren, falder værnet også — rækkefølgen er dommen.
    const byttet = dom
      .replace('if (tekst(r.fbclid) !== null) return "Facebook";\n', "")
      .replace("if (henvisning !== null) return henvisning;", 'if (henvisning !== null) return henvisning;\n  if (tekst(r.fbclid) !== null) return "Facebook";');
    expect(fbclidSlaarReferrer(byttet, view)).toBe(false);
    // Skjules tallet på fladen, falder værnet.
    expect(fbclidSlaarReferrer(dom, view.replace(/spor\.kunFbclid/g, "0"))).toBe(false);
  });

  it("10. overskrifter og rækker deler én fast grid-skabelon", () => {
    const view = laes(VIEW);
    expect(opstillingenFlugter(view)).toBe(true);
    // Præcis fejlen Jonas så: en auto-kolonne, der måles pr. grid.
    expect(opstillingenFlugter(view.replace("repeat(5,2.75rem)", "repeat(5,auto)"))).toBe(false);
    // Overskriften holder op med at bruge skabelonen.
    expect(opstillingenFlugter(view.replace("<Overskrifter grid={TAL_GRID}", "<Overskrifter grid={\"grid grid-cols-6\"}"))).toBe(false);
    expect(opstillingenFlugter(view.replace(/SPOR_GRID/g, "x"))).toBe(false);
  });

  it("14. tragtens grænse i tid bor i dommen — fladen regner ikke selv", () => {
    const dom = laes(DOM), view = laes(VIEW), hook = laes(HOOK), delt = laes(DELT);
    expect(graensenBorIDommen(dom, view, hook, delt)).toBe(true);
    // Grænsen fjernet, eller gjort blød: begge er fejlen fra 22/9 igen.
    expect(graensenBorIDommen(dom.split("if (g === null || t > g) n++;").join("if (g === null || t >= g) n++;"), view, hook, delt)).toBe(false);
    expect(graensenBorIDommen(dom.split("const a = faellesEfter(mails, ansoegte, graense);").join("const a = faellesAntal(mails, new Set(ansoegte.keys()));"), view, hook, delt)).toBe(false);
    // «Blev medlem» sluppet uden om grænsen, mens «ansøgt» beholder den.
    expect(graensenBorIDommen(dom.split("const m = faellesEfter(mails, medlemmer, graense);").join("const m = faellesAntal(mails, new Set(medlemmer.keys()));"), view, hook, delt)).toBe(false);
    // Tidspunktet hentes ikke — dommen har intet at måle mod.
    expect(graensenBorIDommen(dom, view, hook.split("email, indsendt_at, trin, company_id").join("email, trin, company_id"), delt)).toBe(false);
    expect(graensenBorIDommen(dom, view, hook, delt.split("email, indsendt_at, trin, company_id").join("email, trin, company_id"))).toBe(false);
    // Fladen begynder at regne selv.
    expect(graensenBorIDommen(dom, `${view}\nconst egne = a.filter((x) => x.indsendt_at > s.sessionTid);`, hook, delt)).toBe(false);
  });

  it("11. «blev medlem» er husets dom, ikke en ny betingelse", () => {
    const dom = laes(DOM);
    expect(medlemsdommenErHusets(dom)).toBe(true);
    expect(medlemsdommenErHusets(dom.replace(/blevMedlem\(a\)/g, 'a.trin === "underskrevet"'))).toBe(false);
    expect(medlemsdommenErHusets(`${dom}\nconst egen = a.trin === "underskrevet" && a.virksomhed_slutdato !== null;`)).toBe(false);
  });

  it("7. menupunktet er alle rådgiveres, og HbAktiv kender «webinar»", () => {
    const nav = laes(NAV);
    expect(navpunktetErRigtigt(nav)).toBe(true);
    expect(navpunktetErRigtigt(nav.replace('| "webinar"', ""))).toBe(false);
    expect(navpunktetErRigtigt(nav.replace('{ label: "Webinar", to: "/webinar", active: active === "webinar" }', ""))).toBe(false);
  });

  it("12. de små bokse tegner dommens efterfoelgende — grænsen bor i dommen, ingen graf, tom liste tegner intet", () => {
    expect(smaaBokseErDommens(laes(VIEW), laes(DOM))).toBe(true);
  });

  it("13. bedømmelsen tegner dommens tal og fordeling — skalaen bor i dommen, tom bedømmelse tegner intet", () => {
    expect(bedoemmelsenErDommens(laes(VIEW), laes(DOM))).toBe(true);
  });

  it("13b. en skala i fladen, en regning på stemmerne, eller et element uden stemmer, fælder dom 13", () => {
    const view = laes(VIEW), dom = laes(DOM);
    // Skalaen gentaget i fladen: /webinar og /delt/webinar kunne vise hver sit billede.
    expect(bedoemmelsenErDommens(view.replace("{stemmerOrd(b.stemmer)}", "{stemmerOrd(b.stemmer)}{BEDOEMMELSE_MAKS}"), dom)).toBe(false);
    // Skalaen flyttet i dommen uden at fladen følger med.
    expect(bedoemmelsenErDommens(view, dom.replace("export const BEDOEMMELSE_MAKS = 5;", "export const BEDOEMMELSE_MAKS = 10;"))).toBe(false);
    // Fladen regner selv en andel ud af stemmerne.
    expect(bedoemmelsenErDommens(`${view}\nconst egen = t.antal / b.stemmer;`, dom)).toBe(false);
    // Tom bedømmelse tegner en tom stribe i stedet for ingenting.
    expect(bedoemmelsenErDommens(view.replace("{s.bedoemmelse !== null && (", "{true && ("), dom)).toBe(false);
    // «0 stemmer» skrevet i fladen.
    expect(bedoemmelsenErDommens(view.replace("{stemmerOrd(b.stemmer)}", '"0 stemmer"'), dom)).toBe(false);
    // Nul-bedømmelsen tilbage i dommen: så ville hver session uden stemmer få et element.
    expect(bedoemmelsenErDommens(view, dom.replace("if (stemmer === 0) return null;", ""))).toBe(false);
    // Fordelingen hjemmelavet i fladen i stedet for dommens.
    expect(bedoemmelsenErDommens(view.replace("b.fordeling.map((t) => (", "[1, 2, 3, 4, 5].map((t) => ("), dom)).toBe(false);
    // Bedømmelsen koblet fra sessionen i dommen.
    expect(bedoemmelsenErDommens(view, dom.replace("bedoemmelse: bedoemmelse(liste),", ""))).toBe(false);
  });

  it("12b. grænsen flyttet til fladen, en graf i de små, eller en tom liste der tegner en stribe, fælder dom 12", () => {
    const view = laes(VIEW), dom = laes(DOM);
    // Grænsen gentaget i fladen: /webinar og /delt/webinar kunne vise hver sit antal bokse.
    expect(smaaBokseErDommens(view.replace("sessioner.map((s) => (", "sessioner.slice(0, 3).map((s) => ("), dom)).toBe(false);
    // Grænsen væk af dommen.
    expect(smaaBokseErDommens(view, dom.replace("export const KOMMENDE_EFTER_NAESTE_MAKS = 3;", "export const KOMMENDE_EFTER_NAESTE_MAKS = 99;"))).toBe(false);
    // «Spring den næste over» fjernet — så ville den store boks også stå som en lille.
    expect(smaaBokseErDommens(view, dom.replace(".slice(1, 1 + KOMMENDE_EFTER_NAESTE_MAKS)", ".slice(0, KOMMENDE_EFTER_NAESTE_MAKS)"))).toBe(false);
    // En graf i de små.
    expect(smaaBokseErDommens(view.replace("{s.omHvorLaenge}", "{s.omHvorLaenge}<TilmeldtKurve prDag={[]} />"), dom)).toBe(false);
    // Tom liste tegner en tom stribe i stedet for ingenting.
    expect(smaaBokseErDommens(view.replace("if (sessioner.length === 0) return null;", ""), dom)).toBe(false);
    // Rækken koblet fra den store boks.
    expect(smaaBokseErDommens(view.replace("<NaesteAfsnit naeste={dom.naeste} />", "<Naeste naeste={dom.naeste} />"), dom)).toBe(false);
  });
});
