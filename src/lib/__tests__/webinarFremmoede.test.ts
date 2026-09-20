import { describe, expect, it } from "vitest";
import { afgoerOvergang, byggFremmoede } from "../../../supabase/functions/_shared/webinarHaendelser";
import { HAENDELSE, byggHaendelse } from "../../../supabase/functions/_shared/klaviyoHaendelser";
import { doemSetGrad, SET_GRAENSE_PROCENT, type SetGrad } from "../../../supabase/functions/_shared/webinarDom";

const GRADER: SetGrad[] = ["set", "delvist", "moedte_ikke", "tilmeldt", "ukendt"];

const input = (o: Partial<Parameters<typeof byggFremmoede>[1]> = {}) => ({
  ewebinarId: "reg_123",
  email: "Test.Person@Gmail.com",
  grad: "set" as SetGrad,
  setProcent: 82,
  webinarId: "web_9",
  webinarTitel: "Vækststrategi",
  sessionTid: "2026-09-22T17:00:00.000Z",
  tid: new Date("2026-09-22T18:35:00.000Z"),
  ...o,
});

describe("afgoerOvergang — der sendes kun ved SKIFT", () => {
  it("samme grad to gange sender intet — eWebinar POSTer ved hver ændring", () => {
    for (const g of GRADER) expect(afgoerOvergang(g, g)).toBe("ingen");
  });

  it("første besked (ingen tidligere række) kan udløse begge hændelser", () => {
    expect(afgoerOvergang(null, "set")).toBe("deltog");
    expect(afgoerOvergang(null, "delvist")).toBe("deltog");
    expect(afgoerOvergang(null, "moedte_ikke")).toBe("moedte_ikke");
    expect(afgoerOvergang(null, "tilmeldt")).toBe("ingen");
    expect(afgoerOvergang(null, "ukendt")).toBe("ingen");
  });

  it("fra en uafgjort grad videre til en endelig", () => {
    for (const foer of ["tilmeldt", "ukendt"] as SetGrad[]) {
      expect(afgoerOvergang(foer, "set")).toBe("deltog");
      expect(afgoerOvergang(foer, "delvist")).toBe("deltog");
      expect(afgoerOvergang(foer, "moedte_ikke")).toBe("moedte_ikke");
    }
  });

  it("delvist → set sender IGEN, fordi tallet er blevet bedre", () => {
    // Procenten går aldrig ned (fletTilmelding), så overgangen sker højst én
    // gang pr. tilmelding — og unique_id skiller de to ad på graden.
    expect(afgoerOvergang("delvist", "set")).toBe("deltog");
    expect(byggFremmoede("deltog", input({ grad: "delvist" }))!.uniktId).toBe("reg_123:delvist");
    expect(byggFremmoede("deltog", input({ grad: "set" }))!.uniktId).toBe("reg_123:set");
  });

  it("en dom, der går BAGLÆNS, sender intet", () => {
    // set → delvist kan ikke ske. Sker det, er det et tegn på noget galt,
    // ikke på en ny kendsgerning.
    expect(afgoerOvergang("set", "delvist")).toBe("ingen");
    expect(afgoerOvergang("set", "tilmeldt")).toBe("ingen");
    expect(afgoerOvergang("delvist", "tilmeldt")).toBe("ingen");
  });

  it("en der mødte op, bliver aldrig til en der ikke gjorde", () => {
    expect(afgoerOvergang("set", "moedte_ikke")).toBe("ingen");
    expect(afgoerOvergang("delvist", "moedte_ikke")).toBe("ingen");
  });

  it("og en no-show, der senere ses i optagelsen, bliver ikke «deltog»", () => {
    // moedte_ikke er en endelig dom om SESSIONEN. Ser man optagelsen bagefter,
    // er det en anden ting, og den hører ikke til i denne hændelse.
    expect(afgoerOvergang("moedte_ikke", "set")).toBe("ingen");
    expect(afgoerOvergang("moedte_ikke", "delvist")).toBe("ingen");
  });
});

