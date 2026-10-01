import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { erInternEllerProeve, INTERNE_DOMAENER, PROEVE_ID_PRAEFIKS, RING_INDEN_TIMER, sidenOrd, VARME_FLAG_INDEN, VARME_LEADS_DAGE, varmeLeads } from "@/lib/webinar/varmeLeads";
import type { AnsoegerMail, Tilmelding } from "@/lib/webinar/dashboard";
import { bygDeltSvar, findForbudteNoegler, FORBUDTE_NOEGLER } from "../../../../supabase/functions/_shared/webinarDelingSvar.ts";
import { FIXTURE } from "../../__tests__/webinarDashboard.paritet.test";

/**
 * Varme leads (udkast 1/10-2026). To ting prøves:
 *   1. DOMMEN: «set» (webinarDom) på en afholdt session inden for 14 dage —
 *      grænsen inklusiv —, ingen ansøgning (mail ELLER kobling), én linje pr.
 *      person, nyeste først, og Nicklas' 24-timersflag.
 *   2. KILDEVÆRN: listen er persondata og findes KUN på rådgiverens /webinar —
 *      aldrig i webinar-delt, aldrig i den delte side, og et delt-svar med den
 *      ville blive afvist.
 */

const NU = new Date("2026-10-01T12:00:00.000Z");
const H = 3_600_000;
const foer = (ms: number) => new Date(NU.getTime() - ms).toISOString();

const R = (email: string, session_tid: string | null, ekstra: Partial<Tilmelding> = {}): Tilmelding => ({
  ewebinar_id: `id-${email}-${session_tid}`, email, navn: `Navn ${email[0].toUpperCase()}`, webinar_id: "w1", webinar_titel: "Styr på tallene",
  session_tid, session_type: "Scheduled", registreret_at: "2026-09-10T09:00:00.000Z", state: "Watched", sidste_action: null,
  attended: "true", subscribed: null, set_procent: 80, set_procent_kilde: "watchedPercentage", ...ekstra,
}) as Tilmelding;
const A = (email: string, indsendt_at: string | null, ekstra: Partial<AnsoegerMail> = {}): AnsoegerMail => ({
  email, indsendt_at, trin: "ny", virksomhed_slutdato: null, ...ekstra,
});

