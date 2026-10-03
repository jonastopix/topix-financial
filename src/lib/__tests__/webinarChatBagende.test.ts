import { describe, expect, it } from "vitest";
import {
  beskedVedSpoergsmaal, KLOKKE_TEKST, klokkeTitel, raadgivereUdenUlaestKlokke, REFERENCE_WEBINAR_SESSION, TYPE_WEBINAR_SPOERGSMAAL,
} from "@/lib/webinarMotor/klokke";
import {
  bygSvarMail, hilsenNavn, laesSvarMailLaas, skalSvarMailAlarmere, SVAR_MAIL_GAAET_SEK, SVAR_MAIL_SENESTE_START_MS, SVAR_MAIL_VINDUE_DAGE,
  svarMailAlarmNoegle, svarMailBudgetTillader, svarMailDom, type SvarKandidat, svarMailSenderRigtigt, svarUdfaldArt, tomtSvarMailResultat,
} from "@/lib/webinarMotor/svarMail";
import { I_RUMMET_SEK } from "@/lib/webinarMotor/puls";
import { PULS_ROLIG_MS } from "@/lib/webinarRum/pulsplan";
import { laasFraRaekke, leveringTekst, svarLoefteTekst } from "@/lib/webinarMotorAdmin/konsol";
import { SVAR_MAIL_MAKS_AFVISNINGER, svarPassetMaaBegynde } from "@/lib/webinarMotor/svarMail";
import { SENESTE_START_MS } from "@/lib/webinarMotor/fremmoede";
import { udenBesvaredeWebinarKlokker, webinarKlokkeSessioner, WEBINARKLOKKEN } from "../../../supabase/functions/_shared/klokkeMail.ts";
import { raadgiverSti } from "@/lib/hjemmebane/klokke";
import { raadgivereUdenRaekke } from "../../../supabase/functions/_shared/raadgiverBeskedTekst.ts";
import { afsendelseUkendt } from "../../../supabase/functions/_shared/webinarMailDom.ts";
import { klassificer, klokkeSti } from "../../../supabase/functions/_shared/klokkeMail.ts";
import { TIMEOUT_MS } from "../../../supabase/functions/_shared/mailgunAfsendelse.ts";

/**
 * Webinarchattens bagende (spec'ens skive 5, 3/10-2026; docs/webinarmotor.md §7.10):
 * klokken ved et nyt spørgsmål og svaret på mail til den, der er gået. Dommene.
 * Kildeværnet står i webinarChatBagende.guard.test.ts.
 */

