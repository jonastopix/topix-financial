import { describe, expect, it } from "vitest";
import {
  ALARM_MODTAGER_ID,
  ALARM_TYPER,
  ALDRIG_TYPER,
  alarmHaendelser,
  alarmMailTekst,
  COMMUNITY_TYPER,
  communityMailTekst,
  danskDag,
  danskTid,
  erMorgenkoersel,
  fnv1a64,
  fordel,
  forrigeMorgen,
  forrigeMorgenDato,
  klassificer,
  klokkeBlok,
  klokkeLink,
  type KlokkeRaekke,
  klokkeSti,
  LEGACY_TYPER,
  mailNoegle,
  MORGEN_TYPER,
  morgenGraense,
  morgenMailTekst,
  saetAftryk,
  sidenOrd,
  SELVMAILENDE_GRUND,
  SELVMAILENDE_REFERENCER,
  VINDUE_DAGE,
} from "../../../supabase/functions/_shared/klokkeMail.ts";
import { raadgiverSti } from "@/lib/hjemmebane/klokke";

/**
 * Rådgivernes klokker som mail (udkast 21/9-2026) — de rene regler:
 * hvem får hvad, grupperingen pr. rådgiver, læst springes over, én gang,
 * morgenmailens grænse, nøglerne, linket (paritet med fladen) og teksterne.
 */

const JONAS = "11111111-1111-4111-8111-111111111111";
const MORTEN = "22222222-2222-4222-8222-222222222222";
const REF = "33333333-3333-4333-8333-333333333333";
const REF2 = "44444444-4444-4444-8444-444444444444";
const CO = "55555555-5555-4555-8555-555555555555";

// Tirsdag 22/9-2026 kl. 07:04 dansk (CEST = UTC+2) → 05:04Z. Grænsen: 07:00 dansk = 05:00Z.
const MORGEN = new Date("2026-09-22T05:04:00Z");
const FOER_MORGEN = new Date("2026-09-22T04:59:00Z");
const MIDDAG = new Date("2026-09-22T10:19:00Z");

let loebenr = 0;
function raekke(o: Partial<KlokkeRaekke> & { type: string; advisor_id?: string | null }): KlokkeRaekke {
  loebenr++;
  return {
    id: `${String(loebenr).padStart(8, "0")}-0000-4000-8000-000000000000`,
    advisor_id: o.advisor_id === undefined ? JONAS : o.advisor_id,
    type: o.type,
    title: o.title ?? `Titel ${loebenr}`,
    body: o.body ?? null,
    company_id: o.company_id ?? null,
    reference_type: o.reference_type ?? null,
    reference_id: o.reference_id ?? null,
    read_at: o.read_at ?? null,
    mailet_at: o.mailet_at ?? null,
    created_at: o.created_at ?? "2026-09-21T20:00:00Z",
  };
}

