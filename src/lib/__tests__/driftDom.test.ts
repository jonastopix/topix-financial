import { describe, expect, it } from "vitest";
import {
  type CronJob,
  type CronKoersel,
  DRIFT_AGENT_FUNKTION,
  DRIFT_AGENT_JOB,
  DRIFT_AGENT_MARKOER,
  DRIFT_ALARM_NOEGLE_PRAEFIKS,
  type DriftGrundlag,
  type DriftFund,
  doemDrift,
  driftAftryk,
  driftAlarmNoegle,
  driftAlarmTekst,
  fejlTal,
  FORVENTEDE_JOBS,
  type HttpSvar,
  kortBesked,
  laesSkema,
  sidsteFyring,
  skalAlarmere,
  tilskrivSvar,
  udenMail,
  utcUgedag,
  VAGT_JOB,
} from "../../../supabase/functions/_shared/driftDom.ts";

/**
 * Driftsagentens dom, skive 1 (30/9-2026). Hver regel i driftDom.ts' filhoved
 * har sin prøve her. Uret står fast: onsdag 30/9 kl. 10:12 UTC (12:12 dansk).
 */
const NU = new Date("2026-09-30T10:12:00Z");
const foer = (min: number) => new Date(NU.getTime() - min * 60_000).toISOString();

let naesteId = 1000;
/** Et job. Standard: et rent SQL-job med et årsskema (hjerteslaget kan ikke afgøres → intet fund). */
const job = (jobname: string, o: Partial<CronJob> = {}): CronJob => ({
  jobid: naesteId++, jobname, schedule: "0 0 1 1 *", active: true, maal: null, kald_edge: false, http_post: false, timeout_ms: null, ...o,
});
/** Alle forventede jobs — så grundlaget er grønt, indtil en prøve ændrer noget. */
const alleJobs = (...ekstra: CronJob[]): CronJob[] => {
  const navne = new Set(ekstra.map((j) => j.jobname));
  return [...FORVENTEDE_JOBS.filter((n) => !navne.has(n)).map((n) => job(n)), ...ekstra];
};
let naesteRun = 1;
const koersel = (j: CronJob, minFoer: number, o: Partial<CronKoersel> = {}): CronKoersel => ({
  runid: naesteRun++, jobid: j.jobid, status: "succeeded", start: foer(minFoer), slut: foer(minFoer), besked: null, ...o,
});
let naesteSvar = 1;
const svar = (minFoer: number, o: Partial<HttpSvar> = {}): HttpSvar => ({
  id: naesteSvar++, status: 200, timeout: false, transportfejl: false, created: foer(minFoer), kerne: { ok: true }, ...o,
});

const grund = (o: Partial<DriftGrundlag> = {}): DriftGrundlag => ({
  nu: NU,
  jobs: alleJobs(),
  koersler: [],
  koersler_loft_ramt: false,
  aeldste_koersel: null,
  svar: [],
  spor: [],
  vagt: { tid: foer(5), dom: "groen", grunde: [] },
  forrige: { tid: foer(15), alvor: "groen", alarm_mail: "ingen" },
  foerst_set: null,
  laesefejl: [],
  ...o,
});
const koder = (f: readonly DriftFund[]) => f.map((x) => `${x.alvor}:${x.kode}:${x.emne}`);

/** Et kald_edge-job, der har kørt i sit skema — og hvis svar kan sættes. */
const httpJob = (jobname: string, maal: string, timeout_ms: number | null = 60_000) =>
  job(jobname, { schedule: "*/15 * * * *", maal, kald_edge: true, timeout_ms });

describe("driftDom — grundlaget er grønt", () => {
  it("alle forventede jobs, en frisk vagt og ingen fund → grøn, tomt aftryk", () => {
    const d = doemDrift(grund());
    expect(d.fund).toEqual([]);
    expect(d.alvor).toBe("groen");
    expect(d.aftryk).toBe("");
    expect(d.tal.jobs).toBe(FORVENTEDE_JOBS.length);
  });
});

