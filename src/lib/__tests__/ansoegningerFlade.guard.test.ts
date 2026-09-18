import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for rådgiverens side af ansøgningen (18/9-2026). Syv domme
// låser det der ikke kan testes som en ren funktion, og hver beviser sig
// selv på en kopi med fejlen indsat (betalEfterFristen.guard-mønstret):
//   1. Ruterne /ansoegninger og /ansoegninger/:ansoegningId er lazy og bag
//      AdvisorRoute — aldrig MemberRoute, aldrig uguardede.
//   2. Hooken kalder ansoegning-handling med rådgiverens Bearer og de to
//      fejl-tjek (error OG data.error); invalideringen rammer forsiden.
//   3. Knapperne: det uigenkaldelige går gennem AlertDialog; hvilke der
//      vises, kommer fra knapperFor (afgoerOvergang) — ingen egen liste.
//   4. Listen er en OVERSIGT (Jonas 18/9 kl. 11:07 + tillæg 1–3): striben
//      med stribeTal øverst, én linje pr. ansøger med KUN første linje af
//      udfordringen (foersteLinje) — de fulde svar, grundlaget og
//      handlingerne står i folden, som kun én ad gangen kan have åben
//      (kontrolleret <details>, aabenId), og INTET huskes (ingen
//      useSearchParams, ingen localStorage); de lukkede foldet sammen; «Åbn»
//      i folden går til ansøgningens side, som stadig bærer alt.
//   5. Forsiden: grenen for ansøgninger ligger FØR tilstandsgrenen (som
//      betalt/bølgen) og bærer INGEN kvitteringsknapper; linjen peger på
//      ANSOEGNINGER_STI; datalaget læser ansoegninger gennem kraevRaekker og
//      giver dommen `ansoegninger` i ekstra — ingen ny query på forsiden.
//   6. virksomhedsnavnAf i src/lib er ordret motorens (_shared/ansoegningMotor.ts).
//   7. Klokken kender reference_type «ansoegning».

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const APP = "src/App.tsx";
const HOOK = "src/hooks/ansoegninger.ts";
const KNAPPER = "src/components/hjemmebane/ansoegninger/AnsoegningHandlinger.tsx";
const LISTE = "src/components/hjemmebane/ansoegninger/AnsoegningslisteView.tsx";
const DETALJE = "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx";
const FORSIDE = "src/components/hjemmebane/forside/RaadgiverForsideView.tsx";
const DATALAG = "src/components/AdvisorDashboard.tsx";
const VISNING = "src/lib/ansoegninger/ansoegningVisning.ts";
const MOTOR = "supabase/functions/_shared/ansoegningMotor.ts";
const KLOKKE = "src/lib/hjemmebane/klokke.ts";

const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

export const ruterneErRigtige = (app: string): boolean =>
  /<Route path="\/ansoegninger" element=\{<AdvisorRoute><Ansoegninger \/><\/AdvisorRoute>\} \/>/.test(app) &&
  /<Route path="\/ansoegninger\/:ansoegningId" element=\{<AdvisorRoute><Ansoegning \/><\/AdvisorRoute>\} \/>/.test(app) &&
  app.includes('const Ansoegninger = lazy(() => import("./pages/Ansoegninger"));') &&
  app.includes('const Ansoegning = lazy(() => import("./pages/Ansoegning"));') &&
  !/<MemberRoute><Ansoegning/.test(app);

export const hookenErRigtig = (h: string): boolean =>
  h.includes('supabase.functions.invoke("ansoegning-handling"') &&
  h.includes("headers: { Authorization: `Bearer ${session?.access_token}` }") &&
  h.includes("if (error) throw new Error(await laesFejl(error));") &&
  h.includes("if (data?.error) throw new Error(String(data.error));") &&
  h.includes('queryKey: ["advisor-dashboard"]') &&
  h.includes('.not("indsendt_at", "is", null)');

export const knapperneErRigtige = (k: string): boolean =>
  k.includes("knapperFor({ trin, paaPause, lukketFraTrin })") &&
  k.includes("if (k.bekraeft) return setDialog(k);") &&
  k.includes("<AlertDialog open={dialog !== null}") &&
  k.includes("await invaliderAnsoegninger(queryClient, id);") &&
  !/handling === "tilbud" \|\| handling === "afvis"/.test(k);