describe("varmeLeads — dommen", () => {
  it("konstanterne er Nicklas' frist og listens hukommelse", () => {
    expect(RING_INDEN_TIMER).toBe(24);
    expect(VARME_LEADS_DAGE).toBe(14);
  });

  it("set inden for 14 dage og uden ansøgning — nyeste først, 24-timersflaget", () => {
    const l = varmeLeads([
      R("a@x.dk", foer(3 * H)),
      R("b@x.dk", foer(5 * 24 * H), { set_procent: 92 }),
      R("c@x.dk", foer(24 * H)),                           // præcis 24 t: stadig inden for
      R("d@x.dk", foer(24 * H + 1)),                       // 1 ms over: ikke
    ], [], NU);
    expect(l.map((x) => x.email)).toEqual(["a@x.dk", "c@x.dk", "d@x.dk", "b@x.dk"]);
    expect(l.map((x) => x.begyndtInden24Timer)).toEqual([true, true, false, false]);
    expect(l[0]).toMatchObject({ navn: "Navn A", procent: 80, timerSiden: 3, sidenOrd: "webinaret begyndte for 3 timer siden", titel: "Styr på tallene" });
    expect(l[3]).toMatchObject({ procent: 92, sidenOrd: "webinaret begyndte for 5 dage siden" });
    expect(VARME_FLAG_INDEN).toBe("begyndte inden for 24 timer");
  });

  it("vinduet: præcis 14 dage er med, 1 ms mere er ikke; en kommende session er ikke med", () => {
    const l = varmeLeads([
      R("a@x.dk", foer(14 * 24 * H)),
      R("b@x.dk", foer(14 * 24 * H + 1)),
      R("c@x.dk", new Date(NU.getTime() + H).toISOString()),
      R("d@x.dk", null, { session_type: "Replay" }),      // ingen tid: kan ikke ligge «inden for 14 dage»
    ], [], NU);
    expect(l.map((x) => x.email)).toEqual(["a@x.dk"]);
  });

  it("kun «set» (≥ 75 %) — delvist, mødte ikke op og ukendt er ikke leads", () => {
    const l = varmeLeads([
      R("a@x.dk", foer(H), { set_procent: 75 }),
      R("b@x.dk", foer(H), { set_procent: 74 }),
      R("c@x.dk", foer(H), { state: "Missed", attended: null, set_procent: null }),
      R("d@x.dk", foer(H), { state: "Registered", attended: null, set_procent: null }),
      R("e@x.dk", foer(H), { set_procent: null, attended: null, state: "Watched" }), // eWebinars tilstand: set
    ], [], NU);
    expect(l.map((x) => x.email)).toEqual(["a@x.dk", "e@x.dk"]);
    expect(l[1].procent).toBeNull();
  });

  it("B4a: en ansøgning indsendt EFTER sessionen — på mailen ELLER via koblingen — fjerner personen; en før eller en kladde gør ikke", () => {
    const S = foer(2 * H);
    const l = varmeLeads(
      [R("a@x.dk", S), R("b@x.dk", S), R("c@x.dk", S), R("d@x.dk", S), R("e@x.dk", S), R("f@x.dk", S)],
      [
        A("a@x.dk", "2026-09-01T10:00:00.000Z"),                                 // ansøgte FØR sessionen — stadig et lead
        A("privat@firma.dk", foer(H), { webinar_email: "b@x.dk" }),               // koblet af en rådgiver, EFTER — ikke et lead
        A("c@x.dk", null),                                                        // kladde — stadig et lead
        A("e@x.dk", S),                                                           // PRÆCIS ved start — ikke EFTER (skarpt) — stadig et lead
        A("f@x.dk", new Date(Date.parse(S) + 1).toISOString()),                   // 1 ms efter — ikke et lead
      ],
      NU,
    );
    expect(l.map((x) => x.email)).toEqual(["a@x.dk", "c@x.dk", "d@x.dk", "e@x.dk"]);
  });

  it("B4a: grænsen er den FØRSTE «set»-session i vinduet — så 22/9 og 29/9, ansøgte imellem → ikke et lead", () => {
    const l = varmeLeads(
      [R("a@x.dk", foer(9 * 24 * H)), R("a@x.dk", foer(2 * H))],
      [A("a@x.dk", foer(5 * 24 * H))],
      NU,
    );
    expect(l).toEqual([]);
  });

  it("B4b: et medlem (underskrevet OG betalt, mail eller kobling) er aldrig et lead — heller ikke med en gammel ansøgning", () => {
    const l = varmeLeads(
      [R("a@x.dk", foer(H)), R("b@x.dk", foer(H)), R("c@x.dk", foer(H))],
      [
        A("a@x.dk", "2025-07-08T10:00:00.000Z", { trin: "underskrevet", virksomhed_slutdato: "2026-12-31" }),
        A("anden@firma.dk", "2025-07-08T10:00:00.000Z", { trin: "underskrevet", virksomhed_slutdato: "2026-12-31", webinar_email: "b@x.dk" }),
        A("c@x.dk", "2025-07-08T10:00:00.000Z", { trin: "underskrevet", virksomhed_slutdato: null }), // underskrevet, aldrig betalt: ikke medlem
      ],
      NU,
    );
    expect(l.map((x) => x.email)).toEqual(["c@x.dk"]);
  });

  it("B4c: prøver (PROEVE-) og husets egne domæner er aldrig leads — et domæne matcher kun helt", () => {
    expect(PROEVE_ID_PRAEFIKS).toBe("PROEVE-");
    expect([...INTERNE_DOMAENER]).toEqual(["topix.dk", "theboardroom.dk"]);
    const l = varmeLeads([
      R("a@x.dk", foer(H), { ewebinar_id: "PROEVE-123" }),
      R("jonas@topix.dk", foer(H)),
      R("kontakt@theboardroom.dk", foer(H)),
      R("ida@nottopix.dk", foer(H)),
      R("bo@sub.topix.dk", foer(H)),
    ], [], NU);
    expect(l.map((x) => x.email)).toEqual(["bo@sub.topix.dk", "ida@nottopix.dk"]);
    expect(erInternEllerProeve({ ewebinar_id: "x", email: "JONAS@TOPIX.DK" })).toBe(true);
    expect(erInternEllerProeve({ ewebinar_id: "proeve-1", email: "a@x.dk" })).toBe(false);
  });

  it("én linje pr. person: den nyeste session, hun så færdigt", () => {
    const l = varmeLeads([
      R("a@x.dk", foer(10 * 24 * H)),
      R("a@x.dk", foer(2 * H), { set_procent: 20 }),      // nyeste, men kun delvist
      R("a@x.dk", foer(3 * 24 * H), { set_procent: 95 }),
    ], [], NU);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ procent: 95, sidenOrd: "webinaret begyndte for 3 dage siden" });
  });

  it("ordene for tiden", () => {
    expect(sidenOrd(59 * 60_000)).toBe("webinaret begyndte for under en time siden");
    expect(sidenOrd(H)).toBe("webinaret begyndte for 1 time siden");
    expect(sidenOrd(23 * H)).toBe("webinaret begyndte for 23 timer siden");
    expect(sidenOrd(24 * H)).toBe("webinaret begyndte for 1 dag siden");
    expect(sidenOrd(49 * H)).toBe("webinaret begyndte for 2 dage siden");
  });

  it("tom liste, når ingen er varme", () => {
    expect(varmeLeads([], [], NU)).toEqual([]);
  });
});

