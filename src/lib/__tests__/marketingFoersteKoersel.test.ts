import { describe, expect, it } from "vitest";
import { doemMarketing, maaForeslaas, somTekst } from "@/lib/marketing/marketingdom";
import { sammenlignMails } from "@/lib/marketing/maalingsdom";
import type { Ansoegning, Deltager, MailUdsendelse } from "@/lib/marketing/maalingsdom";

/**
 * DEN ALLERFØRSTE KØRSEL — onsdag den 23. september 2026, morgen.
 *
 * Laget dømmer på data, der ikke findes endnu. Denne fil er ikke en test af en
 * funktion; den er PRØVEN på, at dommen opfører sig rigtigt den dag, den første
 * gang møder virkeligheden: ét webinar afholdt tirsdag aften, fem mails ude,
 * og NUL ansøgninger.
 *
 * Tallene er en opstilling, ikke en måling: 200 deltagere er et rundt tal, ikke
 * tirsdagens faktiske fremmøde. Det, der prøves, er dommens FORM — hvad der
 * bliver sagt, og hvad der nægtes sagt — ikke størrelsen.
 */

const WEBINAR = "2026-09-22T17:00:00.000Z"; // tirsdag kl. 19 dansk
const ONSDAG_MORGEN = "2026-09-23T06:00:00.000Z";
const efter = (t: number) => new Date(Date.parse(WEBINAR) + t * 3_600_000).toISOString();

/** 200 deltagere, fem mails ude, ingen ansøgninger. */
function onsdagMorgen(): { udsendelser: MailUdsendelse[]; deltagere: Deltager[]; ansoegninger: Ansoegning[] } {
  const deltagere: Deltager[] = [];
  const udsendelser: MailUdsendelse[] = [];
  const MAILS = [
    { trin: 1, id: "m1", navn: "Tak fordi du så med", t: 1 },
    { trin: 2, id: "m2", navn: "De to områder", t: 3 },
    { trin: 3, id: "m3", navn: "Mortens fem spørgsmål", t: 6 },
    { trin: 4, id: "m4", navn: "Hvad medlemskabet er", t: 9 },
    { trin: 5, id: "m5", navn: "Ansøg inden fredag", t: 12 },
  ];
  for (let p = 0; p < 200; p++) {
    const email = `deltager${p}@eksempel.dk`;
    deltagere.push({ email, session_id: "webinar-22-09:2026-09-22T17:00:00.000Z", session_tid: WEBINAR });
    for (const m of MAILS) {
      udsendelser.push({
        mail_id: m.id, mail_navn: m.navn, email, trin: m.trin,
        modtaget_at: efter(m.t),
        // Faldende åbningsrate ned gennem trappen, som en flow-trappe ser ud.
        aabnet_at: p < 80 - m.trin * 8 ? efter(m.t + 0.5) : null,
        klikket_at: p < 12 - m.trin ? efter(m.t + 0.6) : null,
      });
    }
  }
  return { udsendelser, deltagere, ansoegninger: [] };
}