describe("byggFremmoede — 75 %-grænsen ligger IKKE i navnet", () => {
  it("to metric-navne i alt, og ingen af dem nævner en procent", () => {
    expect(HAENDELSE.deltog).toBe("Deltog i webinar");
    expect(HAENDELSE.moedteIkke).toBe("Moedte ikke op");
    for (const navn of Object.values(HAENDELSE)) {
      expect(navn).not.toMatch(/75|procent|faerdig|fuldt/i);
    }
  });

  it("set og delvist deler metric — forskellen står i tallet", () => {
    const a = byggFremmoede("deltog", input({ grad: "set", setProcent: 82 }))!;
    const b = byggFremmoede("deltog", input({ grad: "delvist", setProcent: 40 }))!;
    expect(a.metric).toBe(b.metric);
    expect(a.metric).toBe(HAENDELSE.deltog);
    expect(a.egenskaber!.set_procent).toBe(82);
    expect(b.egenskaber!.set_procent).toBe(40);
    // Graden følger med som bekvemmelighed, men tallet er sandheden.
    expect(a.egenskaber!.grad).toBe("set");
  });

  it("Klaviyo kan segmentere på tallet, så grænsen kan flyttes ét sted", () => {
    const paaGraensen = byggFremmoede("deltog", input({ setProcent: SET_GRAENSE_PROCENT }))!;
    expect(typeof paaGraensen.egenskaber!.set_procent).toBe("number");
    expect(paaGraensen.egenskaber!.set_procent).toBe(75);
  });
});

describe("byggFremmoede — sessionen ligger på hændelsen, ikke i profilen", () => {
  it("webinar_id og session_tid følger med hver hændelse", () => {
    const h = byggFremmoede("deltog", input())!;
    expect(h.egenskaber!.webinar_id).toBe("web_9");
    expect(h.egenskaber!.session_tid).toBe("2026-09-22T17:00:00.000Z");
    expect(h.egenskaber!.webinar_titel).toBe("Vækststrategi");
  });

  it("to sessioner for samme person giver to hændelser, ikke én overskrevet", () => {
    // Det er hele grunden: profilens `eWebinar`-felt overskrives (målt 19/9).
    const aug = byggFremmoede("deltog", input({ ewebinarId: "reg_aug", sessionTid: "2026-08-25T17:00:00.000Z" }))!;
    const sep = byggFremmoede("deltog", input({ ewebinarId: "reg_sep", sessionTid: "2026-09-22T17:00:00.000Z" }))!;
    expect(aug.uniktId).not.toBe(sep.uniktId);
    expect(aug.egenskaber!.session_tid).not.toBe(sep.egenskaber!.session_tid);
  });

  it("tidspunktet er da vi DØMTE, ikke da vi nåede at sende", () => {
    const tid = new Date("2026-09-22T18:35:00.000Z");
    expect(byggFremmoede("deltog", input({ tid }))!.tid).toBe(tid);
  });
});

describe("byggFremmoede — når der ikke skal sendes", () => {
  it("«ingen» giver null", () => {
    expect(byggFremmoede("ingen", input())).toBeNull();
  });
  it("uden brugbar mail giver null — Klaviyos profil findes på mailen", () => {
    for (const email of [null, undefined, "", "   ", "ikke-en-mail"]) {
      expect(byggFremmoede("deltog", input({ email }))).toBeNull();
    }
  });
  it("mailen normaliseres til små bogstaver", () => {
    expect(byggFremmoede("deltog", input())!.email).toBe("test.person@gmail.com");
  });
});

describe("kæden fra webinarDom til Klaviyo-kroppen", () => {
  const nu = new Date("2026-09-22T18:35:00.000Z");
  const session = "2026-09-22T17:00:00.000Z";

  it("en der så 82 %: doemSetGrad → set → «Deltog i webinar» med tallet", () => {
    const grad = doemSetGrad({ set_procent: 82, state: "Watched", session_tid: session }, nu);
    expect(grad).toBe("set");
    const h = byggFremmoede(afgoerOvergang("tilmeldt", grad), input({ grad, setProcent: 82 }))!;
    const krop = byggHaendelse(h) as Record<string, any>;
    expect(krop.data.attributes.metric.data.attributes.name).toBe("Deltog i webinar");
    expect(krop.data.attributes.properties.set_procent).toBe(82);
    expect(krop.data.attributes.unique_id).toBe("reg_123:set");
  });

  it("en der ikke kom: state Missed → «Moedte ikke op», uden procent", () => {
    const grad = doemSetGrad({ set_procent: null, state: "Missed", session_tid: session }, nu);
    expect(grad).toBe("moedte_ikke");
    const h = byggFremmoede(afgoerOvergang(null, grad), input({ grad, setProcent: null }))!;
    const krop = byggHaendelse(h) as Record<string, any>;
    expect(krop.data.attributes.metric.data.attributes.name).toBe("Moedte ikke op");
    // null udelades af byggHaendelse: «vi ved det ikke» må ikke blive til et
    // segment, der matcher «har ingen procent».
    expect("set_procent" in krop.data.attributes.properties).toBe(false);
  });

  it("før sessionen: tilmeldt → intet sendes", () => {
    const foer = new Date("2026-09-20T09:00:00.000Z");
    const grad = doemSetGrad({ set_procent: null, state: "Registered", session_tid: session }, foer);
    expect(grad).toBe("tilmeldt");
    expect(afgoerOvergang(null, grad)).toBe("ingen");
  });
});