describe("driftDom — ét job, der fejler, er RØDT (vagten kræver ≥ 2)", () => {
  it("ét job, hvis seneste svar er 500 → rød http_fejl, med jobnavn og klokkeslæt", () => {
    const j = httpJob("ansoegning-rykker", "ansoegning-rykker-cron", null);
    const d = doemDrift(grund({ jobs: alleJobs(j), koersler: [koersel(j, 2)], svar: [svar(1, { status: 500, kerne: null })] }));
    expect(d.alvor).toBe("roed");
    expect(koder(d.fund)).toEqual(["roed:http_fejl:ansoegning-rykker"]);
    expect(d.fund[0].saetning).toContain("ansoegning-rykker-cron svarede 500");
    expect(d.fund[0].saetning).toContain("kl. 12:11");
  });

  it("timeout og transportfejl er også røde — med jobbets egen timeout (kald_edge-standarden 30 s uden tal)", () => {
    const j = httpJob("ansoegning-rykker", "ansoegning-rykker-cron", null);
    const t = doemDrift(grund({ jobs: alleJobs(j), koersler: [koersel(j, 2)], svar: [svar(1, { status: null, timeout: true, kerne: null })] }));
    expect(t.fund[0].saetning).toContain("fik timeout (30 s)");
    const x = doemDrift(grund({ jobs: alleJobs(j), koersler: [koersel(j, 2)], svar: [svar(1, { status: null, transportfejl: true, kerne: null })] }));
    expect(x.fund[0].saetning).toContain("fik intet svar");
    expect(x.alvor).toBe("roed");
  });

  it("et senere 200 overtager — kun det SENESTE svar dømmes", () => {
    const j = httpJob("ansoegning-rykker", "ansoegning-rykker-cron", null);
    const d = doemDrift(grund({ jobs: alleJobs(j), koersler: [koersel(j, 16), koersel(j, 1)], svar: [svar(15.9, { status: 500, kerne: null }), svar(0.9)] }));
    expect(d.alvor).toBe("groen");
  });

  it("en SQL-fejl i seneste kørsel er rød; pg_crons forbindelsesfejl er gul; mailadressen i beskeden fjernes", () => {
    const j = job("opgave-udloeb", { schedule: "*/15 * * * *" });
    const sql = doemDrift(grund({ jobs: alleJobs(j), koersler: [koersel(j, 12, { status: "failed", besked: "ERROR: duplicate key for a@b.dk" })] }));
    expect(koder(sql.fund)).toEqual(["roed:sql_fejl:opgave-udloeb"]);
    expect(sql.fund[0].saetning).toContain("(mail)");
    expect(sql.fund[0].saetning).not.toContain("@");
    const op = doemDrift(grund({ jobs: alleJobs(j), koersler: [koersel(j, 12, { status: "failed", besked: "job startup timeout" })] }));
    expect(koder(op.fund)).toEqual(["gul:startup_fejl:opgave-udloeb"]);
  });
});