// ── Kildeværn ───────────────────────────────────────────────────────────────
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

/**
 * Varme leads findes KUN hos rådgiveren:
 *   · ingen fil under supabase/functions nævner dommen eller komponenten;
 *   · den delte side (DeltWebinar.tsx) nævner dem ikke og giver aldrig `varme` ind;
 *   · WebinarVisning tegner kun det, den får ind (`{varme}`) og kalder ikke dommen;
 *   · KUN WebinarView kalder `varmeLeads(` og monterer `<VarmeLeadsAfsnit`.
 */
export interface FunctionFil { sti: string; tekst: string }

export const varmeLeadsKunHosRaadgiveren = (filer: { functions: FunctionFil[]; delt: string; view: string }): boolean => {
  const ORD = /varmeLeads|VarmeLeads|varme=\{/;
  // I functions er ÉN forekomst tilladt: nøglen "varmeLeads" i webinarDelingSvar.FORBUDTE_NOEGLER —
  // værnet selv, som streng i anførselstegn. ALT andet fanges (B5): en import af FILEN
  // (`from "…/varmeLeads"` eller `…/varmeLeads.ts`, uanset hvad der importeres), et kald,
  // typen, komponenten — og en fil under supabase/functions, der selv HEDDER noget med varmeLeads.
  const udenNoeglen = (k: string) => k.replace(/"varmeLeads"/g, "");
  const ORD_I_FUNCTIONS = /varmeLeads|VarmeLeads|VarmtLead/;
  const v = udenKommentarer(filer.view);
  const visning = v.slice(v.indexOf("export const WebinarVisning"), v.indexOf("export const WebinarView "));
  const raadgiver = v.slice(v.indexOf("export const WebinarView "));
  return filer.functions.every((f) => !/varmeLeads/i.test(f.sti) && !ORD_I_FUNCTIONS.test(udenNoeglen(udenKommentarer(f.tekst)))) &&
    !ORD.test(udenKommentarer(filer.delt)) &&
    visning.length > 100 && visning.includes("{varme}") && !visning.includes("varmeLeads(") && !visning.includes("<VarmeLeadsAfsnit") &&
    raadgiver.includes("varmeLeads(query.data.tilmeldinger, query.data.ansoegninger, nu)") &&
    raadgiver.includes("<VarmeLeadsAfsnit leads={leads} />");
};

const alleFunctionFiler = (): FunctionFil[] => {
  const rod = resolve(process.cwd(), "supabase/functions");
  const ud: FunctionFil[] = [];
  const gaa = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const sti = resolve(dir, e.name);
      if (e.isDirectory()) gaa(sti);
      else if (/\.(ts|tsx)$/.test(e.name)) ud.push({ sti: relative(process.cwd(), sti), tekst: readFileSync(sti, "utf8") });
    }
  };
  gaa(rod);
  return ud;
};

