import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (19/9-2026): de TO Meta-nøglesæt må ikke smelte sammen.
//
//   META_ADS_TOKEN + META_AD_ACCOUNT_ID   Marketing API — HENTER vores egne annoncetal hjem (ads_read)
//   META_PIXEL_ID  + META_CAPI_TOKEN      Conversions API — SENDER hændelser til pixlen
//
// MIDLERTIDIGT lige nu: tokenet blev genereret med ads_read, men sat under
// navnet META_CAPI_TOKEN, og værdien kan ikke vises igen. Marketing API falder
// derfor tilbage på det navn (_shared/metaAdsToken.ts).
//
// FÆLDEN, DETTE VÆRN LUKKER: den dag Conversions API går i drift, vil
// META_CAPI_TOKEN bære et token med adgang til PIXLEN — ikke til
// annoncekontoen. Står faldbacken der stadig, kalder Marketing API med det
// forkerte token og får 403'er, som ingen leder efter.
//
// Derfor er dommen KOBLET: findes `_shared/metaCapi.ts` i repoet (= Conversions
// API er landet), må Marketing API-vejen ikke længere nævne META_CAPI_TOKEN.
// Suiten går rød i samme øjeblik — ingen skal huske oprydningen.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const findes = (sti: string) => existsSync(resolve(process.cwd(), sti));

const TOKEN = "supabase/functions/_shared/metaAdsToken.ts";
const OPSLAG = "supabase/functions/meta-annonce-opslag/index.ts";
const CRON = "supabase/functions/meta-annoncer-cron/index.ts";
/** Findes denne, er Conversions API landet i repoet (det gamle udkasts navn — koblingen i dom 4). */
const CAPI = "supabase/functions/_shared/metaCapi.ts";
/** Afsendelsen (udkast 21/9 aften): eget secret-navn META_SEND_TOKEN, læst ét sted. */
const SEND_DOM = "supabase/functions/_shared/metaSend.ts";
const SEND_AFSENDELSE = "supabase/functions/_shared/metaSendAfsendelse.ts";
const SEND_CRON = "supabase/functions/meta-send-cron/index.ts";

/** 1. Rækkefølgen: det rigtige navn FØRST, nødnavnet kun som fald. */
export function rigtigtNavnFoerst(kilde: string): boolean {
  const iRigtigt = kilde.indexOf("Deno.env.get(ADS_TOKEN_NAVN)");
  const iNoed = kilde.indexOf("Deno.env.get(ADS_TOKEN_NOEDNAVN)");
  return iRigtigt !== -1 && iNoed !== -1 && iRigtigt < iNoed;
}