describe("klokkeMail — typerne står ét sted", () => {
  it("hver liste klassificeres som sin egen mail; ALDRIG og LEGACY mailes ikke; alt andet er ukendt", () => {
    for (const t of ALARM_TYPER) expect(klassificer(t)).toBe("alarm");
    for (const t of COMMUNITY_TYPER) expect(klassificer(t)).toBe("community");
    for (const t of MORGEN_TYPER) expect(klassificer(t)).toBe("morgen");
    for (const t of Object.keys(ALDRIG_TYPER)) expect(klassificer(t)).toBe("aldrig");
    for (const t of LEGACY_TYPER) expect(klassificer(t)).toBe("legacy");
    expect(klassificer("noget_nyt")).toBe("ukendt");
    expect(klassificer("")).toBe("ukendt");
  });
  it("en «drift»-klokke fra en selvmailende alarm (gensenderen, profil-cronen) er «aldrig» — de øvrige drift-klokker er alarm", () => {
    expect([...SELVMAILENDE_REFERENCER]).toEqual(["klaviyo_haendelser", "klaviyo_profil", "meta_haendelser", "ga_haendelser"]);
    expect(SELVMAILENDE_GRUND).toContain("egen alarm");
    expect(klassificer("drift", "klaviyo_haendelser")).toBe("aldrig");
    expect(klassificer("drift", "klaviyo_profil")).toBe("aldrig");
    expect(klassificer("drift", "meta_haendelser")).toBe("aldrig"); // #1069 mailer selv driftModtager
    expect(klassificer("drift", "ga_haendelser")).toBe("aldrig");   // ga-send-cron ligeså
    expect(klassificer("drift", "cron_vagt_log")).toBe("alarm");
    expect(klassificer("drift", "meta_hentning")).toBe("alarm");
    expect(klassificer("drift", null)).toBe("alarm");
    expect(klassificer("drift")).toBe("alarm");
    // Reglen gælder KUN drift: en anden type med samme reference_type er uændret.
    expect(klassificer("community_opslag", "klaviyo_profil")).toBe("community");
  });
  it("ingen type står i to lister", () => {
    const alle = [...ALARM_TYPER, ...COMMUNITY_TYPER, ...MORGEN_TYPER, ...Object.keys(ALDRIG_TYPER), ...LEGACY_TYPER];
    expect(new Set(alle).size).toBe(alle.length);
  });
  it("de besluttede typer (Jonas 21/9) står, hvor de skal", () => {
    expect([...ALARM_TYPER]).toEqual(["traek_fejlet", "invitation_fejlet", "ansoegning_underskrevet", "mail_spaerret", "fornyelse_dublet", "drift"]);
    expect([...COMMUNITY_TYPER]).toEqual(["community_opslag"]);
    expect(MORGEN_TYPER).toContain("ansoegning_webhook_afvist"); // det faktiske navn (RAADGIVER_BESKED.webhook_afvist) — ikke «avist»
    expect(MORGEN_TYPER).toContain("ansoegning_samtale_booket");
    expect(MORGEN_TYPER).toContain("stille_ingen_login");
    expect(Object.keys(ALDRIG_TYPER)).toEqual(["ansoegning_ny", "ansoegning_afholdt", "community_svar"]);
    expect(klassificer("community_svar")).toBe("aldrig"); // Jonas 21/9: klokke, ikke mail
    expect(ALDRIG_TYPER.community_svar).toContain("klokke, ikke mail");
    expect(VINDUE_DAGE).toBe(7);
  });
});

describe("klokkeMail — morgenen dømmes i dansk tid", () => {
  it("07:04 dansk er en morgenkørsel, 06:59 er ikke; grænsen er dagens 07:00 dansk", () => {
    expect(erMorgenkoersel(MORGEN)).toBe(true);
    expect(erMorgenkoersel(FOER_MORGEN)).toBe(false);
    expect(erMorgenkoersel(MIDDAG)).toBe(true);
    expect(morgenGraense(MORGEN).toISOString()).toBe("2026-09-22T05:00:00.000Z");
    expect(morgenGraense(FOER_MORGEN).toISOString()).toBe("2026-09-22T05:00:00.000Z");
  });
  it("vintertid: 07:04 dansk = 06:04Z, grænsen 06:00Z", () => {
    const vinter = new Date("2026-12-01T06:04:00Z");
    expect(erMorgenkoersel(vinter)).toBe(true);
    expect(erMorgenkoersel(new Date("2026-12-01T05:59:00Z"))).toBe(false);
    expect(morgenGraense(vinter).toISOString()).toBe("2026-12-01T06:00:00.000Z");
  });
  it("KUN HVERDAGE (Jonas 21/9, hverdage.ts' regel): fredag ja, lørdag og søndag nej, mandag ja — og «siden» er den forrige morgenmail", () => {
    const fre = new Date("2026-09-25T05:04:00Z"), loer = new Date("2026-09-26T05:04:00Z"), soen = new Date("2026-09-27T05:04:00Z"), man = new Date("2026-09-28T05:04:00Z");
    expect(erMorgenkoersel(fre)).toBe(true);
    expect(erMorgenkoersel(loer)).toBe(false);
    expect(erMorgenkoersel(soen)).toBe(false);
    expect(erMorgenkoersel(man)).toBe(true);
    expect(sidenOrd(fre)).toBe("i går"); // torsdag 24/9
    expect(forrigeMorgenDato(man)).toBe("2026-09-25");
    expect(forrigeMorgen(man).toISOString()).toBe("2026-09-25T05:00:00.000Z"); // fredag kl. 07 CEST
    expect(sidenOrd(man)).toBe("fredag");
    expect(sidenOrd(soen)).toBe("fredag"); // en tørkørsel søndag siger stadig det rigtige
    expect(sidenOrd(MORGEN)).toBe("i går"); // tirsdag 22/9 → mandag 21/9
  });
  it("helligdage (hverdage.ts: danske helligdage + husets tre lukkedage): 2. påskedag 6/4-2026 er ingen morgenmail; tirsdag 7/4 siger «siden onsdag» (1/4 — skærtorsdag, langfredag og påsken sprunget over)", () => {
    const paaskemandag = new Date("2026-04-06T05:04:00Z"), tirsdag = new Date("2026-04-07T05:04:00Z");
    expect(erMorgenkoersel(paaskemandag)).toBe(false);
    expect(erMorgenkoersel(tirsdag)).toBe(true);
    expect(forrigeMorgenDato(tirsdag)).toBe("2026-04-01");
    expect(sidenOrd(tirsdag)).toBe("onsdag");
    // Lukkedagene: juleaftensdag 24/12 (torsdag) er ingen morgenmail; mandag 28/12 siger «siden onsdag» (23/12).
    expect(erMorgenkoersel(new Date("2026-12-24T06:04:00Z"))).toBe(false);
    expect(sidenOrd(new Date("2026-12-28T06:04:00Z"))).toBe("onsdag");
    expect(forrigeMorgenDato(new Date("2026-12-28T06:04:00Z"))).toBe("2026-12-23");
  });
  it("vintertid og hverdag: mandag 7/12-2026 kl. 07:04 = 06:04Z; forrige morgenmail fredag 4/12 kl. 07 CET = 06:00Z", () => {
    const man = new Date("2026-12-07T06:04:00Z");
    expect(erMorgenkoersel(man)).toBe(true);
    expect(erMorgenkoersel(new Date("2026-12-06T06:04:00Z"))).toBe(false); // søndag
    expect(forrigeMorgen(man).toISOString()).toBe("2026-12-04T06:00:00.000Z");
    expect(sidenOrd(man)).toBe("fredag");
  });
  it("fordel på en lørdag: ingen morgenmail — klokkerne venter til mandag", () => {
    const f = fordel([raekke({ type: "venteliste", created_at: "2026-09-26T03:00:00Z" })], new Date("2026-09-26T05:04:00Z"));
    expect(f.morgen.size).toBe(0);
    expect(f.sprunget.venter_paa_morgen).toBe(1);
    const m = fordel([raekke({ type: "venteliste", created_at: "2026-09-26T03:00:00Z" })], new Date("2026-09-28T05:04:00Z"));
    expect(m.morgen.get(JONAS)!.length).toBe(1);
  });
});

