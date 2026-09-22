import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as webDash from "@/lib/webinar/dashboard";
import * as webPris from "@/lib/webinar/annoncepriser";
import * as webDeling from "@/lib/webinar/deling";
import { blevMedlem as webBlevMedlem } from "@/lib/ansoegninger/ansoegningVisning";
import * as denoDash from "../../../supabase/functions/_shared/webinarDashboard.ts";
import * as denoPris from "../../../supabase/functions/_shared/annoncepriser.ts";
import * as denoDeling from "../../../supabase/functions/_shared/webinarDeling.ts";
import { blevMedlem as denoBlevMedlem } from "../../../supabase/functions/_shared/blevMedlem.ts";

/**
 * Paritet for webinar-delingen (udkast 21/9-2026): serveren (webinar-delt)
 * regner det delte dashboard med SPEJLE af fladens domme. Fire par:
 *   src/lib/webinar/dashboard.ts      ↔ _shared/webinarDashboard.ts
 *   src/lib/webinar/annoncepriser.ts  ↔ _shared/annoncepriser.ts
 *   src/lib/webinar/deling.ts         ↔ _shared/webinarDeling.ts      (nul imports → byte-ens krop)
 *   blevMedlem i ansoegningVisning.ts ↔ _shared/blevMedlem.ts         (funktionen alene)
 * Kroppen efter filhovedet er ordret ens PÅ NÆR import-stierne (@/lib/… ↔ ./…):
 * imports fjernes før sammenligningen, og hver src-sti skal have sin _shared-sti.
 * OG dommene svarer ens på samme input.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const krop = (k: string) => k.slice(k.indexOf("*/") + 2);
const udenImports = (k: string) => k.replace(/^import[\s\S]*?from "[^"]+";\n/gm, "");
const importStier = (k: string) => [...k.matchAll(/^import[\s\S]*?from "([^"]+)";/gm)].map((m) => m[1]);

const PAR: [string, string, Record<string, string>][] = [
  ["src/lib/webinar/dashboard.ts", "supabase/functions/_shared/webinarDashboard.ts", {
    "@/lib/ansoegninger/ansoegningVisning": "./blevMedlem.ts", "@/lib/ansoegningTrin": "./ansoegningTrin.ts",
    "@/lib/webinarDom": "./webinarDom.ts",
    // annoncekildeStreng: samme kildeNavn med snævret signatur — Deno's strictNullChecks (filhovedet dér).
    "@/lib/webinar/annoncekilde": "./annoncekildeStreng.ts",
  }],
  ["src/lib/webinar/annoncepriser.ts", "supabase/functions/_shared/annoncepriser.ts", {
    "@/lib/metaAnnoncer": "./metaAnnoncer.ts", "@/lib/webinar/dashboard": "./webinarDashboard.ts",
  }],
];

describe("webinarDashboard.paritet — kildeteksten", () => {
  for (const [src, shared, stier] of PAR) {
    it(`${src} ↔ ${shared}: kroppen er ens uden imports, og import-stierne er spejlede`, () => {
      const a = krop(laes(src)), b = krop(laes(shared));
      expect(udenImports(b)).toBe(udenImports(a));
      expect(udenImports(a).length).toBeGreaterThan(5000);
      const iA = importStier(a), iB = importStier(b);
      expect(iA.map((s) => stier[s] ?? `UKENDT:${s}`)).toEqual(iB);
      expect(b).not.toMatch(/"@\//);
      expect(laes(src)).toContain(shared.replace("supabase/functions/", "supabase/functions/"));
      expect(laes(shared)).toContain(src);
    });
  }
  it("deling.ts ↔ webinarDeling.ts: byte-ens krop, nul imports", () => {
    const a = krop(laes("src/lib/webinar/deling.ts")), b = krop(laes("supabase/functions/_shared/webinarDeling.ts"));
    expect(b).toBe(a);
    expect(a).not.toMatch(/^\s*import\s/m);
    expect(a.length).toBeGreaterThan(1500);
  });
  it("blevMedlem: funktionsteksten er ens i ansoegningVisning.ts og _shared/blevMedlem.ts", () => {
    const funk = (k: string) => k.match(/export function blevMedlem\([^)]*\): boolean \{\n[\s\S]*?\n\}/)?.[0] ?? "";
    const a = funk(laes("src/lib/ansoegninger/ansoegningVisning.ts")), b = funk(laes("supabase/functions/_shared/blevMedlem.ts"));
    expect(a).not.toBe("");
    expect(b).toBe(a);
  });
  it("VÆRNET VIRKER: en ændring i kun det ene spejl fanges", () => {
    const a = udenImports(krop(laes("src/lib/webinar/dashboard.ts")));
    const aendret = a.replace("export const UDEN_KAMPAGNE = \"uden kampagne\";", "export const UDEN_KAMPAGNE = \"ingen kampagne\";");
    expect(aendret).not.toBe(a);
    expect(udenImports(krop(laes("supabase/functions/_shared/webinarDashboard.ts")))).not.toBe(aendret);
  });
});

