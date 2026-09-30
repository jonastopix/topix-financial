import { describe, expect, it } from "vitest";
import {
  bygMedlemKrop,
  erMedlemsvirksomhed,
  findForbudteNoegler,
  laasVaerdiErAktiv,
  MEDLEM_FELT,
  MEDLEM_LAAS_NOEGLE,
  medlemPlan,
  medlemSkriverRigtigt,
  medlemsmails,
  normaliserMail,
  rensetMedlemResultat,
  tomtMedlemResultat,
  virksomhedsGrund,
  type MedlemVirksomhed,
} from "../../../supabase/functions/_shared/klaviyoMedlem.ts";
import { medlemTilstand, PROFIL_STI, profilAlarmTekst, skrivMedlem, type MedlemSkriver } from "../../../supabase/functions/_shared/klaviyoProfil.ts";

/**
 * tb_medlem på Klaviyo-profilen (30/9-2026) — én test pr. regel i klaviyoMedlem.ts' filhoved.
 * nu = 30/9-2026 kl. 10 UTC. computeMembershipTier: slutdatoen er SIDSTE dag med adgang.
 */
const NU = new Date("2026-09-30T10:00:00Z");

const virk = (id: string, over: Partial<MedlemVirksomhed> = {}): MedlemVirksomhed => ({
  id,
  contract_end_date: "2027-09-29",
  subscription_status: null,
  subscription_current_period_end: null,
  is_legat: false,
  vis_i_netvaerk: true,
  contact_email: `kontakt@${id}.dk`,
  er_kunde: true,
  is_demo: false,
  data_slettet_at: null,
  ...over,
});

describe("R1 aktiv kontrakt", () => {
  it("fremtidig slutdato → aktiv_kontrakt; slutdatoen I DAG er stadig medlem (sidste dag med adgang)", () => {
    expect(virksomhedsGrund(virk("a"), NU)).toBe("aktiv_kontrakt");
    expect(virksomhedsGrund(virk("a", { contract_end_date: "2026-09-30" }), NU)).toBe("aktiv_kontrakt");
    expect(erMedlemsvirksomhed(virk("a"), NU)).toBe(true);
  });
});

describe("R2 aktivt abonnement", () => {
  it("udløbet kontrakt + subscription_status 'active' + fremtidig periodeslut → aktivt_abonnement", () => {
    const v = virk("s", { contract_end_date: "2026-01-01", subscription_status: "active", subscription_current_period_end: "2026-10-30T00:00:00Z" });
    expect(virksomhedsGrund(v, NU)).toBe("aktivt_abonnement");
    expect(erMedlemsvirksomhed(v, NU)).toBe(true);
  });
  it("past_due, cancelled eller passeret periodeslut er IKKE abonnement (dom 5's streng 'active')", () => {
    for (const over of [
      { subscription_status: "past_due", subscription_current_period_end: "2026-10-30T00:00:00Z" },
      { subscription_status: "cancelled", subscription_current_period_end: "2026-10-30T00:00:00Z" },
      { subscription_status: "active", subscription_current_period_end: "2026-09-29T00:00:00Z" },
    ]) expect(virksomhedsGrund(virk("s", { contract_end_date: "2026-01-01", ...over }), NU)).toBe("udloebet");
  });
});

describe("R3 legat er ikke medlem", () => {
  it("is_legat = true → legat, også med fremtidig kontrakt og aktivt abonnement", () => {
    expect(virksomhedsGrund(virk("l", { is_legat: true }), NU)).toBe("legat");
    expect(virksomhedsGrund(virk("l", { is_legat: true, subscription_status: "active", subscription_current_period_end: "2027-01-01T00:00:00Z" }), NU)).toBe("legat");
    expect(erMedlemsvirksomhed(virk("l", { is_legat: true }), NU)).toBe(false);
  });
});

describe("R4 gæster er ikke medlem", () => {
  it("vis_i_netvaerk = false → gaest; null og true er ikke gæst", () => {
    expect(virksomhedsGrund(virk("g", { vis_i_netvaerk: false }), NU)).toBe("gaest");
    expect(virksomhedsGrund(virk("g", { vis_i_netvaerk: false, contract_end_date: null }), NU)).toBe("gaest");
    expect(virksomhedsGrund(virk("g", { vis_i_netvaerk: null }), NU)).toBe("aktiv_kontrakt");
    expect(erMedlemsvirksomhed(virk("g", { vis_i_netvaerk: false }), NU)).toBe(false);
  });
});