describe("klokkeMail — fordel: hvem får hvad", () => {
  const rows = [
    raekke({ type: "traek_fejlet", advisor_id: JONAS, reference_id: REF, reference_type: "traek", company_id: CO, title: "Trækket fejlede" }),
    raekke({ type: "traek_fejlet", advisor_id: MORTEN, reference_id: REF, reference_type: "traek", company_id: CO, title: "Trækket fejlede" }),
    raekke({ type: "drift", advisor_id: JONAS, title: "Driften: noget" }),
    raekke({ type: "community_opslag", advisor_id: JONAS, reference_id: REF2, reference_type: "community_traad" }),
    raekke({ type: "community_opslag", advisor_id: MORTEN, reference_id: REF2, reference_type: "community_traad" }),
    raekke({ type: "stille_ingen_login", advisor_id: JONAS, company_id: CO, created_at: "2026-09-22T04:00:00Z" }), // før 07 → morgen
    raekke({ type: "stille_ingen_login", advisor_id: MORTEN, company_id: CO, created_at: "2026-09-22T04:00:00Z" }),
    raekke({ type: "venteliste", advisor_id: JONAS, created_at: "2026-09-22T05:03:00Z" }), // efter 07 → venter
    raekke({ type: "fornyelse_betalt", advisor_id: JONAS, read_at: "2026-09-22T04:30:00Z", created_at: "2026-09-22T04:00:00Z" }), // læst
    raekke({ type: "community_opslag", advisor_id: JONAS, mailet_at: "2026-09-21T21:00:00Z" }), // mailet
    raekke({ type: "traek_fejlet", advisor_id: null }), // legacy-form: uden advisor_id
    raekke({ type: "ansoegning_ny", advisor_id: JONAS }), // aldrig
    raekke({ type: "new_message", advisor_id: JONAS }), // legacy-type
    raekke({ type: "helt_ny_klokke", advisor_id: JONAS }), // ukendt
  ];

  it("morgenkørslen: alarmen samler alle rådgiveres rækker, community og morgen deles pr. rådgiver", () => {
    const f = fordel(rows, MORGEN);
    expect(f.alarm.map((r) => r.type)).toEqual(["traek_fejlet", "traek_fejlet", "drift"]);
    expect([...f.community.keys()].sort()).toEqual([JONAS, MORTEN].sort());
    expect(f.community.get(JONAS)!.length).toBe(1);
    expect(f.community.get(MORTEN)!.length).toBe(1);
    expect([...f.morgen.keys()].sort()).toEqual([JONAS, MORTEN].sort());
    expect(f.morgen.get(JONAS)!.map((r) => r.type)).toEqual(["stille_ingen_login"]);
    expect(f.sprunget).toEqual({ laest: 1, mailet: 1, uden_advisor: 1, aldrig: 1, legacy: 1, venter_paa_morgen: 1 });
    expect(f.ukendte).toEqual([{ id: rows[13].id, type: "helt_ny_klokke" }]);
  });
  it("uden for morgenen: ingen morgenmail, morgen-typerne venter — alarm og community går stadig", () => {
    const f = fordel(rows, FOER_MORGEN);
    expect(f.morgen.size).toBe(0);
    expect(f.sprunget.venter_paa_morgen).toBe(3);
    expect(f.alarm.length).toBe(3);
    expect(f.community.size).toBe(2);
  });
  it("fordel: gensenderens og profil-cronens drift-klokker springes over som «aldrig», vagtens går i alarmen", () => {
    const f = fordel([
      raekke({ type: "drift", reference_type: "klaviyo_haendelser", title: "Klaviyo: 2 hændelser kunne ikke sendes" }),
      raekke({ type: "drift", reference_type: "klaviyo_profil", title: "Klaviyo-profil: 1 fejlede" }),
      raekke({ type: "drift", reference_type: "cron_vagt_log", title: "Driften: x" }),
    ], MORGEN);
    expect(f.alarm.map((r) => r.reference_type)).toEqual(["cron_vagt_log"]);
    expect(f.sprunget.aldrig).toBe(2);
  });
  it("en læst klokke mailes ikke, og en mailet mailes ikke igen — uanset art", () => {
    const f = fordel([
      raekke({ type: "drift", read_at: "2026-09-22T04:00:00Z" }),
      raekke({ type: "community_opslag", read_at: "2026-09-22T04:00:00Z" }),
      raekke({ type: "drift", mailet_at: "2026-09-22T04:00:00Z" }),
    ], MORGEN);
    expect(f.alarm).toEqual([]);
    expect(f.community.size).toBe(0);
    expect(f.sprunget.laest).toBe(2);
    expect(f.sprunget.mailet).toBe(1);
  });
  it("rækkefølgen inden i en liste er ældste først, uanset input", () => {
    const a = raekke({ type: "venteliste", created_at: "2026-09-22T03:00:00Z" });
    const b = raekke({ type: "venteliste", created_at: "2026-09-22T01:00:00Z" });
    const f = fordel([a, b], MORGEN);
    expect(f.morgen.get(JONAS)!.map((r) => r.id)).toEqual([b.id, a.id]);
  });
  it("morgenmailens grænse: præcis 07:00 er ikke før 07:00", () => {
    const f = fordel([raekke({ type: "venteliste", created_at: "2026-09-22T05:00:00Z" })], MORGEN);
    expect(f.morgen.size).toBe(0);
    expect(f.sprunget.venter_paa_morgen).toBe(1);
  });
});