describe("onsdag morgen — nul ansøgninger, fem mails, ét webinar", () => {
  const d = doemMarketing(onsdagMorgen(), [], new Date(ONSDAG_MORGEN));

  it("SPØRGSMÅL 4 FØRST: niveauet er observation, og intet må anbefales", () => {
    expect(d.niveau).toBe("observation");
    expect(d.maaAnbefales).toBe(false);
    expect(d.advarsler[0]).toContain("FOR FÅ TIL AT SIGE NOGET");
    expect(d.advarsler[0]).toContain("kun 1 webinar");
    expect(d.advarsler.some((s) => s.includes("IKKE anbefales"))).toBe(true);
  });

  it("ingen to mails kan sammenlignes — heller ikke den bedste mod den værste", () => {
    const bedst = d.maaling.mails[0];
    const vaerst = d.maaling.mails[4];
    expect(bedst.aabnet.succes).toBeGreaterThan(vaerst.aabnet.succes);
    const r = sammenlignMails(bedst, vaerst, d.niveau);
    expect(r.udfald).toBe("kan_ikke");
    expect(r.saetning).toContain("ikke webinarer nok");
    // OG DET ER POINTEN: intervallerne overlapper ikke engang. Matematikken
    // ville sige «reel forskel»; dommen nægter alligevel, fordi ét webinar er
    // én stikprøve af et PUBLIKUM, ikke af 200 mennesker. En faldende
    // åbningsrate ned gennem en flow-trappe er desuden normal.
    expect(bedst.aabnet.interval!.nedre).toBeGreaterThan(vaerst.aabnet.interval!.oevre);
    expect(sammenlignMails(bedst, vaerst, "sammenligning").udfald).toBe("adskilte");
  });

  it("SPØRGSMÅL 1: hvad der SKETE står med tal — det er en observation, ikke et mønster", () => {
    const m1 = d.maaling.mails[0];
    expect(m1.modtaget).toBe(200);
    // 200 modtagere bærer en åbningsrate som OBSERVATION. At skjule den ville
    // være den modsatte fejl: at nægte at rapportere det, der faktisk skete.
    expect(m1.aabnet.nokTilAtSigeNoget).toBe(true);
    expect(m1.aabnet.saetning).toContain("af 200 modtagere åbnede");
  });

  it("SPØRGSMÅL 1, ansøgningerne: INTET vindue er gået endnu — og det siges", () => {
    // DET ER HER ONSDAGSPRØVEN FANDT FEJLEN. Webinaret var 13 timer siden.
    // Første udgave delte 0 ansøgninger med alle 200 modtagere og skrev
    // «0 % (0–2 %)» — et tal, der lignede en dom over flowet, men kun betød,
    // at tiden ikke var gået.
    const m1 = d.maaling.mails[0];
    for (const v of [24, 48, 168] as const) {
      expect(m1.modneInden[v]).toBe(0);
      expect(m1.ansoegteInden[v].saetning).toBe(`ingen ansøgte inden ${v} t endnu`);
      expect(m1.ansoegteInden[v].saetning).not.toContain("%");
    }
    expect(d.advarsler.some((s) => s.includes("168 timer er endnu ikke gået"))).toBe(true);
    // «Blev medlem» har intet vindue — nul er sandt på ethvert tidspunkt.
    expect(m1.blevMedlem.succes).toBe(0);
  });

  it("og når tiden ER gået, kommer tallet — med den rigtige nævner", () => {
    // Torsdag morgen: 24 timer er gået for mail 1 (sendt t+1), men ikke for
    // mail 5 (sendt t+12 … nej, den er også gået) — og 168 timer for ingen.
    const torsdag = new Date(Date.parse(WEBINAR) + 40 * 3_600_000);
    const d2 = doemMarketing(onsdagMorgen(), [], torsdag);
    expect(d2.maaling.mails[0].modneInden[24]).toBe(200);
    expect(d2.maaling.mails[0].ansoegteInden[24].saetning).toContain("0 af 200 ansøgte inden 24 t");
    expect(d2.maaling.mails[0].modneInden[168]).toBe(0);
    expect(d2.maaling.mails[0].ansoegteInden[168].saetning).toBe("ingen ansøgte inden 168 t endnu");
  });

  it("SPØRGSMÅL 2: der er ingen ventetid at måle", () => {
    expect(d.maaling.tid.antal).toBe(0);
    expect(d.maaling.tid.medianTimer).toBeNull();
    expect(d.maaling.tid.saetning).toContain("ingen ventetid at måle");
  });

  it("SPØRGSMÅL 3: ingen mail gik forud for noget", () => {
    expect(d.maaling.forud).toEqual([]);
  });

  it("GRÆNSEN: der må ikke ændres noget onsdag morgen, heller ikke med tomt minde", () => {
    expect(d.budget.tilbage).toBe(0);
    expect(d.minde).toEqual([]);
    expect(maaForeslaas(["emnelinje"], d).ja).toBe(false);
    expect(maaForeslaas(["emnelinje"], d).grund).toContain("ikke webinarer nok til at vide, hvad der virker");
  });

  it("og hele dommen kan læses af et menneske", () => {
    const t = somTekst(d);
    expect(t.split("\n")[0].startsWith("⚠︎")).toBe(true);
    expect(t.indexOf("⚠︎")).toBeLessThan(t.indexOf("NIVEAU:"));
    expect(t).toContain("(intet ændret endnu)");
    expect(ONSDAG_MORGEN > WEBINAR).toBe(true);
    console.log("\n" + t + "\n");
  });
});
