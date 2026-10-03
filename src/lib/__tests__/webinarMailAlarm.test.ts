import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALARM_FEJL_LINJER_MAKS,
  andreFejl,
  beregnPrognose,
  doemAlarm,
  fordelPaaUdfald,
  fristerIFare,
  fristFor,
  laesFejlLinje,
  prognoseTekst,
  WEBINAR_ALARM_KLOKKE_TYPE,
  WEBINAR_ALARM_MAIL_LABEL,
  WEBINAR_ALARM_NOEGLE_PRAEFIKS,
  WEBINAR_ALARM_REFERENCE,
  webinarAlarmDato,
  webinarAlarmDatoOgTime,
  webinarAlarmNoegle,
  webinarAlarmTekst,
  type AlarmInput,
  type WebinarAlarmTekstInput,
} from "../../../supabase/functions/_shared/webinarMailAlarm.ts";
import { indhentningSlut } from "../../../supabase/functions/_shared/webinarMailDom.ts";

/**
 * Alarmen ved fejlede webinarmails — omdømt 29/9 14:04: den må kun lyde, når et
 * menneske skal gøre noget. Hver regel i webinarMailAlarm.ts' filhoved har sin
 * prøve her, og kildeværnet nederst låser nøglen og alvorsordenen.
 */

const NU = new Date("2026-09-29T12:09:00Z"); // 14:09 dansk (CEST)
const SESSION = "2026-10-13T09:00:00Z"; // 13/10 kl. 11:00 dansk
const ROLIG: AlarmInput = { sender_rigtigt: true, fejlede: 0, fejl: [], loft: { pause: null, stoppet_ved: null, ok_60_min: 26 }, over_loft: 0, sprunget: { for_sent_efter_fejl: 0 }, ventende: [] };
const PAUSE = { grund: "Mailgun svarede 420 kl. 2026-09-29T11:47:00.000Z — venter timen ud", til: "2026-09-29T12:47:00.000Z" };
const ventende = (n: number, art = "fjorten_dage" as const) => Array.from({ length: n }, () => ({ art, session_tid: SESSION }));
/** Jonas' mail 29/9 14:04: 112 udsat, pausen til 14:47, 26 gik igennem. */
const LOFT_STOP: AlarmInput = { ...ROLIG, loft: { pause: PAUSE, stoppet_ved: null, ok_60_min: 26 }, over_loft: 112, ventende: ventende(112) };

describe("webinarMailAlarm — konstanterne", () => {
  it("præfiks, label, klokketype «drift» og reference «webinar_mails»", () => {
    expect(WEBINAR_ALARM_NOEGLE_PRAEFIKS).toBe("webinar-mail-alarm:");
    expect(WEBINAR_ALARM_MAIL_LABEL).toBe("webinar-mail-alarm");
    expect(WEBINAR_ALARM_KLOKKE_TYPE).toBe("drift");
    expect(WEBINAR_ALARM_REFERENCE).toBe("webinar_mails");
    expect(ALARM_FEJL_LINJER_MAKS).toBe(10);
  });
});