describe("R5 uden dato og udløbet er ikke medlem", () => {
  it("ingen slutdato → uden_dato; slutdato i går → udloebet", () => {
    expect(virksomhedsGrund(virk("n", { contract_end_date: null }), NU)).toBe("uden_dato");
    expect(virksomhedsGrund(virk("u", { contract_end_date: "2026-09-29" }), NU)).toBe("udloebet");
    expect(erMedlemsvirksomhed(virk("n", { contract_end_date: null }), NU)).toBe(false);
    expect(erMedlemsvirksomhed(virk("u", { contract_end_date: "2026-09-29" }), NU)).toBe(false);
  });
});

describe("R6 alle brugere + kontaktmailen i en medlemsvirksomhed", () => {
  it("to brugere og kontaktmailen → tre mails; brugere i en ikke-medlemsvirksomhed tæller ikke", () => {
    const d = medlemsmails(
      [virk("a"), virk("x", { contract_end_date: "2026-01-01" })],
      [{ company_id: "a", user_id: "u1" }, { company_id: "a", user_id: "u2" }, { company_id: "x", user_id: "u3" }],
      [{ user_id: "u1", email: "ejer@a.dk" }, { user_id: "u2", email: "bogholder@a.dk" }, { user_id: "u3", email: "tidligere@x.dk" }],
      NU,
    );
    expect([...d.mails].sort()).toEqual(["bogholder@a.dk", "ejer@a.dk", "kontakt@a.dk"]);
    expect(d.virksomheder).toEqual({ aktiv_kontrakt: 1, aktivt_abonnement: 0, slettet: 0, egen: 0, demo: 0, legat: 0, gaest: 0, uden_dato: 0, udloebet: 1 });
  });
});

describe("R7 en mail i to virksomheder: true vinder", () => {
  it("samme mail i en udløbet og en aktiv virksomhed → medlem, talt én gang", () => {
    const d = medlemsmails(
      [virk("gammel", { contract_end_date: "2025-01-01", contact_email: "Fælles@X.dk" }), virk("ny", { contact_email: "faelles@x.dk" })],
      [{ company_id: "gammel", user_id: "u1" }, { company_id: "ny", user_id: "u1" }],
      [{ user_id: "u1", email: "person@x.dk" }],
      NU,
    );
    expect(d.mails.has("person@x.dk")).toBe(true);
    expect(d.mails.has("faelles@x.dk")).toBe(true);
    expect(d.mails.has("fælles@x.dk")).toBe(false);
    expect(d.mails.size).toBe(2);
  });
});

describe("R8 normalisering og uden mail", () => {
  it("trim + små bogstaver; tom, null og uden «@» er ikke en mail og tælles som uden_mail", () => {
    expect(normaliserMail("  LH@GreenSolar.dk ")).toBe("lh@greensolar.dk");
    expect(normaliserMail("")).toBeNull();
    expect(normaliserMail(null)).toBeNull();
    expect(normaliserMail("ingen-snabel")).toBeNull();
    const d = medlemsmails(
      [virk("a", { contact_email: null })],
      [{ company_id: "a", user_id: "u1" }, { company_id: "a", user_id: "u-uden-profil" }],
      [{ user_id: "u1", email: " " }],
      NU,
    );
    expect(d.mails.size).toBe(0);
    expect(d.uden_mail).toBe(3);
  });
});

describe("R9 kun ændringer skrives", () => {
  it("medlem og sidst true → uændret; medlem og sidst false/aldrig → sæt true", () => {
    const p = medlemPlan(new Set(["a@x.dk", "b@x.dk", "c@x.dk"]), new Set(["a@x.dk", "b@x.dk", "c@x.dk"]), new Map([["a@x.dk", true], ["b@x.dk", false]]));
    expect(p.poster).toEqual([{ email: "b@x.dk", oensket: true }, { email: "c@x.dk", oensket: true }]);
    expect(p).toMatchObject({ saet_true: 2, saet_false: 0, uaendret: 1 });
  });
});

