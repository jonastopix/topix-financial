/**
 * klaviyoMotorDom (lag 3, udkast 19/9): de tre domme, der afgør, om en
 * skrivning til Klaviyo må forlade huset.
 *
 * Fixturerne er MÅLT: FØR-definitionen er formen fra en rigtig læsning af
 * handling 117754032 i flow «Jonas - Webinar» (inkl. links.next), og de to
 * afvisninger, dommene værner mod, er ordret dem Klaviyo svarede 19/9.
 */
import { describe, expect, it } from "vitest";
import { bevarDefinition, bygMailData, doemAfvigelse, doemBetingelser, doemFlowAfvigelse, doemSkabelon, doemSkabelonKobling, erHeltKladde, type FlowhandlingsDefinition, hvadAendres, KLADDE, tvingKladde } from "../../../supabase/functions/_shared/klaviyoMotorDom.ts";

/** Formen fra en rigtig læsning — id, type, links og hele data. */
const FOER: FlowhandlingsDefinition = {
  id: "117754032",
  type: "send-email",
  links: { next: "117754027" },
  data: {
    message: {
      from_email: "noreply@send.topix.dk",
      from_label: "Morten Larsen",
      reply_to_email: null,
      subject_line: "Et spørgsmål, du kan stille dig selv inden webinaret",
      preview_text: "Om en uge ses vi.",
      template_id: null,
      smart_sending_enabled: false,
      name: "Email #4",
      id: "XYgG3S",
    },
    status: "draft",
  },
};

describe("eksporterne findes", () => {
  it("alle domme er funktioner — ikke undefined", () => {
    for (const f of [bevarDefinition, bygMailData, doemSkabelon, erHeltKladde, hvadAendres, tvingKladde]) {
      expect(typeof f).toBe("function");
    }
    expect(KLADDE).toBe("draft");
  });
});

describe("bevarDefinition — de to afvisninger, der lærte os reglen", () => {
  it("bærer id OG links med videre — det var netop dem, der manglede", () => {
    const d = bevarDefinition(FOER, { data: { status: "draft" } });
    expect(d.ok).toBe(true);
    if (d.ok === false) return;
    // «Actions must have either an id or temporary id» (afvisning 1)
    expect(d.vaerdi.id).toBe("117754032");
    // «You cannot change the links of an action» (afvisning 2)
    expect(d.vaerdi.links).toEqual({ next: "117754027" });
    expect(d.vaerdi.type).toBe("send-email");
  });

  it("et felt, vi ALDRIG har hørt om, følger med — det er hele pointen", () => {
    const medUkendt = { ...FOER, et_felt_klaviyo_finder_paa: { dybt: true } };
    const d = bevarDefinition(medUkendt, { data: { status: "draft" } });
    expect(d.ok && d.vaerdi.et_felt_klaviyo_finder_paa).toEqual({ dybt: true });
  });

  it("data flettes, så uberørte felter i data overlever", () => {
    const d = bevarDefinition(FOER, { data: { status: "manual" } });
    expect(d.ok).toBe(true);
    if (d.ok === false) return;
    expect((d.vaerdi.data as Record<string, unknown>).status).toBe("manual");
    // message rørte vi ikke — den skal stadig være der, hel.
    expect((d.vaerdi.data as Record<string, unknown>).message).toEqual(FOER.data!.message);
  });

  it("uden id og uden temporary_id → afvist med Klaviyos egen formulering i forklaringen", () => {
    const d = bevarDefinition({ type: "send-email", data: {} });
    expect(d.ok).toBe(false);
    if (d.ok === true) return;
    expect(d.fejl).toBe("id_mangler");
    expect(d.forklaring).toContain("temporary id");
  });

  it("temporary_id alene er nok — det er vejen ved oprettelse af et nyt flow", () => {
    expect(bevarDefinition({ temporary_id: "handling-1", type: "send-email", data: {} }).ok).toBe(true);
  });

  it("uden type eller uden definition → afvist", () => {
    expect(bevarDefinition({ id: "1", data: {} })).toMatchObject({ ok: false, fejl: "type_mangler" });
    expect(bevarDefinition(null)).toMatchObject({ ok: false, fejl: "definition_mangler" });
    expect(bevarDefinition(undefined)).toMatchObject({ ok: false, fejl: "definition_mangler" });
  });
});