describe("webinarMailAlarm — doemAlarm: de fire arter", () => {
  it("tørkørsel og låst kørsel alarmerer ALDRIG — uanset tallene", () => {
    for (const r of [{ ...LOFT_STOP }, { ...ROLIG, fejl: ["dagen: ugyldig — Mailgun svarede 400"], fejlede: 1 }, { ...ROLIG, sprunget: { for_sent_efter_fejl: 3 } }]) {
      expect(doemAlarm({ ...r, sender_rigtigt: false }, NU)).toBeNull();
    }
  });

  it("en rolig kørsel alarmerer ikke", () => {
    expect(doemAlarm(ROLIG, NU)).toBeNull();
  });

  it("LOFT-STOP uden andre fejl (pause + over_loft, stoppet_ved, eller over_loft alene) → art «loft» med nøgle pr. dansk DAG", () => {
    const a = doemAlarm(LOFT_STOP, NU);
    expect(a?.art).toBe("loft");
    expect(a?.noegle).toBe("webinar-mail-alarm:loft:2026-09-29");
    expect(doemAlarm({ ...ROLIG, loft: { pause: null, stoppet_ved: 420, ok_60_min: 26 }, over_loft: 5, ventende: ventende(5) }, NU)?.art).toBe("loft");
    expect(doemAlarm({ ...ROLIG, over_loft: 3, ventende: ventende(3) }, NU)?.art).toBe("loft");
    // Fejl-linjer, der KUN er loft-udfald, er stadig et loft-stop — ikke en fejl.
    expect(doemAlarm({ ...LOFT_STOP, fejlede: 1, fejl: ["fjorten_dage: loft — Mailgun svarede 420: recipient limit (26) exceeded"] }, NU)?.art).toBe("loft");
  });

  it("loft hver time hele dagen → ÉN nøgle; ny dag → én ny", () => {
    const noegler = new Set<string>();
    for (let t = 8; t <= 22; t++) noegler.add(doemAlarm(LOFT_STOP, new Date(`2026-09-29T${String(t - 2).padStart(2, "0")}:09:00Z`))!.noegle);
    expect([...noegler]).toEqual(["webinar-mail-alarm:loft:2026-09-29"]);
    expect(doemAlarm(LOFT_STOP, new Date("2026-09-29T22:30:00Z"))!.noegle).toBe("webinar-mail-alarm:loft:2026-09-30"); // 00:30 dansk næste dag
  });

  it("FRIST I FARE: prognosen når ikke fristen → art «frist», nøgle pr. dansk DAG (én om dagen) — og dæmpes ikke af dagens loft-mail", () => {
    // 112 venter ÷ 4 pr. time = 28 t → ca. 30/9 18:09; en «en_dag»-mail til 30/9 (frist midnat før «dagen» 30/9 = 29/9 24:00) når det ikke.
    const r: AlarmInput = { ...LOFT_STOP, loft: { pause: PAUSE, stoppet_ved: null, ok_60_min: 4 }, ventende: [...ventende(111), { art: "en_dag", session_tid: "2026-09-30T09:00:00Z" }] };
    const a = doemAlarm(r, NU);
    expect(a?.art).toBe("frist");
    expect(a?.noegle).toBe("webinar-mail-alarm:frist:2026-09-29");
    expect(a?.iFare.length).toBe(1);
    expect(a?.iFare[0].art).toBe("en_dag");
    expect(a!.noegle).not.toBe(doemAlarm(LOFT_STOP, NU)!.noegle);
  });

  it("UDLØBET: for_sent_efter_fejl > 0 → art «tabt», nøgle pr. dansk DAG, også når loftet står på", () => {
    const a = doemAlarm({ ...LOFT_STOP, sprunget: { for_sent_efter_fejl: 2 } }, NU);
    expect(a?.art).toBe("tabt");
    expect(a?.tabt).toBe(2);
    expect(a?.noegle).toBe("webinar-mail-alarm:tabt:2026-09-29");
  });

  it("FEJLEDE af andre grunde end loftet → art «fejl» som før, nøgle pr. dansk time — og den vinder over tabt/frist/loft", () => {
    const r: AlarmInput = { ...LOFT_STOP, fejlede: 3, fejl: ["dagen: noegle_afvist — Mailgun svarede 403", "en_time: ugyldig — Mailgun svarede 400", "fjorten_dage: loft — Mailgun svarede 429"], sprunget: { for_sent_efter_fejl: 1 } };
    const a = doemAlarm(r, NU);
    expect(a?.art).toBe("fejl");
    expect(a?.andreFejl).toEqual(["dagen: noegle_afvist — Mailgun svarede 403", "en_time: ugyldig — Mailgun svarede 400"]);
    expect(a?.noegle).toBe("webinar-mail-alarm:fejl:2026-09-29T14");
    // Linjer, der ikke er mails (sporet, secret'en), er også fejl.
    expect(doemAlarm({ ...ROLIG, fejl: ["sporet kunne ikke skrives (dagen): 23514"] }, NU)?.art).toBe("fejl");
    expect(andreFejl(["a: loft — x", "b: timeout", "WEBINAR_AFMELD_SECRET mangler — intet sendt"])).toEqual(["b: timeout", "WEBINAR_AFMELD_SECRET mangler — intet sendt"]);
  });

  it("alvorsorden: fejl > tabt > frist > loft", () => {
    const fare: AlarmInput = { ...LOFT_STOP, loft: { pause: PAUSE, stoppet_ved: null, ok_60_min: 1 }, ventende: [{ art: "en_dag", session_tid: "2026-09-30T09:00:00Z" }] };
    expect(doemAlarm(fare, NU)?.art).toBe("frist");
    expect(doemAlarm({ ...fare, sprunget: { for_sent_efter_fejl: 1 } }, NU)?.art).toBe("tabt");
    expect(doemAlarm({ ...fare, sprunget: { for_sent_efter_fejl: 1 }, fejl: ["dagen: fejl — x"] }, NU)?.art).toBe("fejl");
  });
});

