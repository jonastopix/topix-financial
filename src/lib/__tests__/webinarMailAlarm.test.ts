import { describe, expect, it } from "vitest";
import {
  ALARM_FEJL_LINJER_MAKS,
  fordelPaaUdfald,
  laesFejlLinje,
  skalAlarmere,
  WEBINAR_ALARM_KLOKKE_TYPE,
  WEBINAR_ALARM_MAIL_LABEL,
  WEBINAR_ALARM_NOEGLE_PRAEFIKS,
  WEBINAR_ALARM_REFERENCE,
  webinarAlarmDatoOgTime,
  webinarAlarmNoegle,
  webinarAlarmTekst,
  type WebinarAlarmTekstInput,
} from "../../../supabase/functions/_shared/webinarMailAlarm.ts";

/**
 * Alarmen ved fejlede webinarmails (29/9-2026) — kun motoren. Hver regel i
 * webinarMailAlarm.ts' filhoved har sin prøve her.
 */

const NU = new Date("2026-09-29T08:09:00Z"); // 10:09 dansk (CEST)
const ROLIG = { sender_rigtigt: true, fejlede: 0, loft: { pause: null, stoppet_ved: null }, over_loft: 0 };
const PAUSE = { grund: "Mailgun svarede 403 kl. 2026-09-29T06:14:00.000Z — venter timen ud", til: "2026-09-29T07:14:00.000Z" };

describe("webinarMailAlarm — konstanterne", () => {
  it("nøglepræfiks, label, klokketype «drift» og reference «webinar_mails»", () => {
    expect(WEBINAR_ALARM_NOEGLE_PRAEFIKS).toBe("webinar-mail-alarm:");
    expect(WEBINAR_ALARM_MAIL_LABEL).toBe("webinar-mail-alarm");
    expect(WEBINAR_ALARM_KLOKKE_TYPE).toBe("drift");
    expect(WEBINAR_ALARM_REFERENCE).toBe("webinar_mails");
    expect(ALARM_FEJL_LINJER_MAKS).toBe(10);
  });
});

describe("webinarMailAlarm — skalAlarmere", () => {
  it("fejlede > 0 alarmerer", () => {
    expect(skalAlarmere({ ...ROLIG, fejlede: 1 })).toBe(true);
    expect(skalAlarmere({ ...ROLIG, fejlede: 211 })).toBe(true);
  });

  it("stoppet_ved alene alarmerer — Mailgun sagde stop i denne kørsel", () => {
    expect(skalAlarmere({ ...ROLIG, loft: { pause: null, stoppet_ved: 403 } })).toBe(true);
    expect(skalAlarmere({ ...ROLIG, loft: { pause: null, stoppet_ved: 429 } })).toBe(true);
  });

  it("pause + over_loft alarmerer (pausen giver fejlede = 0 — en alarm på fejlede alene havde ikke set 29/9)", () => {
    expect(skalAlarmere({ ...ROLIG, loft: { pause: PAUSE, stoppet_ved: null }, over_loft: 211 })).toBe(true);
  });

  it("pause UDEN over_loft alarmerer ikke — ingen venter", () => {
    expect(skalAlarmere({ ...ROLIG, loft: { pause: PAUSE, stoppet_ved: null }, over_loft: 0 })).toBe(false);
  });

  it("en rolig kørsel alarmerer ikke", () => {
    expect(skalAlarmere(ROLIG)).toBe(false);
    expect(skalAlarmere({ ...ROLIG, over_loft: 5 })).toBe(false); // over maks uden pause: tages om fem minutter
  });

  it("tørkørsel og låst kørsel alarmerer ALDRIG — uanset tallene", () => {
    for (const r of [
      { ...ROLIG, fejlede: 211 },
      { ...ROLIG, loft: { pause: null, stoppet_ved: 403 } },
      { ...ROLIG, loft: { pause: PAUSE, stoppet_ved: null }, over_loft: 211 },
    ]) {
      expect(skalAlarmere({ ...r, sender_rigtigt: false })).toBe(false);
    }
  });
});

