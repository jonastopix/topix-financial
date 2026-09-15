import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (15/9 2026): send-notification-email har ALLE sideeffekter bag
// to hjælpere — send() (sendManagedEmail) og stempl() (email_sent_at) — som
// i tørkørsel kun registrerer i svaret. Body {"dry_run": true} er den eneste
// vej til tørkørsel; «nu» læses kun dér. Kilden læses som tekst (npm-import
// i managedEmail), kommentarer strippet.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const kode = udenKommentarer(laes("supabase/functions/send-notification-email/index.ts"));

function funktionskrop(navn: string): string {
  const start = kode.indexOf(`async function ${navn}(`);
  expect(start, `async function ${navn}( findes`).toBeGreaterThan(-1);
  // Kroppen slutter ved første "\n    }" på funktionens indrykning efter start.
  const slut = kode.indexOf("\n    }\n", start);
  expect(slut).toBeGreaterThan(start);
  return kode.slice(start, slut);
}

describe("dryrun.guard — præcis ét sendManagedEmail( og ét email_sent_at-update, begge i hjælperne", () => {
  it("sendManagedEmail( kaldes præcis én gang, inde i send(), efter tørkørselstjekket", () => {
    expect(kode.split("sendManagedEmail(").length - 1).toBe(1);
    const send = funktionskrop("send");
    expect(send).toContain("sendManagedEmail(");
    expect(send.indexOf("if (toerKoersel)")).toBeGreaterThan(-1);
    expect(send.indexOf("if (toerKoersel)")).toBeLessThan(send.indexOf("sendManagedEmail("));
    expect(send).toContain("villeSende.push(");
  });

  it("email_sent_at opdateres præcis ét sted, inde i stempl(), efter tørkørselstjekket", () => {
    expect(kode.split(".update({ email_sent_at").length - 1).toBe(1);
    expect(kode.split("email_sent_at:").length - 1).toBe(1);
    const stempl = funktionskrop("stempl");
    expect(stempl).toContain('.update({ email_sent_at: new Date().toISOString() })');
    expect(stempl.indexOf("if (toerKoersel)")).toBeGreaterThan(-1);
    expect(stempl.indexOf("if (toerKoersel)")).toBeLessThan(stempl.indexOf(".update({ email_sent_at"));
    expect(stempl).toContain("villeStemple.push(");
  });

  it("hjælperne defineres EFTER hentningen af kandidaterne — første .from(\"notifications\") er stadig hentningen (dagskvote.guard)", () => {
    expect(kode.indexOf('.from("notifications")')).toBeLessThan(kode.indexOf("async function stempl("));
    expect(kode.indexOf(".limit(50);")).toBeLessThan(kode.indexOf("async function stempl("));
  });
});

describe("dryrun.guard — body-læsningen", () => {
  it("tørkørsel sættes KUN ved dry_run === true; tom/ugyldig body sender som i dag", () => {
    expect(kode).toContain("let toerKoersel = false;");
    expect(kode.split(".dry_run === true").length - 1).toBe(1);
    expect(kode.split("toerKoersel = true;").length - 1).toBe(1);
    expect(kode).not.toMatch(/dry_run\s*!==?\s*false/);
    expect(kode).toContain('const body: unknown = raaBody.trim() ? JSON.parse(raaBody) : {};');
    expect(kode).toContain("toerKoersel = false;\n    }");
  });

  it("«nu» læses kun i tørkørsel: inde i dry_run-blokken, efter toerKoersel = true", () => {
    const blokStart = kode.indexOf(".dry_run === true");
    const nuLaes = kode.indexOf("(body as { nu?: unknown }).nu");
    expect(nuLaes).toBeGreaterThan(blokStart);
    expect(kode.indexOf("toerKoersel = true;")).toBeLessThan(nuLaes);
    expect(kode.split("(body as { nu?: unknown }).nu").length - 1).toBe(1);
  });

  it("udløbet-reglen bruger nu og fordelUdloebne, før chat-grupperingen og selectNotificationEmails", () => {
    expect(kode).toContain('import { UDLOEBET_GRUND, fordelUdloebne, type VirksomhedTilMail } from "../_shared/mailModtager.ts";');
    const fordel = kode.indexOf("fordelUdloebne(");
    expect(fordel).toBeGreaterThan(-1);
    expect(fordel).toBeLessThan(kode.indexOf("for (const notif of raekkerTilMail)"));
    expect(fordel).toBeLessThan(kode.indexOf("selectNotificationEmails(candidates)"));
    expect(kode).toContain("await stempl(notif, UDLOEBET_GRUND);");
    expect(kode).toContain("udloebet,");
  });

  it("svaret bærer dry_run, nu, ville_sende og ville_stemple kun i tørkørsel", () => {
    expect(kode).toContain("...(toerKoersel ? { dry_run: true, nu: nu.toISOString(), ville_sende: villeSende, ville_stemple: villeStemple } : {})");
  });
});