describe("tvingKladde — intet går live af sig selv", () => {
  it("sætter enhver status til draft, uanset hvor dybt den ligger, og siger hvor", () => {
    const def = {
      actions: [
        { temporary_id: "a1", type: "send-email", data: { status: "live", message: { subject_line: "x" } } },
        { temporary_id: "a2", type: "countdown-delay", data: { value: 3, unit: "days" } },
        { temporary_id: "a3", type: "send-email", data: { status: "manual" } },
      ],
    };
    const { vaerdi, rettede } = tvingKladde(def);
    const ud = vaerdi as typeof def;
    expect(ud.actions[0].data.status).toBe("draft");
    expect(ud.actions[2].data.status).toBe("draft");
    expect(rettede).toEqual([
      "actions[0].data.status: «live» → «draft»",
      "actions[2].data.status: «manual» → «draft»",
    ]);
  });

  it("rører ikke en status, der allerede er draft — så tom liste betyder «intet forsøgte at gå live»", () => {
    const { rettede } = tvingKladde({ actions: [{ data: { status: "draft" } }] });
    expect(rettede).toEqual([]);
    expect(erHeltKladde({ actions: [{ data: { status: "draft" } }] })).toBe(true);
    expect(erHeltKladde({ actions: [{ data: { status: "live" } }] })).toBe(false);
  });

  it("rører ikke andre felter, og bevarer alt det øvrige uændret", () => {
    const def = { navn: "x", actions: [{ temporary_id: "a1", data: { status: "live", vigtigt: [1, 2, 3] } }] };
    const ud = tvingKladde(def).vaerdi as typeof def;
    expect(ud.navn).toBe("x");
    expect(ud.actions[0].temporary_id).toBe("a1");
    expect(ud.actions[0].data.vigtigt).toEqual([1, 2, 3]);
  });

  it("tåler null, tal og tomme objekter uden at kaste", () => {
    expect(tvingKladde(null).vaerdi).toBeNull();
    expect(tvingKladde(42).vaerdi).toBe(42);
    expect(tvingKladde({}).rettede).toEqual([]);
  });

  it("en status, der ikke er en streng, røres ikke — vi gætter ikke på formen", () => {
    const { rettede, vaerdi } = tvingKladde({ data: { status: 1 } });
    expect(rettede).toEqual([]);
    expect((vaerdi as { data: { status: number } }).data.status).toBe(1);
  });
});

describe("doemSkabelon — html og definition må aldrig blandes", () => {
  it("CODE og USER_DRAGGABLE skrives med html", () => {
    const d = doemSkabelon({ navn: "Velkomst", redigeringstype: "CODE", html: "<p>hej</p>" });
    expect(d.ok).toBe(true);
    if (d.ok === false) return;
    expect(d.vaerdi).toEqual({ name: "Velkomst", editor_type: "CODE", html: "<p>hej</p>" });
    expect(doemSkabelon({ navn: "x", redigeringstype: "USER_DRAGGABLE", html: "<p/>" }).ok).toBe(true);
  });

  it("SYSTEM_DRAGGABLE med html → AFVIST, og forklaringen siger hvorfor det er farligt", () => {
    const d = doemSkabelon({ navn: "x", redigeringstype: "SYSTEM_DRAGGABLE", html: "<p/>" });
    expect(d.ok).toBe(false);
    if (d.ok === true) return;
    expect(d.fejl).toBe("html_paa_system_draggable");
    expect(d.forklaring).toContain("visuelle editor");
  });

  it("SYSTEM_DRAGGABLE skrives med definition", () => {
    const d = doemSkabelon({ navn: "x", redigeringstype: "SYSTEM_DRAGGABLE", definition: { blocks: [] } });
    expect(d.ok && d.vaerdi.definition).toEqual({ blocks: [] });
    expect(d.ok && d.vaerdi.html).toBeUndefined();
  });

  it("CODE med definition → afvist; manglende indhold → afvist; ukendt type → afvist", () => {
    expect(doemSkabelon({ navn: "x", redigeringstype: "CODE", definition: {} })).toMatchObject({ ok: false, fejl: "definition_paa_code" });
    expect(doemSkabelon({ navn: "x", redigeringstype: "CODE" })).toMatchObject({ ok: false, fejl: "indhold_mangler" });
    expect(doemSkabelon({ navn: "x", redigeringstype: "SYSTEM_DRAGGABLE" })).toMatchObject({ ok: false, fejl: "indhold_mangler" });
    expect(doemSkabelon({ navn: "x", redigeringstype: "DND" as never, html: "<p/>" })).toMatchObject({ ok: false, fejl: "ukendt_redigeringstype" });
  });
});

