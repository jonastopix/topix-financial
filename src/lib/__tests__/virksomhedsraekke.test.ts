import { describe, it, expect } from "vitest";
import {
  byggVirksomhedsRaekke,
  parseCvrStiftelsesdato,
  type CvrSvar,
  type VirksomhedsInput,
} from "../virksomhedsraekke";

const NU = new Date("2026-09-02T10:00:00.000Z");

const cvr: CvrSvar = {
  name: "Testvirksomhed ApS",
  founded: "15/03 - 2019",
  industry_code: "620100",
  industry_label: "Computerprogrammering",
};

const input = (overrides: Partial<VirksomhedsInput> = {}): VirksomhedsInput => ({
  company_name: "Test fra ansøgning",
  cvr_number: "12345678",
  website: "https://test.dk",
  phone: "12345678",
  industry_label: null,
  start_date: null,
  current_situation: "Vi vokser",
  goals: "Mere overskud",
  help_needed: "Styr på tallene",
  annual_revenue: 2_500_000,
  revenue_interval: "2-5 mio.",
  contact_name: "Jonas Test",
  contact_email: "jonas@test.dk",
  application_date: "2026-08-25",
  ...overrides,
});

describe("parseCvrStiftelsesdato — de fem formater og fravalgene", () => {
  it("ISO: 2019-03-15", () => {
    expect(parseCvrStiftelsesdato("2019-03-15")).toBe("2019-03-15");
  });
  it("ISO med tidsdel beholdes som dato", () => {
    expect(parseCvrStiftelsesdato("2019-03-15T00:00:00Z")).toBe("2019-03-15");
  });
  it("DD/MM - YYYY (cvrapi.dk's form)", () => {
    expect(parseCvrStiftelsesdato("15/03 - 2019")).toBe("2019-03-15");
  });
  it("DD/MM/YYYY", () => {
    expect(parseCvrStiftelsesdato("15/03/2019")).toBe("2019-03-15");
  });
  it("DD-MM-YYYY", () => {
    expect(parseCvrStiftelsesdato("15-03-2019")).toBe("2019-03-15");
  });
  it("DD.MM.YYYY", () => {
    expect(parseCvrStiftelsesdato("15.03.2019")).toBe("2019-03-15");
  });
  it("encifret dag og måned nulpolstres", () => {
    expect(parseCvrStiftelsesdato("5/3/2019")).toBe("2019-03-05");
  });
  it("ugyldigt input → null (better no date than invalid insert)", () => {
    expect(parseCvrStiftelsesdato("marts 2019")).toBeNull();
    expect(parseCvrStiftelsesdato("2019")).toBeNull();
  });
  it("tom, null og undefined → null", () => {
    expect(parseCvrStiftelsesdato("")).toBeNull();
    expect(parseCvrStiftelsesdato("   ")).toBeNull();
    expect(parseCvrStiftelsesdato(null)).toBeNull();
    expect(parseCvrStiftelsesdato(undefined)).toBeNull();
  });
});

describe("byggVirksomhedsRaekke — feltlisten er LÅST", () => {
  it("rækken har præcis dette sæt nøgler — glemmer nogen et felt, fejler det her", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvr, NU);
    expect(Object.keys(raekke).sort()).toEqual(
      [
        "address",
        "application_context",
        "city",
        "contact_email",
        "contact_phone",
        "cvr_fetched_at",
        "cvr_number",
        "industry_code",
        "industry_label",
        "name",
        "onboarding_completed",
        "postal_code",
        "start_date",
        "website",
      ].sort(),
    );
  });

  it("application_context har præcis de syv felter plus raw_cvr_data", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvr, NU);
    const ctx = raekke.application_context as Record<string, unknown>;
    expect(Object.keys(ctx).sort()).toEqual(
      [
        "annual_revenue",
        "application_date",
        "contact_name",
        "current_situation",
        "goals",
        "help_needed",
        "raw_cvr_data",
        "revenue_interval",
      ].sort(),
    );
  });

  // Tre uafhængige steder læser contract_end_date som «har betalt»:
  // hent_betalingstilbud (status 'betalt'), afgoerBetalingsfrist og
  // useAuth via computeMembershipTier (no_date → full). Kunne rækken bære
  // datoerne — også som null eller undefined — ville en fremtidig kalder
  // kunne sætte dem ved underskrift, og betalingssiden ville sige «Tak —
  // du er inde» før nogen har betalt. Derfor må nøglerne ikke findes.
  it("contract_start_date og contract_end_date er IKKE nøgler i rækken — hverken som null eller undefined", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvr, NU);
    expect("contract_start_date" in raekke).toBe(false);
    expect("contract_end_date" in raekke).toBe(false);
    expect(Object.keys(raekke)).not.toContain("contract_start_date");
    expect(Object.keys(raekke)).not.toContain("contract_end_date");
  });

  it("signaturen tager ikke kontraktdatoer imod", () => {
    // Typen VirksomhedsInput har ingen contract_*-felter; sendes de
    // alligevel med (fx spredt fra et regneark), ender de ikke i rækken.
    const medDatoer = { ...input(), contract_start_date: "2026-09-02", contract_end_date: "2027-09-02" } as VirksomhedsInput;
    const raekke = byggVirksomhedsRaekke(medDatoer, cvr, NU);
    expect("contract_end_date" in raekke).toBe(false);
    expect("contract_start_date" in raekke).toBe(false);
  });
});