// ── Dommene svarer ens ──────────────────────────────────────────────────────
const NU = new Date("2026-09-19T08:00:00.000Z");
const T22 = "2026-09-22T08:00:00.000Z";
const T15 = "2026-09-15T08:00:00.000Z";
const SPOR = { utm_source: "fb", utm_medium: "paid", utm_campaign: "Webinar sep", utm_content: "120212345678901234", utm_term: null, fbclid: "IwAR0abc", origin: "https://theboardroom.dk/webinar?fbclid=IwAR0abc", first_origin: null, referrer: "https://l.facebook.com/", first_referrer: null, widget_source: "topix-webinar-side", by: "Aarhus", land: "Denmark", enhed: "Desktop", tidszone: "Europe/Copenhagen", ad_id_udledt: null };
const R = (email: string, navn: string, session_tid: string, ekstra: Partial<webDash.Tilmelding> = {}): webDash.Tilmelding => ({
  ewebinar_id: `id-${email}-${session_tid}`, email, navn, webinar_id: "w1", webinar_titel: "Sådan får du styr på tallene", session_tid, session_type: "Scheduled",
  registreret_at: "2026-09-10T09:00:00.000Z", state: "Watched", sidste_action: null, attended: "true", subscribed: null, set_procent: 80, set_procent_kilde: "watchedPercentage",
  ...SPOR, ...ekstra,
});
export const FIXTURE = {
  tilmeldinger: [
    R("anna@firma.dk", "Anna Andersen", T15),
    R("bo@firma.dk", "Bo Berg", T15, { set_procent: 20, by: "Odense" }),
    R("carl@firma.dk", "Carl Clausen", T22, { state: "Registered", attended: null, set_procent: null }),
    R("dorte@firma.dk", "Dorte Dam", T22, { utm_content: "annonce-b", fbclid: null }),
    // Bedømmelsen (22/9-2026): eWebinars egen tekst, så begge spejle skal LÆSE den ens,
    // ikke bare svare null. Bo har to linjer — den seneste gyldige er hans stemme.
    R("erik@firma.dk", "Erik Eng", T15, { interactions: "-- Interactions --\n\nFeedback: Del din feedback!: 5\n" }),
    R("frida@firma.dk", "Frida Fog", T15, {
      interactions: "-- Interactions --\n\nFeedback: A: 2\nFeedback: Del din feedback!: 4\nCallToAction: calltoaction_ansgTilTheBoardroom: Clicked\n",
    }),
  ],
  ansoegninger: [
    { email: "anna@firma.dk", indsendt_at: "2026-09-16T10:00:00.000Z", trin: "underskrevet" as const, virksomhed_slutdato: "2027-09-16" },
    { email: "bo@firma.dk", indsendt_at: "2026-09-17T10:00:00.000Z", trin: "ny" as const, virksomhed_slutdato: null },
  ],
  dage: [
    { ad_id: "120212345678901234", campaign_id: "k1", dato: "2026-09-10", valuta: "DKK", forbrug_oere: 250000 },
    { ad_id: "120212345678901234", campaign_id: "k1", dato: "2026-09-11", valuta: "DKK", forbrug_oere: 150000 },
  ],
  annoncer: [{ ad_id: "120212345678901234", campaign_id: "k1", navn: "Annonce A", kampagne_navn: "Webinar sep" }],
};

describe("webinarDashboard.paritet — dommene", () => {
  it("webinarDashboard giver samme svar", () => {
    const ind = { tilmeldinger: FIXTURE.tilmeldinger, ansoegninger: FIXTURE.ansoegninger, sporKolonnerFindes: true };
    expect(denoDash.webinarDashboard(ind, NU)).toEqual(webDash.webinarDashboard(ind, NU));
    expect(denoDash.udenRaekker(denoDash.webinarDashboard(ind, NU))).toEqual(webDash.udenRaekker(webDash.webinarDashboard(ind, NU)));
  });
  it("annoncepriser giver samme svar for hvert vindue", () => {
    for (const valg of ["daekning", "7dage", "30dage"] as const) {
      const ind = { tilmeldinger: FIXTURE.tilmeldinger, ansoegninger: FIXTURE.ansoegninger, dage: FIXTURE.dage, annoncer: FIXTURE.annoncer, tilstand: "har" as const, valg, hentetTil: "2026-09-11" };
      expect(denoPris.annoncepriser(ind, NU)).toEqual(webPris.annoncepriser(ind, NU));
    }
  });
  it("delingsdommen og blevMedlem svarer ens", () => {
    const nu = new Date("2026-09-21T12:00:00Z");
    const r = { id: "a", navn: "x", oprettet_at: "2026-09-21T10:00:00Z", udloeber_at: "2026-12-20T10:00:00Z", lukket_at: null };
    expect(denoDeling.delingsTilstand(r, nu)).toBe(webDeling.delingsTilstand(r, nu));
    expect(denoDeling.forlaengetUdloeb(r.udloeber_at, 30, nu)).toBe(webDeling.forlaengetUdloeb(r.udloeber_at, 30, nu));
    expect(denoDeling.tilBase64Url(new Uint8Array([1, 2, 3, 250]))).toBe(webDeling.tilBase64Url(new Uint8Array([1, 2, 3, 250])));
    expect(denoBlevMedlem({ trin: "underskrevet", virksomhed_slutdato: "2027-01-01" })).toBe(webBlevMedlem({ trin: "underskrevet", virksomhed_slutdato: "2027-01-01" }));
    expect(denoBlevMedlem({ trin: "underskrevet", virksomhed_slutdato: null })).toBe(false);
  });
});
