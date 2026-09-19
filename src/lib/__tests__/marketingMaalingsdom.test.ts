import { describe, expect, it } from "vitest";
import {
  doemMaaling,
  doemNiveau,
  forhold,
  HAENDELSER_FOR_SAMMENLIGNING,
  maalForud,
  maalTid,
  maaSammenlignes,
  MAKS_AENDRINGER_PR_RUNDE,
  PERSONER_FOR_ET_FORHOLD,
  sammenlignMails,
  SESSIONER_FOR_MOENSTER,
  SESSIONER_FOR_SAMMENLIGNING,
  SIDST_AABNET_FORBEHOLD,
  type Ansoegning,
  type Deltager,
  type MailUdsendelse,
} from "@/lib/marketing/maalingsdom";

/** Ét webinar, tirsdag. Alt regnes derfra. */
const W = "2026-09-22T18:00:00.000Z";
const timer = (fra: string, t: number) => new Date(Date.parse(fra) + t * 3_600_000).toISOString();

const d = (email: string, session = "w1:2026-09-22", tid = W): Deltager => ({ email, session_id: session, session_tid: tid });
const u = (email: string, mail_id: string, trin: number, o: Partial<MailUdsendelse> = {}): MailUdsendelse => ({
  mail_id, mail_navn: `Mail ${trin}`, email, trin,
  modtaget_at: timer(W, trin * 24), aabnet_at: null, klikket_at: null, ...o,
});
const a = (email: string, t: number, medlem = false): Ansoegning => ({ email, indsendt_at: timer(W, t), blev_medlem: medlem });

describe("niveauet dømmes — det huskes ikke", () => {
  it("ét webinar er OBSERVATION, uanset hvor mange mennesker", () => {
    const n = doemNiveau(1, 500);
    expect(n.niveau).toBe("observation");
    expect(n.saetning).toContain("FOR FÅ TIL AT SIGE NOGET");
  });

  it("tre webinarer med nok i hver gruppe er MØNSTER", () => {
    expect(doemNiveau(SESSIONER_FOR_MOENSTER, PERSONER_FOR_ET_FORHOLD).niveau).toBe("moenster");
  });

  it("otte webinarer OG nok hændelser er SAMMENLIGNING", () => {
    expect(doemNiveau(SESSIONER_FOR_SAMMENLIGNING, HAENDELSER_FOR_SAMMENLIGNING).niveau).toBe("sammenligning");
  });

  it("DEN VIGTIGE: mange sessioner med SMÅ grupper er stadig kun observation", () => {
    // Fire webinarer lyder af meget — men fire mennesker i hver gruppe bærer intet.
    const n = doemNiveau(20, 4);
    expect(n.niveau).toBe("observation");
    expect(n.saetning).toContain("mindste gruppe er 4");
  });

  it("niveauet siger altid, hvad der mangler for at nå det næste", () => {
    expect(doemNiveau(1, 100).mangler).toContain("webinarer mere");
    expect(doemNiveau(3, 6).mangler).toContain("webinarer mere");
    expect(doemNiveau(10, 100).mangler).toBeNull();
  });
});

describe("forhold — «for få» står hvor tallet ville have stået", () => {
  it("under grænsen ERSTATTES procenten af sætningen", () => {
    const f = forhold(2, 3, "modtagere åbnede");
    expect(f.nokTilAtSigeNoget).toBe(false);
    expect(f.saetning).toBe("2 af 3 modtagere åbnede — FOR FÅ TIL AT SIGE NOGET");
    expect(f.saetning).not.toContain("%");
  });

  it("over grænsen står tallet MED sit interval og sin nævner", () => {
    const f = forhold(2, 14, "modtagere åbnede");
    expect(f.nokTilAtSigeNoget).toBe(true);
    expect(f.saetning).toContain("14 % (4–40 %)");
    expect(f.saetning).toContain("2 af 14");
  });

  it("nul giver «ingen endnu», ikke «0 %»", () => {
    const f = forhold(0, 0, "modtagere åbnede");
    expect(f.saetning).toBe("ingen modtagere åbnede endnu");
    expect(f.interval).toBeNull();
  });
});