describe("byggVirksomhedsRaekke — adressen: input vinder, CVR er fallback, tomt er null (3/9)", () => {
  // cvrapi.dk's feltnavne er målt live 3/9 på CVR 41772239 (FLOOR1 I/S):
  // address «Vestergade 41, 1. tv.», zipcode «8600», city «Silkeborg».
  const cvrMedAdresse: CvrSvar = {
    ...cvr,
    address: "Vestergade 41, 1. tv.",
    zipcode: "8600",
    city: "Silkeborg",
  };

  it("adressen fra CVR når input mangler — det er hullet fra FLOOR1", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvrMedAdresse, NU);
    expect(raekke.address).toBe("Vestergade 41, 1. tv.");
    expect(raekke.postal_code).toBe("8600");
    expect(raekke.city).toBe("Silkeborg");
  });

  it("input vinder over CVR — felt for felt, ikke som blok", () => {
    const raekke = byggVirksomhedsRaekke(
      input({ address: "Strandvejen 1", postal_code: null, city: "Hellerup" }),
      cvrMedAdresse,
      NU,
    );
    expect(raekke.address).toBe("Strandvejen 1");
    expect(raekke.postal_code).toBe("8600"); // CVR fylder det ene hul
    expect(raekke.city).toBe("Hellerup");
  });

  it("ingen adresse i CVR-svaret og intet input → null, ikke tomme strenge", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvr, NU);
    expect(raekke.address).toBeNull();
    expect(raekke.postal_code).toBeNull();
    expect(raekke.city).toBeNull();
    const udenSvar = byggVirksomhedsRaekke(input(), null, NU);
    expect(udenSvar.address).toBeNull();
    expect(udenSvar.postal_code).toBeNull();
    expect(udenSvar.city).toBeNull();
  });

  it("tomme og blanke strenge tæller som manglende — CVR fylder, ellers null", () => {
    const blankt = byggVirksomhedsRaekke(input({ address: "", postal_code: "   ", city: " " }), cvrMedAdresse, NU);
    expect(blankt.address).toBe("Vestergade 41, 1. tv.");
    expect(blankt.postal_code).toBe("8600");
    expect(blankt.city).toBe("Silkeborg");
    const blanktUdenCvr = byggVirksomhedsRaekke(input({ address: "", postal_code: "   ", city: " " }), { ...cvr, address: "", zipcode: " ", city: "" }, NU);
    expect(blanktUdenCvr.address).toBeNull();
    expect(blanktUdenCvr.postal_code).toBeNull();
    expect(blanktUdenCvr.city).toBeNull();
  });

  it("værdierne trimmes, så « 8600 » bliver «8600»", () => {
    const raekke = byggVirksomhedsRaekke(input({ postal_code: " 8600 " }), null, NU);
    expect(raekke.postal_code).toBe("8600");
  });

  it("raw_cvr_data bærer også adressen — cvrapi's egne feltnavne", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvrMedAdresse, NU);
    const ctx = raekke.application_context as { raw_cvr_data: CvrSvar };
    expect(ctx.raw_cvr_data.zipcode).toBe("8600");
  });
});

