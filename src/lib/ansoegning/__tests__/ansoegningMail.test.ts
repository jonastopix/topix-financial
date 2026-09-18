import { describe, expect, it } from "vitest";
import { fornavnAf, genoptagLink, PAAMINDELSE_EMNE, paamindelsesMail } from "../../../../supabase/functions/_shared/ansoegningMail.ts";
import { ANSOEG_STI, TOKEN_PARAM } from "@/lib/ansoegning/skema";

const TOKEN = "3f2c9a4e-7d1b-4c1a-9e2f-0b6d8c5a1e77";

describe("påmindelsesmailen — én, med linket tilbage hvor de slap", () => {
  it("linket bærer tokenet som TOKEN_PARAM på ANSOEG_STI", () => {
    expect(genoptagLink(TOKEN)).toBe(`https://app.theboardroom.dk${ANSOEG_STI}?${TOKEN_PARAM}=${TOKEN}`);
  });

  it("tiltale med fornavn (husets tiltale: «Hej Anders,»); «Hej,» uden", () => {
    const med = paamindelsesMail({ navn: "Anders Andersen", token: TOKEN, besvarede: 7, ialt: 12 });
    expect(med.html).toContain("Hej Anders,");
    const uden = paamindelsesMail({ navn: null, token: TOKEN, besvarede: 7, ialt: 12 });
    expect(uden.html).toContain(">Hej,<");
    expect(fornavnAf("  ")).toBeNull();
  });

  it("siger hvor meget der mangler — 5, 1 eller kun send", () => {
    expect(paamindelsesMail({ navn: null, token: TOKEN, besvarede: 7, ialt: 12 }).html).toContain("Du mangler 5 spørgsmål");
    expect(paamindelsesMail({ navn: null, token: TOKEN, besvarede: 11, ialt: 12 }).html).toContain("Du mangler ét spørgsmål.");
    expect(paamindelsesMail({ navn: null, token: TOKEN, besvarede: 12, ialt: 12 }).html).toContain("der mangler kun at trykke send");
  });

  it("husets ramme: knap med linket, emnet er det faste, navnet er escapet, hilsen og kontaktadresse med", () => {
    const m = paamindelsesMail({ navn: "<b>Ole</b>", token: TOKEN, besvarede: 3, ialt: 12 });
    expect(m.subject).toBe(PAAMINDELSE_EMNE);
    expect(m.html).toContain(`href="${genoptagLink(TOKEN)}"`);
    expect(m.html).toContain("Fortsæt ansøgningen");
    expect(m.html).not.toContain("<b>Ole</b>");
    expect(m.html).toContain("&lt;b&gt;Ole&lt;/b&gt;");
    expect(m.html).toContain("Morten Larsen");
    expect(m.html).toContain("kontakt@theboardroom.dk");
    expect(m.html).toContain("The Boardroom · theboardroom.dk"); // indgangsMailHtml's footer — rammen er husets
  });
});
