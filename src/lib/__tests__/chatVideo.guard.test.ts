import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for chat-video (29/9-2026). Hver dom er bevist på en kopi med
 * fejlen indsat (mutationsprøverne nederst), og hver dom er også bevist GRØN på
 * den rigtige tekst — en dom, der aldrig åbner, er ikke en dom.
 *   1. BUCKET A: authenticateUser FØR body'en og FØR ethvert fetch; ingen
 *      service-role-klient; kun de to imports.
 *   2. OPRET ER RÅDGIVER-GATED FØR BUNNY: gaten er ORDRET bunny-content-admins,
 *      står først i opret, og Create Video bærer chat-collectionen.
 *   3. AFSPIL SIGNERER ALDRIG FØR TJEKKENE: beskeden via callerClient →
 *      afsenderen er rådgiver → Get Video → chat-collectionen → kun «klar» →
 *      signerEmbed, som kaldes ét sted, og tokenet regnes kun dér.
 *   4. SLET KUN AFSENDER/ADMIN: maaSlette, afsender-rådgiver og collection
 *      FØR den ene DELETE.
 *   5. CONFIG: [functions.chat-video] verify_jwt = true.
 */

const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
/** Kun hele kommentarlinjer og blokke fjernes — ALDRIG «//» midt i en linje (URL'er). */
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => {
  const i = k.indexOf(a), j = k.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
};
const antal = (k: string, s: string) => k.split(s).length - 1;
const mellem = (k: string, fra: string, til: string) => {
  const i = k.indexOf(fra);
  if (i === -1) return "";
  const j = k.indexOf(til, i + fra.length);
  return j === -1 ? k.slice(i) : k.slice(i, j);
};

const FUNKTION = "supabase/functions/chat-video/index.ts";
const BUNNY_ADMIN = "supabase/functions/bunny-content-admin/index.ts";
const CONFIG = "supabase/config.toml";

const GATE_START = 'const { data: isAdvisor, error: roleError } = await callerClient.rpc("has_role", {';
const GATE_SLUT = 'return jsonResponse({ error: "Forbidden — advisor role required" }, 403);\n  }';

/** Advisor-gaten fra et sted: fra GATE_START til og med GATE_SLUT. */
const gaten = (k: string) => {
  const i = k.indexOf(GATE_START);
  if (i === -1) return "";
  const j = k.indexOf(GATE_SLUT, i);
  return j === -1 ? "" : k.slice(i, j + GATE_SLUT.length);
};