/** Linjen (summary) fra `<summary` til `</summary>` i Raekke. */
export function linjen(l: string): string {
  const i = l.indexOf("const Raekke = (");
  const s = l.indexOf("<summary", i);
  const e = l.indexOf("</summary>", s);
  return i === -1 || s === -1 || e === -1 ? "" : l.slice(s, e);
}
export const listenErRigtig = (l: string, detalje: string): boolean => {
  const linje = linjen(l);
  return linje.length > 0 &&
    linje.includes("foersteLinje(a.udfordring)") && !linje.includes("a.proevet") && !linje.includes("a.om_tolv_maaneder") && !linje.includes("grundlagSomTekst") && !linje.includes("<AnsoegningHandlinger") &&
    l.includes("{aaben && <Fold a={a} />}") && l.includes("aaben={aabenId === a.id}") && l.includes("useState<string | null>(null)") &&
    !l.includes("useSearchParams") && !l.includes("localStorage") && !l.includes("sessionStorage") &&
    l.includes("stribeTal(alle, nu)") && l.includes("taelVentende(alle, nu)") && l.includes("listeOverskrift(ventende, !!q.data)") &&
    l.includes("<details data-lukkede-fold>") && l.includes("<Link to={`/ansoegninger/${a.id}`}") &&
    ["a.udfordring", "a.proevet", "a.om_tolv_maaneder", "grundlagSomTekst(a.anbefaling)"].every((f) => detalje.includes(f));
};

export function ansoegningsGren(forside: string): string {
  const start = forside.indexOf('if (l.linje === "ansoegninger") {');
  const slut = forside.indexOf('if (l.linje === "boelge") {', start);
  return start === -1 || slut === -1 ? "" : forside.slice(start, slut);
}
export const forsidenErRigtig = (forside: string): boolean => {
  const gren = ansoegningsGren(forside);
  return gren.length > 0 &&
    foer(forside, 'if (l.linje === "ansoegninger") {', 'if (l.linje === "tilstand") {') &&
    gren.includes("<Link to={ANSOEGNINGER_STI}") &&
    !gren.includes("LUKNINGS_UDFALD") && !gren.includes("onLuk(");
};
export const datalagetErRigtigt = (d: string): boolean =>
  d.includes('kraevRaekker(ansoegningerRes, "ansoegninger")') &&
  d.includes("afgoerForsidensDom(virksomhederTilDom, now, { betaltIkkeOprettet, ansoegninger: ansoegningerTilForside })") &&
  d.includes('.from("ansoegninger" as any)') && d.includes('.not("indsendt_at", "is", null)');

/** Kroppen af virksomhedsnavnAf: fra `export function virksomhedsnavnAf(` til næste `\n}`. */
export function navnKrop(k: string): string {
  const i = k.indexOf("export function virksomhedsnavnAf(");
  if (i === -1) return "";
  const j = k.indexOf("\n}", i);
  return k.slice(k.indexOf("{", i), j + 2).replace(/\s+/g, " ");
}

export const klokkenKenderAnsoegning = (k: string): boolean =>
  k.includes('case "ansoegning":') && k.includes("`/ansoegninger/${n.reference_id}`");

describe("ansoegningerFlade.guard — de syv domme på repoets filer", () => {
  it("1. ruterne er lazy og bag AdvisorRoute", () => expect(ruterneErRigtige(laes(APP))).toBe(true));
  it("2. hooken: Bearer, to fejl-tjek, forsiden invalideres, kladder hentes aldrig", () => expect(hookenErRigtig(udenKommentarer(laes(HOOK)))).toBe(true));
  it("3. knapperne kommer fra knapperFor; det uigenkaldelige går gennem AlertDialog; invalidering før luk", () => expect(knapperneErRigtige(udenKommentarer(laes(KNAPPER)))).toBe(true));
  it("4. oversigten: stribe, én linje med første linje af udfordringen, folden med kun én åben og intet husket, lukkede foldet, «Åbn» til siden", () => expect(listenErRigtig(udenKommentarer(laes(LISTE)), udenKommentarer(laes(DETALJE)))).toBe(true));
  it("5. forsiden: grenen før tilstand, uden kvittering, peger på /ansoegninger; datalaget bruger kraevRaekker og ekstra", () => {
    expect(forsidenErRigtig(udenKommentarer(laes(FORSIDE)))).toBe(true);
    expect(datalagetErRigtigt(udenKommentarer(laes(DATALAG)))).toBe(true);
  });
  it("6. virksomhedsnavnAf er ordret motorens", () => {
    const a = navnKrop(udenKommentarer(laes(VISNING)));
    const b = navnKrop(udenKommentarer(laes(MOTOR)));
    expect(a.length).toBeGreaterThan(50);
    expect(a).toBe(b);
  });
  it("7. klokken kender reference_type ansoegning", () => expect(klokkenKenderAnsoegning(laes(KLOKKE))).toBe(true));
});

