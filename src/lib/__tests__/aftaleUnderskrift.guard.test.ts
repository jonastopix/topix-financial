import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for e-underskriften (UDKAST 18/9-2026). De to edge-funktioner
// importerer esm.sh og kan ikke importeres i vitest; reglerne låses ved
// kildelæsning (sikrIndgangsInvitation.guard-mønstret) med SELVBEVIS på
// kopier (dineMaal.guard-mønstret): hvert prædikat skal fælde en muteret
// kilde, ellers beviser værnet ingenting.
//
// Reglerne der låses:
//   1. Tokenet verificeres FØR nogen anden service-role-handling
//      (verifyAftaletoken før første .from(/.storage/.rpc( efter createClient).
//   2. Koden logges aldrig: ingen console.*-linje bærer variablen `kode`.
//   3. Hash-sammenligningen og aftryk-sammenligningen er konstant-tid.
//   4. Underskriften er atomisk: UPDATE … .eq("status", "sendt"); koden
//      bruges én gang: .is("brugt_at", null); forkerte forsøg tælles i SQL
//      (registrer_kodeforsoeg), aldrig med forsoeg + 1 herfra.
//   5. Sporet skrives kun med insert — aldrig update/delete på aftale_spor.
//   6. KOBLINGEN, to veje, begge EFTER status-skiftet: ansøgningsvejen
//      kalder A's udfoerOvergang({ art: "underskrevet" }, via "e_signatur");
//      virksomhedsvejen indsætter company_betalingslink og kalder
//      udloesIndgangsBetalingsmail (linkrække, så dag 0).
//   7. Adgangen åbner ved BETALING (Jonas 18/9): underskriften sender
//      ALDRIG invitationen og skriver aldrig kontraktdatoer.
//   8. send-til-underskrift: authenticateUser før createClient; has_role
//      advisor; pladsholder-mærket afviser; teksten kanoniseres før hash.
//   9. Prædikatet er registreret i CI-værnet, og config.toml har begge blokke.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const OFFENTLIG = "supabase/functions/aftale-underskrift/index.ts";
const RAADGIVER = "supabase/functions/send-til-underskrift/index.ts";
const offentlig = udenKommentarer(laes(OFFENTLIG));
const raadgiver = udenKommentarer(laes(RAADGIVER));

// ── Dommene (eksporteret, så selvbeviset kan køre dem på kopier) ──

/** 1: verifyAftaletoken( står efter createClient( og før første anden databaseadgang. */
export function tokenFoerstDom(k: string): string | null {
  const client = k.indexOf("createClient(");
  const verify = k.indexOf("verifyAftaletoken(");
  if (client < 0) return "createClient mangler";
  if (verify < 0) return "verifyAftaletoken mangler";
  if (verify < client) return "verifyAftaletoken før createClient";
  const foersteAdgang = Math.min(...[".from(", ".storage", ".rpc("].map((s) => k.indexOf(s, client)).filter((i) => i >= 0));
  return foersteAdgang < verify ? "databaseadgang før verifyAftaletoken" : null;
}