// ── 1 ──────────────────────────────────────────────────────────────────────
export const bucketA = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const serve = mellem(f, "Deno.serve(", "\n});");
  const imports = f.split("\n").filter((l) => /^import\s/.test(l));
  return serve.includes("const auth = await authenticateUser(req);\n  if (auth instanceof Response) return auth;") &&
    foer(serve, "await authenticateUser(req)", "await req.json()") &&
    foer(f, "await authenticateUser(req)", "await fetch(") &&
    !/createClient|SUPABASE_SERVICE_ROLE_KEY|service_role|adminClient/.test(f) &&
    imports.length === 2 &&
    imports.some((l) => l.includes('from "../_shared/edgeFunctionAuth.ts"')) &&
    imports.some((l) => l.includes('from "../_shared/chatVideo.ts"'));
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const opretErRaadgiverGated = (funktion: string, bunnyAdmin: string): boolean => {
  const f = udenKommentarer(funktion);
  const opret = mellem(f, "async function opret(", "async function hentBeskedensVideo(");
  const gate = gaten(opret);
  const forbillede = gaten(udenKommentarer(bunnyAdmin));
  const kroppen = opret.slice(opret.indexOf("{") + 1).trimStart();
  return gate !== "" && forbillede !== "" && gate === forbillede &&
    kroppen.startsWith(GATE_START) &&
    foer(opret, GATE_SLUT, "await fetch(") &&
    antal(opret, "await fetch(") === 1 &&
    opret.includes("body: JSON.stringify({ title: title.trim(), collectionId: bunny.chatCollectionId }),") &&
    f.includes('chatCollectionId: (Deno.env.get("BUNNY_STREAM_CHAT_COLLECTION_ID") ?? "").trim(),') &&
    f.includes("return Boolean(b.libraryId && b.apiKey && b.tokenAuthKey && b.chatCollectionId);") &&
    foer(opret, "if (!bunnyKonfigureret(bunny)) {", "await fetch(");
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const afspilSignererSidst = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const afspil = mellem(f, "async function afspil(", "async function signerEmbed(");
  const hent = mellem(f, "async function hentBeskedensVideo(", "async function afsenderErRaadgiver(");
  const afsender = mellem(f, "async function afsenderErRaadgiver(", "async function hentBunnyVideo(");
  const signer = mellem(f, "async function signerEmbed(", "async function slet(");
  const trin = [
    "await hentBeskedensVideo(callerClient, messageId);",
    "if (!(await afsenderErRaadgiver(callerClient, besked.senderId))) {",
    "await hentBunnyVideo(bunny, besked.guid);",
    "if (!iChatCollection(opslag.video, bunny.chatCollectionId)) {",
    "const status = videoStatus(opslag.video);",
    'if (status !== "klar") return jsonResponse({ status });',
    "return await signerEmbed(bunny, besked.guid, status);",
  ];
  const iOrden = trin.every((t, i) => afspil.includes(t) && (i === 0 || foer(afspil, trin[i - 1], t)));
  return iOrden &&
    antal(f, "signerEmbed(") === 2 && // definitionen + ét kald
    antal(f, "tokenAuthKey}${guid}${expires}") === 1 && signer.includes("const token = await sha256Hex(`${bunny.tokenAuthKey}${guid}${expires}`);") &&
    signer.includes("const EMBED_TTL") === false && f.includes("const EMBED_TTL_SECONDS = 3600;") &&
    hent.includes('.from("messages")') && hent.includes('.select("id, sender_id, context_meta")') &&
    hent.includes("laesChatVideo(r.context_meta)") && hent.includes("callerClient") &&
    afsender.includes('await callerClient.rpc("has_role", { _user_id: senderId, _role: "advisor" });') &&
    afsender.includes("return !error && data === true;");
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const sletKunAfsenderEllerAdmin = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const slet = f.slice(f.indexOf("async function slet("));
  const DELETE = 'method: "DELETE",';
  return antal(f, DELETE) === 1 && slet.includes(DELETE) &&
    slet.includes('_role: "admin",') &&
    foer(slet, "await hentBeskedensVideo(callerClient, messageId);", "if (!maaSlette(") &&
    slet.includes("if (!maaSlette({ callerId, senderId: besked.senderId, erAdmin: !adminFejl && erAdmin === true })) {") &&
    foer(slet, "if (!maaSlette(", DELETE) &&
    foer(slet, "if (!(await afsenderErRaadgiver(callerClient, besked.senderId))) {", DELETE) &&
    foer(slet, "if (!iChatCollection(opslag.video, bunny.chatCollectionId)) {", DELETE);
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const configErTrue = (config: string): boolean =>
  /\[functions\.chat-video\]\n\s*verify_jwt = true\n/.test(config);

describe("chatVideo.guard — de fem domme på repoets filer", () => {
  const funktion = laes(FUNKTION);
  it("1. Bucket A: authenticateUser først, ingen service role, kun to imports", () => expect(bucketA(funktion)).toBe(true));
  it("2. opret er rådgiver-gated FØR Bunny — gaten ordret som bunny-content-admin", () =>
    expect(opretErRaadgiverGated(funktion, laes(BUNNY_ADMIN))).toBe(true));
  it("3. afspil signerer aldrig før afsender- og collection-tjekket", () => expect(afspilSignererSidst(funktion)).toBe(true));
  it("4. slet kun afsender eller admin — og de to tjek før DELETE", () => expect(sletKunAfsenderEllerAdmin(funktion)).toBe(true));
  it("5. config.toml: chat-video har verify_jwt = true", () => expect(configErTrue(laes(CONFIG))).toBe(true));
});

describe("chatVideo.guard — dommene fanger fejlen på en kopi", () => {
  const f = laes(FUNKTION);
  const byt = (fra: string | RegExp, til: string) => {
    const ny = typeof fra === "string" ? f.split(fra).join(til) : f.replace(fra, til);
    expect(ny, `mutationen ramte ikke: ${String(fra)}`).not.toBe(f);
    return ny;
  };

  it("1. body før auth, en service-role-klient eller en tredje import fælder dom 1", () => {
    const flyttet = byt(
      "  const auth = await authenticateUser(req);\n  if (auth instanceof Response) return auth;\n  const { callerId, callerClient } = auth;\n",
      "",
    ).replace("  const { action, title, messageId }", "  const auth = await authenticateUser(req);\n  if (auth instanceof Response) return auth;\n  const { callerId, callerClient } = auth;\n  const { action, title, messageId }");
    expect(bucketA(flyttet)).toBe(false);
    expect(bucketA(`${f}\nconst admin = createClient("u", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);\n`)).toBe(false);
    expect(bucketA(`import { x } from "../_shared/andet.ts";\n${f}`)).toBe(false);
  });

  it("2. gaten væk, gaten efter fetch, en anden rolle, eller ingen collection fælder dom 2", () => {
    const b = laes(BUNNY_ADMIN);
    expect(opretErRaadgiverGated(byt('    _role: "advisor",\n  });\n  if (roleError', '    _role: "member",\n  });\n  if (roleError'), b)).toBe(false);
    const udenGate = f.replace(gaten(f), "");
    expect(udenGate).not.toBe(f);
    expect(opretErRaadgiverGated(udenGate, b)).toBe(false);
    const gateEfter = udenGate.replace(
      "  const expires = Math.floor(Date.now() / 1000) + TUS_GRANT_TTL_SECONDS;",
      `  ${gaten(f)}\n  const expires = Math.floor(Date.now() / 1000) + TUS_GRANT_TTL_SECONDS;`,
    );
    expect(opretErRaadgiverGated(gateEfter, b)).toBe(false);
    expect(opretErRaadgiverGated(byt("title: title.trim(), collectionId: bunny.chatCollectionId", "title: title.trim()"), b)).toBe(false);
    expect(opretErRaadgiverGated(byt(" && b.chatCollectionId);", ");"), b)).toBe(false);
  });

  it("3. signering før afsender- eller collection-tjekket, eller signering i alle tilstande, fælder dom 3", () => {
    const signerFoerst = byt(
      "  // (a) FØR signering: afsenderen er rådgiver.\n",
      "  // (a) FØR signering: afsenderen er rådgiver.\n  return await signerEmbed(bunny, besked.guid, \"klar\");\n",
    );
    expect(afspilSignererSidst(signerFoerst)).toBe(false);
    expect(afspilSignererSidst(byt(
      "  if (!(await afsenderErRaadgiver(callerClient, besked.senderId))) {\n    return jsonResponse({ error: \"Forbidden\" }, 403);\n  }\n  // (b)",
      "  // (b)",
    ))).toBe(false);
    expect(afspilSignererSidst(byt(
      "  if (!iChatCollection(opslag.video, bunny.chatCollectionId)) {\n    return jsonResponse({ error: \"Forbidden\" }, 403);\n  }\n\n  const status",
      "\n  const status",
    ))).toBe(false);
    expect(afspilSignererSidst(byt('  if (status !== "klar") return jsonResponse({ status });\n', ""))).toBe(false);
    expect(afspilSignererSidst(byt('_user_id: senderId, _role: "advisor"', '_user_id: senderId, _role: "member"'))).toBe(false);
    expect(afspilSignererSidst(byt("return !error && data === true;", "return true;"))).toBe(false);
    expect(afspilSignererSidst(byt('.select("id, sender_id, context_meta")', '.select("id, context_meta")'))).toBe(false);
  });

  it("4. DELETE før maaSlette eller collection-tjekket, eller en anden DELETE, fælder dom 4", () => {
    const tidligDelete = byt(
      "  // Kun beskedens afsender eller en admin.\n",
      "  await fetch(`${BUNNY_API_BASE}/${bunny.libraryId}/videos/${besked.guid}`, { method: \"DELETE\", headers: { AccessKey: bunny.apiKey } });\n  // Kun beskedens afsender eller en admin.\n",
    );
    expect(sletKunAfsenderEllerAdmin(tidligDelete)).toBe(false);
    expect(sletKunAfsenderEllerAdmin(byt(
      "erAdmin: !adminFejl && erAdmin === true",
      "erAdmin: true",
    ))).toBe(false);
    const udenCollection = byt(
      "  if (!iChatCollection(opslag.video, bunny.chatCollectionId)) {\n    return jsonResponse({ error: \"Forbidden\" }, 403);\n  }\n\n  const sletResponse",
      "\n  const sletResponse",
    );
    expect(sletKunAfsenderEllerAdmin(udenCollection)).toBe(false);
    expect(sletKunAfsenderEllerAdmin(byt('    _role: "admin",', '    _role: "advisor",'))).toBe(false);
  });

  it("5. false eller ingen blok fælder dom 5", () => {
    const c = laes(CONFIG);
    expect(configErTrue(c.replace("[functions.chat-video]\n    verify_jwt = true", "[functions.chat-video]\n    verify_jwt = false"))).toBe(false);
    expect(configErTrue(c.replace("[functions.chat-video]\n    verify_jwt = true\n", ""))).toBe(false);
  });
});