describe("ansoegningerFlade.guard — dommene fanger fejlen på en kopi", () => {
  it("1. MemberRoute eller synkron import fælder dom 1", () => {
    const app = laes(APP);
    expect(ruterneErRigtige(app.replace("<AdvisorRoute><Ansoegninger /></AdvisorRoute>", "<MemberRoute><Ansoegninger /></MemberRoute>"))).toBe(false);
    expect(ruterneErRigtige(app.replace('const Ansoegninger = lazy(() => import("./pages/Ansoegninger"));', 'import Ansoegninger from "./pages/Ansoegninger";'))).toBe(false);
  });
  it("2. uden Bearer, uden data.error-tjek eller med kladder fælder dom 2", () => {
    const h = udenKommentarer(laes(HOOK));
    expect(hookenErRigtig(h.replace("headers: { Authorization: `Bearer ${session?.access_token}` }", ""))).toBe(false);
    expect(hookenErRigtig(h.replace("if (data?.error) throw new Error(String(data.error));", ""))).toBe(false);
    expect(hookenErRigtig(h.split('.not("indsendt_at", "is", null)').join(""))).toBe(false);
  });
  it("3. en egen knapliste, eller afvis uden dialog, fælder dom 3", () => {
    const k = udenKommentarer(laes(KNAPPER));
    expect(knapperneErRigtige(k.replace("if (k.bekraeft) return setDialog(k);", ""))).toBe(false);
    expect(knapperneErRigtige(k + '\nconst x = handling === "tilbud" || handling === "afvis";')).toBe(false);
  });
  it("4. hele teksten på linjen, knapper på linjen, folden husket i URL/localStorage, eller flere folder åbne fælder dom 4", () => {
    const l = udenKommentarer(laes(LISTE));
    const d = udenKommentarer(laes(DETALJE));
    expect(listenErRigtig(l.replace("foersteLinje(a.udfordring)", "a.udfordring"), d)).toBe(false);
    expect(listenErRigtig(l.replace("{foersteLinje(a.udfordring) || \"—\"}", "{foersteLinje(a.udfordring)}<AnsoegningHandlinger id={a.id} />"), d)).toBe(false);
    expect(listenErRigtig(l + "\nconst [p] = useSearchParams();", d)).toBe(false);
    expect(listenErRigtig(l + "\nlocalStorage.setItem('fold', aabenId ?? '');", d)).toBe(false);
    expect(listenErRigtig(l.replace("aaben={aabenId === a.id}", "aaben={true}"), d)).toBe(false);
    expect(listenErRigtig(l, d.replace("a.om_tolv_maaneder", "null"))).toBe(false);
  });
  it("5. kvitteringsknapper i grenen, grenen efter tilstand, eller dommen uden ekstra fælder dom 5", () => {
    const f = udenKommentarer(laes(FORSIDE));
    const gren = ansoegningsGren(f);
    expect(forsidenErRigtig(f.replace(gren, gren.replace("</details>", "</details>{LUKNINGS_UDFALD.map((u) => <button onClick={() => onLuk(l, u)}>x</button>)}")))).toBe(false);
    expect(forsidenErRigtig(f.replace(gren, "").replace('export const RaadgiverForsideView = () => {', gren + '\nexport const RaadgiverForsideView = () => {'))).toBe(false);
    const d = udenKommentarer(laes(DATALAG));
    expect(datalagetErRigtigt(d.replace("{ betaltIkkeOprettet, ansoegninger: ansoegningerTilForside }", "{ betaltIkkeOprettet }"))).toBe(false);
    expect(datalagetErRigtigt(d.replace('kraevRaekker(ansoegningerRes, "ansoegninger")', "(ansoegningerRes.data ?? [])"))).toBe(false);
  });
  it("6. en anden rækkefølge i navnet fælder dom 6", () => {
    const a = navnKrop(udenKommentarer(laes(VISNING)));
    expect(a.replace("if (cvrNavn) return cvrNavn;", "")).not.toBe(navnKrop(udenKommentarer(laes(MOTOR))));
  });
  it("7. casen væk fælder dom 7", () => {
    expect(klokkenKenderAnsoegning(laes(KLOKKE).replace('case "ansoegning":', 'case "ansoegning_gammel":'))).toBe(false);
  });
});