const SES = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("klokken — den rene dom", () => {
  it("beskeden: typen, konsollens reference, titlen med webinarets titel", () => {
    const b = beskedVedSpoergsmaal({ sessionId: SES.toUpperCase(), webinarTitel: "  Overskud uden overarbejde " })!;
    expect(b).toEqual({ type: TYPE_WEBINAR_SPOERGSMAAL, title: "Nyt spørgsmål i webinaret «Overskud uden overarbejde»", body: KLOKKE_TEKST, company_id: null, reference_type: REFERENCE_WEBINAR_SESSION, reference_id: SES });
    expect(klokkeTitel(null)).toBe("Nyt spørgsmål i webinaret");
    expect(beskedVedSpoergsmaal({ sessionId: "P-123" })).toBeNull();
    expect(beskedVedSpoergsmaal({ sessionId: null })).toBeNull();
  });
  it("brødteksten nævner aldrig seeren eller spørgsmålet", () => {
    expect(KLOKKE_TEKST).not.toMatch(/@|«/);
  });
  it("højst én ULÆST pr. (rådgiver, session): en ulæst spærrer, en læst gør ikke, en anden session gør ikke", () => {
    const eks = [
      { advisor_id: A, reference_id: SES, read_at: null },
      { advisor_id: B, reference_id: SES, read_at: "2026-10-03T10:00:00Z" },
      { advisor_id: C, reference_id: "22222222-2222-4222-8222-222222222222", read_at: null },
      { advisor_id: null, reference_id: SES, read_at: null },
    ];
    expect(raadgivereUdenUlaestKlokke([A, B, C], eks, SES)).toEqual([B, C]);
  });
  it("PARITET: samme regel som husets writer med dedupKunUlaeste (raadgivereUdenRaekke, kunUlaeste = true) — på alle delmængder", () => {
    const ids = [A, B, C];
    const muligheder = [null, { r: SES, l: null }, { r: SES, l: "2026-10-03T10:00:00Z" }, { r: "22222222-2222-4222-8222-222222222222", l: null }];
    for (let x = 0; x < 64; x++) {
      const eks = ids.flatMap((id, i) => {
        const m = muligheder[(x >> (i * 2)) & 3];
        return m ? [{ advisor_id: id, reference_id: m.r, read_at: m.l, title: "t" }] : [];
      });
      expect(raadgivereUdenUlaestKlokke(ids, eks, SES)).toEqual(raadgivereUdenRaekke(ids, eks, { title: "t", reference_id: SES }, true));
    }
  });
  it("typen står på MORGEN-listen — ingen mail pr. spørgsmål, morgenmailen fanger en ulæst", () => {
    expect(klassificer(TYPE_WEBINAR_SPOERGSMAAL, REFERENCE_WEBINAR_SESSION)).toBe("morgen");
  });
  it("vejen: konsollen for sessionen — samme sti i klokken og i mailen", () => {
    const n = { type: TYPE_WEBINAR_SPOERGSMAAL, reference_type: REFERENCE_WEBINAR_SESSION, reference_id: SES, company_id: null };
    expect(raadgiverSti(n)).toBe(`/webinar/motor/session/${SES}`);
    expect(klokkeSti(n)).toBe(raadgiverSti(n));
    expect(klokkeSti({ ...n, reference_id: null })).toBe(raadgiverSti({ ...n, reference_id: null }));
  });
});

const NU = Date.parse("2026-11-03T12:00:00Z");
const k = (o: Partial<SvarKandidat> = {}): SvarKandidat => ({
  status: "besvaret", leveret: null, svar_tekst: "Ja — kig på dækningsbidraget først.", svaret_at: new Date(NU - 60_000).toISOString(),
  email: "anne@firma.dk", kilde_system: "platform", afmeldt: false, sessionIntern: false, adresseErHusets: false,
  sidstePulsMs: NU - SVAR_MAIL_GAAET_SEK * 1000, sessionSlutMs: NU + 3_600_000, tidligereUgyldig: false, afvisningerFoer: 0, ...o,
});
const dom = (o: Partial<SvarKandidat> = {}, proeveEmail: string | null = null) => svarMailDom(k(o), { nuMs: NU, proeveEmail });

describe("svar på mail — N og regnestykket", () => {
  it("N = 3 × I_RUMMET_SEK = 180 s, og N er længere end den langsomste puls drosslet til det dobbelte", () => {
    expect(SVAR_MAIL_GAAET_SEK).toBe(3 * I_RUMMET_SEK);
    expect(SVAR_MAIL_GAAET_SEK * 1000).toBeGreaterThan(2 * PULS_ROLIG_MS);
  });
  it("budgettet: 60 000 − 5 000 − (5 000 + Mailguns timeout + 5 000) = 35 000", () => {
    expect(SVAR_MAIL_SENESTE_START_MS).toBe(60_000 - 5_000 - (5_000 + TIMEOUT_MS + 5_000));
    expect(SVAR_MAIL_SENESTE_START_MS).toBe(35_000);
    expect(svarMailBudgetTillader(35_000)).toBe(true);
    expect(svarMailBudgetTillader(35_001)).toBe(false);
  });
});

