import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RING_INDEN_TIMER, sidenOrd, VARME_LEADS_DAGE, varmeLeads } from "@/lib/webinar/varmeLeads";
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
    expect(l.map((x) => x.inden24Timer)).toEqual([true, true, false, false]);
    expect(l[0]).toMatchObject({ navn: "Navn A", procent: 80, timerSiden: 3, sidenOrd: "set for 3 timer siden", titel: "Styr på tallene" });
    expect(l[3]).toMatchObject({ procent: 92, sidenOrd: "set for 5 dage siden" });
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

  it("en indsendt ansøgning — på mailen ELLER via koblingen — fjerner personen; en kladde gør ikke", () => {
    const l = varmeLeads(
      [R("a@x.dk", foer(H)), R("b@x.dk", foer(H)), R("c@x.dk", foer(H)), R("d@x.dk", foer(H))],
      [
        A("a@x.dk", "2026-09-01T10:00:00.000Z"),                                 // ansøgte FØR — stadig en ansøger
        A("privat@firma.dk", "2026-10-01T11:00:00.000Z", { webinar_email: "b@x.dk" }), // koblet af en rådgiver
        A("c@x.dk", null),                                                        // kladde
      ],
      NU,
    );
    expect(l.map((x) => x.email)).toEqual(["c@x.dk", "d@x.dk"]);
  });

  it("én linje pr. person: den nyeste session, hun så færdigt", () => {
    const l = varmeLeads([
      R("a@x.dk", foer(10 * 24 * H)),
      R("a@x.dk", foer(2 * H), { set_procent: 20 }),      // nyeste, men kun delvist
      R("a@x.dk", foer(3 * 24 * H), { set_procent: 95 }),
    ], [], NU);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ procent: 95, sidenOrd: "set for 3 dage siden" });
  });

  it("ordene for tiden", () => {
    expect(sidenOrd(59 * 60_000)).toBe("set for under en time siden");
    expect(sidenOrd(H)).toBe("set for 1 time siden");
    expect(sidenOrd(23 * H)).toBe("set for 23 timer siden");
    expect(sidenOrd(24 * H)).toBe("set for 1 dag siden");
    expect(sidenOrd(49 * H)).toBe("set for 2 dage siden");
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
export const varmeLeadsKunHosRaadgiveren = (filer: { functions: string[]; delt: string; view: string }): boolean => {
  const ORD = /varmeLeads|VarmeLeads|varme=\{/;
  // I functions er ÉN forekomst tilladt: nøglen i webinarDelingSvar.FORBUDTE_NOEGLER — værnet selv.
  const ORD_I_FUNCTIONS = /import[^;]*(varmeLeads|VarmeLeads)|varmeLeads\(|VarmtLead|VarmeLeads/;
  const v = udenKommentarer(filer.view);
  const visning = v.slice(v.indexOf("export const WebinarVisning"), v.indexOf("export const WebinarView "));
  const raadgiver = v.slice(v.indexOf("export const WebinarView "));
  return filer.functions.every((f) => !ORD_I_FUNCTIONS.test(udenKommentarer(f))) &&
    !ORD.test(udenKommentarer(filer.delt)) &&
    visning.length > 100 && visning.includes("{varme}") && !visning.includes("varmeLeads(") && !visning.includes("<VarmeLeadsAfsnit") &&
    raadgiver.includes("varmeLeads(query.data.tilmeldinger, query.data.ansoegninger, nu)") &&
    raadgiver.includes("<VarmeLeadsAfsnit leads={leads} />");
};

const alleFunctionFiler = (): string[] => {
  const rod = resolve(process.cwd(), "supabase/functions");
  const ud: string[] = [];
  const gaa = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const sti = resolve(dir, e.name);
      if (e.isDirectory()) gaa(sti);
      else if (/\.(ts|tsx)$/.test(e.name)) ud.push(readFileSync(sti, "utf8"));
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
    expect(varmeLeadsKunHosRaadgiveren({ ...filer, functions: [...filer.functions, 'import { varmeLeads } from "./varmeLeads.ts";'] })).toBe(false);
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