describe("webinarMailAlarm — nøglerne i dansk tid", () => {
  it("dato og dato+time — over døgnskiftet og i vintertid", () => {
    expect(webinarAlarmDato(new Date("2026-09-29T22:30:00Z"))).toBe("2026-09-30");
    expect(webinarAlarmDatoOgTime(new Date("2026-09-29T08:09:00Z"))).toBe("2026-09-29T10");
    expect(webinarAlarmDatoOgTime(new Date("2026-12-01T07:15:00Z"))).toBe("2026-12-01T08");
    expect(webinarAlarmNoegle("loft", NU)).toBe("webinar-mail-alarm:loft:2026-09-29");
    // Én om dagen pr. art for loft, tabt og frist — kun fejl pr. time (noget er i stykker).
    expect(webinarAlarmNoegle("frist", NU)).toBe("webinar-mail-alarm:frist:2026-09-29");
    expect(webinarAlarmNoegle("tabt", NU)).toBe("webinar-mail-alarm:tabt:2026-09-29");
    expect(webinarAlarmNoegle("tabt", new Date("2026-09-29T21:59:59Z"))).toBe(webinarAlarmNoegle("tabt", NU));
    expect(webinarAlarmNoegle("tabt", new Date("2026-09-29T22:00:00Z"))).not.toBe(webinarAlarmNoegle("tabt", NU)); // 00:00 dansk næste dag
    expect(webinarAlarmNoegle("fejl", NU)).toBe("webinar-mail-alarm:fejl:2026-09-29T14");
    expect(webinarAlarmNoegle("fejl", new Date("2026-09-29T12:59:59Z"))).toBe(webinarAlarmNoegle("fejl", NU));
    expect(webinarAlarmNoegle("fejl", new Date("2026-09-29T13:00:00Z"))).not.toBe(webinarAlarmNoegle("fejl", NU));
  });
});

