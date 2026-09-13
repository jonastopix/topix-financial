import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for hjemkomsten fra Stripe på /betal (fund A, 14/9): siden SKAL
// læse hintet opret-indgangs-checkout sætter i success_url, dømme gennem
// betalKvittering, og vise kvitteringen FØR sine egne skærme — så én der
// lige har betalt aldrig ser «Vi finder dit tilbud…» eller, værre,
// betalingsknapperne igen. Kildelæsning frem for import (betaltSession.guard-
// mønstret): fladen er React/Supabase-kode, functionen er Deno.

const FLADE = "src/pages/Betal.tsx";
const CHECKOUT = "supabase/functions/opret-indgangs-checkout/index.ts";
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

describe("betalKvittering.guard — hjemkomsten fra Stripe", () => {
  it("checkout sætter betalt=1 i success_url og KUN dér — cancel_url bærer det ikke", () => {
    const kode = udenKommentarer(laes(CHECKOUT));
    expect(kode).toMatch(/"success_url":\s*`[^`]*\/betal\?token=\$\{tokenParam\}&betalt=1`/);
    expect(kode).toMatch(/"cancel_url":\s*`[^`]*\/betal\?token=\$\{tokenParam\}`/);
    expect(kode.split("betalt=1").length - 1).toBe(1);
  });

  it("siden læser hintet gennem dommen — parameternavnet skrives ikke frit i fladen", () => {
    const kode = udenKommentarer(laes(FLADE));
    expect(kode).toContain("laesBetaltHint(searchParams.get(BETALT_PARAM))");
    expect(kode).toContain("afgoerKvittering({");
    expect(kode).toContain("skalHenteIgen(kvittering)");
    expect(kode).not.toContain('searchParams.get("betalt")');
  });

  it("kvitteringsskærmene står FØR henter-skærmen, så kvitteringen vises straks", () => {
    const kode = udenKommentarer(laes(FLADE));
    const bekraefter = kode.indexOf('kvittering === "bekraefter"');
    const ubekraeftet = kode.indexOf('kvittering === "ubekraeftet"');
    const henter = kode.indexOf('opslag.tilstand === "henter") {');
    expect(bekraefter).toBeGreaterThan(-1);
    expect(ubekraeftet).toBeGreaterThan(bekraefter);
    expect(henter, "henter-skærmen mangler").toBeGreaterThan(ubekraeftet);
  });

  it("ingen af kvitteringsskærmene åbner Checkout — vaelg( og betalingsknapperne står først efter dem", () => {
    const kode = udenKommentarer(laes(FLADE));
    const start = kode.indexOf('kvittering === "bekraefter"');
    const slut = kode.indexOf('opslag.tilstand === "henter") {');
    const kvitteringer = kode.slice(start, slut);
    expect(kvitteringer).not.toContain("vaelg(");
    expect(kvitteringer).not.toContain("alleIndgangsmuligheder(");
    expect(kvitteringer).not.toContain("opret-indgangs-checkout");
    // Udgangene i den ubekræftede skærm: Tjek igen (nyt vindue) og Skriv til os.
    expect(kvitteringer).toContain("onClick={tjekIgen}");
    expect(kvitteringer).toContain("MAILTO_BETALING");
  });

  it("vinduet er state med egen timer (Index.tsx-lærdommen) og de stille hentninger stopper med dommen", () => {
    const kode = udenKommentarer(laes(FLADE));
    expect(kode).toContain("setTimeout(() => setOverskredet(true), KVITTERING_GRAENSE_MS)");
    expect(kode).toContain("setTimeout(hentStille, KVITTERING_RETRY_MS)");
    // Stille hentning må ikke falde tilbage til spinneren.
    expect(kode).toContain('if (!forsoeg.stille) setOpslag({ tilstand: "henter" });');
  });

  it("hooks står i topblokken: ingen return før den sidste hook (React #310)", () => {
    const kode = udenKommentarer(laes(FLADE));
    const krop = kode.slice(kode.indexOf("export default function Betal()"));
    const sidsteHook = Math.max(krop.lastIndexOf("useEffect("), krop.lastIndexOf("useCallback("), krop.lastIndexOf("useState"));
    const foersteReturn = krop.indexOf("\n  if (");
    expect(foersteReturn).toBeGreaterThan(sidsteHook);
  });
});
