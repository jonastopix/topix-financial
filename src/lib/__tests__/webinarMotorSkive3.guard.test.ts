import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for webinarmotoren, skive 3 (30/9-2026). Hver dom har en MUTATION,
 * der viser, at værnet fælder den fejl, det er sat til at fange.
 *
 *   1. ORDENE (Jonas' D2.1): «optaget»/«optagelse» og «live» står ALDRIG i
 *      seerens tekster — strenge og JSX-tekst i rummet, tilmeldingen,
 *      motorens domme og mailteksterne. Kodeord («live» som visningens navn,
 *      aria-live) er undtaget: kun tekst med et mellemrum, et stort bogstav
 *      eller JSX-tekst dømmes.
 *   2. MAILVEJEN: webinar-mail-cron's dom og eWebinar-vejen er urørte —
 *      planlaegKoersel, loftet og budgettet kaldes som før, hovedforespørgslen
 *      læser de samme kolonner (ingen skive 1-kolonne, så cronen virker FØR
 *      migrationerne), og hentInvitation kaldes KUN på eWebinars vej. Motorens
 *      .ics bygges i processen.
 *   3. WEBINAR-MOTOR-CRON: Bucket B med verify_jwt = true, tørkørsel som
 *      standard, låsen (eller en intern session), Klaviyo ad den EKSISTERENDE
 *      vej (byggFremmoede → sendHvisMail, ingen egen fetch), loggen EFTER
 *      afsendelsen, opbevaringen kun i den globale kørsel med låsen.
 *   4. DEN INTERNE SESSION: internDom står FØR offentligTilmeldDom i webinar-tilmeld;
 *      «sessioner» viser kun den interne, når der spørges efter den; rummet
 *      tilbyder den kun husets adresser.
 *   5. MIGRATIONERNE: første linje, kun tilføjende, kun rådgivere (ingen anon,
 *      ingen SECURITY DEFINER), interaktioner kun i kladden, tidsstempel efter
 *      20260930152000.
 *   6. OPSÆTNINGEN: /webinar/motor bag AdvisorRoute, i ingen menu; fladen
 *      skriver kun gennem hooken.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const udenSql = (s: string) => s.replace(/--[^\n]*/g, "");
const MAIL_CRON = "supabase/functions/webinar-mail-cron/index.ts";
const MOTOR_CRON = "supabase/functions/webinar-motor-cron/index.ts";
const TILMELD = "supabase/functions/webinar-tilmeld/index.ts";
const RUM = "supabase/functions/webinar-rum/index.ts";
const MIG = "supabase/migrations/20260930160000_webinarmotor_skive3.sql";
const MIG_CRON = "supabase/migrations/20260930161000_webinar_motor_cron.sql";

// ── 1. Ordene ────────────────────────────────────────────────────────────────

const FORBUDT = /(?<![\p{L}\p{N}_-])(optaget|optagelse|live)(?![\p{L}\p{N}_-])/iu;

/** Strengliteraler og JSX-tekst i en kildefil — uden kommentarer. */
export function seerTekster(kilde: string, jsx: boolean): string[] {
  const k = udenKommentarer(kilde);
  const ud: string[] = [];
  for (const m of k.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) ud.push(m[1] ?? m[2] ?? m[3] ?? "");
  if (jsx) for (const m of k.matchAll(/>([^<>{}]*[\p{L}][^<>{}]*)</gu)) ud.push(m[1]);
  return ud;
}

/** Et kodeord: små bogstaver, tal, _ og - uden mellemrum (visningens «live», «aria-live»). */
const erKodeord = (s: string) => /^[a-z0-9_:-]*$/.test(s.trim());

export function forbudteOrd(kilde: string, jsx: boolean): string[] {
  return seerTekster(kilde, jsx).filter((t) => !erKodeord(t)).filter((t) => FORBUDT.test(t));
}

const SEER_FILER = [
  ...readdirSync(resolve(ROD, "src/components/webinarRum")).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).map((f) => `src/components/webinarRum/${f}`),
  ...readdirSync(resolve(ROD, "src/lib/webinarRum")).filter((f) => f.endsWith(".ts")).map((f) => `src/lib/webinarRum/${f}`),
  ...readdirSync(resolve(ROD, "src/lib/webinarMotor")).filter((f) => f.endsWith(".ts")).map((f) => `src/lib/webinarMotor/${f}`),
  "src/pages/WebinarSide.tsx",
  "supabase/functions/_shared/webinarMailTekster.ts",
  "supabase/functions/_shared/webinarMotorMail.ts",
];

