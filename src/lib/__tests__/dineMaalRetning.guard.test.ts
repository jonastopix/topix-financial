import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «Dine mål»s hoved og «Jeres retning» (2/10-2026; Jonas: «gør det
// øverste afsnit med Jeres retning under Dine mål lidt mere lækkert visuelt»;
// docs/dine-maal-design.md §8 «Hierarkiet 2/10»):
//   1. HIERARKIET på /milestones: hovedet (h1 + ÉN hovedlinje) → «Jeres retning»
//      → «venter på jeres ja» (BekraeftMaalKort — stod før OVER hovedet) →
//      «Jeres mål» → Rejsen. Kilderækkefølgen i DineMaalView er den dom.
//   2. ÉN HOVEDLINJE: /milestones tegner hovedLinje og ALDRIG dom.graenseTekst
//      (i drift stod to røde linjer oven på hinanden: «5 mål … · flere end de 3»
//      OG «5 af 3 aktive mål …», Rallysupport). Linjen er neutral (ingen rust),
//      og hverken hovedLinje eller graenseTekst skriver «N af 3» med N > 3.
//   3. RÅDGIVEREN ser aldrig «Skrevet af en anden i virksomheden»: dommen
//      begynder med den RÅ rolle (`!rawAdvisor &&`).
//   4. FORNAVNET kommer KUN fra useAuth's egen profil, og kun når rækken er den
//      indloggedes — intet profilopslag, ingen ny RLS (hverken view eller felt
//      læser `profiles`).
//   5. TOKENS: feltet bruger husets tokens (bg-hb-evergreen, text-hb-amber …) —
//      ingen rå hex/hsl i komponenten; `--hb-amber` findes i hjemmebane.css og
//      tailwind.config.ts.
//   6. ORDENE står ét sted (RETNING_FELT_ORD) — komponenten bærer ikke
//      kortoverskrifterne eller foden som literaler.
// Selvbevis: hver dom falder, når kilden ændres tilbage.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const VIEW = "src/components/hjemmebane/milestones/DineMaalView.tsx";
const FELT = "src/components/hjemmebane/milestones/JeresRetning.tsx";
const FLADE = "src/lib/hjemmebane/dineMaalFlade.ts";
const DOM = "src/lib/hjemmebane/dineMaal.ts";
const CSS = "src/styles/hjemmebane.css";
const TAILWIND = "tailwind.config.ts";

/** Dom 1: hierarkiet. */
export const hierarkietHolder = (view: string): boolean => {
  const v = udenKommentarer(view);
  const jsx = v.slice(v.indexOf("return (\n    <div data-dine-maal-aktive"));
  const h1 = jsx.indexOf("<h1");
  const hoved = jsx.indexOf("data-hoved-linje");
  const retning = jsx.indexOf("<JeresRetning");
  const venter = jsx.indexOf("<BekraeftMaalKort");
  const maalene = jsx.indexOf('eyebrow="Jeres mål"');
  const rejsen = jsx.indexOf("<Rejsen");
  return h1 > 0 && hoved > h1 && retning > hoved && venter > retning && maalene > venter && rejsen > maalene;
};

/** Dom 2: én hovedlinje, neutral; aldrig «N af 3» med N > 3. */
export const enHovedlinje = (view: string, flade: string, dom: string): boolean => {
  const v = udenKommentarer(view);
  const hovedLinjeTag = /<p className="text-sm text-hb-ink-soft" data-hoved-linje>\{hovedLinje\(kort\.length, dom\.ubekraeftede\.length\)\}<\/p>/.test(v);
  const ingenGraense = !/graenseTekst/.test(v) && !/data-graense-tekst/.test(v);
  const f = udenKommentarer(flade);
  const fn = f.slice(f.indexOf("export function hovedLinje"), f.indexOf("export interface StatusChip"));
  const overFoerst = /if \(antalBekraeftede > MAX_AKTIVE_MAAL\) \{\s*return `\$\{antalBekraeftede\} aktive mål\$\{venter\} — flere end de \$\{MAX_AKTIVE_MAAL\}, der er plads til\. Parkér eller markér nogle som nået, så I står med højst \$\{MAX_AKTIVE_MAAL\}\.`;/.test(fn) && !/ af \$\{MAX_AKTIVE_MAAL\}/.test(fn);
  const d = udenKommentarer(dom);
  const gfn = d.slice(d.indexOf("export function graenseTekst"), d.indexOf("function medHandlinger"));
  const graenseOverFoerst = gfn.indexOf("if (antalBekraeftede > MAX_AKTIVE_MAAL)") > 0 && gfn.indexOf("if (antalBekraeftede > MAX_AKTIVE_MAAL)") < gfn.indexOf("af ${MAX_AKTIVE_MAAL} aktive mål");
  return hovedLinjeTag && ingenGraense && overFoerst && graenseOverFoerst;
};

/** Dom 3: aldrig «Skrevet af en anden» for rådgiveren. */
export const aldrigForRaadgiveren = (view: string): boolean =>
  /const retningSkrevetAfAnden = !rawAdvisor && /.test(udenKommentarer(view));

/** Dom 4: fornavnet kun fra egen profil, intet opslag. */
export const fornavnUdenOpslag = (view: string, felt: string): boolean => {
  const v = udenKommentarer(view);
  const f = udenKommentarer(felt);
  return (
    /const retningFornavn = retningErEgen \? fornavn\(profile\?\.full_name\) : null;/.test(v) &&
    /fornavn=\{retningFornavn\}/.test(v) &&
    !/from\("profiles"/.test(v) &&
    !/from\(/.test(f) &&
    !/supabase/.test(f)
  );
};

/** Dom 5: tokens, ingen rå farver. */
export const tokensHolder = (felt: string, css: string, tailwind: string): boolean => {
  const f = udenKommentarer(felt);
  return (
    /bg-hb-evergreen/.test(f) &&
    /text-hb-amber/.test(f) &&
    !/#[0-9a-fA-F]{3,8}\b/.test(f) &&
    !/\bhsl\(/.test(f) &&
    !/\brgb\(/.test(f) &&
    /--hb-amber: 28 70% 66%;/.test(css) &&
    /amber: "hsl\(var\(--hb-amber\)\)"/.test(tailwind)
  );
};

/** Dom 6: ordene ét sted. */
export const ordeneEtSted = (felt: string): boolean => {
  const f = udenKommentarer(felt);
  return (
    /RETNING_FELT_ORD\.hverdagen/.test(f) && /RETNING_FELT_ORD\.prisen/.test(f) && /RETNING_FELT_ORD\.fod/.test(f) && /RETNING_FELT_ORD\.laesAlt/.test(f) &&
    !/Hverdagen, vi bygger/.test(f) && !/Prisen, hvis intet/.test(f) && !/vejen derhen/.test(f) && !/"Læs alt"/.test(f)
  );
};

describe("dineMaalRetning.guard", () => {
  it("dom 1: hierarkiet — h1 → hovedlinje → Jeres retning → venter på jeres ja → Jeres mål → Rejsen", () => {
    const view = laes(VIEW);
    expect(hierarkietHolder(view)).toBe(true);
    // Mod-prøven: BekraeftMaalKort flyttet tilbage op over hovedet.
    const kort = view.slice(view.indexOf("<BekraeftMaalKort"), view.indexOf("/>", view.indexOf("<BekraeftMaalKort")) + 2);
    expect(hierarkietHolder(view.replace(kort, "").replace("<section className=\"max-w-3xl\">", `${kort}<section className="max-w-3xl">`))).toBe(false);
  });

  it("dom 2: ÉN hovedlinje, neutral, aldrig graenseTekst på /milestones, aldrig «N af 3» med N > 3", () => {
    const view = laes(VIEW);
    const flade = laes(FLADE);
    const dom = laes(DOM);
    expect(enHovedlinje(view, flade, dom)).toBe(true);
    expect(enHovedlinje(view.replace('<p className="text-sm text-hb-ink-soft" data-hoved-linje>', '<p className="text-sm text-hb-rust" data-hoved-linje>'), flade, dom)).toBe(false);
    expect(enHovedlinje(view.replace("</section>\n\n      {/* ── 2. Jeres retning ── */}", '<p data-graense-tekst>{dom.graenseTekst}</p></section>\n\n      {/* ── 2. Jeres retning ── */}'), flade, dom)).toBe(false);
    expect(enHovedlinje(view, flade.replace("if (antalBekraeftede > MAX_AKTIVE_MAAL) {", "if (false) {"), dom)).toBe(false);
    expect(enHovedlinje(view, flade, dom.replace("  if (antalBekraeftede > MAX_AKTIVE_MAAL) return", "  if (false) return"))).toBe(false);
  });

  it("dom 3: «Skrevet af en anden» dømmes af den rå rådgiverrolle først", () => {
    const view = laes(VIEW);
    expect(aldrigForRaadgiveren(view)).toBe(true);
    expect(aldrigForRaadgiveren(view.replace("const retningSkrevetAfAnden = !rawAdvisor && ", "const retningSkrevetAfAnden = "))).toBe(false);
  });

  it("dom 4: fornavnet KUN fra egen profil (useAuth), kun for egen række — intet profilopslag", () => {
    const view = laes(VIEW);
    const felt = laes(FELT);
    expect(fornavnUdenOpslag(view, felt)).toBe(true);
    expect(fornavnUdenOpslag(view.replace("retningErEgen ? fornavn(profile?.full_name) : null", "fornavn(profile?.full_name)"), felt)).toBe(false);
    expect(fornavnUdenOpslag(view, felt + '\nconst x = supabase.from("profiles");')).toBe(false);
  });

  it("dom 5: husets tokens — ingen rå hex/hsl i feltet; --hb-amber i CSS og tailwind", () => {
    const felt = laes(FELT);
    const css = laes(CSS);
    const tw = laes(TAILWIND);
    expect(tokensHolder(felt, css, tw)).toBe(true);
    expect(tokensHolder(felt.replace("bg-hb-evergreen", "bg-[#0f2a24]"), css, tw)).toBe(false);
    expect(tokensHolder(felt, css.replace("--hb-amber: 28 70% 66%;", ""), tw)).toBe(false);
    expect(tokensHolder(felt, css, tw.replace('amber: "hsl(var(--hb-amber))",', ""))).toBe(false);
  });

  it("dom 6: kortoverskrifter, fod og «Læs alt» står i RETNING_FELT_ORD, ikke i komponenten", () => {
    const felt = laes(FELT);
    expect(ordeneEtSted(felt)).toBe(true);
    expect(ordeneEtSted(felt.replace("RETNING_FELT_ORD.fod", '"Jeres mål herunder er vejen derhen."'))).toBe(false);
  });
});