describe("klokkeMail — alarmen lister en hændelse én gang", () => {
  it("samme type + reference_id hos to rådgivere = én hændelse; uden reference dedup'es på titlen", () => {
    const a = raekke({ type: "traek_fejlet", advisor_id: JONAS, reference_id: REF });
    const b = raekke({ type: "traek_fejlet", advisor_id: MORTEN, reference_id: REF });
    const c = raekke({ type: "traek_fejlet", advisor_id: MORTEN, reference_id: REF2 });
    const d = raekke({ type: "drift", advisor_id: JONAS, title: "Driften: x" });
    const e = raekke({ type: "drift", advisor_id: MORTEN, title: "Driften: x" });
    const f = raekke({ type: "drift", advisor_id: MORTEN, title: "Driften: y" });
    expect(alarmHaendelser([b, a, c, e, d, f]).map((r) => r.id)).toEqual([a.id, c.id, d.id, f.id]);
  });
});

describe("klokkeMail — nøglerne", () => {
  it("fnv1a64 er deterministisk, 16 hex-tegn, og skelner", () => {
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64("a")).not.toBe(fnv1a64("b"));
    expect(fnv1a64("abc")).toMatch(/^[0-9a-f]{16}$/);
  });
  it("sættets aftryk er uafhængigt af rækkefølgen og ændrer sig, når sættet ændrer sig", () => {
    const a = raekke({ type: "drift" }), b = raekke({ type: "drift" }), c = raekke({ type: "drift" });
    expect(saetAftryk([a, b])).toBe(saetAftryk([b, a]));
    expect(saetAftryk([a, b])).not.toBe(saetAftryk([a, b, c]));
  });
  it("alarm og community bærer sættets aftryk; morgen bærer den danske dato — én pr. dag pr. rådgiver", () => {
    const a = raekke({ type: "drift" }), b = raekke({ type: "drift" });
    expect(mailNoegle("alarm", ALARM_MODTAGER_ID, [a, b], MORGEN)).toBe(`klokke-mail:alarm:drift:${saetAftryk([a, b])}`);
    expect(mailNoegle("alarm", ALARM_MODTAGER_ID, [a, b], MIDDAG)).toBe(mailNoegle("alarm", ALARM_MODTAGER_ID, [b, a], MORGEN)); // tiden er ikke i nøglen
    expect(mailNoegle("community", JONAS, [a], MORGEN)).toBe(`klokke-mail:community:${JONAS}:${saetAftryk([a])}`);
    expect(mailNoegle("morgen", JONAS, [a], MORGEN)).toBe(`klokke-mail:morgen:${JONAS}:2026-09-22`);
    expect(mailNoegle("morgen", JONAS, [a, b], MIDDAG)).toBe(mailNoegle("morgen", JONAS, [a], MORGEN)); // samme dag, samme nøgle
    expect(mailNoegle("morgen", JONAS, [a], new Date("2026-09-23T05:04:00Z"))).toBe(`klokke-mail:morgen:${JONAS}:2026-09-23`);
    expect(mailNoegle("morgen", MORTEN, [a], MORGEN)).not.toBe(mailNoegle("morgen", JONAS, [a], MORGEN));
  });
});