describe("webinarMotorSkive3.guard 1 — «optaget» og «live» står aldrig i seerens tekster", () => {
  for (const f of SEER_FILER) {
    it(`${f}`, () => {
      expect(forbudteOrd(laes(f), f.endsWith(".tsx"))).toEqual([]);
    });
  }
  it("værnet ser noget: rummets filer har tekst at dømme", () => {
    expect(seerTekster(laes("src/components/webinarRum/Afspiller.tsx"), true)).toContain("Webinaret kører videre.");
    expect(seerTekster(laes("src/components/webinarRum/Afspiller.tsx"), true).some((t) => t.includes("Tilbage til webinaret"))).toBe(true);
  });
  it("MUTATION: «Tilbage til live» som JSX-tekst fanges", () => {
    const k = laes("src/components/webinarRum/Afspiller.tsx").replace("Webinaret kører videre.</p>", "Webinaret kører videre live.</p>");
    expect(k).not.toBe(laes("src/components/webinarRum/Afspiller.tsx"));
    expect(forbudteOrd(k, true)).toContain("Webinaret kører videre live.");
    expect(forbudteOrd(laes("src/components/webinarRum/Afspiller.tsx").replace("> Tilbage til webinaret", "> Tilbage til live"), true).length).toBeGreaterThan(0);
  });
  it("MUTATION: «optaget» i en streng fanges — også med stort begyndelsesbogstav", () => {
    const k = laes("src/components/webinarRum/InteraktionsKort.tsx").replace('"Ansøgningsfristen lukker om"', '"Optaget lukker om"');
    expect(forbudteOrd(k, true)).toEqual(["Optaget lukker om"]);
    expect(forbudteOrd('const a = "Webinaret er optaget på forhånd";', false)).toHaveLength(1);
    expect(forbudteOrd("const a = `Se det Live nu`;", false)).toHaveLength(1);
  });
  it("kodeord og kommentarer er undtaget", () => {
    expect(forbudteOrd('if (visning === "live") x = "aria-live"; // Tilbage til live', false)).toEqual([]);
    expect(forbudteOrd('/* optaget */ const z = "polite";', false)).toEqual([]);
    expect(forbudteOrd('const s = "levende billeder";', false)).toEqual([]);
  });
});

// ── 2. Mailvejen ─────────────────────────────────────────────────────────────

