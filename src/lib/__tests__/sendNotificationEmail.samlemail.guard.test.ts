import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (15/9 2026, PR 2): samlemailens integration i
// send-notification-email. Kilden læses som tekst (npm-import i
// managedEmail), kommentarer strippet. Chattens beslutninger 1–6, DEL 2
// «15. september» §16.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const kode = udenKommentarer(laes("supabase/functions/send-notification-email/index.ts"));

describe("samlemail.guard — hentningerne", () => {
  it("den første hentning udelukker SAMLEMAIL_TYPER (og beholder det dagskvote-værnet låser)", () => {
    const hent = kode.slice(kode.indexOf('.from("notifications")'), kode.indexOf(".limit(50);"));
    expect(hent).toContain('.not("type", "in", `(${SAMLEMAIL_TYPER.join(",")})`)');
    expect(hent).toContain('.neq("type", "report_reminder")');
    expect(hent).toContain('.in("priority", ["action_required", "important"])');
  });

  it("samlemailens egen hentning står EFTER den første og er gated af erISamlemailVindue(nu)", () => {
    const foerste = kode.indexOf(".limit(50);");
    const gate = kode.indexOf("const samlemailIVinduet = erISamlemailVindue(nu);");
    const hent = kode.indexOf('.in("type", [...SAMLEMAIL_TYPER])');
    expect(foerste).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(foerste);
    expect(hent).toBeGreaterThan(gate);
    expect(kode).toContain("if (samlemailIVinduet) {");
    const samlemailHent = kode.slice(hent, kode.indexOf(".limit(SAMLEMAIL_LOFT);"));
    expect(samlemailHent).toContain('.is("email_sent_at", null)');
    expect(samlemailHent).toContain('.is("seen_at", null)');
    expect(samlemailHent).toContain('.in("priority", ["action_required", "important"])');
    expect(samlemailHent).toContain('.lt("created_at", samlemailGraense)');
    expect(samlemailHent).toContain('.order("created_at", { ascending: true })');
    expect(kode).toContain("const SAMLEMAIL_LOFT = 500;");
  });

  it("den tidlige retur kræver at BÅDE køen og samlemailens rækker er tomme", () => {
    expect(kode).toContain("if (!pending?.length && samlemailRaekker.length === 0) {");
  });
});

describe("samlemail.guard — reglen, fordelingen og afsendelsen", () => {
  it("udløbet-reglen kaldes på samlemailens rækker (fordelUdloebne) og de udløbne stemples med UDLOEBET_GRUND", () => {
    const kald = kode.indexOf("fordelUdloebne(\n      samlemailRaekker.map(");
    expect(kald).toBeGreaterThan(-1);
    expect(kode).toContain("const samlemailTilFordeling = samlemailRaekker.filter((n) => !samlemailUdloebneSet.has(n.id));");
    expect(kode.split("await stempl(n, UDLOEBET_GRUND);").length - 1).toBe(1);
    expect(kode.split("await stempl(notif, UDLOEBET_GRUND);").length - 1).toBe(1);
  });

  it("fordelSamlemail og bygSamlemail importeres fra ../_shared/samlemail.ts og bruges", () => {
    const imp = kode.slice(kode.indexOf("import {\n  SAMLEMAIL_LABEL,"), kode.indexOf('} from "../_shared/samlemail.ts";'));
    for (const navn of ["SAMLEMAIL_LABEL", "SAMLEMAIL_TYPER", "bygSamlemail", "erISamlemailVindue", "fordelSamlemail", "fornavnFraFuldtNavn"]) {
      expect(imp, navn).toContain(navn);
    }
    expect(kode).toContain("const fordeling = fordelSamlemail({ nu, raekker: samlemailTilFordeling, opslaaet, modtagere });");
    expect(kode).toContain("const mail = bygSamlemail({ fornavn: m.fornavn, punkter: m.punkter, nu, appUrl: APP_URL });");
  });

  it("afsendelsen går gennem send( med SAMLEMAIL_LABEL og fordelingens idempotency-nøgle; stemplingen gennem stempl(", () => {
    const loekke = kode.slice(kode.indexOf("for (const m of fordeling.mails)"), kode.indexOf("const summary = {"));
    expect(loekke).toContain("const resultat = await send({");
    expect(loekke).toContain("label: SAMLEMAIL_LABEL,");
    expect(loekke).toContain("idempotencyKey: m.idempotencyKey,");
    expect(loekke).toContain('type: "samlemail", ids: m.raekkeIder');
    expect(loekke).toContain('for (const n of raekker) await stempl(n, "sendt");');
    expect(loekke).not.toContain("sendManagedEmail(");
    expect(loekke).not.toContain("email_sent_at");
    expect(kode).toContain("await stempl(n, st.grund);");
  });

  it("løkken kører efter de to eksisterende og ikke når rateLimit er sat; dommene kopieres ikke fra køen", () => {
    expect(kode.indexOf("for (const m of fordeling.mails)")).toBeGreaterThan(kode.indexOf("for (let i = 0; i < toEmail.length; i++)"));
    expect(kode).toContain("if (samlemailTilFordeling.length > 0 && !rateLimit) {");
    // Værnenes tællinger: reglerne for rådgiver, mail og kvote ligger i fordelSamlemail.
    expect(kode.split("advisorUserIds.has(").length - 1).toBe(2);
    expect(kode.split("if (!userEmail) {").length - 1).toBe(2);
    expect(kode.split("if (userDailyCount >= MAX_EMAILS_PER_DAY) {").length - 1).toBe(2);
    expect(kode).toContain("dagskvoteNaaet: (countMap[uid] || 0) >= MAX_EMAILS_PER_DAY,");
    expect(kode).toContain('.eq("template_name", SAMLEMAIL_LABEL)');
  });

  it("svaret bærer samlemail: { i_vinduet, hentet, udloebet, mails, stemplet_uden_mail, venter }", () => {
    const svar = kode.slice(kode.indexOf("const summary = {"), kode.indexOf("return json(summary);"));
    for (const felt of ["i_vinduet: samlemailIVinduet", "hentet: samlemailRaekker.length", "udloebet: samlemailUdloebet", "mails: samlemailSendt", "stemplet_uden_mail: samlemailStemplet", "venter: samlemailVenter"]) {
      expect(svar, felt).toContain(felt);
    }
  });
});