describe("webinarMailAlarm — fristen (dommens INDHENTNING) og prognosen", () => {
  it("fristFor: tidssatte arter = max(planlagt + nåde, indhentningSlut); straks/en_time = starten; udgåede (30/9) = null", () => {
    // fjorten_dage for 13/10 er planlagt 29/9 08:00 dansk; næste er syv_dage 6/10, loft 8 dage før (5/10) → frist = midnat 6/10 dansk = 5/10 22:00Z.
    expect(fristFor("fjorten_dage", SESSION)?.toISOString()).toBe("2026-10-05T22:00:00.000Z");
    // 30/9: syv_dage 6/10 08:00 dansk; næste er en_dag 12/10, men loftet 4 dage før (9/10 til og med) er tidligere
    // → frist = midnat 10/10 dansk = 9/10 22:00Z (uden loftet: 11/10 22:00Z).
    expect(fristFor("syv_dage", SESSION)?.toISOString()).toBe("2026-10-09T22:00:00.000Z");
    // Alarmen og dommen er enige: fristen er dommens indhentningSlut for alle tidssatte arter.
    for (const art of ["fjorten_dage", "syv_dage", "en_dag"] as const) {
      expect(fristFor(art, SESSION)?.toISOString(), art).toBe(indhentningSlut(SESSION, art)?.toISOString());
    }
    // en_dag 12/10 08:00 dansk; næste er en_time 13/10 10:00 dansk → midnat 13/10 dansk = 12/10 22:00Z (> planlagt + 2 t).
    expect(fristFor("en_dag", SESSION)?.toISOString()).toBe("2026-10-12T22:00:00.000Z");
    // De udgåede har ingen plan og dermed ingen frist.
    expect(fristFor("tre_dage", SESSION)).toBeNull();
    expect(fristFor("dagen", SESSION)).toBeNull();
    expect(fristFor("en_time", SESSION)?.toISOString()).toBe(SESSION.replace("Z", ".000Z"));
    expect(fristFor("bekraeftelse", SESSION)?.toISOString()).toBe(SESSION.replace("Z", ".000Z"));
    expect(fristFor("en_dag", "ikke en tid")).toBeNull();
  });

  it("fristFor «ti_minutter» (3/10) = planlagt + dens EGEN nåde (5 min) = T − 5 min — ikke starten og ikke 2 t", () => {
    // Session 09:00Z: planlagt 08:50Z + 5 min = 08:55Z. Dommen sender den aldrig senere.
    const ms = Date.parse(SESSION);
    expect(fristFor("ti_minutter", SESSION)?.getTime()).toBe(ms - 5 * 60_000);
  });

  it("beregnPrognose: 112 ÷ 26 ≈ 4,3 t; 0 igennem → kan ikke regnes; 0 venter → færdig nu", () => {
    const p = beregnPrognose(112, 26, NU);
    expect(p.timer).toBeCloseTo(4.3077, 3);
    expect(p.faerdig?.toISOString()).toBe(new Date(NU.getTime() + (112 / 26) * 3_600_000).toISOString());
    expect(prognoseTekst(p, NU)).toBe("112 venter ÷ 26 pr. time ≈ 4,3 t → ca. kl. 18:27.");
    expect(beregnPrognose(112, 0, NU)).toEqual({ ventende: 112, okPrTime: 0, timer: null, faerdig: null });
    expect(prognoseTekst(beregnPrognose(112, 0, NU), NU)).toBe("112 venter — hvornår de er ude, kan ikke beregnes: intet gik igennem den seneste time.");
    expect(beregnPrognose(0, 26, NU).faerdig).toBe(NU);
    // Færdig en anden dag: datoen med.
    expect(prognoseTekst(beregnPrognose(300, 10, NU), NU)).toBe("300 venter ÷ 10 pr. time ≈ 30,0 t → ca. 30/9 kl. 20:09.");
  });

  it("fristerIFare: kun dem med frist før færdigtiden, sorteret; uden prognose ingen (der gættes ikke)", () => {
    const p = beregnPrognose(112, 4, NU); // 28 t → 30/9 ~18:09 dansk
    const liste = [{ art: "fjorten_dage" as const, session_tid: SESSION }, { art: "en_dag" as const, session_tid: "2026-09-30T09:00:00Z" }, { art: "en_time" as const, session_tid: "2026-09-30T09:00:00Z" }];
    const fare = fristerIFare(liste, p);
    expect(fare.map((f) => f.art)).toEqual(["en_dag", "en_time"]);
    expect(fristerIFare(liste, beregnPrognose(112, 0, NU))).toEqual([]);
  });
});