describe("bygMailData — ét felt ad gangen, resten bevares", () => {
  it("ændrer kun det navngivne felt; alt andet i message overlever", () => {
    const ud = bygMailData(FOER.data as Record<string, unknown>, { svaradresse: "kontakt@topix.dk" });
    const besked = ud.message as Record<string, unknown>;
    expect(besked.reply_to_email).toBe("kontakt@topix.dk");
    expect(besked.subject_line).toBe("Et spørgsmål, du kan stille dig selv inden webinaret");
    expect(besked.id).toBe("XYgG3S");
    expect(ud.status).toBe("draft");
  });

  it("undefined rører ikke — null rydder med vilje. De to er ikke det samme", () => {
    const uroert = bygMailData(FOER.data as Record<string, unknown>, {});
    expect((uroert.message as Record<string, unknown>).subject_line).toBe(FOER.data!.message!["subject_line" as never]);
    const ryddet = bygMailData(FOER.data as Record<string, unknown>, { forhaandstekst: null });
    expect((ryddet.message as Record<string, unknown>).preview_text).toBeNull();
  });

  it("alle seks felter kan sættes", () => {
    const ud = bygMailData(FOER.data as Record<string, unknown>, {
      skabelonId: "T1", emne: "Nyt emne", forhaandstekst: "Ny tekst",
      afsenderMail: "a@b.dk", afsenderNavn: "Morten", svaradresse: "kontakt@topix.dk",
    });
    expect(ud.message).toMatchObject({
      template_id: "T1", subject_line: "Nyt emne", preview_text: "Ny tekst",
      from_email: "a@b.dk", from_label: "Morten", reply_to_email: "kontakt@topix.dk",
    });
  });
});

describe("hvadAendres — et menneske skal kunne læse ændringen på ét blik", () => {
  it("finder kun de felter, der flytter sig, med fuld sti", () => {
    const foer = { message: { subject_line: "A", reply_to_email: null }, status: "draft" };
    const efter = { message: { subject_line: "A", reply_to_email: "kontakt@topix.dk" }, status: "draft" };
    expect(hvadAendres(foer, efter)).toEqual([
      { felt: "message.reply_to_email", foer: null, efter: "kontakt@topix.dk" },
    ]);
  });

  it("ens objekter giver tom liste; et nyt felt og et fjernet felt vises begge", () => {
    expect(hvadAendres({ a: 1 }, { a: 1 })).toEqual([]);
    expect(hvadAendres({ a: 1 }, { a: 1, b: 2 })).toEqual([{ felt: "b", foer: null, efter: 2 }]);
    expect(hvadAendres({ a: 1, b: 2 }, { a: 1 })).toEqual([{ felt: "b", foer: 2, efter: null }]);
  });

  it("tåler null i begge ender", () => {
    expect(hvadAendres(null, null)).toEqual([]);
    expect(hvadAendres(null, { a: 1 })).toEqual([{ felt: "a", foer: null, efter: 1 }]);
  });
});