describe("R10 false kun for et tidligere medlem", () => {
  it("sidst true og ikke medlem nu → false; sidst false → uændret; aldrig skrevet → røres ikke", () => {
    const kendte = new Set(["ophoert@x.dk", "allerede@x.dk", "null@x.dk"]);
    const p = medlemPlan(new Set<string>(), kendte, new Map<string, boolean | null>([["ophoert@x.dk", true], ["allerede@x.dk", false], ["null@x.dk", null]]));
    expect(p.poster).toEqual([{ email: "ophoert@x.dk", oensket: false }]);
    expect(p).toMatchObject({ saet_true: 0, saet_false: 1, uaendret: 1, ukendt_udeladt: 0 });
  });
  it("«kun» begrænser planen til én mail (beviset)", () => {
    const p = medlemPlan(new Set(["a@x.dk", "lh@greensolar.dk"]), new Set(), new Map(), "lh@greensolar.dk");
    expect(p.poster).toEqual([{ email: "lh@greensolar.dk", oensket: true }]);
  });
});

describe("R11 afmeldte markeres også", () => {
  it("dommen kender ingen afmeldte: medlemsmails tager ingen afmeldte-parameter, og planen sætter true", () => {
    expect(medlemsmails.length).toBe(4);
    expect(medlemPlan(new Set(["afmeldt@x.dk"]), new Set(["afmeldt@x.dk"]), new Map()).poster).toEqual([{ email: "afmeldt@x.dk", oensket: true }]);
  });
});

describe("R0 slettet, egen og demo er ikke medlem — dømt før legat, gæst og tier", () => {
  it("er_kunde = false (Topix.dk ApS) → egen, også med kontrakt til 2030 og aktivt abonnement", () => {
    expect(virksomhedsGrund(virk("t", { er_kunde: false, contract_end_date: "2030-12-31" }), NU)).toBe("egen");
    expect(virksomhedsGrund(virk("t", { er_kunde: false, subscription_status: "active", subscription_current_period_end: "2027-01-01T00:00:00Z" }), NU)).toBe("egen");
    expect(erMedlemsvirksomhed(virk("t", { er_kunde: false }), NU)).toBe(false);
    expect(virksomhedsGrund(virk("t", { er_kunde: null }), NU)).toBe("aktiv_kontrakt");
  });
  it("is_demo = true → demo; null og false er ikke demo", () => {
    expect(virksomhedsGrund(virk("d", { is_demo: true }), NU)).toBe("demo");
    expect(erMedlemsvirksomhed(virk("d", { is_demo: true }), NU)).toBe(false);
    expect(virksomhedsGrund(virk("d", { is_demo: null }), NU)).toBe("aktiv_kontrakt");
  });
  it("data_slettet_at sat → slettet, FØR alt andet (også legat, egen og demo)", () => {
    expect(virksomhedsGrund(virk("s", { data_slettet_at: "2026-09-08T08:08:00Z" }), NU)).toBe("slettet");
    expect(virksomhedsGrund(virk("s", { data_slettet_at: "2026-09-08T08:08:00Z", is_legat: true, er_kunde: false, is_demo: true }), NU)).toBe("slettet");
    expect(erMedlemsvirksomhed(virk("s", { data_slettet_at: "2026-09-08T08:08:00Z" }), NU)).toBe(false);
  });
  it("egen før demo før legat: rækkefølgen er fast", () => {
    expect(virksomhedsGrund(virk("x", { er_kunde: false, is_demo: true, is_legat: true }), NU)).toBe("egen");
    expect(virksomhedsGrund(virk("x", { is_demo: true, is_legat: true }), NU)).toBe("demo");
  });
  it("brugere og kontaktmail i egen og demo er ikke medlemsmails — men platformen kender dem stadig", () => {
    const d = medlemsmails(
      [virk("topix", { er_kunde: false }), virk("demo", { is_demo: true })],
      [{ company_id: "topix", user_id: "u1" }, { company_id: "demo", user_id: "u2" }],
      [{ user_id: "u1", email: "kontakt@topix.dk" }, { user_id: "u2", email: "demo@x.dk" }],
      NU,
    );
    expect(d.mails.size).toBe(0);
    expect([...d.kendte].sort()).toEqual(["demo@x.dk", "kontakt@demo.dk", "kontakt@topix.dk"]);
    expect(d.virksomheder).toMatchObject({ egen: 1, demo: 1, aktiv_kontrakt: 0 });
  });
});