describe("driftDom — et job, der ikke kører i sin rytme, er RØDT", () => {
  it("*/15 uden kørsel siden 11:30 → rød stille (forventet 12:00 dansk)", () => {
    const j = job("klokke-mail", { schedule: "*/15 * * * *" });
    const d = doemDrift(grund({ jobs: alleJobs(j), koersler: [koersel(j, 42)] }));
    expect(koder(d.fund)).toEqual(["roed:stille:klokke-mail"]);
    expect(d.fund[0].saetning).toContain("har ikke kørt kl. 12:00");
    expect(d.fund[0].saetning).toContain("sidste kørsel kl. 11:30");
  });

  it("slækket: en kørsel, der skulle være startet for under 5 min siden, dømmes ikke endnu", () => {
    const j = job("x-job", { schedule: "10 * * * *" }); // 10:10 UTC — kun 2 min siden
    const d = doemDrift(grund({ jobs: alleJobs(j), koersler: [koersel(j, 62)] }));
    expect(d.fund).toEqual([]);
  });

  it("et døgnjob, der kørte i morges, er grønt; et, der ikke gjorde, er rødt", () => {
    const j = job("meta-annoncer", { schedule: "33 3 * * *" });
    const ok = doemDrift(grund({ jobs: alleJobs(j), koersler: [koersel(j, 399)] })); // 03:33 UTC
    expect(ok.fund).toEqual([]);
    const stille = doemDrift(grund({ jobs: alleJobs(j), koersler: [] }));
    expect(koder(stille.fund)).toEqual(["roed:stille:meta-annoncer"]);
    expect(stille.fund[0].saetning).toContain("ingen kørsel i det læste døgn");
  });

  it("et ugejob uden fyring i de læste 25 timer kan ikke afgøres — står i tal, intet fund", () => {
    const j = job("generate-weekly-focus", { schedule: "0 6 * * 1" });
    const d = doemDrift(grund({ jobs: alleJobs(j) }));
    expect(d.fund).toEqual([]);
    expect(d.tal.kan_ikke_afgoeres).toContain("generate-weekly-focus");
  });

  it("et job, agenten først så EFTER sin forventede fyring, er nyt — ikke stille", () => {
    const j = job("nyt-job", { schedule: "15 6 * * *" });
    const d = doemDrift(grund({ jobs: alleJobs(j), foerst_set: { [String(j.jobid)]: foer(30) } }));
    expect(d.fund).toEqual([]);
    expect(d.tal.nye_jobs).toEqual(["nyt-job"]);
    const kendt = doemDrift(grund({ jobs: alleJobs(j), foerst_set: { [String(j.jobid)]: foer(2000) } }));
    expect(koder(kendt.fund)).toEqual(["roed:stille:nyt-job"]);
  });

  it("et slukket job dømmes ikke stille; kan kørslerne ikke læses, dømmes INTET job stille", () => {
    const j = job("klokke-mail", { schedule: "*/15 * * * *", active: false });
    expect(koder(doemDrift(grund({ jobs: alleJobs(j) })).fund)).toEqual(["gul:job_slukket:klokke-mail"]);
    const k = job("klokke-mail", { schedule: "*/15 * * * *" });
    const d = doemDrift(grund({ jobs: alleJobs(k), laesefejl: ["cron.job_run_details: permission denied"] }));
    expect(koder(d.fund)).toEqual(["roed:kan_ikke_laese:cron.job_run_details"]);
  });

  it("loftet ramt: kun det læste dømmes — et forventet tidspunkt før den ældste læste kørsel kan ikke afgøres", () => {
    const j = job("meta-annoncer", { schedule: "33 3 * * *" });
    const d = doemDrift(grund({ jobs: alleJobs(j), koersler_loft_ramt: true, aeldste_koersel: foer(60) }));
    expect(d.fund).toEqual([]);
    expect(d.tal.kan_ikke_afgoeres).toContain("meta-annoncer");
  });

  it("et skema, dommen ikke kan læse, er gult — aldrig gættet", () => {
    const j = job("x", { schedule: "@daily" });
    expect(koder(doemDrift(grund({ jobs: alleJobs(j) })).fund)).toEqual(["gul:skema_ulaeseligt:x"]);
  });
});