describe("svar på mail — låsen er fail-closed", () => {
  it("kun true eller «true» åbner", () => {
    expect(laesSvarMailLaas(true)).toBe(true);
    expect(laesSvarMailLaas("true")).toBe(true);
    for (const v of [false, "false", null, undefined, 1, "ja", {}, []]) expect(laesSvarMailLaas(v)).toBe(false);
  });
  it("rigtig afsendelse kræver dry_run: false OG (låsen ELLER prøven)", () => {
    expect(svarMailSenderRigtigt({ toerKoersel: true, laas: true, proeveEmail: "a@topix.dk" })).toBe(false);
    expect(svarMailSenderRigtigt({ toerKoersel: false, laas: false, proeveEmail: null })).toBe(false);
    expect(svarMailSenderRigtigt({ toerKoersel: false, laas: true, proeveEmail: null })).toBe(true);
    expect(svarMailSenderRigtigt({ toerKoersel: false, laas: false, proeveEmail: "a@topix.dk" })).toBe(true);
  });
  it("konsollens løfte følger låsen — og lover intet, når låsen ikke kan læses", () => {
    expect(laasFraRaekke(null, null)).toBe(false);
    expect(laasFraRaekke({ config_value: true }, null)).toBe(true);
    expect(laasFraRaekke({ config_value: true }, { message: "nej" })).toBeNull();
    expect(svarLoefteTekst(false)).toContain("der sendes intet på mail");
    expect(svarLoefteTekst(true)).toContain("sendes svaret på mail");
    expect(svarLoefteTekst(true)).toContain("ingen puls i 3 min");
    expect(svarLoefteTekst(true)).toContain("hvis seeren kan modtage mail");
    expect(svarLoefteTekst(null)).not.toMatch(/sendes svaret på mail|sendes intet/);
    for (const v of [true, false, null]) expect(svarLoefteTekst(v)).not.toMatch(/\blive\b|optag/i);
  });
});

describe("svar på mail — dommen", () => {
  it("gået (ingen puls i 180 s) → send; 179 s → stadig i rummet", () => {
    expect(dom()).toEqual({ send: true });
    expect(dom({ sidstePulsMs: NU - 179_000 })).toEqual({ send: false, grund: "i_rummet" });
    expect(dom({ sidstePulsMs: null })).toEqual({ send: true });
  });
  it("sessionen slut → send, også med en frisk puls", () => {
    expect(dom({ sidstePulsMs: NU - 1_000, sessionSlutMs: NU })).toEqual({ send: true });
    expect(dom({ sidstePulsMs: NU - 1_000, sessionSlutMs: NU + 1 })).toEqual({ send: false, grund: "i_rummet" });
  });
  it("ALDRIG til en afmeldt — heller ikke i prøven til samme adresse", () => {
    expect(dom({ afmeldt: true })).toEqual({ send: false, grund: "afmeldt" });
    expect(dom({ afmeldt: true }, "anne@firma.dk")).toEqual({ send: false, grund: "afmeldt" });
  });
  it("en intern session: kun husets adresser", () => {
    expect(dom({ sessionIntern: true })).toEqual({ send: false, grund: "intern_fremmed" });
    expect(dom({ sessionIntern: true, email: "jonas@topix.dk", adresseErHusets: true })).toEqual({ send: true });
  });
  it("prøven: kun den ene adresse (store bogstaver ens)", () => {
    expect(dom({}, "lh@greensolar.dk")).toEqual({ send: false, grund: "ikke_proeven" });
    expect(dom({ email: "LH@greensolar.dk" }, "lh@greensolar.dk")).toEqual({ send: true });
  });
  it("én pr. spørgsmål: allerede leveret (live ELLER mail) sendes aldrig", () => {
    expect(dom({ leveret: "live" })).toEqual({ send: false, grund: "allerede_leveret" });
    expect(dom({ leveret: "mail" })).toEqual({ send: false, grund: "allerede_leveret" });
  });
  it("rækkens egen tilstand først: ikke besvaret, tomt svar, ingen mail, ikke motorens", () => {
    expect(dom({ status: "ny" })).toEqual({ send: false, grund: "ikke_besvaret" });
    expect(dom({ svar_tekst: "   " })).toEqual({ send: false, grund: "tomt_svar" });
    expect(dom({ email: null })).toEqual({ send: false, grund: "ingen_mail" });
    expect(dom({ email: "ikke-en-mail" })).toEqual({ send: false, grund: "ingen_mail" });
    expect(dom({ kilde_system: "ewebinar" })).toEqual({ send: false, grund: "ikke_platform" });
    expect(dom({ svaret_at: null })).toEqual({ send: false, grund: "ikke_besvaret" });
  });
  it("en adresse, Mailgun har afvist, prøves aldrig igen på mail", () => {
    expect(dom({ tidligereUgyldig: true })).toEqual({ send: false, grund: "ugyldig_adresse" });
  });
  it("for gammel: et svar over 7 døgn sendes ikke (en ny lås sender ikke gamle svar ud)", () => {
    expect(SVAR_MAIL_VINDUE_DAGE).toBe(7);
    expect(dom({ svaret_at: new Date(NU - 7 * 86_400_000 - 1).toISOString() })).toEqual({ send: false, grund: "for_gammel" });
    expect(dom({ svaret_at: new Date(NU - 7 * 86_400_000).toISOString() })).toEqual({ send: true });
  });
});

