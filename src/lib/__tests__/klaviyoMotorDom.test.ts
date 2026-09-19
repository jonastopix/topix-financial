/**
 * klaviyoMotorDom (lag 3, udkast 19/9): de tre domme, der afgør, om en
 * skrivning til Klaviyo må forlade huset.
 *
 * Fixturerne er MÅLT: FØR-definitionen er formen fra en rigtig læsning af
 * handling 117754032 i flow «Jonas - Webinar» (inkl. links.next), og de to
 * afvisninger, dommene værner mod, er ordret dem Klaviyo svarede 19/9.
 */
import { describe, expect, it } from "vitest";
import {
  bevarDefinition,
  bygMailData,
  doemSkabelon,
  erHeltKladde,
  hvadAendres,
  KLADDE,
  tvingKladde,
  type FlowhandlingsDefinition,
} from "../../../supabase/functions/_shared/klaviyoMotorDom.ts";

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