describe("driftDom — 200 med fejl i kroppen", () => {
  const j = httpJob("indgangs-paamindelser", "indgangs-paamindelser-cron");
  const med = (...s: HttpSvar[]) => grund({ jobs: alleJobs(j), koersler: [koersel(j, 31), koersel(j, 16), koersel(j, 1)], svar: s });

  it("ok: false → rød", () => {
    expect(koder(doemDrift(med(svar(0.5, { kerne: { ok: false } }))).fund)).toEqual(["roed:svar_ok_false:indgangs-paamindelser"]);
  });

  it("fejlet > 0 én gang → gul; også i kørslen før → rød", () => {
    expect(koder(doemDrift(med(svar(0.5, { kerne: { ok: true, fejlet: 2 } }))).fund)).toEqual(["gul:fejl_i_svar:indgangs-paamindelser"]);
    const d = doemDrift(med(svar(15.5, { kerne: { ok: true, fejl: 1 } }), svar(0.5, { kerne: { ok: true, fejlet: 2 } })));
    expect(koder(d.fund)).toEqual(["roed:fejl_i_svar:indgangs-paamindelser"]);
    expect(d.fund[0].saetning).toContain("også i kørslen før");
  });

  it("faktura_i_haanden er penge → rød, også første gang", () => {
    const d = doemDrift(med(svar(0.5, { kerne: { ok: true, faktura_i_haanden: 1 } })));
    expect(koder(d.fund)).toEqual(["roed:faktura_i_haanden:indgangs-paamindelser"]);
    expect(d.fund[0].saetning).toContain("1 faktura står «i hånden»");
  });

  it("en function, der selv alarmerer, er gul også ved gentagelse", () => {
    const w = httpJob("webinar-mail", "webinar-mail-cron");
    const d = doemDrift(grund({
      jobs: alleJobs(w), koersler: [koersel(w, 16), koersel(w, 1)],
      svar: [svar(15.5, { kerne: { ok: true, fejlede: 1 } }), svar(0.5, { kerne: { ok: true, fejlede: 3 } })],
    }));
    expect(koder(d.fund)).toEqual(["gul:fejl_i_svar:webinar-mail"]);
    expect(d.fund[0].saetning).toContain("alarmerer selv");
  });

  it("fejltallet er det STØRSTE af felterne, ikke summen (fejlede 3 + en liste med 3 linjer = 3)", () => {
    expect(fejlTal({ fejlede: 3, fejl: 3 })).toBe(3);
    expect(fejlTal({ fejlet: 1 })).toBe(1);
    expect(fejlTal({})).toBe(0);
  });

  it("en ulæselig krop eller et svar uden kerne giver intet kropsfund", () => {
    expect(doemDrift(med(svar(0.5, { kerne: { ulaeselig: true } }))).fund).toEqual([]);
    expect(doemDrift(med(svar(0.5, { kerne: null }))).fund).toEqual([]);
  });
});

describe("driftDom — svartider tæt på timeout", () => {
  it("svar efter ≥ 80 % af timeouten → gul (49 s ≥ 0,8 × 60 s); 47 s → intet", () => {
    const j = httpJob("webinar-mail", "webinar-mail-cron", 60_000);
    const k = koersel(j, 1);
    const langsom = { ...svar(0), created: new Date(Date.parse(k.start) + 49_000).toISOString() };
    const d = doemDrift(grund({ jobs: alleJobs(j), koersler: [k], svar: [langsom] }));
    expect(koder(d.fund)).toEqual(["gul:svartid_naer_timeout:webinar-mail"]);
    expect(d.fund[0].saetning).toContain("efter 49 s");
    expect(d.fund[0].saetning).toContain("timeout på 60 s");
    const k2 = koersel(j, 1);
    const hurtig = { ...svar(0), created: new Date(Date.parse(k2.start) + 47_000).toISOString() };
    expect(doemDrift(grund({ jobs: alleJobs(j), koersler: [k2], svar: [hurtig] })).fund).toEqual([]);
  });
});

