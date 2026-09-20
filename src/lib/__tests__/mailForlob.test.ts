import { describe, expect, it } from "vitest";
import {
  byggForloeb, erMenneskeligt, udledTrin, tilUdsendelser, tilMaalingsInput, koblingsOversigt,
  type Mailhaendelse, type RaekkeMedEmail,
} from "@/lib/marketing/mailForlob";
// LAG 6's EGNE typer og dom — ikke mine gentagelser af dem. Prøven nederst
// tildeler adapterens resultat til lag 6's MaalingsInput; driver de to fra
// hinanden, er det tsc der siger fra, ikke en tavs uenighed i drift.
import { doemMaaling, type MaalingsInput } from "@/lib/marketing/maalingsdom";
// Paritet: Deno-kopien er en ordret spejling. Importeres her, så vitest falder
// højlydt, hvis de to driver fra hinanden.
import {
  byggForloeb as byggForloebDeno, tilUdsendelser as tilUdsendelserDeno,
} from "../../../supabase/functions/_shared/mailForlob";

const h = (o: Partial<Mailhaendelse> & Pick<Mailhaendelse, "art" | "sket_ved">): Mailhaendelse => ({
  flow_id: "UiECQS", besked_id: "XTwpRQ", besked_navn: "Webinar - Email #1",
  maskine: false, bot: false, url: null, ...o,
});

const ANSOEGT = "2026-09-20T12:00:00.000Z";

describe("mailForlob — maskiner og botter tælles, men er aldrig bevis", () => {
  it("en maskinåbning gør ikke en mail «åbnet»", () => {
    const f = byggForloeb([
      h({ art: "modtaget", sket_ved: "2026-09-19T08:00:00.000Z" }),
      h({ art: "aabnet", sket_ved: "2026-09-19T08:00:30.000Z", maskine: true }),
    ], ANSOEGT);
    expect(f.antal_aabnet).toBe(0);
    expect(f.beskeder[0].maskinaabninger).toBe(1);
    expect(f.kobling).toBe("modtaget_uden_aabning");
  });

  it("et botklik gør ikke en mail «klikket» — målt 42 mod 1 på UiECQS", () => {
    const f = byggForloeb([
      h({ art: "modtaget", sket_ved: "2026-09-19T08:00:00.000Z" }),
      h({ art: "klikket", sket_ved: "2026-09-19T08:00:05.000Z", bot: true, url: "https://www.topix.dk/" }),
    ], ANSOEGT);
    expect(f.antal_klikket).toBe(0);
    expect(f.beskeder[0].botklik).toBe(1);
  });

  it("erMenneskeligt kræver at BEGGE flag er falske", () => {
    expect(erMenneskeligt(h({ art: "aabnet", sket_ved: ANSOEGT }))).toBe(true);
    expect(erMenneskeligt(h({ art: "aabnet", sket_ved: ANSOEGT, maskine: true }))).toBe(false);
    expect(erMenneskeligt(h({ art: "klikket", sket_ved: ANSOEGT, bot: true }))).toBe(false);
  });
});

describe("mailForlob — rækkefølgen og tiden siden", () => {
  it("den sidste mail før ansøgningen, og timerne siden", () => {
    const f = byggForloeb([
      h({ art: "modtaget", sket_ved: "2026-09-13T08:00:00.000Z", besked_id: "A", besked_navn: "7 dage før" }),
      h({ art: "modtaget", sket_ved: "2026-09-19T08:00:00.000Z", besked_id: "B", besked_navn: "1 dag før" }),
      h({ art: "aabnet", sket_ved: "2026-09-19T09:00:00.000Z", besked_id: "B", besked_navn: "1 dag før" }),
    ], ANSOEGT);
    expect(f.beskeder.map((b) => b.besked_id)).toEqual(["A", "B"]);
    expect(f.sidste_mail_foer?.besked_id).toBe("B");
    expect(f.timer_siden_sidste_mail).toBe(28);
    expect(f.sidste_aabnede_foer?.besked_id).toBe("B");
    expect(f.timer_siden_sidste_aabning).toBe(27);
    expect(f.kobling).toBe("fuld");
  });

  it("hændelser EFTER ansøgningen tælles ikke med — men må gerne gives ind", () => {
    // Rækkerne skal kunne genbruges til en senere skæring. Filtrerer man ved
    // kilden, kan man ikke regne bagud.
    const alle = [
      h({ art: "modtaget", sket_ved: "2026-09-19T08:00:00.000Z" }),
      h({ art: "aabnet", sket_ved: "2026-09-21T08:00:00.000Z" }),
    ];
    expect(byggForloeb(alle, ANSOEGT).antal_aabnet).toBe(0);
    expect(byggForloeb(alle, "2026-09-22T00:00:00.000Z").antal_aabnet).toBe(1);
  });

  it("første åbning vinder, ikke den sidste", () => {
    const f = byggForloeb([
      h({ art: "modtaget", sket_ved: "2026-09-19T08:00:00.000Z" }),
      h({ art: "aabnet", sket_ved: "2026-09-19T20:05:14.000Z" }),
      h({ art: "aabnet", sket_ved: "2026-09-19T20:05:07.000Z" }),
    ], ANSOEGT);
    // Målt i virkeligheden: to åbninger syv sekunder fra hinanden, samme udsendelse.
    expect(f.beskeder[0].aabnet_ved).toBe("2026-09-19T20:05:07.000Z");
  });
});