describe("R12 false kun for en mail, platformen stadig kender", () => {
  it("en slettet virksomhed giver hverken medlemsmails eller kendte mails", () => {
    const d = medlemsmails(
      [virk("s", { data_slettet_at: "2026-09-08T08:08:00Z", contact_email: "gammel@s.dk" })],
      [{ company_id: "s", user_id: "u1" }],
      [{ user_id: "u1", email: "person@s.dk" }],
      NU,
    );
    expect(d.mails.size).toBe(0);
    expect(d.kendte.size).toBe(0);
    expect(d.virksomheder.slettet).toBe(1);
  });
  it("sidst true, ikke medlem og ukendt (slettet) → INGEN skrivning, talt som ukendt_udeladt", () => {
    const p = medlemPlan(new Set<string>(), new Set<string>(), new Map<string, boolean | null>([["slettet@x.dk", true]]));
    expect(p.poster).toEqual([]);
    expect(p).toMatchObject({ saet_true: 0, saet_false: 0, uaendret: 0, ukendt_udeladt: 1 });
  });
  it("sidst true, ikke medlem men stadig kendt (udløbet) → false; kun den kendte skrives", () => {
    const sidst = new Map<string, boolean | null>([["udloebet@x.dk", true], ["slettet@x.dk", true]]);
    const p = medlemPlan(new Set<string>(), new Set(["udloebet@x.dk"]), sidst);
    expect(p.poster).toEqual([{ email: "udloebet@x.dk", oensket: false }]);
    expect(p).toMatchObject({ saet_false: 1, ukendt_udeladt: 1 });
  });
  it("en person, der også er bruger i en levende virksomhed, er stadig kendt", () => {
    const d = medlemsmails(
      [virk("s", { data_slettet_at: "2026-09-08T08:08:00Z" }), virk("levende", { contract_end_date: "2026-01-01" })],
      [{ company_id: "s", user_id: "u1" }, { company_id: "levende", user_id: "u1" }],
      [{ user_id: "u1", email: "person@x.dk" }],
      NU,
    );
    expect(d.kendte.has("person@x.dk")).toBe(true);
    expect(d.mails.has("person@x.dk")).toBe(false);
  });
  it("prøven til én slettet mail skriver heller ikke false", () => {
    const p = medlemPlan(new Set<string>(), new Set<string>(), new Map<string, boolean | null>([["slettet@x.dk", true]]), "slettet@x.dk");
    expect(p.poster).toEqual([]);
    expect(p.ukendt_udeladt).toBe(1);
  });
});

describe("R13 låsen app_config.klaviyo_medlem_aktiv", () => {
  it("nøglen og værdien: kun jsonb true eller «true» åbner", () => {
    expect(MEDLEM_LAAS_NOEGLE).toBe("klaviyo_medlem_aktiv");
    expect(laasVaerdiErAktiv(true)).toBe(true);
    expect(laasVaerdiErAktiv("true")).toBe(true);
    for (const v of [false, "false", null, undefined, 1, "ja", {}]) expect(laasVaerdiErAktiv(v)).toBe(false);
  });
  it("tørkørsel skriver aldrig — heller ikke med åben lås eller én adresse", () => {
    expect(medlemSkriverRigtigt(true, true, null)).toBe(false);
    expect(medlemSkriverRigtigt(true, true, "lh@greensolar.dk")).toBe(false);
    expect(medlemSkriverRigtigt(true, false, null)).toBe(false);
  });
  it("rigtig kørsel uden lås og uden adresse (job 571) → skriver IKKE", () => {
    expect(medlemSkriverRigtigt(false, false, null)).toBe(false);
  });
  it("prøven til én adresse er tilladt uden lås; åben lås tillader hele kørslen", () => {
    expect(medlemSkriverRigtigt(false, false, "lh@greensolar.dk")).toBe(true);
    expect(medlemSkriverRigtigt(false, true, null)).toBe(true);
  });
  it("svaret: låsen er lukket i et tomt resultat, og renseren bevarer lås-felterne", () => {
    const t = tomtMedlemResultat();
    expect(t).toMatchObject({ laas_aktiv: false, sender_rigtigt: false, holdt_af_laas: 0, ukendt_udeladt: 0 });
    const r = rensetMedlemResultat({ ...t, laas_aktiv: true, sender_rigtigt: true, holdt_af_laas: 0, fejl: ["x@y.dk"] });
    expect(r).toMatchObject({ laas_aktiv: true, sender_rigtigt: true });
  });
});