describe("driftDom — tilskrivningen efter tid", () => {
  it("svaret med markøren går til agentens job; et 200 uden markøren stjæler aldrig agentens kørsel", () => {
    const agent = httpJob(DRIFT_AGENT_JOB, DRIFT_AGENT_FUNKTION);
    const andet = httpJob("klokke-mail", "klokke-mail-cron");
    const ka = koersel(agent, 2), kb = koersel(andet, 2.5);
    const sA = svar(1.9, { kerne: { ok: true } });
    const sB = svar(1.8, { kerne: { ok: true, drift_agent: DRIFT_AGENT_MARKOER } });
    const t = tilskrivSvar([agent, andet], [ka, kb], [sA, sB]);
    expect(t.job.get(sA.id)).toBe(andet.jobid);
    expect(t.job.get(sB.id)).toBe(agent.jobid);
    expect(t.start.get(sB.id)).toBe(Date.parse(ka.start));
  });

  it("et svar uden kandidat (manuelt kald) tilskrives ingen; to jobs i samme vindue tæller som tvetydigt", () => {
    const a = httpJob("a", "a-cron"), b = httpJob("b", "b-cron");
    const t = tilskrivSvar([a, b], [koersel(a, 3), koersel(b, 3)], [svar(2.9), svar(200)]);
    expect(t.job.size).toBe(1);
    expect(t.tvetydige).toBe(1);
  });

  it("et rent SQL-job får aldrig et svar", () => {
    const s = job("sql");
    expect(tilskrivSvar([s], [koersel(s, 1)], [svar(0.5)]).job.size).toBe(0);
  });
});

describe("driftDom — sporene", () => {
  const spor = (navn: string, time: boolean, udfald: string, n: number) => ({ spor: navn, time, udfald, n });

  it("≥ 5 fejl og ≥ 50 % den seneste time → rød", () => {
    const d = doemDrift(grund({ spor: [spor("webinar_mails", true, "fejl", 5), spor("webinar_mails", true, "ok", 5)] }));
    expect(koder(d.fund)).toEqual(["roed:spor_fejlrate:webinar_mails"]);
    expect(d.fund[0].saetning).toContain("5 af 10 forsøg fejlede");
  });

  it("stigende: 3 af 10 nu mod 1 af 100 i døgnet → gul; samme rate hele døgnet → intet", () => {
    const stiger = doemDrift(grund({ spor: [spor("meta_haendelser", true, "timeout", 3), spor("meta_haendelser", true, "sendt", 7), spor("meta_haendelser", false, "fejl", 1), spor("meta_haendelser", false, "sendt", 99)] }));
    expect(koder(stiger.fund)).toEqual(["gul:spor_fejlrate:meta_haendelser"]);
    const flad = doemDrift(grund({ spor: [spor("meta_haendelser", true, "fejl", 3), spor("meta_haendelser", true, "sendt", 7), spor("meta_haendelser", false, "fejl", 30), spor("meta_haendelser", false, "sendt", 70)] }));
    expect(flad.fund).toEqual([]);
  });

  it("neutrale udfald tæller ikke (loft i webinar_mails, pending/suppressed i email_send_log)", () => {
    const d = doemDrift(grund({ spor: [spor("webinar_mails", true, "loft", 50), spor("email_send_log", true, "pending", 40), spor("email_send_log", true, "suppressed", 9), spor("email_send_log", true, "sent", 1)] }));
    expect(d.fund).toEqual([]);
    const dlq = doemDrift(grund({ spor: [spor("email_send_log", true, "dlq", 6), spor("email_send_log", true, "sent", 1)] }));
    expect(koder(dlq.fund)).toEqual(["roed:spor_fejlrate:email_send_log"]);
  });
});

describe("driftDom — webinarmails, der venter tæt på fristen", () => {
  const w = httpJob("webinar-mail", "webinar-mail-cron");
  const venter = (sessionOm: number) => grund({
    jobs: alleJobs(w), koersler: [koersel(w, 1)],
    svar: [svar(0.5, { kerne: { ok: true, over_loft: 40, udsat: 2, ventende: [{ art: "bekraeftelse", session_tid: new Date(NU.getTime() + sessionOm * 3_600_000).toISOString() }] } })],
  });
  it("frist om 1 t → rød; om 6 t → gul; om 48 t → intet", () => {
    const r = doemDrift(venter(1));
    expect(koder(r.fund)).toEqual(["roed:mails_venter_frist:webinar-mail"]);
    expect(r.fund[0].saetning).toContain("42 webinarmails venter");
    expect(koder(doemDrift(venter(6)).fund)).toEqual(["gul:mails_venter_frist:webinar-mail"]);
    expect(doemDrift(venter(48)).fund).toEqual([]);
  });
});