// ── doemBetingelser ────────────────────────────────────────────────────────

/** Den målte form fra kontoens eget flow «Onboarding, new subscriber & no order». */
const gyldigtFilter = () => ({
  condition_groups: [{
    conditions: [{
      type: "profile-metric",
      metric_id: "SMSxaW",
      measurement: "count",
      measurement_filter: { type: "numeric", operator: "equals", value: 0 },
      timeframe_filter: { type: "date", operator: "flow-start" },
      metric_filters: null,
    }],
  }],
});

describe("doemBetingelser", () => {
  it("tager den målte form fra en rigtig konto", () => {
    const d = doemBetingelser(gyldigtFilter());
    expect(d.ok).toBe(true);
    if (d.ok === true) expect(d.vaerdi).toEqual(gyldigtFilter());
  });

  it("null er et gyldigt svar og betyder «ryd filteret»", () => {
    const d = doemBetingelser(null);
    expect(d.ok).toBe(true);
    if (d.ok === true) expect(d.vaerdi).toBeNull();
  });

  it("beholder felter, vi ikke kender — vi dømmer form, ikke ordforråd", () => {
    const med = { ...gyldigtFilter(), noget_nyt_fra_klaviyo: 42 };
    const d = doemBetingelser(med);
    expect(d.ok).toBe(true);
    if (d.ok === true) expect((d.vaerdi as Record<string, unknown>).noget_nyt_fra_klaviyo).toBe(42);
  });

  it("tillader en betingelsestype, vi ikke kender, når den har en type", () => {
    const d = doemBetingelser({ condition_groups: [{ conditions: [{ type: "noget-helt-nyt", hvadsomhelst: true }] }] });
    expect(d.ok).toBe(true);
  });

  it.each([
    ["en streng", "profile-metric"],
    ["et tal", 7],
    ["en liste", [{ conditions: [] }]],
  ])("afviser %s", (_navn, vaerdi) => {
    expect(doemBetingelser(vaerdi).ok).toBe(false);
  });

  it("afviser et tomt objekt — condition_groups mangler", () => {
    const d = doemBetingelser({});
    expect(d.ok).toBe(false);
    if (d.ok === false) expect(d.fejl).toBe("betingelser_ugyldige");
  });

  it("afviser tomme condition_groups", () => {
    expect(doemBetingelser({ condition_groups: [] }).ok).toBe(false);
  });

  it("afviser en gruppe uden conditions", () => {
    expect(doemBetingelser({ condition_groups: [{ conditions: [] }] }).ok).toBe(false);
  });

  it("afviser en betingelse uden type", () => {
    expect(doemBetingelser({ condition_groups: [{ conditions: [{ metric_id: "SMSxaW" }] }] }).ok).toBe(false);
  });

  // DEN VIGTIGSTE: webinar-sagen i miniature. Metrikken fandtes ikke, og en
  // pladsholder ville have set ud som en tekst, der virkede.
  it("afviser profile-metric uden metric_id", () => {
    const f = gyldigtFilter();
    delete (f.condition_groups[0].conditions[0] as Record<string, unknown>).metric_id;
    const d = doemBetingelser(f);
    expect(d.ok).toBe(false);
    if (d.ok === false) expect(d.forklaring).toContain("metric_id");
  });

  it.each([["en pladsholder", "<id>"], ["tom", ""], ["for kort", "abc"], ["for lang", "SMSxaW77"]])(
    "afviser metric_id, der er %s",
    (_navn, id) => {
      const f = gyldigtFilter();
      (f.condition_groups[0].conditions[0] as Record<string, unknown>).metric_id = id;
      expect(doemBetingelser(f).ok).toBe(false);
    },
  );

  it("peger på den gruppe og betingelse, der fejler", () => {
    const f = gyldigtFilter();
    f.condition_groups.push({ conditions: [{ type: "profile-metric", metric_id: "nej" }] } as never);
    const d = doemBetingelser(f);
    expect(d.ok).toBe(false);
    if (d.ok === false) expect(d.forklaring).toContain("condition_groups[1].conditions[0]");
  });
});