describe("kroppen til POST /profile-import/", () => {
  it("ét felt, altid boolean, mailen normaliseret — ingen webinarfelter, ingen unset", () => {
    expect(MEDLEM_FELT).toBe("tb_medlem");
    expect(bygMedlemKrop(" LH@GreenSolar.dk", true)).toEqual({ data: { type: "profile", attributes: { email: "lh@greensolar.dk", properties: { tb_medlem: true } } } });
    expect(bygMedlemKrop("a@x.dk", false)).toEqual({ data: { type: "profile", attributes: { email: "a@x.dk", properties: { tb_medlem: false } } } });
    expect(JSON.stringify(bygMedlemKrop("a@x.dk", true))).not.toContain("tb_naeste_webinar");
  });
});

describe("skrivMedlem — kaldet og tilstanden", () => {
  function fake(findes: boolean) {
    const opdateret: Record<string, unknown>[] = [];
    const indsat: Record<string, unknown>[] = [];
    const skriver: MedlemSkriver = {
      from: () => ({
        update: (r: unknown) => ({ eq: () => ({ select: async () => { opdateret.push(r as Record<string, unknown>); return { data: findes ? [{ email: "x" }] : [], error: null }; } }) }),
        upsert: async (r: unknown) => { indsat.push(r as Record<string, unknown>); return { error: null }; },
      }),
    };
    return { skriver, opdateret, indsat };
  }
  const svar = (status: number) => (async () => new Response("", { status })) as unknown as typeof fetch;

  it("rækken findes: KUN medlemskolonnerne opdateres — webinarets udfald/status røres ikke", async () => {
    const { skriver, opdateret, indsat } = fake(true);
    const kaldt: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => { kaldt.push(String(url)); kaldt.push(String(init?.body)); return new Response("", { status: 200 }); }) as unknown as typeof fetch;
    const r = await skrivMedlem(skriver, "pk_test", "A@X.dk", true, { fetchImpl, nuDato: NU });
    expect(r.sendt).toBe(true);
    expect(kaldt[0]).toBe(`https://a.klaviyo.com/api${PROFIL_STI}`);
    expect(JSON.parse(kaldt[1])).toEqual(bygMedlemKrop("a@x.dk", true));
    expect(opdateret).toEqual([{ medlem_forsoegt_at: NU.toISOString(), medlem_udfald: "ok", medlem_status: 200, medlem_grund: null, tb_medlem: true, tb_medlem_skrevet_at: NU.toISOString() }]);
    expect(indsat).toEqual([]);
  });
  it("rækken findes ikke: indsættes med medlemsforsøget også i de fælles NOT NULL-kolonner", async () => {
    const { skriver, indsat } = fake(false);
    await skrivMedlem(skriver, "pk_test", "ny@x.dk", true, { fetchImpl: svar(201), nuDato: NU });
    expect(indsat).toHaveLength(1);
    expect(indsat[0]).toMatchObject({ email: "ny@x.dk", tb_medlem: true, medlem_udfald: "ok", udfald: "ok", status: 201, forsoegt_at: NU.toISOString() });
    expect(indsat[0]).not.toHaveProperty("tb_naeste_webinar");
  });
  it("fejl: tb_medlem røres ikke (prøves igen næste time); udfald og grund står", async () => {
    const t = medlemTilstand(false, { udfald: "noegle_afvist", metode: "POST", sti: PROFIL_STI, status: 403, svar: null, grund: "HTTP 403", varighed_ms: 5 }, NU);
    expect(t).toEqual({ medlem_forsoegt_at: NU.toISOString(), medlem_udfald: "noegle_afvist", medlem_status: 403, medlem_grund: "HTTP 403" });
    const { skriver, opdateret } = fake(true);
    const r = await skrivMedlem(skriver, "pk_test", "a@x.dk", false, { fetchImpl: svar(403), nuDato: NU });
    expect(r.sendt).toBe(false);
    expect(opdateret[0]).not.toHaveProperty("tb_medlem");
  });
  it("en ikke-boolean værdi sendes aldrig: «ugyldig» i tilstanden, intet kald", async () => {
    const { skriver, opdateret } = fake(true);
    let kaldt = 0;
    const fetchImpl = (async () => { kaldt++; return new Response("", { status: 200 }); }) as unknown as typeof fetch;
    const r = await skrivMedlem(skriver, "pk_test", "a@x.dk", "true" as unknown as boolean, { fetchImpl, nuDato: NU });
    expect(r.spor.udfald).toBe("ugyldig");
    expect(kaldt).toBe(0);
    expect(opdateret[0]).toMatchObject({ medlem_udfald: "ugyldig" });
  });
  it("ingen nøgle: udfald ingen_noegle, intet kald", async () => {
    const { skriver } = fake(true);
    const r = await skrivMedlem(skriver, undefined, "a@x.dk", true, { fetchImpl: svar(200), nuDato: NU });
    expect(r.spor.udfald).toBe("ingen_noegle");
  });
});