describe("kildeværn — varme leads aldrig i den delte flade", () => {
  const filer = { functions: alleFunctionFiler(), delt: laes("src/pages/DeltWebinar.tsx"), view: laes("src/components/hjemmebane/webinar/WebinarView.tsx") };

  it("kun rådgiverens /webinar regner og tegner listen", () => {
    expect(filer.functions.length).toBeGreaterThan(50);
    expect(varmeLeadsKunHosRaadgiveren(filer)).toBe(true);
  });
  it("VÆRNET VIRKER: listen i en function, i den delte side eller i den fælles visning fanges", () => {
    const med = (tekst: string, sti = "supabase/functions/x/index.ts") => ({ ...filer, functions: [...filer.functions, { sti, tekst }] });
    expect(varmeLeadsKunHosRaadgiveren(med('import { varmeLeads } from "./varmeLeads.ts";'))).toBe(false);
    // Importen af FILEN fanges, også når det importerede hedder noget andet:
    expect(varmeLeadsKunHosRaadgiveren(med('import { liste as l } from "../../../src/lib/webinar/varmeLeads";'))).toBe(false);
    expect(varmeLeadsKunHosRaadgiveren(med('import * as v from "./varmeLeads.ts";'))).toBe(false);
    // En fil, der HEDDER varmeLeads, under functions:
    expect(varmeLeadsKunHosRaadgiveren(med("export const x = 1;", "supabase/functions/_shared/varmeLeads.ts"))).toBe(false);
    // Nøglen i anførselstegn alene er værnet selv — den er tilladt:
    expect(varmeLeadsKunHosRaadgiveren(med('const N = ["varmeLeads"];'))).toBe(true);
    expect(varmeLeadsKunHosRaadgiveren({ ...filer, delt: `${filer.delt}\n<WebinarVisning varme={<VarmeLeadsAfsnit leads={[]} />} />` })).toBe(false);
    expect(varmeLeadsKunHosRaadgiveren({ ...filer, view: filer.view.replace("{varme}", "{<VarmeLeadsAfsnit leads={[]} />}") })).toBe(false);
  });
  it("et delt-svar med listen afvises af findForbudteNoegler — og det rigtige svar bærer den ikke", () => {
    expect(FORBUDTE_NOEGLER).toContain("varmeLeads");
    const ind = { ...FIXTURE, sporKolonnerFindes: true, tilstand: "har" as const, hentning: null, valg: "daekning" as const };
    const svar = bygDeltSvar(ind, new Date("2026-09-19T08:00:00.000Z"));
    expect(findForbudteNoegler(svar)).toEqual([]);
    expect("varmeLeads" in svar).toBe(false);
    expect(findForbudteNoegler({ ...svar, varmeLeads: [] })).toEqual(["varmeLeads"]);
    expect(findForbudteNoegler({ ...svar, dashboard: { ...svar.dashboard, varmeLeads: [{ navn: "x" }] } })).toEqual(["dashboard.varmeLeads"]);
  });
});