/** 2. Faldbacken bor ÉT sted — functions læser aldrig navnene selv. */
export function kunEtSted(opslag: string, cron: string): boolean {
  return [opslag, cron].every(
    (k) => k.includes("metaAdsToken()") && !/Deno\.env\.get\(\s*["']META_(ADS|CAPI)_TOKEN["']\s*\)/.test(k),
  );
}

/**
 * 3. KOBLINGEN. Er Conversions API landet, må Marketing API-vejen ikke længere
 * kende META_CAPI_TOKEN. Er den ikke landet, er faldbacken tilladt.
 */
export function faldbackFjernetNaarCapiLander(capiFindes: boolean, token: string, opslag: string, cron: string): boolean {
  const naevner = [token, opslag, cron].some((k) => k.includes("META_CAPI_TOKEN"));
  return capiFindes ? !naevner : true;
}

/** 6. Afsendelsens tre filer: kun META_SEND_TOKEN, læst i afsendelsen alene; annoncehentningens navne forekommer ikke — og omvendt. */
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
export function afsendelsenErAdskilt(domRaa: string, afsendelseRaa: string, cronRaa: string, tokenRaa: string): boolean {
  // Koden, ikke kommentarerne: filhovederne SKAL kunne forklare adskillelsen med navnene.
  const dom = udenKommentarer(domRaa), afsendelse = udenKommentarer(afsendelseRaa), cron = udenKommentarer(cronRaa), token = udenKommentarer(tokenRaa);
  const alle = [dom, afsendelse, cron];
  const envKald = (k: string) => [...k.matchAll(/Deno\.env\.get\(\s*([^)]+?)\s*\)/g)].map((m) => m[1]);
  return dom.includes('export const META_SEND_TOKEN_NAVN = "META_SEND_TOKEN";') &&
    alle.every((k) => !k.includes("META_CAPI_TOKEN") && !k.includes("META_ADS_TOKEN") && !k.includes("META_PIXEL_ID")) &&
    envKald(afsendelse).join(",") === "META_SEND_TOKEN_NAVN" &&
    envKald(dom).length === 0 &&
    envKald(cron).every((n) => n === '"SUPABASE_URL"' || n === '"SUPABASE_SERVICE_ROLE_KEY"') &&
    !token.includes("META_SEND_TOKEN");
}

describe("metaTokenAdskillelse.guard — de to Meta-nøglesæt", () => {
  it("1. Marketing API læser det rigtige navn først, nødnavnet kun som fald", () => {
    expect(rigtigtNavnFoerst(laes(TOKEN))).toBe(true);
  });

  it("2. faldbacken bor ét sted — ingen function læser secret-navnene selv", () => {
    expect(kunEtSted(laes(OPSLAG), laes(CRON))).toBe(true);
  });

  it("3. genvejen er beskrevet med dato og grund — så den næste ikke læser den som sjusk", () => {
    const t = laes(TOKEN);
    expect(t).toContain("19/9-2026");
    expect(t).toMatch(/ikke sjusk|IKKE SJUSK/i);
    // Og den siger højt, hvad der skal ske, når Conversions API går i drift.
    expect(t).toContain("metaTokenAdskillelse.guard.test.ts");
  });

  it("4. KOBLINGEN: lander Conversions API, skal faldbacken være væk", () => {
    // I dag findes _shared/metaCapi.ts ikke → faldbacken er tilladt, og dommen er sand.
    // Den dag udkastet lægges ind UDEN at faldbacken fjernes, bliver denne rød.
    expect(faldbackFjernetNaarCapiLander(findes(CAPI), laes(TOKEN), laes(OPSLAG), laes(CRON))).toBe(true);
  });

  it("6. afsendelsen (meta-send) læser KUN META_SEND_TOKEN, ét sted, og nævner aldrig META_CAPI_TOKEN/META_ADS_TOKEN; metaAdsToken.ts nævner aldrig META_SEND_TOKEN", () => {
    expect(afsendelsenErAdskilt(laes(SEND_DOM), laes(SEND_AFSENDELSE), laes(SEND_CRON), laes(TOKEN))).toBe(true);
  });
  it("5. de to sæt deler ingen kode: Conversions API-navnene står ikke i Marketing API-motoren", () => {
    const motor = laes("supabase/functions/_shared/metaAnnoncer.ts");
    for (const navn of ["META_PIXEL_ID", "META_CAPI_TOKEN", "META_TEST_EVENT_CODE"]) {
      expect(motor).not.toContain(navn);
    }
  });
});

describe("metaTokenAdskillelse.guard — dommene fanger fejlen på en kopi", () => {
  it("rækkefølgen vendt om → falsk", () => {
    const t = laes(TOKEN);
    const vendt = t
      .replace("Deno.env.get(ADS_TOKEN_NAVN)", "__A__")
      .replace("Deno.env.get(ADS_TOKEN_NOEDNAVN)", "Deno.env.get(ADS_TOKEN_NAVN)")
      .replace("__A__", "Deno.env.get(ADS_TOKEN_NOEDNAVN)");
    expect(vendt).not.toBe(t);
    expect(rigtigtNavnFoerst(vendt)).toBe(false);
  });

  it("en function der læser navnet selv → falsk", () => {
    const snyd = laes(OPSLAG).replace("metaAdsToken()", 'Deno.env.get("META_CAPI_TOKEN")');
    expect(snyd).not.toBe(laes(OPSLAG));
    expect(kunEtSted(snyd, laes(CRON))).toBe(false);
  });

  it("6. afsendelsen der læser META_CAPI_TOKEN, cronen der læser tokenet selv, eller metaAdsToken.ts der nævner META_SEND_TOKEN → falsk", () => {
    const d = laes(SEND_DOM), a = laes(SEND_AFSENDELSE), c = laes(SEND_CRON), t = laes(TOKEN);
    expect(afsendelsenErAdskilt(d, a.replace("Deno.env.get(META_SEND_TOKEN_NAVN)", 'Deno.env.get("META_CAPI_TOKEN")'), c, t)).toBe(false);
    expect(afsendelsenErAdskilt(d, a, c + '\nconst x = Deno.env.get("META_SEND_TOKEN");\n', t)).toBe(false);
    expect(afsendelsenErAdskilt(d, a, c, t + '\nexport const SEND = "META_SEND_TOKEN";\n')).toBe(false);
  });
  it("KOBLINGEN: med Conversions API i repoet og faldbacken tilbage → falsk", () => {
    // Præcis den fremtid, værnet findes for: metaCapi.ts er landet, og faldbacken står endnu.
    expect(faldbackFjernetNaarCapiLander(true, laes(TOKEN), laes(OPSLAG), laes(CRON))).toBe(false);
    // Og uden faldbacken er den grøn igen — også med Conversions API landet.
    const ryddet = laes(TOKEN).replace(/META_CAPI_TOKEN/g, "META_ADS_TOKEN");
    expect(faldbackFjernetNaarCapiLander(true, ryddet, laes(OPSLAG), laes(CRON))).toBe(true);
  });
});