/** 2: ingen console-linje bruger VARIABLEN kode (`${kode}`, `(kode`, `, kode`). Ordet «kode» i en tekst er lovligt. */
export function kodeAldrigLoggetDom(k: string): string[] {
  return k.split("\n").filter((l) => /console\.(log|error|warn|info)\(/.test(l) && /\$\{kode\}|[(,]\s*kode\s*[,)]/.test(l));
}

/** 3: begge sammenligninger går gennem erKonstantTidLig. */
export function konstantTidDom(k: string): string | null {
  if (!/erKonstantTidLig\(kodeRaekke\.kode_hash, await kodeHash\(/.test(k)) return "kodehash sammenlignes ikke i konstant tid";
  if (!/erKonstantTidLig\(aftryk, aftale\.dokument_aftryk\)/.test(k)) return "aftryk sammenlignes ikke i konstant tid";
  if (/kode_hash\s*===|===\s*kodeRaekke\.kode_hash|aftryk\s*===\s*aftale\.dokument_aftryk/.test(k)) return "en === på hash";
  return null;
}

/** 4: atomiske gates og SQL-optælling. */
export function atomiskDom(k: string): string[] {
  const fejl: string[] = [];
  if (!/status: "underskrevet"[\s\S]{0,600}\.eq\("status", "sendt"\)/.test(k)) fejl.push("underskrift uden .eq(status, sendt)");
  if (!/brugt_at: nu\.toISOString\(\)[\s\S]{0,200}\.is\("brugt_at", null\)/.test(k)) fejl.push("kode bruges uden .is(brugt_at, null)");
  if (!k.includes('rpc("registrer_kodeforsoeg"')) fejl.push("forsøg tælles ikke i SQL");
  if (/forsoeg\s*\+\s*1/.test(k)) fejl.push("forsoeg + 1 regnes i funktionen");
  return fejl;
}

/** 5: aftale_spor kun insert. */
export function sporKunInsertDom(k: string): string[] {
  const fejl: string[] = [];
  for (const m of k.matchAll(/\.from\("aftale_spor"\)([\s\S]{0,120})/g)) {
    const kaede = m[1];
    if (/\.(update|delete|upsert)\(/.test(kaede)) fejl.push(kaede.trim().slice(0, 60));
  }
  return fejl;
}

/** 6: begge koblinger står efter status-skiftet — motoren for ansøgninger, B7+B8 for virksomheder. */
export function koblingDom(k: string): string | null {
  const skift = k.indexOf('status: "underskrevet"');
  const link = k.indexOf('.from("company_betalingslink").insert(');
  const dag0 = k.indexOf("udloesIndgangsBetalingsmail(");
  const motor = k.indexOf("udfoerOvergang(admin, { ansoegning: a, handling: { art: \"underskrevet\" }, via: \"e_signatur\"");
  if (skift < 0) return "status-skift mangler";
  if (motor < 0) return "udfoerOvergang(underskrevet, e_signatur) mangler";
  if (link < 0) return "company_betalingslink.insert mangler";
  if (dag0 < 0) return "udloesIndgangsBetalingsmail mangler";
  if (motor < skift || link < skift || dag0 < skift) return "koblingen står FØR underskriften";
  if (dag0 < link) return "dag 0 før linkrækken";
  if (!/if \(aftale\.ansoegning_id\) \{[\s\S]{0,900}udfoerOvergang\(/.test(k)) return "motoren kaldes ikke bag ansoegning_id";
  if (!/else if \(aftale\.company_id\) \{[\s\S]{0,600}company_betalingslink/.test(k)) return "B7 kaldes ikke bag company_id";
  return null;
}

/** 7: ingen invitation, ingen kontraktdatoer, intet adgangsflag ved underskriften. */
export function ingenAdgangVedUnderskriftDom(k: string): string[] {
  const fejl: string[] = [];
  if (/sikrIndgangsInvitation|send-invitation-email|company_invitations/.test(k)) fejl.push("underskriften rører invitationen");
  if (/contract_start_date|contract_end_date/.test(k)) fejl.push("underskriften rører kontraktdatoer");
  if (/ADGANG_VED/.test(k)) fejl.push("det fravalgte flag findes stadig");
  return fejl;
}

/** 8: rådgiverfunktionens form. */
export function raadgiverDom(k: string): string[] {
  const fejl: string[] = [];
  const auth = k.indexOf("authenticateUser(");
  const client = k.indexOf("createClient(");
  if (auth < 0 || client < 0 || auth > client) fejl.push("authenticateUser står ikke før createClient");
  if (!/_role: "advisor"/.test(k)) fejl.push("ingen advisor-gate");
  if (!k.includes("PLADSHOLDER_MAERKE") || !/skabelon\.tekst\.includes\(PLADSHOLDER_MAERKE\)/.test(k)) fejl.push("pladsholder-mærket afviser ikke");
  if (!/sha256Hex\(tekst\)/.test(k) || !/const tekst = kanoniskTekst\(/.test(k)) fejl.push("aftrykket regnes ikke over kanonisk tekst");
  if (!/sendt_af: callerId/.test(k)) fejl.push("sendt_af er ikke rådgiveren");
  return fejl;
}

describe("aftaleUnderskrift.guard — den offentlige funktion", () => {
  it("1: tokenet verificeres før enhver anden databaseadgang", () => expect(tokenFoerstDom(offentlig)).toBeNull());
  it("2: koden logges aldrig", () => expect(kodeAldrigLoggetDom(offentlig)).toEqual([]));
  it("3: hash og aftryk sammenlignes i konstant tid", () => expect(konstantTidDom(offentlig)).toBeNull());
  it("4: underskrift og kodebrug er atomiske, forsøg tælles i SQL", () => expect(atomiskDom(offentlig)).toEqual([]));
  it("5: sporet skrives kun med insert", () => expect(sporKunInsertDom(offentlig)).toEqual([]));
  it("6: begge koblinger står efter underskriften — motoren bag ansoegning_id, linkrække så dag 0 bag company_id", () => expect(koblingDom(offentlig)).toBeNull());
  it("7: underskriften sender ingen invitation og skriver ingen kontraktdatoer (adgang ved betaling)", () => expect(ingenAdgangVedUnderskriftDom(offentlig)).toEqual([]));
});

describe("aftaleUnderskrift.guard — rådgiverfunktionen og registreringen", () => {
  it("8: send-til-underskrift har husets Bucket A-form og fastfryser rigtigt", () => expect(raadgiverDom(raadgiver)).toEqual([]));
  it("9: verifyAftaletoken er registreret i CI-værnet, og config.toml har begge blokke", () => {
    expect(laes("scripts/check-edge-function-auth.ts")).toContain("verifyAftaletoken");
    const toml = laes("supabase/config.toml");
    expect(toml).toMatch(/\[functions\.aftale-underskrift\]\s*\n\s*verify_jwt = false/);
    expect(toml).toMatch(/\[functions\.send-til-underskrift\]\s*\n\s*verify_jwt = true/);
  });
});

describe("selvbevis — hvert prædikat fælder en muteret kopi", () => {
  it("1: verifyAftaletoken flyttet ned under et .from( falder", () => {
    const k = offentlig.replace("const aftale = await verifyAftaletoken(token, admin);", "").replace(
      "const visTekst =",
      'await admin.from("aftale_spor").select("id");\n      const aftale = await verifyAftaletoken(token, admin);\n      const visTekst =',
    );
    expect(tokenFoerstDom(k)).not.toBeNull();
  });
  it("2: en console.log med koden falder", () => {
    const k = offentlig + '\nconsole.log(`kode ${kode}`);\n';
    expect(kodeAldrigLoggetDom(k).length).toBe(1);
  });
  it("3: en === på hash'en falder", () => {
    const k = offentlig.replace("erKonstantTidLig(kodeRaekke.kode_hash, await kodeHash(aftale.id, kode))", "kodeRaekke.kode_hash === await kodeHash(aftale.id, kode)");
    expect(konstantTidDom(k)).not.toBeNull();
  });
  it("4: uden .eq(status, sendt), eller med forsoeg + 1, falder", () => {
    expect(atomiskDom(offentlig.replace('.eq("status", "sendt")', ""))).not.toEqual([]);
    expect(atomiskDom(offentlig + "\nconst x = forsoeg + 1;\n")).not.toEqual([]);
  });
  it("5: en update på aftale_spor falder", () => {
    expect(sporKunInsertDom(offentlig + '\nawait admin.from("aftale_spor").update({ ip: null }).eq("id", 1);\n')).not.toEqual([]);
  });
  it("6: koblingen flyttet foran underskriften, eller motoren uden e_signatur, falder", () => {
    const k = offentlig.replace('.from("company_betalingslink").insert(', "").replace(
      'status: "underskrevet"',
      'x = admin.from("company_betalingslink").insert({}); status: "underskrevet"',
    );
    expect(koblingDom(k)).not.toBeNull();
    expect(koblingDom(offentlig.replace('via: "e_signatur"', 'via: "raadgiver"'))).not.toBeNull();
  });
  it("7: et kald til sikrIndgangsInvitation eller en kontraktdato falder", () => {
    expect(ingenAdgangVedUnderskriftDom(offentlig + "\nawait sikrIndgangsInvitation(admin, aftale.company_id, aftale.id);\n")).not.toEqual([]);
    expect(ingenAdgangVedUnderskriftDom(offentlig + "\nawait admin.from(\"companies\").update({ contract_end_date: x });\n")).not.toEqual([]);
  });
  it("8: rådgiverfunktionen uden advisor-gate eller uden pladsholder-tjek falder", () => {
    expect(raadgiverDom(raadgiver.replace('_role: "advisor"', '_role: "member"'))).not.toEqual([]);
    expect(raadgiverDom(raadgiver.replace("skabelon.tekst.includes(PLADSHOLDER_MAERKE)", "false"))).not.toEqual([]);
  });
});