export function mailvejenErRigtig(kilde: string): boolean {
  const k = udenKommentarer(kilde);
  const koer = k.slice(k.indexOf("async function koer("), k.indexOf("async function skrivAlarm("));
  // Dommen, loftet og budgettet som før.
  if (!koer.includes("planlaegKoersel({ raekker, afmeldte, sendte, fejlede, ukendte, nu: a.nu })")) return false;
  if (!koer.includes("beregnKoerselsLoft({ seneste: loftRaekker, loft: MAILGUN_LOFT_PR_TIME, nu: loftNu })")) return false;
  if (!koer.includes("budgetTillader({ forloebetMs, medInvitation: baererInvitation(s.art) })")) return false;
  // Hovedforespørgslen læser de samme kolonner — ingen motor-kolonne (virker før migrationerne).
  if (!koer.includes('.select("ewebinar_id, email, navn, session_tid, registreret_at, webinar_titel, subscribed, sidste_action, join_link, kalender_link, replay_link")')) return false;
  // hentInvitation præcis én gang, i else-grenen efter motorens vej.
  if ((koer.match(/hentInvitation\(/g) ?? []).length !== 1) return false;
  const motorGren = koer.indexOf('invitation = "hentet";\n        ics = motorIcs;');
  const hent = koer.indexOf("hentInvitation(s.kalenderLink)");
  const elseGren = koer.indexOf("} else {", motorGren);
  if (motorGren < 0 || elseGren < 0 || !(motorGren < elseGren && elseGren < hent)) return false;
  // Motorens .ics er bygget i processen — og mailen får de udledte links.
  if (!koer.includes("ics = motorIcs;")) return false;
  if (!/joinLink,\s*\n\s*kalenderLink,/.test(koer)) return false;
  // Vejen dømmes af den rene dom, og motorens rækker slås kun op for «P-».
  return koer.includes("mailVejDom(s.ewebinarId, motorOpslag.get(s.ewebinarId), motorSecret !== null)") && koer.includes(".filter(erMotorId)");
}

describe("webinarMotorSkive3.guard 2 — mailvejen: eWebinar urørt, motoren med egne links og .ics", () => {
  it("cronen er rigtig", () => expect(mailvejenErRigtig(laes(MAIL_CRON))).toBe(true));
  it("svaret bærer beviset `motor_mail`", () => {
    expect(laes(MAIL_CRON)).toMatch(/motor_mail: MotorMailTal;/);
    expect(laes(MAIL_CRON)).toMatch(/motor_mail: tomtMotorMailTal\(\)/);
  });
  it("MUTATION: hentInvitation på motorens vej fanges", () => {
    const m = laes(MAIL_CRON).replace("ics = motorIcs;", "ics = (await hentInvitation(kalenderLink)).ics;");
    expect(m).not.toBe(laes(MAIL_CRON));
    expect(mailvejenErRigtig(m)).toBe(false);
  });
  it("MUTATION: en skive 1-kolonne i hovedforespørgslen fanges", () => {
    const m = laes(MAIL_CRON).replace("join_link, kalender_link, replay_link\")", "join_link, kalender_link, replay_link, kilde_system\")");
    expect(m).not.toBe(laes(MAIL_CRON));
    expect(mailvejenErRigtig(m)).toBe(false);
  });
  it("MUTATION: eWebinars links udskiftet for alle fanges", () => {
    const m = laes(MAIL_CRON).replace("      joinLink,\n      kalenderLink,", "      joinLink: s.joinLink,\n      kalenderLink: s.kalenderLink,");
    expect(m).not.toBe(laes(MAIL_CRON));
    expect(mailvejenErRigtig(m)).toBe(false);
  });
});

// ── 3. webinar-motor-cron ────────────────────────────────────────────────────

const foer = (s: string, a: string, b: string) => s.indexOf(a) >= 0 && s.indexOf(b) >= 0 && s.indexOf(a) < s.indexOf(b);

export function motorCronErRigtig(kilde: string, config: string): boolean {
  const k = udenKommentarer(kilde);
  const serve = k.slice(k.indexOf("Deno.serve("));
  if (!foer(serve, "await authenticateServiceRole(req)", "createClient(")) return false;
  if (!/\[functions\.webinar-motor-cron\]\s*\n\s*verify_jwt = true/.test(config)) return false;
  if (!k.includes("const toerKoersel = raaBody.dry_run !== false;")) return false;
  if (!k.includes('export const LAAS_NOEGLE = "webinar_motor_aktiv";')) return false;
  if (!k.includes("r.sender_rigtigt = !a.toerKoersel && (a.laas || proeveIntern);")) return false;
  if (!k.includes("const proeveIntern = a.sessionId !== null && sessioner.length === 1 && sessioner[0].intern === true;")) return false;
  if (!k.includes("if (!a.senderRigtigt) continue;")) return false;
  // Klaviyo ad den eksisterende vej, aldrig en egen fetch.
  if (/\bfetch\(/.test(k)) return false;
  if (!k.includes("afgoerOvergang(gradFoer, gradEfter)") || !k.includes("byggFremmoede(overgang,") || !k.includes("await sendHvisMail(admin, haendelse)")) return false;
  // Loggen EFTER afsendelsen.
  if (!foer(k, "await sendHvisMail(admin, haendelse)", 'art: "fremmoede_dom"')) return false;
  // Opbevaringen: sletning kun i den globale kørsel og kun med låsen.
  const opb = k.slice(k.indexOf("if (a.sessionId === null) {"));
  if (!opb.startsWith("if (a.sessionId === null) {")) return false;
  if (!foer(opb, "if (!a.toerKoersel && a.laas) {", '.from("webinar_pulser").delete(')) return false;
  if ((k.match(/\.from\("webinar_pulser"\)\.delete\(/g) ?? []).length !== 1) return false;
  // `nu` kun i en tørkørsel.
  return k.includes('if (harNu && !toerKoersel) return json({ motor: MOTOR_VERSION, error: "nu_kun_i_toerkoersel" }, 400);');
}

describe("webinarMotorSkive3.guard 3 — webinar-motor-cron", () => {
  it("formen er rigtig", () => expect(motorCronErRigtig(laes(MOTOR_CRON), laes("supabase/config.toml"))).toBe(true));
  it("svaret bærer beviset `motor`", () => expect(laes(MOTOR_CRON)).toMatch(/motor: MOTOR_VERSION, ok: true/));
  it("MUTATION: låsen sprunget over fanges", () => {
    const m = laes(MOTOR_CRON).replace("(a.laas || proeveIntern)", "true");
    expect(motorCronErRigtig(m, laes("supabase/config.toml"))).toBe(false);
  });
  it("MUTATION: sletning af pulser i prøven eller uden lås fanges", () => {
    const m = laes(MOTOR_CRON).replace("if (!a.toerKoersel && a.laas) {", "if (!a.toerKoersel) {");
    expect(m).not.toBe(laes(MOTOR_CRON));
    expect(motorCronErRigtig(m, laes("supabase/config.toml"))).toBe(false);
  });
  it("MUTATION: en egen fetch til Klaviyo fanges", () => {
    const m = laes(MOTOR_CRON).replace("const s = await sendHvisMail(admin, haendelse);", 'const s = await sendHvisMail(admin, haendelse); await fetch("https://a.klaviyo.com/api/events/");');
    expect(motorCronErRigtig(m, laes("supabase/config.toml"))).toBe(false);
  });
  it("MUTATION: verify_jwt = false fanges", () => {
    const c = laes("supabase/config.toml").replace("[functions.webinar-motor-cron]\n    verify_jwt = true", "[functions.webinar-motor-cron]\n    verify_jwt = false");
    expect(c).not.toBe(laes("supabase/config.toml"));
    expect(motorCronErRigtig(laes(MOTOR_CRON), c)).toBe(false);
  });
});

// ── 4. Den interne session ───────────────────────────────────────────────────

export function internErRigtig(tilmeld: string, rum: string): boolean {
  const t = udenKommentarer(tilmeld), r = udenKommentarer(rum);
  if (!foer(t, "internDom(sessionIntern, ind.email)", "offentligTilmeldDom(")) return false;
  if (!t.includes("if (!intern.ok) return svar(req, { fejl: intern.grund }, 403);")) return false;
  if (!t.includes("naesteSessioner(bagLaasen(valg, offentligAaben), nuMs, bestemt !== null ? 1 : undefined, bestemt !== null)")) return false;
  const rumKald = [...r.matchAll(/naesteSessioner\(([\s\S]*?)\)\[0\]/g)].map((m) => m[1]);
  return rumKald.length === 2 && rumKald.every((a) => a.includes("erInternAdresse(d.email)"));
}

describe("webinarMotorSkive3.guard 4 — den interne prøvesession", () => {
  it("tilmeld og rum dømmer den", () => expect(internErRigtig(laes(TILMELD), laes(RUM))).toBe(true));
  it("MUTATION: internDom efter offentligTilmeldDom fanges", () => {
    const t = laes(TILMELD).replace("const intern = internDom(sessionIntern, ind.email);", "const intern = { ok: true } as const;");
    expect(internErRigtig(t, laes(RUM))).toBe(false);
  });
  it("MUTATION: den offentlige liste med interne fanges", () => {
    const t = laes(TILMELD).replace("bestemt !== null ? 1 : undefined, bestemt !== null)", "bestemt !== null ? 1 : undefined, true)");
    expect(t).not.toBe(laes(TILMELD));
    expect(internErRigtig(t, laes(RUM))).toBe(false);
  });
  it("MUTATION: rummet, der tilbyder interne til alle, fanges", () => {
    const r = laes(RUM).replace("await hentOffentligLaas(admin)), nuMs, 1, erInternAdresse(d.email))", "await hentOffentligLaas(admin)), nuMs, 1, true)");
    expect(r).not.toBe(laes(RUM));
    expect(internErRigtig(laes(TILMELD), r)).toBe(false);
  });
});

// ── 5. Migrationerne ─────────────────────────────────────────────────────────

const FOERSTE = "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).";

export function migrationErRigtig(sql: string): boolean {
  const k = udenSql(sql).replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
  if (!sql.startsWith(FOERSTE + "\n")) return false;
  if (/security definer/i.test(sql) || /\bto anon\b/i.test(k)) return false;
  if (/\bdrop\s+(table|column|function|index)\b/i.test(k) || /\balter\s+column\b/i.test(k) || /^\s*(update|delete|truncate)\b/im.test(k)) return false;
  for (const m of k.matchAll(/alter table public\.(\w+)\s+([a-z]+ [a-z]+)/gi)) if (!/^add column$/i.test(m[2])) return false;
  // DROP POLICY/TRIGGER kun foran det, filen selv opretter.
  for (const m of k.matchAll(/drop policy if exists "([^"]+)" on/gi)) if (!k.includes(`create policy "${m[1]}"`)) return false;
  for (const m of k.matchAll(/drop trigger if exists (\w+) on/gi)) if (!k.includes(`create trigger ${m[1]} `)) return false;
  // Hver politik: authenticated + rådgiver.
  const politikker = [...k.matchAll(/create policy "[^"]+" on public\.(\w+)\s+for (\w+) to (\w+)([\s\S]*?);/gi)];
  if (politikker.length !== 7) return false;
  for (const p of politikker) if (p[3] !== "authenticated" || !p[4].includes("public.has_role(auth.uid(), 'advisor')")) return false;
  // Interaktionerne KUN i kladden.
  for (const p of politikker.filter((x) => x[1] === "webinar_interaktioner")) {
    if (!p[4].includes("version > (select w.tidslinje_version from public.webinarer w where w.id = webinar_id)")) return false;
  }
  return /add column if not exists intern boolean not null default false/.test(k);
}

describe("webinarMotorSkive3.guard 5 — migrationerne", () => {
  it("skive 3's migration er tilføjende, rådgiver-only og kladde-only", () => expect(migrationErRigtig(laes(MIG))).toBe(true));
  it("cron-migrationen: første linje, 1-59/5, 60 s timeout, 5 min interval, og en vej tilbage", () => {
    const c = laes(MIG_CRON);
    expect(c.split("\n")[0]).toBe(FOERSTE);
    expect(c).toMatch(/cron\.schedule\(\s*'webinar-motor',\s*'1-59\/5 \* \* \* \*'/);
    expect(c).toMatch(/kald_edge\(\s*'webinar-motor-cron',\s*'\{"dry_run": false\}'::jsonb,\s*60000,[^\n]*\n\s*300000/);
    expect(c).toContain("cron.unschedule('webinar-motor')");
  });
  it("tidsstemplerne ligger efter 20260930152000", () => {
    for (const f of [MIG, MIG_CRON]) expect(f.split("/")[2].slice(0, 14) > "20260930152000").toBe(true);
  });
  it("MUTATION: en anon-politik, en interaktion uden kladde-krav og en UPDATE fanges", () => {
    expect(migrationErRigtig(laes(MIG).replace("for insert to authenticated with check (public.has_role(auth.uid(), 'advisor'));\ndrop policy if exists \"Advisors can update webinarer\"", "for insert to anon with check (true);\ndrop policy if exists \"Advisors can update webinarer\""))).toBe(false);
    const udenKladde = laes(MIG).replace(/(create policy "Advisors can delete kladde webinar_interaktioner"[\s\S]*?)\n    and version > \(select w\.tidslinje_version from public\.webinarer w where w\.id = webinar_id\)/, "$1");
    expect(udenKladde).not.toBe(laes(MIG));
    expect(migrationErRigtig(udenKladde)).toBe(false);
    expect(migrationErRigtig(laes(MIG) + "\nupdate public.webinar_sessioner set intern = true;")).toBe(false);
    expect(migrationErRigtig(laes(MIG).replace(FOERSTE, "-- KØRT"))).toBe(false);
  });
});

// ── 6. Opsætningen ───────────────────────────────────────────────────────────

describe("webinarMotorSkive3.guard 6 — /webinar/motor", () => {
  const FLADE = "src/components/hjemmebane/webinarMotor/WebinarMotorOpsaetning.tsx";
  it("ruten er bag AdvisorRoute", () => {
    expect(laes("src/App.tsx")).toContain('<Route path="/webinar/motor" element={<AdvisorRoute><WebinarMotor /></AdvisorRoute>} />');
  });
  it("ingen menu linker til den (kun App.tsx nævner stien)", () => {
    const alle: string[] = [];
    const gaa = (dir: string) => {
      for (const n of readdirSync(resolve(ROD, dir), { withFileTypes: true })) {
        const p = `${dir}/${n.name}`;
        if (n.isDirectory()) { if (n.name !== "__tests__") gaa(p); } else if (/\.tsx?$/.test(n.name)) alle.push(p);
      }
    };
    gaa("src");
    expect(alle.filter((f) => /["'`]\/webinar\/motor/.test(udenKommentarer(laes(f))))).toEqual(["src/App.tsx"]);
  });
  it("fladen skriver kun gennem hooken, og alle hooks står i topblokken", () => {
    const k = udenKommentarer(laes(FLADE));
    expect(k).not.toMatch(/\bsupabase\b/);
    const hovedKrop = k.slice(k.indexOf("export const WebinarMotorOpsaetning"), k.indexOf("interface DetaljerProps"));
    const foersteReturn = hovedKrop.indexOf("return (");
    expect([...hovedKrop.matchAll(/\buse[A-Z]\w*\(/g)].every((m) => (m.index ?? 0) < foersteReturn)).toBe(true);
    const detaljer = k.slice(k.indexOf("function WebinarDetaljer"));
    expect(detaljer).not.toMatch(/\buse[A-Z]\w*\(/);
  });
});