describe("webinarMailAlarm — nøglen: én pr. dansk time", () => {
  it("bærer dansk dato og time — også over døgnskiftet og i vintertid", () => {
    expect(webinarAlarmDatoOgTime(new Date("2026-09-29T08:09:00Z"))).toBe("2026-09-29T10"); // CEST = UTC+2
    expect(webinarAlarmDatoOgTime(new Date("2026-09-29T22:30:00Z"))).toBe("2026-09-30T00"); // døgnskiftet
    expect(webinarAlarmDatoOgTime(new Date("2026-09-29T21:59:59Z"))).toBe("2026-09-29T23");
    expect(webinarAlarmDatoOgTime(new Date("2026-12-01T07:15:00Z"))).toBe("2026-12-01T08"); // CET = UTC+1
    expect(webinarAlarmDatoOgTime(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01T00");
  });

  it("nøglen er præfiks + dato og time; to kørsler i samme time deler nøgle, to timer gør ikke", () => {
    expect(webinarAlarmNoegle(NU)).toBe("webinar-mail-alarm:2026-09-29T10");
    expect(webinarAlarmNoegle(new Date("2026-09-29T08:59:59Z"))).toBe(webinarAlarmNoegle(NU));
    expect(webinarAlarmNoegle(new Date("2026-09-29T09:00:00Z"))).not.toBe(webinarAlarmNoegle(NU));
    expect(webinarAlarmNoegle(new Date("2026-09-29T12:09:00Z"))).toBe("webinar-mail-alarm:2026-09-29T14");
  });
});

describe("webinarMailAlarm — fejl-linjerne", () => {
  it("læser «art: udfald — grund», og ignorerer andre linjer", () => {
    expect(laesFejlLinje("fjorten_dage: noegle_afvist — Mailgun svarede 403"))
      .toEqual({ art: "fjorten_dage", udfald: "noegle_afvist", rest: "Mailgun svarede 403" });
    expect(laesFejlLinje("en_time: timeout")).toEqual({ art: "en_time", udfald: "timeout", rest: "" });
    expect(laesFejlLinje("sporet kunne ikke skrives (dagen): x")).toBeNull();
    expect(laesFejlLinje("WEBINAR_AFMELD_SECRET mangler — intet sendt")).toBeNull();
  });

  it("fordeler på udfald, flest først", () => {
    const fejl = ["a: loft", "b: noegle_afvist — x", "c: loft", "d: ugyldig", "e: loft", "andet"];
    expect(fordelPaaUdfald(fejl)).toEqual([{ udfald: "loft", antal: 3 }, { udfald: "noegle_afvist", antal: 1 }, { udfald: "ugyldig", antal: 1 }]);
  });
});

describe("webinarMailAlarm — teksten", () => {
  const fejl211 = Array.from({ length: 211 }, (_, i) => `fjorten_dage: ${i % 3 === 0 ? "loft" : "noegle_afvist"} — Mailgun svarede ${i % 3 === 0 ? 429 : 403}`);
  const r: WebinarAlarmTekstInput = {
    sender_rigtigt: true, fejlede: 211, sendt: 108, skal_sendes: 319, over_loft: 0,
    loft: { pause: null, stoppet_ved: null }, fejl: fejl211,
  };

  it("titlen bærer dansk dato og time, og emnet tallet", () => {
    const t = webinarAlarmTekst(r, NU);
    expect(t.titel).toBe("Webinarmails: 211 webinarmails kunne ikke sendes (2026-09-29 kl. 10)");
    expect(t.emne).toBe("211 webinarmails kunne ikke sendes — webinar-mail-cron har brug for et menneske");
    expect(webinarAlarmTekst({ ...r, fejlede: 1, fejl: [fejl211[0]] }, NU).titel).toContain("1 webinarmail kunne");
  });

  it("afkorter til 10 fejl-linjer og nævner resten som tal — og fordelingen på udfald står i første afsnit", () => {
    const t = webinarAlarmTekst(r, NU);
    const fejlBlokke = t.blokke.filter((b) => b.overskrift === "fjorten_dage");
    expect(fejlBlokke.length).toBe(ALARM_FEJL_LINJER_MAKS);
    expect(t.blokke.length).toBe(ALARM_FEJL_LINJER_MAKS + 1);
    expect(t.blokke[t.blokke.length - 1].tekst).toContain("og 201 linjer mere");
    expect(t.afsnit[0]).toBe("Kørslen 2026-09-29 kl. 10 skulle sende 319 mails, sendte 108 og fejlede med 211 (140 × noegle_afvist, 71 × loft).");
    expect(t.tekst.split("\n").filter((l) => l.startsWith("fjorten_dage:")).length).toBe(10);
    expect(fejlBlokke[0].tekst).toContain("Mailgun svarede 429");
  });

  it("nævner stoppet (statuskode), pausen (til hvornår, dansk) og over_loft", () => {
    const t = webinarAlarmTekst({
      ...r, fejlede: 1, fejl: [fejl211[1]], sendt: 90, over_loft: 120,
      loft: { pause: PAUSE, stoppet_ved: 403 },
    }, NU);
    expect(t.afsnit.some((a) => a.includes("Mailgun sagde stop midt i kørslen (status 403)"))).toBe(true);
    expect(t.afsnit.some((a) => a.includes("Pausen gælder til kl. 09:14"))).toBe(true);
    expect(t.afsnit.some((a) => a === "120 mails blev ikke forsøgt (over_loft) — de tages i en senere kørsel.")).toBe(true);
    expect(t.afsnit[t.afsnit.length - 1]).toContain("fejlede mails indhentes automatisk, indtil næste påmindelse er planlagt");
  });

  it("en kørsel under pausen (fejlede 0, over_loft > 0) får sin egen emnelinje og titel", () => {
    const t = webinarAlarmTekst({ ...r, fejlede: 0, fejl: [], sendt: 0, over_loft: 211, loft: { pause: PAUSE, stoppet_ved: null } }, NU);
    expect(t.emne).toBe("Webinarmails venter: Mailgun har sagt stop — 211 udsat");
    expect(t.titel).toBe("Webinarmails: Mailgun har sagt stop, 211 venter (2026-09-29 kl. 10)");
    expect(t.blokke).toEqual([]);
    expect(t.afsnit[0]).toBe("Kørslen 2026-09-29 kl. 10 skulle sende 319 mails og sendte 0.");
  });

  it("andre fejl-linjer (sporet, secret) kommer med som blokke uden art", () => {
    const t = webinarAlarmTekst({ ...r, fejlede: 1, fejl: ["dagen: fejl — Mailgun svarede 500", "sporet kunne ikke skrives (dagen): 23514"] }, NU);
    expect(t.blokke).toEqual([
      { overskrift: "dagen", tekst: "fejl — Mailgun svarede 5xx, eller kaldet kastede · Mailgun svarede 500" },
      { overskrift: "fejl", tekst: "sporet kunne ikke skrives (dagen): 23514" },
    ]);
    expect(t.tekst).toContain("Sporet: webinar_mails");
  });
});