describe("1. hvad skete der, pr. mail", () => {
  /**
   * Tiden gives ind. Vinduerne tælles kun for dem, hvis vindue ER gået, så en
   * måling uden et «nu» ville måle mod maskinens ur og svare forskelligt i dag
   * og i morgen.
   */
  const SENERE = new Date(Date.parse(W) + 1000 * 3_600_000);
  const udsendelser = [
    ...["a", "b", "c", "d", "e", "f"].map((n) => u(`${n}@x.dk`, "m1", 1, { aabnet_at: timer(W, 25) })),
    ...["a", "b", "c"].map((n) => u(`${n}@x.dk`, "m2", 2, { aabnet_at: timer(W, 49), klikket_at: timer(W, 50) })),
  ];
  const ind = {
    udsendelser,
    deltagere: ["a", "b", "c", "d", "e", "f"].map((n) => d(`${n}@x.dk`)),
    ansoegninger: [a("a@x.dk", 30, true), a("b@x.dk", 100)],
  };

  it("tæller modtaget, åbnet, klikket og medlem pr. mail", () => {
    const m = doemMaaling(ind, SENERE).mails;
    expect(m.map((x) => x.mail_id)).toEqual(["m1", "m2"]);
    expect(m[0].modtaget).toBe(6);
    expect(m[0].aabnet.succes).toBe(6);
    expect(m[0].klikket.succes).toBe(0);
    expect(m[0].blevMedlem.succes).toBe(1);
  });

  it("ansøgninger tælles i de tre vinduer, fra da mailen blev MODTAGET", () => {
    const m1 = doemMaaling(ind, SENERE).mails[0];
    // m1 modtaget ved t+24; a@ ansøgte t+30 (6 t efter), b@ ved t+100 (76 t efter).
    expect(m1.ansoegteInden[24].succes).toBe(1);
    expect(m1.ansoegteInden[48].succes).toBe(1);
    expect(m1.ansoegteInden[168].succes).toBe(2);
  });

  it("en ansøgning FØR mailen tæller ikke som mailens", () => {
    const m2 = doemMaaling(ind, SENERE).mails[1];
    // m2 modtaget ved t+48; a@ ansøgte t+30, altså før.
    expect(m2.ansoegteInden[24].succes).toBe(0);
    expect(m2.ansoegteInden[168].succes).toBe(1);
  });

  it("ET VINDUE, DER IKKE ER GÅET ENDNU, TÆLLES IKKE MED (onsdagsprøven 19/9)", () => {
    // Fem timer efter at m1 blev modtaget: 24-timersvinduet er ikke gået for
    // nogen. Nævneren er tom, og der står en sætning — ikke «0 %».
    const tidligt = new Date(Date.parse(timer(W, 29)));
    const m1 = doemMaaling(ind, tidligt).mails[0];
    expect(m1.modtaget).toBe(6);
    expect(m1.modneInden[24]).toBe(0);
    expect(m1.ansoegteInden[24].saetning).toBe("ingen ansøgte inden 24 t endnu");
    expect(m1.ansoegteInden[24].saetning).not.toContain("%");
    // Og dommen siger det højt, i stedet for at lade tallet stå som færdigt.
    expect(doemMaaling(ind, tidligt).advarsler.some((s) => s.includes("er ikke færdige"))).toBe(true);
  });

  it("samme person, der ansøger to gange, tælles én gang", () => {
    const m = doemMaaling({ ...ind, ansoegninger: [a("a@x.dk", 30), a("a@x.dk", 40)] }, SENERE).mails[0];
    expect(m.ansoegteInden[168].succes).toBe(1);
  });
});

describe("2. hvornår ansøger folk", () => {
  it("median, kvartiler og vinduer — regnet fra webinaret", () => {
    const t = maalTid({
      udsendelser: [],
      deltagere: ["a", "b", "c", "d", "e"].map((n) => d(`${n}@x.dk`)),
      ansoegninger: [a("a@x.dk", 2), a("b@x.dk", 20), a("c@x.dk", 40), a("d@x.dk", 100), a("e@x.dk", 400)],
    });
    expect(t.antal).toBe(5);
    expect(t.medianTimer).toBe(40);
    expect(t.indenfor[24]).toBe(2);
    expect(t.indenfor[48]).toBe(3);
    expect(t.indenfor[168]).toBe(4);
    expect(t.efterSidsteVindue).toBe(1);
    expect(t.saetning).toContain("Halvdelen ansøgte inden for 40 timer");
  });

  it("den, der ansøgte FØR webinaret, er ikke en ventetid", () => {
    const t = maalTid({
      udsendelser: [],
      deltagere: [d("a@x.dk")],
      ansoegninger: [a("a@x.dk", -50)],
    });
    expect(t.foerWebinaret).toBe(1);
    expect(t.antal).toBe(0);
  });

  it("under grænsen siger den det, i stedet for at vise en median", () => {
    const t = maalTid({ udsendelser: [], deltagere: [d("a@x.dk"), d("b@x.dk")], ansoegninger: [a("a@x.dk", 5), a("b@x.dk", 9)] });
    expect(t.saetning).toContain("FOR FÅ TIL AT SIGE NOGET");
  });

  it("ingen der både deltog og ansøgte giver en sætning, ikke et nul", () => {
    expect(maalTid({ udsendelser: [], deltagere: [], ansoegninger: [] }).saetning).toContain("ingen ventetid at måle");
  });
});

