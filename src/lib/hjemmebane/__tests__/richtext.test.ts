import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasRichTextContent, renTekst } from "../richtext";
// Paritet mod spejlet i _shared: src/lib er kanonisk, spejlet bærer samme
// kode til Deno (send-slack-chat-notification). Samme input, samme tekst.
import { renTekst as renTekstSpejl } from "../../../../supabase/functions/_shared/richtext.ts";

describe("hasRichTextContent — tom-body-dommen", () => {
  it("null og tom streng er tomme", () => {
    expect(hasRichTextContent(null)).toBe(false);
    expect(hasRichTextContent("")).toBe(false);
  });

  it("richtext-skaller uden indhold er tomme", () => {
    expect(hasRichTextContent("<p></p>")).toBe(false);
    expect(hasRichTextContent("<p> </p>")).toBe(false);
    expect(hasRichTextContent("<p><br></p>")).toBe(false);
    expect(hasRichTextContent("&nbsp;")).toBe(false);
  });

  it("reelt indhold er ikke tomt", () => {
    expect(hasRichTextContent("<p>Ugens vigtigste pointe.</p>")).toBe(true);
    expect(hasRichTextContent("ren tekst uden tags")).toBe(true);
  });
});

/* Set på skærm 14/9 kl. 19:43: klokken viste ordret
   «<p>Hej Jonas, </p><p>Jo, det virkede ok! :-)<br>Når forretningen er så
   lille som her (går også ud fr…» — et uddrag må aldrig vise tags som tekst. */
const SET_PAA_SKAERM =
  "<p>Hej Jonas, </p><p>Jo, det virkede ok! :-)<br>Når forretningen er så lille som her (går også ud fra det er en enkeltmandsvirksomhed), er det fint.</p>";

describe("renTekst — et uddrag er ren tekst", () => {
  it("det der stod i klokken 14/9 bliver til ord uden én eneste tag", () => {
    const t = renTekst(SET_PAA_SKAERM);
    expect(t).toBe(
      "Hej Jonas, Jo, det virkede ok! :-) Når forretningen er så lille som her (går også ud fra det er en enkeltmandsvirksomhed), er det fint.",
    );
    expect(t).not.toMatch(/<[^>]*>/);
  });

  it("afsnit og linjeskift bliver til ét mellemrum — to afsnit klistrer ikke sammen", () => {
    expect(renTekst("<p>Første.</p><p>Andet.</p>")).toBe("Første. Andet.");
    expect(renTekst("<p>Linje<br>skift<br/>igen</p>")).toBe("Linje skift igen");
    expect(renTekst("<ul><li>et</li><li>to</li></ul>")).toBe("et to");
  });

  it("inline-tags giver intet mellemrum", () => {
    expect(renTekst("<p>Det er <strong>vigtigt</strong>, <em>meget</em>.</p>")).toBe("Det er vigtigt, meget.");
    expect(renTekst('<p>Se <a href="https://x.dk">linket</a>.</p>')).toBe("Se linket.");
  });

  it("entiteter oversættes", () => {
    expect(renTekst("<p>Tom &amp; Jerry &lt;3 &quot;ok&quot; &#39;ja&#39;&nbsp;nu</p>")).toBe("Tom & Jerry <3 \"ok\" 'ja' nu");
  });

  it("ren tekst uden tags går igennem; whitespace normaliseres", () => {
    expect(renTekst("Dans uden formatering")).toBe("Dans uden formatering");
    expect(renTekst("  to\n\nlinjer   her ")).toBe("to linjer her");
  });

  it("null, undefined og skaller giver tom streng", () => {
    expect(renTekst(null)).toBe("");
    expect(renTekst(undefined)).toBe("");
    expect(renTekst("<p></p>")).toBe("");
    expect(renTekst("<p><br></p>")).toBe("");
  });
});

describe("renTekst — paritet med supabase/functions/_shared/richtext.ts", () => {
  const cases: Array<[string, string | null | undefined]> = [
    ["set på skærm", SET_PAA_SKAERM],
    ["to afsnit", "<p>Første.</p><p>Andet.</p>"],
    ["inline", "<p>Det er <strong>vigtigt</strong>, <em>meget</em>.</p>"],
    ["entiteter", "<p>Tom &amp; Jerry &lt;3 &quot;ok&quot; &#39;ja&#39;&nbsp;nu</p>"],
    ["ren tekst", "Dans uden formatering"],
    ["whitespace", "  to\n\nlinjer   her "],
    ["skal", "<p><br></p>"],
    ["null", null],
    ["undefined", undefined],
  ];
  for (const [navn, input] of cases) {
    it(`paritet: ${navn}`, () => {
      expect(renTekstSpejl(input)).toBe(renTekst(input));
    });
  }
});

/* KILDEVÆRN: uddraget dannes i send-slack-chat-notification (preview → body i
   advisor_notifications OG notifications OG Slack). Det skal gå gennem
   renTekst FØR der klippes — ellers er de 250 tegn markup igen. */
describe("kildeværn: chat-notifikationens uddrag er ren tekst ved kilden", () => {
  const kilde = readFileSync(
    resolve(process.cwd(), "supabase/functions/send-slack-chat-notification/index.ts"),
    "utf8",
  );
  it("importerer renTekst fra spejlet og danner preview af den", () => {
    expect(kilde).toContain('import { renTekst } from "../_shared/richtext.ts"');
    expect(kilde).toMatch(/const preview = renTekst\(message\.content\)\.slice\(/);
    expect(kilde).not.toMatch(/const preview = \(message\.content \|\| ""\)/);
  });
});
