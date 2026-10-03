/**
 * Værn: AI-skemaet (_shared/aiSkema.ts) har et felt for HVER kanonisk omkostningsnøgle (pakke B skive 1, 3/10-2026,
 * m17-ai-skema-grupper). Før manglede pension, øvrige personale, autodrift, andre eksterne og ekstraordinære poster —
 * AI'en kunne kun lægge dem i line_items, som aldrig når metrics, og kontrolsummen viste dem som udækket
 * (målt 3/10: 21 af 42 målbare AI-rapporter, 8 virksomheder).
 *
 * Dommen er manglendeOmkostningsfelter(skema, KF_TO_CANONICAL, omkostningsnoegler(CANONICAL, "alle")). SELVBEVIS:
 * hver dom prøves først mod et skema, hvor feltet er fjernet, og skal da fælde.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KF_TO_CANONICAL } from "../../../supabase/functions/_shared/canonicalEngine.ts";
import { CANONICAL, omkostningsnoegler } from "../../../supabase/functions/_shared/omkostningsnoegler.ts";
import {
  AI_KEY_FIGURES_EGENSKABER,
  AI_POSITIVE_DRIFTSFELTER,
  AI_SKEMA_FELT,
  AI_SKEMA_MARKOER,
  AI_SKIVE1_GRUPPER,
  manglendeOmkostningsfelter,
  medAiSkema,
} from "../../../supabase/functions/_shared/aiSkema.ts";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const MAPNING = KF_TO_CANONICAL as Readonly<Record<string, string>>;
const OMK_NOEGLER = omkostningsnoegler(CANONICAL, "alle");

describe("aiSkemaGrupper.guard — AI-skemaet dækker hver kanonisk omkostningsnøgle", () => {
  it("dom 1: ingen omkostningsnøgle uden et skemafelt (med selvbevis pr. nøgle)", () => {
    expect(OMK_NOEGLER.length, "omkostningsnoegler gav for få nøgler — parseren ramte ved siden af").toBeGreaterThanOrEqual(11);
    expect(manglendeOmkostningsfelter(AI_KEY_FIGURES_EGENSKABER, MAPNING, OMK_NOEGLER)).toEqual([]);
    // SELVBEVIS: fjern alle felter, der mapper til nøglen → dommen SKAL nævne den.
    for (const noegle of OMK_NOEGLER) {
      const uden = Object.fromEntries(Object.entries(AI_KEY_FIGURES_EGENSKABER).filter(([f]) => MAPNING[f] !== noegle));
      expect(manglendeOmkostningsfelter(uden, MAPNING, OMK_NOEGLER), `selvbevis: ${noegle}`).toEqual([noegle]);
    }
  });

  it("dom 2: de fem grupper står i skemaet og mapper til deres kanoniske nøgle gennem KF_TO_CANONICAL", () => {
    expect(AI_SKIVE1_GRUPPER.map((g) => g.felt)).toEqual(["pensioner_sociale", "oevrige_personale", "autodrift", "oevrige_omkostninger", "ekstraordinaere_poster"]);
    for (const { felt, noegle } of AI_SKIVE1_GRUPPER) {
      expect(AI_KEY_FIGURES_EGENSKABER[felt], `${felt} mangler i skemaet`).toBeDefined();
      expect(MAPNING[felt], `${felt} mapper ikke til ${noegle}`).toBe(noegle);
    }
    // De fire driftsgrupper er kanoniske omkostningsnøgler; ekstraordinære er det IKKE (dom 5).
    for (const f of AI_POSITIVE_DRIFTSFELTER) expect(OMK_NOEGLER).toContain(MAPNING[f]);
  });

  it("dom 3: hver af de fem har en beskrivelse med danske regnskabslinjer og fortegnet", () => {
    for (const { felt } of AI_SKIVE1_GRUPPER) {
      const b = AI_KEY_FIGURES_EGENSKABER[felt].description ?? "";
      expect(b.length, `${felt}: beskrivelsen er for kort`).toBeGreaterThan(80);
      expect(b, `${felt}: ingen regnskabslinje i «…»`).toMatch(/«[^»]+»/);
      expect(b, `${felt}: fortegnet er ikke sagt`).toMatch(/POSITIVT|positivt/);
      expect(b, `${felt}: siger ikke hvad der sker uden gruppen`).toMatch(/Udelad feltet/);
    }
  });

  it("dom 4: extract-financial-data bruger skemaet, nævner felterne i prompten og sætter markøren", () => {
    const k = laes("supabase/functions/extract-financial-data/index.ts");
    expect(k).toMatch(/properties:\s*AI_KEY_FIGURES_EGENSKABER/);
    // Ingen indlejret kopi af skemaet (selvbevis: mønstret rammer den gamle form).
    const gammel = `key_figures: {\n  type: "object",\n  properties: {\n    omsaetning: { type: "number" },`;
    expect(/omsaetning:\s*\{\s*type:\s*"number"\s*\}/.test(gammel)).toBe(true);
    expect(k).not.toMatch(/omsaetning:\s*\{\s*type:\s*"number"\s*\}/);
    const prompt = k.slice(k.indexOf("const systemPrompt = `"), k.indexOf("Hvis du er i tvivl om et tal eller en kolonne"));
    expect(prompt.length).toBeGreaterThan(1000);
    for (const { felt } of AI_SKIVE1_GRUPPER) expect(prompt, `prompten nævner ikke ${felt}`).toContain(felt);
    expect(k).toContain("extractedData[AI_SKEMA_FELT] = AI_SKEMA_MARKOER");
    expect(k).toContain("rawAiOutput[AI_SKEMA_FELT] = AI_SKEMA_MARKOER");
    expect(AI_SKEMA_FELT).toBe("ai_skema");
    expect(AI_SKEMA_MARKOER).toBe("skive-1");
  });

  it("dom 5: extraordinary_items er stadig UDEN for regnestykkerne — ændres det, skal aiSkema.ts' regnestykke rettes", () => {
    // Selvudløbende: kommer nøglen ind i CANONICAL, er kommentaren i _shared/aiSkema.ts og OVERLEVERINGs åbne punkt forkerte.
    expect(OMK_NOEGLER).not.toContain("extraordinary_items");
    expect(laes("supabase/functions/_shared/aiSkema.ts")).toContain("udaekket = −E");
  });

  // ── CTO-fund 10 (3/10): markøren i ALLE svar — kun svar-hjælperen konstruerer en Response ──
  /** Dommen: alle «new Response(» i filen står inde i funktionen svar, og der er præcis to (preflight + JSON). */
  const kunHjaelperen = (k: string): boolean => {
    const start = k.indexOf("function svar(");
    if (start < 0) return false;
    const slut = k.indexOf("\n}\n", start);
    const krop = k.slice(start, slut);
    const iAlt = k.split("new Response(").length - 1;
    const iHjaelperen = krop.split("new Response(").length - 1;
    return iAlt === 2 && iHjaelperen === 2 && krop.includes("JSON.stringify(medAiSkema(krop))");
  };

  it("dom 6: kun svar-hjælperen konstruerer en Response, og den lægger markøren på (med selvbevis)", () => {
    const k = laes("supabase/functions/extract-financial-data/index.ts");
    expect(kunHjaelperen(k)).toBe(true);
    // SELVBEVIS: et svar uden om hjælperen fælder; en hjælper uden markøren fælder.
    expect(kunHjaelperen(k + "\nconst x = new Response(JSON.stringify({ ok: true }), { status: 200 });\n")).toBe(false);
    expect(kunHjaelperen(k.replace("JSON.stringify(medAiSkema(krop))", "JSON.stringify(krop)"))).toBe(false);
    // Alle 23 svar-steder fra før (fejl, 429/402, dublet, spænd, ikke afsluttet, catch, deterministisk, succes) + hjælperen.
    expect((k.match(/\bsvar\(/g) ?? []).length).toBeGreaterThanOrEqual(24);
  });

  it("dom 7: medAiSkema lægger markøren sidst — en krop kan ikke overskrive den", () => {
    expect(medAiSkema({ error: "x" })).toEqual({ error: "x", ai_skema: "skive-1" });
    expect(medAiSkema({ ai_skema: "gammel" }).ai_skema).toBe("skive-1");
  });
});