describe("webinarMailAlarm — teksten pr. art", () => {
  const bas: WebinarAlarmTekstInput = { ...LOFT_STOP, sendt: 26, skal_sendes: 138 };

  it("loft: emne med forventet færdigtid, titlen bærer KUN datoen, regnestykket står i mailen, og «ikke noget at gøre»", () => {
    const t = webinarAlarmTekst(bas, doemAlarm(bas, NU)!, NU);
    expect(t.emne).toBe("Webinarmails: 112 venter på Mailguns loft — forventet ude ca. kl. 18:27");
    expect(t.titel).toBe("Webinarmails: 112 venter på loftet (2026-09-29)");
    expect(t.afsnit[0]).toBe("Kørslen 2026-09-29 kl. 14 skulle sende 138 mails, sendte 26, og 112 venter (over loftet).");
    expect(t.afsnit[1]).toBe("Den seneste time gik 26 igennem. 112 venter ÷ 26 pr. time ≈ 4,3 t → ca. kl. 18:27. Prognosen antager samme takt som den seneste time.");
    expect(t.afsnit[2]).toContain("Pausen gælder til kl. 14:47");
    expect(t.afsnit[t.afsnit.length - 1]).toContain("Der er ikke noget at gøre");
    expect(t.blokke).toEqual([]);
    expect(t.tekst).toContain("112 venter ÷ 26 pr. time");
  });

  it("loft med 0 igennem: ærligt «kan ikke beregnes»", () => {
    const r = { ...bas, loft: { pause: PAUSE, stoppet_ved: null, ok_60_min: 0 } };
    const t = webinarAlarmTekst(r, doemAlarm(r, NU)!, NU);
    expect(t.emne).toBe("Webinarmails: 112 venter på Mailguns loft — hvornår kan ikke beregnes");
    expect(t.afsnit[1]).toBe("Den seneste time gik 0 igennem. 112 venter — hvornår de er ude, kan ikke beregnes: intet gik igennem den seneste time. Prognosen antager samme takt som den seneste time.");
  });

  it("frist: hvor mange og den tidligste frist; titlen bærer KUN datoen (én om dagen)", () => {
    const r: WebinarAlarmTekstInput = { ...bas, loft: { pause: PAUSE, stoppet_ved: null, ok_60_min: 4 }, ventende: [...ventende(111), { art: "en_dag", session_tid: "2026-09-30T09:00:00Z" }] };
    const t = webinarAlarmTekst(r, doemAlarm(r, NU)!, NU);
    expect(t.emne).toBe("Webinarmails i fare: 1 når ikke sin frist (første 30/9 kl. 00:00)");
    expect(t.titel).toBe("Webinarmails: 1 i fare for fristen (2026-09-29)");
    expect(t.afsnit[1]).toContain("112 venter ÷ 4 pr. time ≈ 28,0 t → ca. 30/9 kl. 18:09. 1 af de ventende har en frist FØR det — den første 30/9 kl. 00:00 (i morgen, webinar 30/9 kl. 11:00)");
    expect(t.afsnit[2]).toBe("Fordelt: 1 × en_dag.");
  });

  it("tabt: antallet og hvad det betyder", () => {
    const r = { ...bas, sprunget: { for_sent_efter_fejl: 2 } };
    const t = webinarAlarmTekst(r, doemAlarm(r, NU)!, NU);
    expect(t.emne).toBe("2 webinarmails er tabt — nåede ikke ud før næste påmindelse");
    expect(t.titel).toBe("Webinarmails: 2 tabt (2026-09-29)");
    expect(t.afsnit[1]).toContain("for_sent_efter_fejl");
  });

  it("fejl: som før — fordeling på udfald, højst 10 blokke, «og N linjer mere»; loft-linjer tælles ikke med", () => {
    const fejl = [...Array.from({ length: 14 }, (_, i) => `dagen: ${i % 2 ? "ugyldig" : "noegle_afvist"} — Mailgun svarede ${i % 2 ? 400 : 403}`), "fjorten_dage: loft — Mailgun svarede 429"];
    const r = { ...bas, fejlede: 15, fejl };
    const t = webinarAlarmTekst(r, doemAlarm(r, NU)!, NU);
    expect(t.emne).toBe("14 webinarmails kunne ikke sendes — webinar-mail-cron har brug for et menneske");
    expect(t.titel).toBe("Webinarmails: 14 webinarmails kunne ikke sendes (2026-09-29 kl. 14)");
    expect(t.afsnit[1]).toBe("14 fejl af andre grunde end loftet (7 × noegle_afvist, 7 × ugyldig) — det retter throttlen ikke.");
    expect(t.blokke.length).toBe(ALARM_FEJL_LINJER_MAKS + 1);
    expect(t.blokke[t.blokke.length - 1].tekst).toContain("og 4 linjer mere");
    expect(laesFejlLinje("en_time: timeout")).toEqual({ art: "en_time", udfald: "timeout", rest: "" });
    expect(fordelPaaUdfald(["a: loft", "b: loft", "c: fejl"])).toEqual([{ udfald: "loft", antal: 2 }, { udfald: "fejl", antal: 1 }]);
  });
});