describe("bygMailData — betingelser", () => {
  const foer = { message: { subject_line: "Emne", additional_filters: null }, status: "live" };

  it("udeladt rører ikke filteret", () => {
    const ud = bygMailData(foer, { emne: "Nyt" });
    expect((ud.message as Record<string, unknown>).additional_filters).toBeNull();
    expect(Object.keys(ud.message as object)).toContain("additional_filters");
  });

  it("et objekt sættes som additional_filters", () => {
    const ud = bygMailData(foer, { betingelser: gyldigtFilter() as never });
    expect((ud.message as Record<string, unknown>).additional_filters).toEqual(gyldigtFilter());
  });

  it("null rydder filteret", () => {
    const med = { message: { subject_line: "Emne", additional_filters: gyldigtFilter() }, status: "live" };
    const ud = bygMailData(med, { betingelser: null });
    expect((ud.message as Record<string, unknown>).additional_filters).toBeNull();
  });
});

// ── doemAfvigelse: skabelon-klonen, målt 19/9 kl. 23:17 ────────────────────

const defMed = (skabelonId: string) => ({
  id: "117754032",
  type: "send-email",
  links: { next: "117754027" },
  data: { status: "live", message: { template_id: skabelonId, subject_line: "Emne", id: "XYgG3S" } },
});

describe("doemAfvigelse", () => {
  it("siger intet, når svaret er det, vi sendte", () => {
    const r = doemAfvigelse(defMed("TVbT4b"), defMed("TVbT4b"));
    expect(r.afvigelser).toEqual([]);
    expect(r.besked).toBeNull();
  });

  // DEN RIGTIGE SAG: vi sendte TVbT4b, EFTER bar SYKyM6.
  it("fanger klonen og navngiver begge id'er", () => {
    const r = doemAfvigelse(defMed("TVbT4b"), defMed("SYKyM6"));
    expect(r.afvigelser).toEqual([
      { felt: "data.message.template_id", vi_sendte: "TVbT4b", klaviyo_satte: "SYKyM6" },
    ]);
    expect(r.besked).toContain("KLONEDE");
    expect(r.besked).toContain("TVbT4b");
    expect(r.besked).toContain("SYKyM6");
    // Det vigtigste for et menneske, der læser sporet et halvt år senere.
    expect(r.besked).toContain("frakoblet");
  });

  it("er generel: fanger også en ombytning, vi ikke har set før", () => {
    const sendt = defMed("TVbT4b");
    const efter = defMed("TVbT4b");
    (efter.data.message as Record<string, unknown>).subject_line = "Noget Klaviyo fandt på";
    const r = doemAfvigelse(sendt, efter);
    expect(r.afvigelser).toHaveLength(1);
    expect(r.besked).toContain("subject_line");
    expect(r.besked).not.toContain("KLONEDE");
  });

  it("nævner både klonen og de øvrige, når begge dele sker", () => {
    const efter = defMed("SYKyM6");
    (efter.data.message as Record<string, unknown>).subject_line = "Ændret";
    const r = doemAfvigelse(defMed("TVbT4b"), efter);
    expect(r.afvigelser).toHaveLength(2);
    expect(r.besked).toContain("KLONEDE");
    expect(r.besked).toContain("subject_line");
  });
});

describe("doemSkabelonKobling", () => {
  // Kloner fra den rigtige kørsel.
  const iBrug = ["SYKyM6", "Yn3dix", "Tx9m4j", "VjzeyN"];

  it("godkender den skabelon, flowet faktisk bruger", () => {
    const d = doemSkabelonKobling("SYKyM6", iBrug);
    expect(d.ok).toBe(true);
  });

  it("afviser originalen, som er frakoblet", () => {
    const d = doemSkabelonKobling("TVbT4b", iBrug);
    expect(d.ok).toBe(false);
    if (d.ok === false) {
      expect(d.fejl).toBe("skabelon_frakoblet");
      // Den skal sige, hvad man SKAL rette — ikke kun at man tog fejl.
      expect(d.forklaring).toContain("SYKyM6");
      expect(d.forklaring).toContain("frakoblet");
    }
  });

  it("siger det tydeligt, når flowet slet ingen mails har", () => {
    const d = doemSkabelonKobling("TVbT4b", []);
    expect(d.ok).toBe(false);
    if (d.ok === false) expect(d.forklaring).toContain("ingen mailhandlinger");
  });
});