describe("svaret bærer aldrig en mail", () => {
  it("tællerne er rene; en mail i en streng, en nøgle «email» eller en adresse som nøgle fanges", () => {
    expect(findForbudteNoegler(tomtMedlemResultat())).toEqual([]);
    expect(findForbudteNoegler({ fejl: ["lh@greensolar.dk fejlede"] })).toEqual(["fejl[0]: rå e-mail"]);
    expect(findForbudteNoegler({ eksempel: { email: "x" } })).toEqual(["eksempel.email: forbudt nøgle"]);
    expect(findForbudteNoegler({ fejlede_udfald: { "a@x.dk": 1 } })).toHaveLength(1);
  });
  it("rensetMedlemResultat: rent passerer uændret; urent erstattes af tællere + en fejl uden mailen", () => {
    const rent = { ...tomtMedlemResultat(), medlemsmails: 26, saet_true: 26 };
    expect(rensetMedlemResultat(rent)).toBe(rent);
    const urent = { ...tomtMedlemResultat(), skrevet: 3, lykkedes: 2, fejlede: 1, fejl: ["læsning: noget med lh@greensolar.dk"] };
    const r = rensetMedlemResultat(urent);
    expect(JSON.stringify(r)).not.toContain("@");
    expect(r).toMatchObject({ skrevet: 3, lykkedes: 2, fejlede: 1 });
    expect(r.fejl[0]).toMatch(/^svaret bar persondata og er fjernet/);
  });
});

describe("alarmen nævner medlemsfeltet", () => {
  it("kun medlemsfejl → emnet siger tb_medlem; blandet → begge; kun webinar → som før", () => {
    const m = profilAlarmTekst([{ email: "a@x.dk", udfald: "timeout", grund: null, felt: "medlem" }], NU);
    expect(m.emne).toBe("1 profilskrivning til Klaviyo fejlede — medlemsfeltet (tb_medlem) står ikke på profilen");
    expect(m.blokke[0].overskrift).toBe("a@x.dk (tb_medlem)");
    expect(m.tekst).toContain("medlem_udfald");
    const b = profilAlarmTekst([{ email: "a@x.dk", udfald: "timeout", grund: null, felt: "medlem" }, { email: "b@x.dk", udfald: "timeout", grund: null }], NU);
    expect(b.emne).toContain("webinarets tidspunkt eller medlemsfeltet (tb_medlem)");
    const w = profilAlarmTekst([{ email: "b@x.dk", udfald: "timeout", grund: null }], NU);
    expect(w.emne).toBe("1 profilskrivning til Klaviyo fejlede — webinarets tidspunkt står ikke på profilen");
    expect(w.tekst).not.toContain("medlem_udfald");
  });
});