describe("klokkeMail — linket følger fladen (paritet med raadgiverSti)", () => {
  const proever: Pick<KlokkeRaekke, "type" | "reference_type" | "reference_id" | "company_id">[] = [
    { type: "drift", reference_type: "cron_vagt_log", reference_id: REF, company_id: null },
    { type: "drift", reference_type: "klaviyo_haendelser", reference_id: null, company_id: CO },
    { type: "traek_fejlet", reference_type: "traek", reference_id: REF, company_id: CO },
    { type: "traek_fejlet", reference_type: "traek", reference_id: REF, company_id: null },
    { type: "invitation_fejlet", reference_type: "company", reference_id: null, company_id: CO },
    { type: "indgang_betalt", reference_type: "company", reference_id: null, company_id: null },
    { type: "ansoegning_genoptaget", reference_type: "ansoegning", reference_id: REF, company_id: null },
    { type: "ansoegning_lukket_af_koen", reference_type: "ansoegning", reference_id: null, company_id: null },
    { type: "community_opslag", reference_type: "community_traad", reference_id: REF2, company_id: CO },
    { type: "community_opslag", reference_type: "community_traad", reference_id: null, company_id: null },
    { type: "stille_ingen_login", reference_type: "kontrakt", reference_id: null, company_id: CO },
    { type: "ansoegning_cvr_loft", reference_type: "cvr_loft", reference_id: null, company_id: null },
    { type: "report_uploaded", reference_type: "report", reference_id: REF, company_id: CO },
    { type: "handout_completed", reference_type: "handout", reference_id: REF, company_id: null },
    { type: "new_message", reference_type: "chat", reference_id: REF, company_id: CO },
    { type: "new_message", reference_type: "chat", reference_id: null, company_id: null },
    { type: "feedback_submitted", reference_type: "feedback", reference_id: REF, company_id: null },
  ];
  it("samme sti for hver prøve", () => {
    for (const p of proever) expect(`${p.type}/${p.reference_type}: ${klokkeSti(p)}`).toBe(`${p.type}/${p.reference_type}: ${raadgiverSti(p)}`);
  });
  it("linket er app.theboardroom.dk + stien; uden sti → forsiden", () => {
    expect(klokkeLink(proever[6])).toBe(`https://app.theboardroom.dk/ansoegninger/${REF}`);
    expect(klokkeLink(proever[11])).toBe("https://app.theboardroom.dk/");
  });
});