describe("mailForlob — den ærlige markering af hvad der IKKE kan kobles", () => {
  it("fire grunde, ikke én tom liste", () => {
    const modtaget = h({ art: "modtaget", sket_ved: "2026-09-19T08:00:00.000Z" });
    const aabnet = h({ art: "aabnet", sket_ved: "2026-09-19T09:00:00.000Z" });
    expect(byggForloeb([modtaget, aabnet], ANSOEGT).kobling).toBe("fuld");
    expect(byggForloeb([modtaget], ANSOEGT).kobling).toBe("modtaget_uden_aabning");
    expect(byggForloeb([], ANSOEGT).kobling).toBe("ingen_mail_foer");
    expect(byggForloeb([], ANSOEGT, false).kobling).toBe("ikke_i_klaviyo");
  });

  it("«ikke i Klaviyo» og «fik ingen mail» må ALDRIG se ens ud", () => {
    // Den ene ansøgte med en anden adresse; den anden kom uden om flowet.
    // Konsekvenserne er vidt forskellige, og en dom der blander dem lyver.
    expect(byggForloeb([], ANSOEGT, true).kobling).not.toBe(byggForloeb([], ANSOEGT, false).kobling);
  });
});

describe("mailForlob — til lag 6: trinnet udledes, ikke huskes", () => {
  const r = (email: string, art: Mailhaendelse["art"], sket_ved: string, besked_id: string, o: Partial<RaekkeMedEmail> = {}): RaekkeMedEmail => ({
    email, art, sket_ved, besked_id, flow_id: "UiECQS", besked_navn: besked_id, maskine: false, bot: false, url: null, ...o,
  });

  it("den tidligst sendte mail i et flow er trin 1 — uanset navn", () => {
    const trin = udledTrin([
      r("a@x.dk", "modtaget", "2026-09-19T08:00:00.000Z", "Z-sidst"),
      r("a@x.dk", "modtaget", "2026-09-13T08:00:00.000Z", "M-foerst"),
      r("b@x.dk", "modtaget", "2026-09-13T08:00:00.000Z", "M-foerst"),
      r("a@x.dk", "modtaget", "2026-09-15T08:00:00.000Z", "A-midt"),
    ]);
    expect(trin.get("M-foerst")).toBe(1);
    expect(trin.get("A-midt")).toBe(2);
    expect(trin.get("Z-sidst")).toBe(3);
  });

  it("trin regnes PR. FLOW — to flows deler ikke tælling", () => {
    const trin = udledTrin([
      r("a@x.dk", "modtaget", "2026-09-13T08:00:00.000Z", "foer-1", { flow_id: "UiECQS" }),
      r("a@x.dk", "modtaget", "2026-09-23T08:00:00.000Z", "efter-1", { flow_id: "YcBF9f" }),
    ]);
    expect(trin.get("foer-1")).toBe(1);
    expect(trin.get("efter-1")).toBe(1);
  });

  it("én udsendelse pr. (person, mail) med FØRSTE menneskelige åbning — maskiner ses aldrig", () => {
    const u = tilUdsendelser([
      r("A@X.dk", "modtaget", "2026-09-19T08:00:00.000Z", "m1"),
      r("A@X.dk", "aabnet", "2026-09-19T08:00:30.000Z", "m1", { maskine: true }),
      r("A@X.dk", "aabnet", "2026-09-19T09:05:00.000Z", "m1"),
      r("A@X.dk", "aabnet", "2026-09-19T09:00:00.000Z", "m1"),
      r("A@X.dk", "klikket", "2026-09-19T09:01:00.000Z", "m1", { bot: true }),
    ]);
    expect(u).toHaveLength(1);
    expect(u[0].email).toBe("a@x.dk");
    expect(u[0].aabnet_at).toBe("2026-09-19T09:00:00.000Z");
    expect(u[0].klikket_at).toBeNull();
    expect(u[0].trin).toBe(1);
  });

  it("tilMaalingsInput leverer det, lag 6 FAKTISK læser — og lag 6 dømmer det", () => {
    const raekker = [
      r("a@x.dk", "modtaget", "2026-09-13T08:00:00.000Z", "m1"),
      r("a@x.dk", "aabnet", "2026-09-13T09:00:00.000Z", "m1"),
    ];
    // Tildelingen ER prøven: er formen ikke lag 6's, kompilerer linjen ikke.
    const ind: MaalingsInput = tilMaalingsInput(
      raekker,
      [{ email: "a@x.dk", session_id: "web_9|2026-09-22T10:00:00.000Z", session_tid: "2026-09-22T10:00:00.000Z" }],
      [{ email: "a@x.dk", indsendt_at: "2026-09-23T10:00:00.000Z", blev_medlem: false }],
    );
    const dom = doemMaaling(ind, new Date("2026-10-01T00:00:00.000Z"));
    // Én session, én person: lag 6 skal sige «for få» — og det er DENS sætning, ikke vores.
    expect(dom.niveau.niveau).toBe("observation");
    expect(dom.advarsler[0]).toContain("FOR FÅ TIL AT SIGE NOGET");
    expect(dom.mails[0].mail_id).toBe("m1");
    expect(dom.mails[0].aabnet.nokTilAtSigeNoget).toBe(false);
  });
});