describe("CTO 3/10 — rettelserne", () => {
  it("fund 1: passet begynder kun ≤ 35 000 ms; fremmødet kan holde til 42 000 + 13 000", () => {
    expect(SENESTE_START_MS).toBe(42_000);
    expect(svarPassetMaaBegynde(35_000)).toBe(true);
    expect(svarPassetMaaBegynde(35_001)).toBe(false);
    expect(svarPassetMaaBegynde(SENESTE_START_MS)).toBe(false);
  });
  it("fund 6: højst 6 tydelige afvisninger pr. spørgsmål", () => {
    expect(SVAR_MAIL_MAKS_AFVISNINGER).toBe(6);
    expect(dom({ afvisningerFoer: 5 })).toEqual({ send: true });
    expect(dom({ afvisningerFoer: 6 })).toEqual({ send: false, grund: "opgivet" });
  });
  it("fund 3: morgenmailen springer webinarklokken over, når sessionen ikke har et ubesvaret spørgsmål — fail-open ved læsefejl", () => {
    const S2 = "22222222-2222-4222-8222-222222222222";
    const raekker = [
      { id: "1", type: WEBINARKLOKKEN, reference_id: SES },
      { id: "2", type: WEBINARKLOKKEN, reference_id: S2 },
      { id: "3", type: "venteliste", reference_id: null },
      { id: "4", type: WEBINARKLOKKEN, reference_id: null },
    ];
    expect(webinarKlokkeSessioner(raekker)).toEqual([SES, S2].sort());
    const ud = udenBesvaredeWebinarKlokker(raekker, new Set([SES]));
    expect(ud.raekker.map((r) => r.id)).toEqual(["1", "3"]);
    expect(ud.sprunget).toBe(2);
    expect(udenBesvaredeWebinarKlokker(raekker, null)).toEqual({ raekker, sprunget: 0 });
  });
  it("fund 7: leveringen skelner sendt · ukendt · afvist", () => {
    const b = { status: "besvaret", leveret: "mail", leveret_at: "2026-11-03T10:12:00Z" };
    expect(leveringTekst({ ...b, mail_udfald: "sendt" })).toBe("Sendt på mail kl. 11.12");
    expect(leveringTekst({ ...b, mail_udfald: "ukendt" })).toContain("det vides ikke, om den kom frem");
    expect(leveringTekst({ ...b, mail_udfald: null })).toContain("Sendes på mail");
    expect(leveringTekst({ status: "besvaret", leveret: null, leveret_at: null, mail_udfald: "afvist" })).toContain("afvist");
    expect(leveringTekst({ status: "besvaret", leveret: "live", leveret_at: "2026-11-03T10:12:00Z", mail_udfald: "afvist" })).toBe("Set i rummet kl. 11.12");
  });
});

