import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Kildeværn for seerens flade, skive 2 (30/9-2026). Hver dom har en MUTATION,
 * der viser, at værnet fælder den fejl, det er sat til at fange.
 *
 *   1. PERSONFELTER KUN GENNEM DE NAVNGIVNE UNDTAGELSER: kun webinar-rum bruger
 *      findMotorForbudteMed, «hilsen» i præcis ét svar (tilstand), «forudfyld» i
 *      præcis ét — og begge efter tokenet.
 *   2. GEN_TILMELD ARVER ANNONCESPORET, ALDRIG SAMTYKKET.
 *   3. INGEN TREDJEPARTS-TRACKING OG INGEN VARIG LAGRING på seerens flade:
 *      ingen pixel/GTM/GA, ingen localStorage, ingen cookie; sessionStorage KUN
 *      i lager.ts (spec §C6).
 *   4. HOOKS I TOPBLOKKEN (React #310): ingen hook efter den første betingede
 *      return i rummet, tilmeldingen og siden.
 *   5. RUTERNE ER OFFENTLIGE OG I INGEN MENU: /w/-ruterne står uden guard i
 *      App.tsx, og intet andet sted i src/ linker til /w/.
 *   6. TOKENET TIL ANSØGNINGEN STÅR I FRAGMENTET: ansoegUrl bruger «#wt=», og
 *      sporets landing skræller fragmentet af (begge spejle).
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const RUM = "supabase/functions/webinar-rum/index.ts";
const utenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function alleFiler(dir: string, endelser: RegExp): string[] {
  const ud: string[] = [];
  for (const n of readdirSync(resolve(ROD, dir))) {
    const p = join(dir, n);
    if (statSync(resolve(ROD, p)).isDirectory()) ud.push(...alleFiler(p, endelser));
    else if (endelser.test(p)) ud.push(p);
  }
  return ud;
}

// ── 1. Undtagelserne ─────────────────────────────────────────────────────────

export function undtagelserHoldt(rum: string): boolean {
  const k = utenKommentarer(rum);
  const hilsen = [...k.matchAll(/,\s*200,\s*"hilsen"\)/g)].length;
  const forudfyld = [...k.matchAll(/,\s*200,\s*"forudfyld"\)/g)].length;
  const post = k.slice(k.indexOf("req.json()"));
  const verify = post.indexOf("verifyDeltagertoken(");
  const brug = post.search(/"(hilsen|forudfyld)"\)/);
  return hilsen === 1 && forudfyld === 1 && verify > 0 && brug > verify;
}

describe("webinarRum.guard 1 — personfelter kun gennem de navngivne undtagelser", () => {
  it("kun webinar-rum bruger findMotorForbudteMed", () => {
    const brugere = alleFiler("supabase/functions", /\.ts$/).filter((f) => !f.includes("_shared/webinarMotor/svar.ts") && /findMotorForbudteMed/.test(laes(f)));
    expect(brugere).toEqual([RUM]);
  });
  it("«hilsen» og «forudfyld» i præcis ét svar hver, efter tokenet", () => {
    expect(undtagelserHoldt(laes(RUM))).toBe(true);
  });
  it("MUTATION: et ekstra svar med «forudfyld» fanges", () => {
    const m = laes(RUM).replace('return json({ fejl: "ukendt_handling" }, 400);', 'return json({ forudfyld: {} }, 200, "forudfyld");');
    expect(m).not.toBe(laes(RUM));
    expect(undtagelserHoldt(m)).toBe(false);
  });
});

// ── 2. gen_tilmeld ───────────────────────────────────────────────────────────

export function arverIkkeSamtykke(rum: string): boolean {
  const m = rum.match(/const ARVET_SPOR = "([^"]+)";/);
  if (!m) return false;
  const felter = m[1].split(",").map((f) => f.trim());
  return felter.includes("fbclid") && felter.includes("utm_source") && !felter.some((f) => /samtykke|token|ip_dagshash|user_agent|email/.test(f));
}

describe("webinarRum.guard 2 — gen_tilmeld arver annoncesporet, aldrig samtykket", () => {
  it("ARVET_SPOR har sporet og intet andet", () => {
    expect(arverIkkeSamtykke(laes(RUM))).toBe(true);
  });
  it("MUTATION: samtykket i arven fanges", () => {
    const m = laes(RUM).replace('fbc_cookie, ga_client_id";', 'fbc_cookie, ga_client_id, samtykke_nyhedsbrev_at";');
    expect(m).not.toBe(laes(RUM));
    expect(arverIkkeSamtykke(m)).toBe(false);
  });
});

// ── 3. Ingen tracking, ingen varig lagring ───────────────────────────────────

const FLADE = [
  ...alleFiler("src/components/webinarRum", /\.tsx?$/),
  ...alleFiler("src/lib/webinarRum", /\.ts$/),
  "src/pages/WebinarSide.tsx",
  "src/hooks/useWebinarForudfyld.ts",
];
const TRACKING = /\b(gtag|fbq|_fbq|dataLayer|lintrk)\b|googletagmanager|connect\.facebook|localStorage|document\.cookie|indexedDB/;