describe("driftDom — vagt for vagten og for agenten selv", () => {
  it("vagt-cron mangler i cron.job → rød; vagtens række er over 75 min gammel → rød; ingen række → rød", () => {
    const uden = alleJobs().filter((j) => j.jobname !== VAGT_JOB);
    expect(koder(doemDrift(grund({ jobs: uden })).fund)).toEqual(["roed:vagt_mangler:vagt-cron"]);
    expect(koder(doemDrift(grund({ vagt: { tid: foer(80), dom: "groen", grunde: [] } })).fund)).toEqual(["roed:vagt_tavs:cron_vagt_log"]);
    expect(koder(doemDrift(grund({ vagt: null })).fund)).toEqual(["roed:vagt_tavs:cron_vagt_log"]);
  });

  it("en rød vagt er gul her — den ringer selv sin klokke", () => {
    const d = doemDrift(grund({ vagt: { tid: foer(5), dom: "roed", grunde: ["flere_jobs_ikke_200"] } }));
    expect(koder(d.fund)).toEqual(["gul:vagt_roed:vagt-cron"]);
  });

  it("agentens forrige kørsel for 40 min siden → gul; forrige alarmmail fejlede → rød", () => {
    expect(koder(doemDrift(grund({ forrige: { tid: foer(40), alvor: "groen", alarm_mail: "ingen" } })).fund)).toEqual(["gul:agent_sprang_over:drift-agent"]);
    expect(koder(doemDrift(grund({ forrige: { tid: foer(15), alvor: "roed", alarm_mail: "fejlet: failed" } })).fund)).toEqual(["roed:alarm_kanal_fejlet:alarmmail"]);
  });

  it("0 jobs → rød (rettigheder); en læsefejl → rød", () => {
    expect(koder(doemDrift(grund({ jobs: [] })).fund)).toContain("roed:kan_ikke_se_cron:cron.job");
    expect(koder(doemDrift(grund({ laesefejl: ["spor ga_haendelser: relation findes ikke"] })).fund)).toEqual(["roed:kan_ikke_laese:spor ga_haendelser"]);
  });

  it("et forventet job, der mangler, eller et dødt job, der står aktivt → gul", () => {
    const uden = alleJobs().filter((j) => j.jobname !== "klokke-mail");
    expect(koder(doemDrift(grund({ jobs: uden })).fund)).toEqual(["gul:job_mangler:klokke-mail"]);
    const doed = job("daily-circle-sync");
    expect(koder(doemDrift(grund({ jobs: alleJobs(doed) })).fund)).toEqual(["gul:job_skulle_vaere_vaek:daily-circle-sync"]);
  });
});

describe("driftDom — cron-skemaet", () => {
  it("læser lister, intervaller, trin, «N seconds» — og afviser det ukendte", () => {
    const s = laesSkema("*/15 5-15 * * 1-5");
    expect(s?.art).toBe("felter");
    expect(laesSkema("30 seconds")).toEqual({ art: "sekunder", sekunder: 30 });
    expect(laesSkema("@daily")).toBeNull();
    expect(laesSkema("61 * * * *")).toBeNull();
    expect(laesSkema("* * *")).toBeNull();
  });

  it("ugedagen regnes af epoken og er enig med kalenderen (et helt år, hver time)", () => {
    expect(utcUgedag(new Date("2026-09-30T23:59:00Z"))).toBe(3); // onsdag
    expect(utcUgedag(new Date("2026-10-04T00:00:00Z"))).toBe(0); // søndag
    const facit = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 3_600_000) {
      const d = new Date(t);
      expect(facit[utcUgedag(d)]).toBe(d.toLocaleDateString("da-DK", { weekday: "long", timeZone: "UTC" }));
    }
  });

  it("seneste fyring: 10,25,40,55 kl. 10:12 → 10:10; hverdagsjob lørdag → fredag 15:45", () => {
    expect(sidsteFyring(laesSkema("10,25,40,55 * * * *")!, NU)?.toISOString()).toBe("2026-09-30T10:10:00.000Z");
    expect(sidsteFyring(laesSkema("*/15 5-15 * * 1-5")!, new Date("2026-10-03T09:00:00Z"))?.toISOString()).toBe("2026-10-02T15:45:00.000Z");
    expect(sidsteFyring(laesSkema("7 * * * 7")!, new Date("2026-10-04T08:00:00Z"))?.toISOString()).toBe("2026-10-04T07:07:00.000Z");
  });
});