describe("webinarMailAlarm — kildeværn: nøglen for loft-grenen er pr. dag, og de rigtige alarmer kan ikke dæmpes", () => {
  const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
  const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
  const ALARM = "supabase/functions/_shared/webinarMailAlarm.ts";
  const dommenErRigtig = (kilde: string): boolean => {
    const k = udenKommentarer(kilde);
    return (
      k.includes('export const ARTER_PR_DAG: readonly AlarmArt[] = ["loft", "tabt", "frist"];') &&
      k.includes("const hale = ARTER_PR_DAG.includes(art) ? webinarAlarmDato(nu) : webinarAlarmDatoOgTime(nu);") &&
      k.includes("return `${WEBINAR_ALARM_NOEGLE_PRAEFIKS}${art}:${hale}`;") &&
      /fejl\.length > 0 \? "fejl"\s*: tiMinutter\.iFare\.length > 0 \|\| tiMinutter\.tabt > 0 \? "ti_minutter"\s*: tabt > 0 \? "tabt"\s*: iFare\.length > 0 \? "frist"\s*: loftStop \? "loft"\s*: null;/.test(k) &&
      // «ti_minutter» (3/10): pr. dansk TIME (står ikke i ARTER_PR_DAG), og 10 min er grænsen.
      k.includes("export const TI_MINUTTER_ALARM_MS = 10 * 60_000;") &&
      k.includes("if (frist !== null && frist.getTime() - nu.getTime() <= TI_MINUTTER_ALARM_MS)") &&
      k.includes("for (const v of [...r.ventende, ...(r.udsatte ?? [])]) {") &&
      k.includes("if (!r.sender_rigtigt) return null;") &&
      k.includes("return l === null || l.udfald !== LOFT_UDFALD;") &&
      k.includes("if (okPrTime <= 0) return { ventende, okPrTime, timer: null, faerdig: null };") &&
      k.includes("if (prognose.faerdig === null) return [];")
    );
  };
  it("dommen står, som prøverne ovenfor kræver", () => expect(dommenErRigtig(laes(ALARM))).toBe(true));
  it("VÆRNET VIRKER: loft/tabt/frist pr. time, arten uden for nøglen, loft foran de rigtige, eller en gættet prognose fælder", () => {
    const k = laes(ALARM);
    expect(dommenErRigtig(k.replace("const hale = ARTER_PR_DAG.includes(art) ? webinarAlarmDato(nu) : webinarAlarmDatoOgTime(nu);", "const hale = webinarAlarmDatoOgTime(nu);"))).toBe(false);
    // tabt eller frist pr. time fælder — én om dagen pr. art er nok.
    expect(dommenErRigtig(k.replace('["loft", "tabt", "frist"]', '["loft", "frist"]'))).toBe(false);
    expect(dommenErRigtig(k.replace('["loft", "tabt", "frist"]', '["loft", "tabt"]'))).toBe(false);
    expect(dommenErRigtig(k.replace("return `${WEBINAR_ALARM_NOEGLE_PRAEFIKS}${art}:${hale}`;", "return `${WEBINAR_ALARM_NOEGLE_PRAEFIKS}${hale}`;"))).toBe(false);
    const loftFoerst = k.replace(/: loftStop \? "loft"\s*: null;/, ': null;').replace('fejl.length > 0 ? "fejl"', 'loftStop ? "loft" : fejl.length > 0 ? "fejl"');
    expect(loftFoerst).not.toBe(k);
    expect(dommenErRigtig(loftFoerst)).toBe(false);
    expect(dommenErRigtig(k.replace("if (okPrTime <= 0) return { ventende, okPrTime, timer: null, faerdig: null };", "if (okPrTime <= 0) okPrTime = 1;"))).toBe(false);
    expect(dommenErRigtig(k.replace("if (!r.sender_rigtigt) return null;", ""))).toBe(false);
    // «ti_minutter» (3/10): pr. dag, uden de udsatte, eller grænsen flyttet, fælder.
    expect(dommenErRigtig(k.replace('["loft", "tabt", "frist"]', '["loft", "tabt", "frist", "ti_minutter"]'))).toBe(false);
    expect(dommenErRigtig(k.replace("for (const v of [...r.ventende, ...(r.udsatte ?? [])]) {", "for (const v of r.ventende) {"))).toBe(false);
    expect(dommenErRigtig(k.replace("export const TI_MINUTTER_ALARM_MS = 10 * 60_000;", "export const TI_MINUTTER_ALARM_MS = 0;"))).toBe(false);
    expect(dommenErRigtig(k.replace(' : tiMinutter.iFare.length > 0 || tiMinutter.tabt > 0 ? "ti_minutter"', ""))).toBe(false);
  });
});