describe("klokkeMail — teksterne", () => {
  it("dansk tid og dag", () => {
    expect(danskTid(MORGEN)).toBe("22/9-2026 kl. 07:04");
    expect(danskDag(MORGEN)).toBe("tirsdag 22. september");
    expect(danskDag(new Date("2026-12-01T06:04:00Z"))).toBe("tirsdag 1. december");
  });
  it("blokken: titlen som overskrift; brødtekst + link som tekst; uden brødtekst kun linket", () => {
    const r = raekke({ type: "ansoegning_genoptaget", reference_type: "ansoegning", reference_id: REF, title: "X er klar igen", body: "Ansøgeren tog pausen af." });
    expect(klokkeBlok(r)).toEqual({ overskrift: "X er klar igen", tekst: `Ansøgeren tog pausen af. https://app.theboardroom.dk/ansoegninger/${REF}` });
    expect(klokkeBlok(raekke({ type: "drift", title: "Driften", body: "  " })).tekst).toBe("https://app.theboardroom.dk/");
  });
  it("alarmen: emnet bærer tallet og tiden; én blok pr. hændelse; typerne nævnes", () => {
    const h = [raekke({ type: "traek_fejlet", title: "Trækket fejlede", reference_type: "traek", company_id: CO }), raekke({ type: "drift", title: "Driften: x" })];
    const t = alarmMailTekst(h, MORGEN);
    expect(t.emne).toBe("Alarm: 2 klokker kræver et menneske (22/9-2026 kl. 07:04)");
    expect(t.afsnit[0]).toContain("traek_fejlet, drift");
    expect(t.blokke.map((b) => b.overskrift)).toEqual(["Trækket fejlede", "Driften: x"]);
    expect(t.tekst).toContain("Trækket fejlede: ");
    expect(alarmMailTekst([h[0]], MORGEN).emne).toBe("Alarm: 1 klokke kræver et menneske (22/9-2026 kl. 07:04)");
  });
  it("community: hilsen med fornavn (eller «rådgiver»), ental/flertal", () => {
    const r = [raekke({ type: "community_opslag", reference_type: "community_traad", reference_id: REF2, title: "Anna har skrevet et nyt opslag", body: "Hvordan budgetterer I?" })];
    const t = communityMailTekst(r, MORGEN, "Jonas");
    expect(t.emne).toBe("Community: 1 nyt opslag (22/9-2026 kl. 07:04)");
    expect(t.afsnit[0].startsWith("Hej Jonas. Et medlem har skrevet et nyt opslag")).toBe(true);
    expect(t.blokke[0].tekst).toBe(`Hvordan budgetterer I? https://app.theboardroom.dk/community/${REF2}`);
    const t2 = communityMailTekst([...r, ...r], MORGEN, null);
    expect(t2.emne).toBe("Community: 2 nye opslag (22/9-2026 kl. 07:04)");
    expect(t2.afsnit[0].startsWith("Hej rådgiver. Medlemmerne har skrevet 2 nye opslag")).toBe(true);
  });
  it("morgenmailen: dagen i emnet, tallet, og halen om at markere som læst", () => {
    const r = [raekke({ type: "stille_ingen_login", title: "Ingen har logget ind" }), raekke({ type: "venteliste", title: "Pladsen er taget" })];
    const t = morgenMailTekst(r, MORGEN, "Morten");
    expect(t.emne).toBe("Morgenmailen tirsdag 22. september: 2 klokker siden i går kl. 07");
    expect(t.afsnit[0]).toContain("Hej Morten. 2 klokker har ringet i platformen siden i går kl. 07");
    expect(t.tekst.endsWith("en læst klokke mailes ikke igen.")).toBe(true);
    expect(morgenMailTekst([r[0]], MORGEN, " ").emne).toBe("Morgenmailen tirsdag 22. september: 1 klokke siden i går kl. 07");
    // Mandag siger ikke «i går»: den forrige morgenmail gik fredag.
    const man = morgenMailTekst(r, new Date("2026-09-28T05:04:00Z"), "Morten");
    expect(man.emne).toBe("Morgenmailen mandag 28. september: 2 klokker siden fredag kl. 07");
    expect(man.afsnit[0]).toContain("siden fredag kl. 07");
    expect(man.afsnit[0]).not.toContain("i går");
  });
});