export function fladenErRen(filer: Array<[string, string]>): string[] {
  const fejl: string[] = [];
  for (const [f, kilde] of filer) {
    const k = utenKommentarer(kilde);
    if (TRACKING.test(k)) fejl.push(`${f}: tracking eller varig lagring`);
    if (/sessionStorage/.test(k) && !f.endsWith("src/lib/webinarRum/lager.ts")) fejl.push(`${f}: sessionStorage uden for lager.ts`);
  }
  return fejl;
}

describe("webinarRum.guard 3 — ingen tredjeparts-tracking og ingen varig lagring", () => {
  it("fladen er ren", () => {
    expect(FLADE.length).toBeGreaterThan(12);
    expect(fladenErRen(FLADE.map((f) => [f, laes(f)]))).toEqual([]);
  });
  it("MUTATION: en pixel eller localStorage fanges", () => {
    const f = "src/components/webinarRum/WebinarTilmelding.tsx";
    expect(fladenErRen([[f, laes(f).replace("setKvittering(svar);", "setKvittering(svar);\n      window.fbq?.('track', 'CompleteRegistration');")]])).not.toEqual([]);
    expect(fladenErRen([[f, laes(f).replace("setKvittering(svar);", 'setKvittering(svar);\n      localStorage.setItem("x", "y");')]])).not.toEqual([]);
    expect(fladenErRen([["src/pages/WebinarSide.tsx", 'sessionStorage.setItem("t", "x")']])).not.toEqual([]);
  });
});

// ── 4. Hooks i topblokken ────────────────────────────────────────────────────

/** Ingen hook-kald på komponentens øverste niveau efter den første betingede return. */
export function hooksFoerReturn(kilde: string, komponent: string): boolean {
  const k = utenKommentarer(kilde);
  const start = k.search(new RegExp(`export (default )?function ${komponent}\\(`));
  if (start < 0) return false;
  const krop = k.slice(start);
  const foersteReturn = krop.search(/\n {2}(if \(|return\b)/);
  if (foersteReturn < 0) return false;
  const hooks = [...krop.matchAll(/\n {2}(?:(?:const|let) [^=\n]+= )?use[A-Z]\w*\(/g)].map((m) => m.index ?? 0);
  return hooks.length > 0 && Math.max(...hooks) < foersteReturn;
}

const KOMPONENTER: Array<[string, string]> = [
  ["src/components/webinarRum/WebinarRum.tsx", "WebinarRum"],
  ["src/components/webinarRum/WebinarTilmelding.tsx", "WebinarTilmelding"],
  ["src/pages/WebinarSide.tsx", "WebinarSide"],
];

describe("webinarRum.guard 4 — hooks i topblokken (React #310)", () => {
  for (const [f, navn] of KOMPONENTER) {
    it(`${navn}: ingen hook efter den første betingede return`, () => {
      expect(hooksFoerReturn(laes(f), navn)).toBe(true);
    });
  }
  it("MUTATION: en hook efter en return fanges", () => {
    const f = "src/components/webinarRum/WebinarRum.tsx";
    const m = laes(f).replace("  const w = tilstand.webinar;", "  const [sen] = useState(0);\n  const w = tilstand.webinar;");
    expect(m).not.toBe(laes(f));
    expect(hooksFoerReturn(m, "WebinarRum")).toBe(false);
  });
});

// ── 5. Ruterne ───────────────────────────────────────────────────────────────

describe("webinarRum.guard 5 — offentlige ruter i ingen menu", () => {
  it("de tre /w/-ruter står uden guard i App.tsx", () => {
    const app = laes("src/App.tsx");
    expect(app).toContain('<Route path="/w/:slug" element={<WebinarSide />} />');
    expect(app).toContain('<Route path="/w/:slug/tilmeld" element={<WebinarSide visning="tilmeld" />} />');
    expect(app).toContain('<Route path="/w/:slug/kalender" element={<WebinarSide visning="kalender" />} />');
  });
  it("intet andet sted i src/ linker til /w/", () => {
    // sentryRens.ts (3/10) nævner stien for at RENSE tokenet ud af Sentry — den linker ikke.
    const tilladt = new Set(["src/App.tsx", "src/pages/WebinarSide.tsx", "src/lib/webinarMotor/token.ts", "src/lib/sentryRens.ts"]);
    const linkere = alleFiler("src", /\.tsx?$/)
      .filter((f) => !tilladt.has(f) && !f.includes("__tests__"))
      .filter((f) => /["'`]\/w\//.test(utenKommentarer(laes(f))));
    expect(linkere).toEqual([]);
  });
});

// ── 6. Fragmentet ────────────────────────────────────────────────────────────

describe("webinarRum.guard 6 — tokenet til ansøgningen står i fragmentet", () => {
  it("ansoegUrl bygger «#wt=», aldrig «?wt=» eller «&wt=»", () => {
    const k = utenKommentarer(laes("src/lib/webinarRum/links.ts"));
    expect(k).toMatch(/\/ansoeg\?kilde=webinar#\$\{WT_FRAGMENT\}=/);
    expect(k).not.toMatch(/[?&]\$\{WT_FRAGMENT\}=|[?&]wt=/);
  });
  it("sporets landing skræller fragmentet af — i begge spejle", () => {
    for (const f of ["src/lib/ansoegning/skema.ts", "supabase/functions/_shared/ansoegningSkema.ts"]) {
      const k = laes(f);
      const fn = k.slice(k.indexOf("export function landingUdenToken("));
      expect(fn.slice(0, 500)).toContain('u.hash = "";');
    }
  });
});