describe("webinarMailAlarm — «ti_minutter» lige før start (3/10-2026, CTO-rådets fund 1)", () => {
  // Session 13/10 kl. 11:00 dansk = 09:00Z; fristen (fristFor) = T − 5 min = 08:55Z.
  const TI = (n: number) => Array.from({ length: n }, () => ({ art: "ti_minutter" as const, session_tid: SESSION }));
  const ved = (iso: string) => new Date(iso);

  it("en UDSAT ti_minutter med frist ≤ 10 min → art «ti_minutter», nøgle pr. dansk TIME", () => {
    const a = doemAlarm({ ...ROLIG, udsatte: TI(3) }, ved("2026-10-13T08:47:40Z")); // frist 7 min 20 s ude
    expect(a?.art).toBe("ti_minutter");
    expect(a?.noegle).toBe("webinar-mail-alarm:ti_minutter:2026-10-13T10");
    expect(a?.tiMinutter.iFare).toHaveLength(3);
    expect(a?.tiMinutter.iFare[0].frist.toISOString()).toBe("2026-10-13T08:55:00.000Z");
  });

  it("OVER LOFTET (ventende) tæller som udsat — og grænsen er præcis 10 min", () => {
    expect(doemAlarm({ ...ROLIG, over_loft: 2, ventende: TI(2) }, ved("2026-10-13T08:45:00Z"))?.art).toBe("ti_minutter");
    // 10 min 1 s ude: næste slot kan nå den — kun loft-alarmen.
    expect(doemAlarm({ ...ROLIG, over_loft: 2, ventende: TI(2) }, ved("2026-10-13T08:44:59Z"))?.art).toBe("loft");
    expect(doemAlarm({ ...ROLIG, udsatte: TI(2) }, ved("2026-10-13T08:44:59Z"))).toBeNull();
    // Fristen passeret: stadig i fare (tabt i denne kørsel).
    expect(doemAlarm({ ...ROLIG, udsatte: TI(1) }, ved("2026-10-13T08:58:00Z"))?.art).toBe("ti_minutter");
  });

  it("TABT (dommens kortNaadeTabt) → art «ti_minutter», også uden noget udsat", () => {
    const a = doemAlarm({ ...ROLIG, ti_minutter: { tabt: 4 } }, ved("2026-10-13T08:57:03Z"));
    expect(a?.art).toBe("ti_minutter");
    expect(a?.tiMinutter.tabt).toBe(4);
    expect(doemAlarm({ ...ROLIG, ti_minutter: { tabt: 0 } }, ved("2026-10-13T08:57:03Z"))).toBeNull();
  });

  it("de andre arters udsatte alarmerer IKKE (de tages af næste slot, som før)", () => {
    const andre = [{ art: "en_time" as const, session_tid: SESSION }, { art: "en_dag" as const, session_tid: SESSION }, { art: "bekraeftelse" as const, session_tid: SESSION }];
    expect(doemAlarm({ ...ROLIG, udsatte: andre }, ved("2026-10-13T08:57:03Z"))).toBeNull();
  });

  it("én pr. dansk TIME: samme time → samme nøgle; næste time → en ny", () => {
    const r = { ...ROLIG, udsatte: TI(1) };
    expect(doemAlarm(r, ved("2026-10-13T08:47:00Z"))!.noegle).toBe(doemAlarm(r, ved("2026-10-13T08:59:00Z"))!.noegle);
    const S2 = "2026-10-13T10:00:00Z";
    expect(doemAlarm({ ...ROLIG, udsatte: [{ art: "ti_minutter", session_tid: S2 }] }, ved("2026-10-13T09:47:00Z"))!.noegle).toBe("webinar-mail-alarm:ti_minutter:2026-10-13T11");
  });

  it("alvorsorden: «fejl» vinder over «ti_minutter»; «ti_minutter» over tabt, frist og loft", () => {
    const nu = ved("2026-10-13T08:50:00Z");
    expect(doemAlarm({ ...ROLIG, udsatte: TI(1), fejl: ["en_dag: ugyldig — Mailgun svarede 400"], fejlede: 1 }, nu)?.art).toBe("fejl");
    expect(doemAlarm({ ...LOFT_STOP, udsatte: TI(1), sprunget: { for_sent_efter_fejl: 3 } }, nu)?.art).toBe("ti_minutter");
  });

  it("RUNDE 2, fund 3: vinder «fejl», bærer fejl-mailen STADIG ti_minutter-afsnittet (som loftAfsnit)", () => {
    const nu = ved("2026-10-13T08:57:03Z");
    const r: WebinarAlarmTekstInput = { ...ROLIG, fejl: ["en_dag: ugyldig — Mailgun svarede 400"], fejlede: 1, udsatte: TI(2), ti_minutter: { tabt: 3 }, sendt: 1, skal_sendes: 4 };
    const a = doemAlarm(r, nu)!;
    expect(a.art).toBe("fejl");
    const t = webinarAlarmTekst(r, a, nu);
    expect(t.tekst).toContain("3 mails «lige før start»");
    expect(t.tekst).toContain("2 mails «lige før start» står udsat");
    // Uden ti_minutter i kørslen: ingen sådan linje i fejl-mailen.
    const ren: WebinarAlarmTekstInput = { ...r, udsatte: [], ti_minutter: { tabt: 0 } };
    expect(webinarAlarmTekst(ren, doemAlarm(ren, nu)!, nu).tekst).not.toContain("lige før start");
  });

  it("aldrig i en tørkørsel", () => {
    expect(doemAlarm({ ...ROLIG, sender_rigtigt: false, udsatte: TI(5), ti_minutter: { tabt: 5 } }, ved("2026-10-13T08:50:00Z"))).toBeNull();
  });

  it("teksten siger tallene, ingen mail, og klokkens titel bærer dato + time", () => {
    const nu = ved("2026-10-13T08:57:03Z");
    const r: WebinarAlarmTekstInput = { ...ROLIG, udsatte: TI(2), ti_minutter: { tabt: 3 }, sendt: 100, skal_sendes: 102 };
    const a = doemAlarm(r, nu)!;
    const t = webinarAlarmTekst(r, a, nu);
    expect(t.emne).toContain("3 tabt");
    expect(t.emne).toContain("2 i fare");
    expect(t.titel).toContain("2026-10-13 kl. 10");
    expect(t.tekst).toContain("T−30 … T−5");
    expect(t.tekst).not.toMatch(/@/);
  });
});
