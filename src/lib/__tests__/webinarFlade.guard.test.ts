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
  return kode.includes("if (!erUkendtKolonne(fuld.error)) throw new HentningsFejl(") &&
    kode.includes("erUkendtKolonne") &&
    // Begge opslag går gennem kraevRaekker — ingen `res.data ?? []`.
    (kode.split("kraevRaekker(").length - 1) >= 3 &&
    !/\.data\s*\|\|\s*\[\]/.test(kode) &&
    !/\.data\s*\?\?\s*\[\]/.test(kode) &&
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

// ── Dommene mod de rigtige filer, og mod en kopi med fejlen indsat ─────────

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
    expect(hentningenErForsigtig(`${hook}\nconst r = res.data ?? [];`)).toBe(false);
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

  it("7. menupunktet er alle rådgiveres, og HbAktiv kender «webinar»", () => {
    const nav = laes(NAV);
    expect(navpunktetErRigtigt(nav)).toBe(true);
    expect(navpunktetErRigtigt(nav.replace('| "webinar"', ""))).toBe(false);
    expect(navpunktetErRigtigt(nav.replace('{ label: "Webinar", to: "/webinar", active: active === "webinar" }', ""))).toBe(false);
  });
});