describe("mailForlob — hvor stor er gruppen, der ikke kan kobles", () => {
  it("tæller de fire koblinger — og «ikke i Klaviyo» kræver at adressen mangler helt", () => {
    const modtaget = h({ art: "modtaget", sket_ved: "2026-09-19T08:00:00.000Z" });
    const aabnet = h({ art: "aabnet", sket_ved: "2026-09-19T09:00:00.000Z" });
    const prEmail = new Map<string, Mailhaendelse[]>([
      ["fuld@x.dk", [modtaget, aabnet]],
      ["kun-modtaget@x.dk", [modtaget]],
      ["i-klaviyo-uden-mail@x.dk", []],
    ]);
    const iKlaviyo = new Set(["fuld@x.dk", "kun-modtaget@x.dk", "i-klaviyo-uden-mail@x.dk"]);
    const o = koblingsOversigt(
      ["fuld@x.dk", "kun-modtaget@x.dk", "i-klaviyo-uden-mail@x.dk", "Fremmed@Y.dk"].map((email) => ({ email, indsendt_at: ANSOEGT, blev_medlem: false })),
      prEmail, iKlaviyo,
    );
    expect(o).toEqual({ fuld: 1, modtaget_uden_aabning: 1, ingen_mail_foer: 1, ikke_i_klaviyo: 1, i_alt: 4 });
  });
});

describe("mailForlob — paritet mellem src/lib og _shared", () => {
  it("de to kopier dømmer ens", () => {
    const haendelser = [
      h({ art: "modtaget", sket_ved: "2026-09-13T08:00:00.000Z", besked_id: "A" }),
      h({ art: "aabnet", sket_ved: "2026-09-13T09:00:00.000Z", besked_id: "A" }),
      h({ art: "aabnet", sket_ved: "2026-09-13T09:00:02.000Z", besked_id: "A", maskine: true }),
      h({ art: "modtaget", sket_ved: "2026-09-19T08:00:00.000Z", besked_id: "B" }),
      h({ art: "klikket", sket_ved: "2026-09-19T08:00:01.000Z", besked_id: "B", bot: true }),
    ];
    expect(byggForloeb(haendelser, ANSOEGT)).toEqual(byggForloebDeno(haendelser, ANSOEGT));
    expect(byggForloeb([], ANSOEGT, false)).toEqual(byggForloebDeno([], ANSOEGT, false));
    const medEmail = haendelser.map((x) => ({ ...x, email: "a@x.dk" }));
    expect(tilUdsendelser(medEmail)).toEqual(tilUdsendelserDeno(medEmail));
  });
});