// ── doemFlowAfvigelse: den rigtige sag fra QYVEpj, 19/9 kl. 23:34 ─────────

const flowDef = (over: { tid?: string; skabelon?: string; id?: string; metric?: string } = {}) => ({
  triggers: [{
    type: "date",
    date_profile_property: "eWebinar",
    trigger_time: over.tid ?? "11:00:00",
    ...(over.metric ? { internal_metric_id: over.metric } : {}),
  }],
  reentry_criteria: { duration: 14, unit: "day" },
  entry_action_id: over.id ?? "t-start",
  actions: [
    { [over.id ? "id" : "temporary_id"]: over.id ?? "t-start", type: "target-date", data: {} },
    {
      [over.id ? "id" : "temporary_id"]: over.id ?? "t-mail1",
      type: "send-email",
      data: { status: "draft", message: { name: "Efter 01 — Tak fordi du var med", template_id: over.skabelon ?? "TYDpbi", subject_line: "Tak", preview_text: "Se det igen", additional_filters: null, from_email: "noreply@send.topix.dk", from_label: "Morten Larsen", reply_to_email: "kontakt@topix.dk" } },
    },
  ],
});

describe("doemFlowAfvigelse", () => {
  it("tier, når vi fik det, vi bad om — også når id'erne er blevet rigtige", () => {
    const r = doemFlowAfvigelse(flowDef(), flowDef({ id: "117759058" }));
    expect(r.afvigelser).toEqual([]);
    expect(r.besked).toBeNull();
  });

  it("ser bort fra internal_metric_id, som Klaviyo selv tildeler", () => {
    const r = doemFlowAfvigelse(flowDef(), flowDef({ metric: "SMmxTN" }));
    expect(r.afvigelser).toEqual([]);
  });

  // DEN RIGTIGE SAG: vi sendte 11:00:00, Klaviyo gemte 00:00:00.
  it("fanger, at Klaviyo flyttede udløsningstidspunktet", () => {
    const r = doemFlowAfvigelse(flowDef(), flowDef({ tid: "00:00:00" }));
    expect(r.afvigelser).toEqual([
      { felt: "udloeser.trigger_time", vi_sendte: "11:00:00", klaviyo_satte: "00:00:00" },
    ]);
    expect(r.besked).toContain("11:00:00");
    expect(r.besked).toContain("00:00:00");
    expect(r.besked).not.toContain("KLONEDE");
  });

  it("fanger klonen og navngiver begge id'er", () => {
    const r = doemFlowAfvigelse(flowDef(), flowDef({ skabelon: "WndiUL" }));
    expect(r.besked).toContain("KLONEDE");
    expect(r.besked).toContain("TYDpbi → WndiUL");
    expect(r.besked).toContain("frakoblet");
  });

  it("siger begge dele, når begge dele skete — som de gjorde", () => {
    const r = doemFlowAfvigelse(flowDef(), flowDef({ tid: "00:00:00", skabelon: "WndiUL" }));
    expect(r.afvigelser).toHaveLength(2);
    expect(r.besked).toContain("KLONEDE");
    expect(r.besked).toContain("trigger_time");
  });

  it("matcher mails på navn, ikke på rækkefølge", () => {
    const sendt = flowDef();
    const efter = flowDef({ id: "117759058" });
    efter.actions.reverse();
    expect(doemFlowAfvigelse(sendt, efter).afvigelser).toEqual([]);
  });
});