describe("byggVirksomhedsRaekke — felt for felt, som import-application gør det", () => {
  // RETTET 3/9 (docs/indgangen-overhaling.md §6, §9 trin 4). Testen låste
  // før «industry_code er ALTID null — også når CVR-svaret bærer en
  // NACE-kode». Grunden holder stadig: registerkoden må ikke i feltet,
  // fordi feltet er nøgle til industry_benchmarks, og en registerkode
  // giver nul benchmarks (målt i prod 3/9: WESDEX 439100 og Two Socks
  // 563020 står med registerkode i feltet og har nul benchmarks). Det der
  // ændrede sig, er at branchemotoren OVERSÆTTER registerkoden til
  // taksonomiens kode. Testen låser derfor nu det den altid skulle:
  // registerkoden selv lander aldrig i feltet — kun oversættelsen, eller
  // null når motoren ikke rammer. Aldrig other_general.
  it("industry_code: registerkoden selv lander ALDRIG i feltet — kun motorens oversættelse", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvr, NU);
    expect(raekke.industry_code).not.toBe("620100");
    expect(raekke.industry_code).toBe("tech_software");
  });

  it("industry_code: registerkode der rammer → taksonomiens kode", () => {
    expect(byggVirksomhedsRaekke(input(), cvr, NU).industry_code).toBe("tech_software"); // 620100
    expect(byggVirksomhedsRaekke(input(), { ...cvr, industry_code: "471110" }, NU).industry_code).toBe("retail_grocery");
    expect(byggVirksomhedsRaekke(input(), { ...cvr, industry_code: "682040" }, NU).industry_code).toBe("realestate_rental");
  });

  it("industry_code: registerkode der ikke rammer → null, aldrig other_general; labelen står som i dag", () => {
    const hotel = byggVirksomhedsRaekke(input(), { ...cvr, industry_code: "551000", industry_label: "Hoteller" }, NU);
    expect(hotel.industry_code).toBeNull();
    expect(hotel.industry_label).toBe("Hoteller"); // CVR-teksten som før — motoren rører den ikke
    const holding = byggVirksomhedsRaekke(input(), { ...cvr, industry_code: "642120", industry_label: null as unknown as string }, NU);
    expect(holding.industry_code).toBeNull();
    expect(holding.industry_label).toBeNull();
  });

  it("industry_code: ingen registerkode → null (intet CVR-svar, eller svar uden kode)", () => {
    expect(byggVirksomhedsRaekke(input(), null, NU).industry_code).toBeNull();
    expect(byggVirksomhedsRaekke(input(), { name: "Uden kode ApS", founded: "2019-03-15" }, NU).industry_code).toBeNull();
    expect(byggVirksomhedsRaekke(input(), { ...cvr, industry_code: "" }, NU).industry_code).toBeNull();
  });

  it("industry_label: et input-label overskrives IKKE — koden sættes alligevel", () => {
    const raekke = byggVirksomhedsRaekke(input({ industry_label: "Detailhandel" }), cvr, NU);
    expect(raekke.industry_label).toBe("Detailhandel");
    expect(raekke.industry_code).toBe("tech_software");
  });

  it("industry_label: CVR-teksten vinder over motorens label", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvr, NU);
    expect(raekke.industry_label).toBe("Computerprogrammering");
    expect(raekke.industry_label).not.toBe("Softwareudvikling");
  });

  it("industry_label: motorens label KUN når både input og CVR-tekst mangler", () => {
    const raekke = byggVirksomhedsRaekke(input(), { name: "Kun kode ApS", industry_code: "620100" }, NU);
    expect(raekke.industry_label).toBe("Softwareudvikling");
    expect(raekke.industry_code).toBe("tech_software");
  });

  it("raw_cvr_data bærer stadig registerkoden urørt — det er dér den hører hjemme", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvr, NU);
    expect((raekke.application_context as { raw_cvr_data: CvrSvar }).raw_cvr_data.industry_code).toBe("620100");
  });

  it("name: CVR-registrets navn vinder over company_name", () => {
    expect(byggVirksomhedsRaekke(input(), cvr, NU).name).toBe("Testvirksomhed ApS");
  });

  it("name: company_name når CVR-svaret er null eller uden navn", () => {
    expect(byggVirksomhedsRaekke(input(), null, NU).name).toBe("Test fra ansøgning");
    expect(byggVirksomhedsRaekke(input(), { founded: "2019-03-15" }, NU).name).toBe("Test fra ansøgning");
  });

  it("industry_label: input vinder over CVR; CVR når input mangler; null når begge mangler", () => {
    expect(byggVirksomhedsRaekke(input({ industry_label: "Detailhandel" }), cvr, NU).industry_label).toBe("Detailhandel");
    expect(byggVirksomhedsRaekke(input({ industry_label: null }), cvr, NU).industry_label).toBe("Computerprogrammering");
    expect(byggVirksomhedsRaekke(input({ industry_label: null }), null, NU).industry_label).toBeNull();
  });

  it("start_date: input vinder over CVR-stiftelsesdatoen", () => {
    expect(byggVirksomhedsRaekke(input({ start_date: "2020-01-01" }), cvr, NU).start_date).toBe("2020-01-01");
  });

  it("start_date: CVR-stiftelsesdatoen parses når input mangler", () => {
    expect(byggVirksomhedsRaekke(input({ start_date: null }), cvr, NU).start_date).toBe("2019-03-15");
  });

  it("start_date: null når begge mangler, og null når CVR-datoen ikke kan parses", () => {
    expect(byggVirksomhedsRaekke(input({ start_date: null }), null, NU).start_date).toBeNull();
    expect(byggVirksomhedsRaekke(input({ start_date: null }), { ...cvr, founded: "marts 2019" }, NU).start_date).toBeNull();
  });

  it("cvr_fetched_at: tidsstemplet når CVR-svaret findes, null når ikke", () => {
    expect(byggVirksomhedsRaekke(input(), cvr, NU).cvr_fetched_at).toBe("2026-09-02T10:00:00.000Z");
    expect(byggVirksomhedsRaekke(input(), null, NU).cvr_fetched_at).toBeNull();
  });

  it("contact_email sættes fra input (NY i forhold til import-application) — null når den mangler", () => {
    expect(byggVirksomhedsRaekke(input(), cvr, NU).contact_email).toBe("jonas@test.dk");
    expect(byggVirksomhedsRaekke(input({ contact_email: null }), cvr, NU).contact_email).toBeNull();
    expect(byggVirksomhedsRaekke(input({ contact_email: "" }), cvr, NU).contact_email).toBeNull();
  });

  it("de øvrige felter: cvr_number, website, contact_phone, onboarding_completed", () => {
    const raekke = byggVirksomhedsRaekke(input(), cvr, NU);
    expect(raekke.cvr_number).toBe("12345678");
    expect(raekke.website).toBe("https://test.dk");
    expect(raekke.contact_phone).toBe("12345678");
    expect(raekke.onboarding_completed).toBe(false);
    const tom = byggVirksomhedsRaekke(input({ cvr_number: "", website: null, phone: undefined }), null, NU);
    expect(tom.cvr_number).toBeNull();
    expect(tom.website).toBeNull();
    expect(tom.contact_phone).toBeNull();
  });

  it("application_context: alle syv felter plus raw_cvr_data, udfyldt", () => {
    const ctx = byggVirksomhedsRaekke(input(), cvr, NU).application_context as Record<string, unknown>;
    expect(ctx).toEqual({
      current_situation: "Vi vokser",
      goals: "Mere overskud",
      help_needed: "Styr på tallene",
      annual_revenue: 2_500_000,
      revenue_interval: "2-5 mio.",
      contact_name: "Jonas Test",
      application_date: "2026-08-25",
      raw_cvr_data: cvr,
    });
  });

  it("application_context: null hvor input mangler, og raw_cvr_data null uden CVR-svar", () => {
    const ctx = byggVirksomhedsRaekke(
      input({
        current_situation: null,
        goals: undefined,
        help_needed: "",
        annual_revenue: null,
        revenue_interval: null,
        contact_name: null,
        application_date: null,
      }),
      null,
      NU,
    ).application_context as Record<string, unknown>;
    expect(ctx).toEqual({
      current_situation: null,
      goals: null,
      help_needed: null,
      annual_revenue: null,
      revenue_interval: null,
      contact_name: null,
      application_date: null,
      raw_cvr_data: null,
    });
  });
});