describe("driftDom — alarmen", () => {
  const roed = doemDrift(grund({ vagt: null }));

  it("nøglen er pr. dansk TIME (sommertid: 10:12 UTC = 12)", () => {
    expect(driftAlarmNoegle(NU)).toBe(`${DRIFT_ALARM_NOEGLE_PRAEFIKS}2026-09-30T12`);
    expect(driftAlarmNoegle(new Date("2026-12-01T23:30:00Z"))).toBe(`${DRIFT_ALARM_NOEGLE_PRAEFIKS}2026-12-02T00`);
  });

  it("mailer kun rødt, kun rigtigt, én gang i timen, og ikke samme røde billede to gange samme dag", () => {
    expect(skalAlarmere({ dom: doemDrift(grund()), senderRigtigt: true, noegleFandtes: false, aftrykMailetIDag: [] })).toEqual({ mail: false, grund: "ikke_roed" });
    expect(skalAlarmere({ dom: roed, senderRigtigt: false, noegleFandtes: false, aftrykMailetIDag: [] })).toEqual({ mail: false, grund: "sender_ikke" });
    expect(skalAlarmere({ dom: roed, senderRigtigt: true, noegleFandtes: true, aftrykMailetIDag: [] })).toEqual({ mail: false, grund: "fandtes_denne_time" });
    expect(skalAlarmere({ dom: roed, senderRigtigt: true, noegleFandtes: false, aftrykMailetIDag: [roed.aftryk] })).toEqual({ mail: false, grund: "samme_billede_i_dag" });
    expect(skalAlarmere({ dom: roed, senderRigtigt: true, noegleFandtes: false, aftrykMailetIDag: ["andet:billede"] })).toEqual({ mail: true });
  });

  it("aftrykket er de røde fund, sorteret og uden gentagelser — de gule tæller ikke", () => {
    const f: DriftFund[] = [
      { kode: "stille", alvor: "roed", emne: "b", saetning: "" },
      { kode: "http_fejl", alvor: "roed", emne: "a", saetning: "" },
      { kode: "stille", alvor: "roed", emne: "b", saetning: "" },
      { kode: "job_mangler", alvor: "gul", emne: "c", saetning: "" },
    ];
    expect(driftAftryk(f)).toBe("http_fejl:a|stille:b");
  });

  it("teksten: emnet navngiver det røde fund, titlen bærer dato og time, ingen mailadresse", () => {
    const t = driftAlarmTekst(roed, NU);
    expect(t.emne).toBe("Driften: cron_vagt_log — vagt tavs");
    expect(t.titel).toBe("Driftsagenten: 1 rødt (2026-09-30T12)");
    expect(t.tekst).toContain("RØD · Cron-vagten har ingen række");
    expect(t.tekst).not.toMatch(/@/);
  });

  it("udenMail og kortBesked fjerner adresser og afkorter", () => {
    expect(udenMail("fejl for jonas@theboardroom.dk og <x@y.dk>")).toBe("fejl for (mail) og <(mail)>");
    expect(kortBesked("a".repeat(200)).length).toBe(161);
  });
});