describe("3. hvilken mail gik forud — med forbeholdet i typen", () => {
  it("vælger den SIDST åbnede før ansøgningen", () => {
    const f = maalForud({
      udsendelser: [
        u("a@x.dk", "m1", 1, { aabnet_at: timer(W, 10) }),
        u("a@x.dk", "m2", 2, { aabnet_at: timer(W, 20) }),
        u("a@x.dk", "m3", 3, { aabnet_at: timer(W, 40) }), // EFTER ansøgningen
      ],
      deltagere: [d("a@x.dk")],
      ansoegninger: [a("a@x.dk", 30)],
    });
    expect(f).toHaveLength(1);
    expect(f[0].mail_id).toBe("m2");
    expect(f[0].forbehold).toBe(SIDST_AABNET_FORBEHOLD);
    expect(f[0].forbehold).toContain("ikke «årsag til»");
  });

  it("den, der ansøgte uden at åbne noget, tælles for sig", () => {
    const f = maalForud({ udsendelser: [u("a@x.dk", "m1", 1)], deltagere: [d("a@x.dk")], ansoegninger: [a("a@x.dk", 30)] });
    expect(f[0].mail_id).toBeNull();
    expect(f[0].mail_navn).toBe("åbnede ingen mail før");
  });
});

describe("4. er det nok — og hvad der ALDRIG må siges", () => {
  /** En måling med præcis de tal sammenligningen ser på. */
  const byg = (succes: number, n: number, navn: string) =>
    ({ mail_id: navn, mail_navn: navn, trin: 1, modtaget: n, aabnet: forhold(succes, n, "åbnede") }) as never;

  const eet = {
    udsendelser: ["a", "b", "c"].map((n) => u(`${n}@x.dk`, "m1", 1, { aabnet_at: timer(W, 25) })),
    deltagere: ["a", "b", "c"].map((n) => d(`${n}@x.dk`)),
    ansoegninger: [a("a@x.dk", 30)],
  };

  it("på observationsniveau står forbuddet mod anbefalinger ØVERST", () => {
    const dom = doemMaaling(eet);
    expect(dom.niveau.niveau).toBe("observation");
    expect(dom.advarsler[0]).toContain("FOR FÅ TIL AT SIGE NOGET");
    expect(dom.advarsler.some((s) => s.includes("IKKE anbefales"))).toBe(true);
  });

  it("to mails kan IKKE sammenlignes på observationsniveau", () => {
    const dom = doemMaaling(eet);
    const to = [...dom.mails, { ...dom.mails[0], mail_id: "m2", mail_navn: "Mail 2" }];
    expect(maaSammenlignes(to[0], to[1], dom.niveau.niveau)).toBe(false);
    expect(sammenlignMails(to[0], to[1], dom.niveau.niveau).udfald).toBe("kan_ikke");
  });

  it("selv på sammenligningsniveau kræves nok HÆNDELSER i hver gruppe", () => {
    // 2 af 100 er en pæn nævner og en tom tæller. Nævneren alene er ikke nok.
    expect(maaSammenlignes(byg(2, 100, "A"), byg(2, 100, "B"), "sammenligning")).toBe(false);
    expect(maaSammenlignes(byg(5, 100, "A"), byg(5, 100, "B"), "sammenligning")).toBe(true);
  });

  it("overlappende intervaller siger «kan ikke afgøres» — ikke «ens»", () => {
    // 40 % mod 30 % af 20 lyder af en forskel. Intervallerne overlapper.
    const r = sammenlignMails(byg(8, 20, "A"), byg(6, 20, "B"), "sammenligning");
    expect(r.udfald).toBe("overlapper");
    expect(r.saetning).toContain("betyder IKKE at de er ens");
    expect(r.saetning).not.toContain("reel");
  });

  it("adskilte intervaller — og FØRST der siges «forskellen er reel»", () => {
    const r = sammenlignMails(byg(90, 100, "A"), byg(20, 100, "B"), "sammenligning");
    expect(r.udfald).toBe("adskilte");
    expect(r.saetning).toContain("forskellen er reel");
  });

  it("en mail med for få åbninger kan ikke sammenlignes, uanset den anden", () => {
    const r = sammenlignMails(byg(90, 100, "A"), byg(4, 100, "B"), "sammenligning");
    expect(r.udfald).toBe("kan_ikke");
    expect(r.saetning).toContain(`mindst ${HAENDELSER_FOR_SAMMENLIGNING} åbninger i hver`);
  });

  it("advarer, når over halvdelen ansøger senere end det sidste vindue", () => {
    const sene = {
      udsendelser: ["a", "b", "c", "d", "e", "f"].map((n) => u(`${n}@x.dk`, "m1", 1)),
      deltagere: ["a", "b", "c", "d", "e", "f"].map((n) => d(`${n}@x.dk`, `w1:${n}`, W)),
      ansoegninger: [a("a@x.dk", 200), a("b@x.dk", 300), a("c@x.dk", 400), a("d@x.dk", 10), a("e@x.dk", 20)],
    };
    expect(doemMaaling(sene).advarsler.some((s) => s.includes("Flowet kan være for kort"))).toBe(true);
  });

  it("grænsen for ændringer er ÉN", () => expect(MAKS_AENDRINGER_PR_RUNDE).toBe(1));
});
