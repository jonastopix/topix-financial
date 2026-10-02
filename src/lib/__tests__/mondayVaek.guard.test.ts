import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Kildeværn: Monday er væk (2/10-2026). Jonas 1/10 kl. 22:18: «Vi bruger
// ikke Monday mere. Det er opsagt. Så kald fra Monday skal bare væk.»
//
// Afløser mondayVaern.guard (14/9), som låste værnets rækkefølge i en
// function, der ikke findes mere i den form. Det, der låses nu:
//   1. monday-webhook svarer 410 på alt og gør INTET andet: ingen parsing,
//      ingen env, ingen service-role, ingen database, ingen fetch. Det er
//      grunden til, at den må stå uden auth-prædikat (CI-værnet springer
//      den over som «skip-no-sr») — og den grund må ikke forsvinde stille.
//   2. Ingen function kalder Monday's API eller læser en Monday-secret.
//   3. De Monday-specifikke delte filer er væk, og ingen importerer dem.
//   4. CI-værnets prædikatliste bærer ikke et prædikat, ingen fil kan
//      opfylde (verifyMondayJwt).
//   5. config.toml holder functionen nåbar (verify_jwt = false), så 410-
//      beviset kan måles — bag verify_jwt = true ville gatewayen svare 401.
// Kilde-læsning frem for import: index.ts kalder Deno.serve ved import.

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const WEBHOOK = "supabase/functions/monday-webhook/index.ts";

/** Alle .ts/.tsx under en mappe, rekursivt (tests og _shared medregnet). */
function alleKildefiler(mappe: string): string[] {
  const ud: string[] = [];
  const gaa = (sti: string) => {
    for (const navn of readdirSync(sti)) {
      const fuld = join(sti, navn);
      if (statSync(fuld).isDirectory()) gaa(fuld);
      else if (/\.tsx?$/.test(navn)) ud.push(fuld);
    }
  };
  gaa(resolve(ROD, mappe));
  return ud.map((f) => f.slice(ROD.length + 1));
}

describe("mondayVaek.guard — monday-webhook svarer 410 og gør intet andet", () => {
  const kilde = udenKommentarer(laes(WEBHOOK));

  it("har et HTTP-indgangspunkt og svarer 410", () => {
    expect(kilde).toMatch(/Deno\.serve\s*\(/);
    expect(kilde).toMatch(/status:\s*410/);
  });

  it("parser ingen body: hverken req.json() eller req.text()", () => {
    expect(kilde).not.toMatch(/\.json\s*\(/);
    expect(kilde).not.toMatch(/\.text\s*\(/);
    expect(kilde).not.toMatch(/\.formData\s*\(/);
  });

  it("læser ingen env, bygger ingen klient, rører ingen database, kalder intet ud", () => {
    expect(kilde).not.toMatch(/Deno\.env/);
    expect(kilde).not.toMatch(/createClient/);
    expect(kilde).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(kilde).not.toMatch(/\bfetch\s*\(/);
    expect(kilde).not.toMatch(/\bimport\b/);
    expect(kilde).not.toMatch(/MONDAY_/);
    expect(kilde).not.toMatch(/api\.monday\.com/);
  });

  it("svarer ens på alt: ingen forgrening på metode, header, URL eller body", () => {
    expect(kilde).not.toMatch(/req\.method/);
    expect(kilde).not.toMatch(/req\.headers/);
    expect(kilde).not.toMatch(/req\.url/);
    expect(kilde).not.toMatch(/challenge/);
  });
});

describe("mondayVaek.guard — ingen function kalder Monday, ingen læser en Monday-secret", () => {
  const functions = alleKildefiler("supabase/functions");

  it("api.monday.com står ingen steder i functions (uden kommentarer)", () => {
    const ramt = functions.filter((f) => /api\.monday\.com/.test(udenKommentarer(laes(f))));
    expect(ramt).toEqual([]);
  });

  it("MONDAY_API_TOKEN, MONDAY_SIGNING_SECRET og MONDAY_WEBHOOK_SECRET læses ingen steder", () => {
    const ramt = functions.filter((f) => /MONDAY_(API_TOKEN|SIGNING_SECRET|WEBHOOK_SECRET)/.test(udenKommentarer(laes(f))));
    expect(ramt).toEqual([]);
  });
});

describe("mondayVaek.guard — de Monday-specifikke delte filer er væk, og ingen importerer dem", () => {
  const VAEK = [
    "supabase/functions/_shared/mondayVaern.ts",
    "supabase/functions/_shared/mondayAnsoegning.ts",
    "supabase/functions/_shared/mondayAnsoegning_test.ts",
    "src/lib/__tests__/mondayVaern.test.ts",
    "src/lib/__tests__/mondayVaern.guard.test.ts",
  ];

  it("filerne findes ikke", () => {
    for (const f of VAEK) expect(existsSync(resolve(ROD, f)), f).toBe(false);
  });

  it("ingen fil under src eller supabase/functions importerer mondayVaern eller mondayAnsoegning", () => {
    const alle = [...alleKildefiler("src"), ...alleKildefiler("supabase/functions")];
    const ramt = alle.filter((f) => /from\s+["'][^"']*monday(Vaern|Ansoegning)(\.ts)?["']/.test(udenKommentarer(laes(f))));
    expect(ramt).toEqual([]);
  });
});

describe("mondayVaek.guard — CI-værnet og config.toml", () => {
  it("check-edge-function-auth.ts bærer ikke længere prædikatet verifyMondayJwt (ingen fil kan opfylde det)", () => {
    const script = udenKommentarer(laes("scripts/check-edge-function-auth.ts"));
    expect(script).not.toMatch(/verifyMondayJwt/);
  });

  it("config.toml holder monday-webhook nåbar (verify_jwt = false), så 410-beviset kan måles", () => {
    const toml = laes("supabase/config.toml");
    expect(toml).toMatch(/\[functions\.monday-webhook\]\s*\n\s*verify_jwt = false/);
  });
});
