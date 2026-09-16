import { describe, expect, it } from "vitest";
import {
  SVAR_SLETTET_TEKST,
  SVAR_UDDRAG_MAKS,
  citatTilstand,
  kanBesvares,
  svarUddrag,
  svarerPaaTekst,
  type SvarBesked,
} from "@/lib/chatSvar";

// Svar på en konkret besked (Jonas 16/9, form A): citatet følger den rigtige
// besked — alle grene af tilstanden, uddraget som ren tekst, og hvem der kan
// besvares. Databasens værn (20260917090000) dømmer det samme.

const b = (id: string, content: string, ekstra: Partial<SvarBesked> = {}): SvarBesked => ({
  id,
  sender_id: "u1",
  content,
  message_type: "user",
  context_type: null,
  ...ekstra,
});

describe("svarUddrag — ren tekst, én linje, højst 120 tegn", () => {
  it("fjerner Tiptap-HTML og entiteter, samler linjeskift til ét mellemrum", () => {
    expect(svarUddrag("<p>Hej Jonas, </p><p>Jo, det virkede &amp; ok!<br>Tak</p>")).toBe("Hej Jonas, Jo, det virkede & ok! Tak");
  });
  it("klipper med «…» ved grænsen — aldrig et halvt tag, aldrig mere end SVAR_UDDRAG_MAKS", () => {
    const lang = "x".repeat(300);
    const u = svarUddrag(`<p>${lang}</p>`);
    expect(u.length).toBe(SVAR_UDDRAG_MAKS);
    expect(u.endsWith("…")).toBe(true);
  });
  it("tom besked og panernes «📎» bliver «📎 Vedhæftning»", () => {
    expect(svarUddrag("")).toBe("📎 Vedhæftning");
    expect(svarUddrag("📎")).toBe("📎 Vedhæftning");
    expect(svarUddrag(null)).toBe("📎 Vedhæftning");
  });
});

describe("kanBesvares — kun rigtige samtalebeskeder", () => {
  it("user uden context → ja; user med context report → ja (rapportbeskeder er samtale)", () => {
    expect(kanBesvares({ message_type: "user", context_type: null })).toBe(true);
    expect(kanBesvares({ message_type: "user", context_type: "report" })).toBe(true);
    expect(kanBesvares({})).toBe(true); // message_type mangler i typen → DB-default 'user'
  });
  it("system, ai og session_prep → nej", () => {
    expect(kanBesvares({ message_type: "system", context_type: "agent" })).toBe(false);
    expect(kanBesvares({ message_type: "ai", context_type: null })).toBe(false);
    expect(kanBesvares({ message_type: "user", context_type: "session_prep" })).toBe(false);
  });
});

describe("citatTilstand — de fire grene", () => {
  const visning = [b("m1", "<p>Har du set tallene for juli?</p>"), b("m2", "Ja")];

  it("ingen: svar_paa_id mangler", () => {
    expect(citatTilstand({ svarPaaId: null, beskeder: visning })).toEqual({ art: "ingen" });
    expect(citatTilstand({ svarPaaId: undefined, beskeder: visning })).toEqual({ art: "ingen" });
  });

  it("citat fra visningen — og citatet FØLGER beskeden: rettes content, ændres uddraget", () => {
    const t = citatTilstand({ svarPaaId: "m1", beskeder: visning });
    expect(t).toEqual({ art: "citat", besked: visning[0], uddrag: "Har du set tallene for juli?" });
    const rettet = [b("m1", "<p>Har du set tallene for AUGUST?</p>")];
    expect(citatTilstand({ svarPaaId: "m1", beskeder: rettet })).toMatchObject({ art: "citat", uddrag: "Har du set tallene for AUGUST?" });
  });

  it("henter: ikke i visningen (ældre end de 500) og opslaget er ikke kommet — aldrig «slettet» i mellemtiden", () => {
    expect(citatTilstand({ svarPaaId: "gammel", beskeder: visning })).toEqual({ art: "henter" });
    expect(citatTilstand({ svarPaaId: "gammel", beskeder: visning, hentet: undefined })).toEqual({ art: "henter" });
  });

  it("citat fra opslaget: originalen findes, men stod ikke i visningen", () => {
    const hentet = b("gammel", "<p>Fra marts</p>");
    expect(citatTilstand({ svarPaaId: "gammel", beskeder: visning, hentet })).toEqual({ art: "citat", besked: hentet, uddrag: "Fra marts" });
  });

  it("slettet: opslaget gav nul rækker → «Svar på en slettet besked»", () => {
    expect(citatTilstand({ svarPaaId: "vaek", beskeder: visning, hentet: null })).toEqual({ art: "slettet" });
    expect(SVAR_SLETTET_TEKST).toBe("Svar på en slettet besked");
  });

  it("visningen vinder over opslaget (samme id begge steder → visningens tekst, den nyeste)", () => {
    const hentet = b("m1", "gammel tekst");
    expect(citatTilstand({ svarPaaId: "m1", beskeder: visning, hentet })).toMatchObject({ uddrag: "Har du set tallene for juli?" });
  });
});

describe("svarerPaaTekst — linjen over sendefeltet", () => {
  it("navn og uddrag", () => {
    expect(svarerPaaTekst("Morten", "Har du set tallene?")).toBe("Svarer på Morten: Har du set tallene?");
  });
  it("uden navn: «beskeden»", () => {
    expect(svarerPaaTekst(null, "x")).toBe("Svarer på beskeden: x");
    expect(svarerPaaTekst("  ", "x")).toBe("Svarer på beskeden: x");
  });
});
