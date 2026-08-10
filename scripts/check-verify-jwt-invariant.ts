/**
 * check-verify-jwt-invariant — CI guardrail (PR 2a i auth-sporet)
 *
 * INVARIANT: Enhver edge-funktion der bruger authenticateServiceRole
 * eller parseJwtClaims SKAL have verify_jwt = true i
 * supabase/config.toml. Begge mønstre læser JWT-claims UDEN
 * signaturverifikation — signaturtjekket er GATEWAYENS ansvar, og
 * gatewayen validerer bevisligt intet for funktioner uden blok eller
 * med false (prod-bevis 10-08-2026). Uden true-blokken kan role-claimet
 * forfalskes af hvem som helst.
 *
 * Funktioner uden blok i config.toml tælles som false — det ER
 * gateway-adfærden i dette projekt.
 *
 * Run: bun run scripts/check-verify-jwt-invariant.ts
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const FUNCTIONS_DIR = "supabase/functions";
const CONFIG_PATH = "supabase/config.toml";

const CLAIM_PATTERNS = ["authenticateServiceRole", "parseJwtClaims"];

/** funktionsnavn → verify_jwt-værdi. Kun blokke i filen optræder;
    opslag på manglende navn skal tolkes som false af kalderen. */
async function readVerifyJwtMap(): Promise<Map<string, boolean>> {
  const text = await readFile(CONFIG_PATH, "utf8");
  const map = new Map<string, boolean>();
  let current: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const block = line.match(/^\[functions\.([^\]]+)\]$/);
    if (block) {
      current = block[1];
      continue;
    }
    const value = line.match(/^verify_jwt\s*=\s*(true|false)$/);
    if (value && current) {
      map.set(current, value[1] === "true");
      current = null;
    }
  }
  return map;
}

async function listFunctionNames(): Promise<string[]> {
  const entries = await readdir(FUNCTIONS_DIR);
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith("_")) continue;
    const indexPath = join(FUNCTIONS_DIR, entry, "index.ts");
    try {
      const s = await stat(indexPath);
      if (s.isFile()) names.push(entry);
    } catch {
      // ingen index.ts — ikke en funktion
    }
  }
  return names.sort();
}

async function main() {
  const verifyJwt = await readVerifyJwtMap();
  const names = await listFunctionNames();

  const affected: { name: string; matched: string[]; verifyJwtTrue: boolean }[] = [];

  for (const name of names) {
    const text = await readFile(join(FUNCTIONS_DIR, name, "index.ts"), "utf8");
    const matched = CLAIM_PATTERNS.filter((p) => text.includes(p));
    if (matched.length === 0) continue;
    affected.push({
      name,
      matched,
      verifyJwtTrue: verifyJwt.get(name) === true, // ingen blok = false
    });
  }

  const fails = affected.filter((a) => !a.verifyJwtTrue);

  console.log("check-verify-jwt-invariant");
  console.log("==========================");
  console.log(`Scanned:    ${names.length} index.ts files`);
  console.log(`Affected:   ${affected.length} (bruger ${CLAIM_PATTERNS.join(" / ")})`);
  console.log("");

  if (fails.length === 0) {
    console.log(`PASS — all ${affected.length} affected functions have verify_jwt = true.`);
    process.exit(0);
  }

  console.log(`FAIL — ${fails.length} function(s) læser JWT-claims uden gateway-signaturtjek:`);
  console.log("");
  for (const f of fails) {
    const blockState = verifyJwt.has(f.name) ? "verify_jwt = false" : "INGEN BLOK (= false)";
    console.log(`  supabase/functions/${f.name}/index.ts`);
    console.log(`    Bruger ${f.matched.join(" + ")} men har ${blockState} i supabase/config.toml.`);
    console.log(`    Claims uden signaturtjek kan forfalskes — tilføj [functions.${f.name}] verify_jwt = true.`);
    console.log("");
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("check-verify-jwt-invariant crashed:", err);
  process.exit(2);
});
