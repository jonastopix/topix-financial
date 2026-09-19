import { describe, expect, it } from "vitest";
import { doemMarketing, maaForeslaas, somTekst } from "@/lib/marketing/marketingdom";
import type { Ansoegning, Deltager, MailUdsendelse } from "@/lib/marketing/maalingsdom";
import type { Sporraekke } from "@/lib/marketing/minde";

const W = (uge: number) => `2026-0${uge < 5 ? 7 : 8}-${String(uge * 7 % 28 + 1).padStart(2, "0")}T18:00:00.000Z`;
const timer = (fra: string, t: number) => new Date(Date.parse(fra) + t * 3_600_000).toISOString();

/** Ti sessioner à ti deltagere — nok til at nå sammenligningsniveau. */
function stort(): { udsendelser: MailUdsendelse[]; deltagere: Deltager[]; ansoegninger: Ansoegning[] } {
  const deltagere: Deltager[] = [];
  const udsendelser: MailUdsendelse[] = [];
  const ansoegninger: Ansoegning[] = [];
  for (let s = 0; s < 10; s++) {
    const tid = `2026-0${s < 5 ? 7 : 8}-${String(s * 3 + 1).padStart(2, "0")}T18:00:00.000Z`;
    for (let p = 0; p < 10; p++) {
      const email = `s${s}p${p}@x.dk`;
      deltagere.push({ email, session_id: `w${s}`, session_tid: tid });
      for (const [trin, mail_id] of [[1, "m1"], [2, "m2"]] as const) {
        udsendelser.push({
          mail_id, mail_navn: `Mail ${trin}`, email, trin,
          modtaget_at: timer(tid, trin * 24),
          aabnet_at: p < 6 ? timer(tid, trin * 24 + 1) : null,
          klikket_at: p < 2 ? timer(tid, trin * 24 + 2) : null,
        });
      }
      if (p < 3) ansoegninger.push({ email, indsendt_at: timer(tid, 30), blev_medlem: p === 0 });
    }
  }
  return { udsendelser, deltagere, ansoegninger };
}

const spor = (dato: string, felt: string, o: Partial<Sporraekke> = {}): Sporraekke => ({
  id: `${dato}:${felt}`, created_at: dato, handling: "ret_flowmail", klaviyo_id: "X1",
  klaviyo_type: "flow-action", toerkoersel: false, udfald: "skrevet", aendringer: [{ felt }], ...o,
});

describe("dommen som én dør", () => {
  it("måling, minde og grænse kommer ud SAMLET", () => {
    const d = doemMarketing(stort(), []);
    expect(d.niveau).toBe("sammenligning");
    expect(d.maaling.mails).toHaveLength(2);
    expect(d.minde).toEqual([]);
    expect(d.budget.tilbage).toBe(1);
    expect(d.maaAnbefales).toBe(true);
  });

  it("uden data er niveauet observation, og intet må anbefales", () => {
    const d = doemMarketing({ udsendelser: [], deltagere: [], ansoegninger: [] }, []);
    expect(d.niveau).toBe("observation");
    expect(d.maaAnbefales).toBe(false);
    expect(d.advarsler[0]).toContain("FOR FÅ TIL AT SIGE NOGET");
  });

  it("en frisk ændring lukker døren, selv på højeste niveau", () => {
    const d = doemMarketing(stort(), [spor("2026-08-25T09:00:00Z", "emnelinje")]);
    expect(d.niveau).toBe("sammenligning");
    expect(d.maaAnbefales).toBe(false);
    expect(maaForeslaas(["afsendetid"], d).ja).toBe(false);
  });

  it("maaForeslaas svarer på BEGGE spørgsmål — grænsen og hukommelsen", () => {
    const d = doemMarketing(stort(), [spor("2026-06-01T09:00:00Z", "emnelinje")]);
    expect(d.budget.tilbage).toBe(1);
    expect(maaForeslaas(["emnelinje"], d).ja).toBe(false);
    expect(maaForeslaas(["emnelinje"], d).grund).toContain("prøvet før");
    expect(maaForeslaas(["forhåndstekst"], d).ja).toBe(true);
  });

  it("teksten sætter forbeholdene ØVERST — før det første tal", () => {
    const t = somTekst(doemMarketing({ udsendelser: [], deltagere: [], ansoegninger: [] }, []));
    const linjer = t.split("\n");
    expect(linjer[0].startsWith("⚠︎")).toBe(true);
    expect(t.indexOf("⚠︎")).toBeLessThan(t.indexOf("NIVEAU:"));
    expect(t).toContain("(ingen udsendelser målt endnu)");
    expect(t).toContain("(intet ændret endnu)");
  });

  it("teksten og felterne siger det SAMME — de kommer fra ét sted", () => {
    const d = doemMarketing(stort(), []);
    const t = somTekst(d);
    expect(t).toContain(d.maaling.mails[0].aabnet.saetning);
    expect(t).toContain(d.maaling.tid.saetning);
    expect(t).toContain(d.maaling.forud[0].forbehold);
  });
});
