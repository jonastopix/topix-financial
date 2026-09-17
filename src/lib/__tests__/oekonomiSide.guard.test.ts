import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for økonomi Ø3 (18/9-2026) — siden /oekonomi. Fire domme:
//   1. Siden står bag PartnerRoute (App.tsx) og er en tynd wrapper i
//      HbMemberShell med active="oekonomi" om OekonomiView.
//   2. Fladen har ÉN kilde: useOekonomiOverblik. Ingen Supabase-klient,
//      ingen .from(, ingen .rpc( i fladen; intet sted from("kontrakter").
//   3. Fladen regner intet selv: dommen er dashboardDom; ingen «/ 12»,
//      «* 12» eller reduce-summer i fladen.
//   4. Tom- og fejltilstanden er dommens ord: OEKONOMI_FEJL_TEKST på
//      isError («Økonomioverblikket kunne ikke hentes. Prøv igen.») og
//      dom.tekst når dom.tom === true; skelet mens der hentes.
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const APP = "src/App.tsx";
const SIDE = "src/pages/Oekonomi.tsx";
const VIEW = "src/components/hjemmebane/oekonomi/OekonomiView.tsx";
const DOM = "src/lib/oekonomi/dashboard.ts";

/** Dom 1: bag PartnerRoute; tynd wrapper i skallen. */
export const sidenBagPartnerRoute = (app: string, side: string): boolean =>
  app.includes('<Route path="/oekonomi" element={<PartnerRoute><Oekonomi /></PartnerRoute>} />') &&
  side.includes('<HbMemberShell active="oekonomi">') &&
  side.includes("<OekonomiView />") &&
  !/supabase|useQuery/.test(side);

/** Dom 2: én kilde. */
export const enKilde = (view: string, side: string, dom: string): boolean =>
  view.includes('import { useOekonomiOverblik } from "@/hooks/oekonomiOverblik";') &&
  view.includes("const query = useOekonomiOverblik();") &&
  !/@\/integrations\/supabase\/client/.test(view) &&
  !/\.from\(|\.rpc\(/.test(view) &&
  ![view, side, dom].some((k) => /from\("kontrakter"\)/.test(k));

/** Dom 3: dommen regner, fladen viser. */
export const fladenRegnerIkke = (view: string): boolean =>
  view.includes("dashboardDom(query.data, nu)") &&
  !/\/\s*12\b|\*\s*12\b|\.reduce\(/.test(view);

/** Dom 4: fejl-, tom- og hentetilstand. */
export const tilstandeneHolder = (view: string, dom: string): boolean =>
  dom.includes('export const OEKONOMI_FEJL_TEKST = "Økonomioverblikket kunne ikke hentes. Prøv igen.";') &&
  view.includes('{query.isError ? (') &&
  view.includes('data-oekonomi="fejl">{OEKONOMI_FEJL_TEKST}</p>') &&
  view.includes("dom.tom === true ? (") &&
  view.includes('data-oekonomi="tom">{dom.tekst}</p>') &&
  view.includes('data-oekonomi="henter"');

describe("oekonomiSide.guard — Ø3: bag PartnerRoute, én kilde, dommen regner, tilstandene", () => {
  const app = udenKommentarer(laes(APP));
  const side = udenKommentarer(laes(SIDE));
  const view = udenKommentarer(laes(VIEW));
  const dom = udenKommentarer(laes(DOM));

  it("dom 1: /oekonomi bag PartnerRoute; siden er skallen om OekonomiView", () => {
    expect(sidenBagPartnerRoute(app, side)).toBe(true);
  });
  it("dom 2: kun useOekonomiOverblik — ingen Supabase-klient, .from eller .rpc i fladen; ingen from(\"kontrakter\")", () => {
    expect(enKilde(view, side, dom)).toBe(true);
  });
  it("dom 3: fladen kalder dashboardDom og regner intet selv", () => {
    expect(fladenRegnerIkke(view)).toBe(true);
  });
  it("dom 4: fejl «Økonomioverblikket kunne ikke hentes. Prøv igen.», tom = dommens tekst, skelet mens der hentes", () => {
    expect(tilstandeneHolder(view, dom)).toBe(true);
  });

  it("selvbevis 1: ruten bag AdvisorRoute, eller siden med egen hentning, falder", () => {
    expect(sidenBagPartnerRoute(app.replace('<Route path="/oekonomi" element={<PartnerRoute><Oekonomi /></PartnerRoute>} />', '<Route path="/oekonomi" element={<AdvisorRoute><Oekonomi /></AdvisorRoute>} />'), side)).toBe(false);
    expect(sidenBagPartnerRoute(app, side + '\nimport { supabase } from "@/integrations/supabase/client";')).toBe(false);
  });
  it("selvbevis 2: en direkte tabel-læsning eller Supabase-klienten i fladen falder", () => {
    expect(enKilde(view + '\nsupabase.from("kontrakter").select("*");', side, dom)).toBe(false);
    expect(enKilde(view + '\nimport { supabase } from "@/integrations/supabase/client";', side, dom)).toBe(false);
  });
  it("selvbevis 3: egen regning i fladen (pris / 12) falder", () => {
    expect(fladenRegnerIkke(view + "\nconst mrr = pris / 12;")).toBe(false);
    expect(fladenRegnerIkke(view.replace("dashboardDom(query.data, nu)", "egenDom(query.data)"))).toBe(false);
  });
  it("selvbevis 4: en anden fejltekst, eller tom-tilstanden væk, falder", () => {
    expect(tilstandeneHolder(view, dom.replace("Økonomioverblikket kunne ikke hentes. Prøv igen.", "Noget gik galt."))).toBe(false);
    expect(tilstandeneHolder(view.replace('data-oekonomi="tom">{dom.tekst}</p>', 'data-oekonomi="tom">Ingen data</p>'), dom)).toBe(false);
  });
});