describe("svar på mail — udfaldet", () => {
  it("«ukendt» er ORDRET webinarMailDom.afsendelseUkendt — alle udfald × statusser", () => {
    const udfald = ["ok", "ingen_noegle", "noegle_afvist", "loft", "ugyldig", "fejl", "timeout"];
    const statusser = [null, 200, 400, 401, 403, 404, 420, 422, 429, 499, 500, 502, 503];
    for (const u of udfald) for (const s of statusser) {
      const art = svarUdfaldArt(u, s);
      if (u === "ok") expect(art).toBe("ok");
      else expect(`${u}/${s}: ${art === "ukendt"}`).toBe(`${u}/${s}: ${afsendelseUkendt({ udfald: u, status: s })}`);
    }
  });
});

describe("svar på mail — mailen", () => {
  const m = bygSvarMail({ fornavn: "Anne Marie", spoergsmaal: "Hvad med <moms>?\nOg løn?", svar: "Moms & løn:\nførst momsen.", webinarTitel: "Overskud", vaertNavn: "Morten Larsen", afmeldUrl: "https://x/functions/v1/webinar-afmeld?t=abc" });
  it("emnet; spørgsmålet og svaret ORDRET i teksten og escapet i HTML'en", () => {
    expect(m.subject).toBe("Svar på dit spørgsmål fra webinaret");
    expect(m.text).toContain("Hvad med <moms>?\nOg løn?");
    expect(m.text).toContain("Moms & løn:\nførst momsen.");
    expect(m.html).toContain("Hvad med &lt;moms&gt;?<br/>Og løn?");
    expect(m.html).toContain("Moms &amp; løn:<br/>først momsen.");
    expect(m.html).not.toContain("<moms>");
  });
  it("hilsen fra værten, fornavnet til seeren, afmeldingslinket", () => {
    expect(m.text).toMatch(/^Hej Anne,/);
    expect(m.text).toContain("Venlig hilsen\nMorten");
    expect(hilsenNavn(null)).toBe("Morten");
    expect(m.text).toContain("https://x/functions/v1/webinar-afmeld?t=abc");
    expect(m.html).toContain("https://x/functions/v1/webinar-afmeld?t=abc");
  });
  it("ingen påstand om «live», ingen «optagelse», ingen gensyn", () => {
    for (const t of [m.subject, m.text, m.html]) expect(t).not.toMatch(/\blive\b|optag|gensyn|replay/i);
  });
});

describe("svar på mail — alarmen", () => {
  it("aldrig i en tørkørsel; i en rigtig kørsel kun ved fejl, ukendte eller stop", () => {
    const tom = tomtSvarMailResultat({ laas: true, senderRigtigt: false, proeve: false });
    expect(skalSvarMailAlarmere({ ...tom, fejlede: 3, fejl: ["x"] })).toBe(false);
    const rigtig = tomtSvarMailResultat({ laas: true, senderRigtigt: true, proeve: false });
    expect(skalSvarMailAlarmere(rigtig)).toBe(false);
    expect(skalSvarMailAlarmere({ ...rigtig, fejlede: 1 })).toBe(true);
    expect(skalSvarMailAlarmere({ ...rigtig, ukendte: 1 })).toBe(true);
    expect(skalSvarMailAlarmere({ ...rigtig, stoppet: true })).toBe(true);
    expect(skalSvarMailAlarmere({ ...rigtig, fejl: ["webinar_afmeldinger: nede"] })).toBe(true);
  });
  it("én pr. dansk time", () => {
    expect(svarMailAlarmNoegle("2026-11-03T13")).toBe("webinar-svar-mail:2026-11-03T13");
  });
  it("beviset: svar_mail bærer kandidater, sendt, sprunget og laas_aktiv", () => {
    const r = tomtSvarMailResultat({ laas: false, senderRigtigt: false, proeve: false });
    for (const f of ["kandidater", "sendt", "sprunget", "laas_aktiv"]) expect(r).toHaveProperty(f);
  });
});
