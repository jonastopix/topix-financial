import { describe, it, expect } from "vitest";
import { escHtml, escHtmlMedLinjeskift } from "../../../supabase/functions/_shared/htmlEscape.ts";
import {
  NAVN_FALLBACK,
  UDDRAG_MAKS_SAETNINGER,
  UDDRAG_MAKS_TEGN,
  opslagsMail,
  uddrag,
  visningsnavn,
} from "../../../supabase/functions/_shared/opslagsMail.ts";
import { samlNaevnteBrugere } from "../../../supabase/functions/_shared/communityNaevnte.ts";

// Opslagsmailen (3/9): escaping, uddrag og mailens dele. Datakilden er
// community_traade.indhold (ren tekst ved skrivning) + profiles + companies.

describe("escHtml — brugerskrevet tekst kan aldrig bære HTML", () => {
  it("escaper de fem tegn", () => {
    expect(escHtml(`<b onclick="x">a & 'b'</b>`)).toBe("&lt;b onclick=&quot;x&quot;&gt;a &amp; &#39;b&#39;&lt;/b&gt;");
  });
  it("null/undefined bliver tom streng", () => {
    expect(escHtml(null)).toBe("");
    expect(escHtml(undefined)).toBe("");
  });
  it("ren tekst passerer uændret, og {{body}}-pladsholderen røres ikke", () => {
    expect(escHtml("Dine tal er klar. Æøå")).toBe("Dine tal er klar. Æøå");
    expect(escHtml("{{body}}")).toBe("{{body}}");
  });
  it("linjeskift bliver <br> kun i linjeskift-varianten", () => {
    expect(escHtml("a\nb")).toBe("a\nb");
    expect(escHtmlMedLinjeskift("a\r\nb<")).toBe("a<br>b&lt;");
  });
});

describe("uddrag — de første par sætninger, aldrig midt i et ord", () => {
  it("kort tekst kommer helt med, ikke afkortet", () => {
    expect(uddrag("Vi har landet en ny kunde. Det er stort!")).toEqual({
      tekst: "Vi har landet en ny kunde. Det er stort!",
      afkortet: false,
    });
  });
  it("tom/null giver tom tekst", () => {
    expect(uddrag(null)).toEqual({ tekst: "", afkortet: false });
    expect(uddrag("   ")).toEqual({ tekst: "", afkortet: false });
  });
  it("whitespace normaliseres", () => {
    expect(uddrag("Hej   verden.\n\nMere.").tekst).toBe("Hej verden. Mere.");
  });
  it("højst tre sætninger, også når teksten er kort", () => {
    const r = uddrag("En. To. Tre. Fire. Fem.");
    expect(r.tekst).toBe("En. To. Tre.");
    expect(r.afkortet).toBe(true);
    expect(UDDRAG_MAKS_SAETNINGER).toBe(3);
  });
  it("hele sætninger inden for grænsen, ingen «…» ved sætningsgrænse", () => {
    const s1 = "A".repeat(120) + ".";
    const s2 = "B".repeat(120) + "!";
    const s3 = "C".repeat(120) + "?";
    const r = uddrag(`${s1} ${s2} ${s3}`);
    expect(r.tekst).toBe(`${s1} ${s2}`); // 241 tegn; tre ville være 362
    expect(r.afkortet).toBe(true);
    expect(r.tekst.endsWith("…")).toBe(false);
  });
  it("én lang sætning klippes ved ordgrænse med «…», under grænsen", () => {
    const ord = Array.from({ length: 80 }, (_, i) => `ord${i}`).join(" "); // ~450 tegn, ingen punktum
    const r = uddrag(ord);
    expect(r.afkortet).toBe(true);
    expect(r.tekst.endsWith("…")).toBe(true);
    expect(r.tekst.length).toBeLessThanOrEqual(UDDRAG_MAKS_TEGN);
    const udenEllipse = r.tekst.slice(0, -1);
    expect(ord.startsWith(udenEllipse)).toBe(true);
    expect(ord.charAt(udenEllipse.length)).toBe(" "); // klippet PÅ et mellemrum
  });
  it("efterhængende komma fjernes før «…»", () => {
    const tekst = "Vi arbejder på noget nyt, " + "x".repeat(300);
    const r = uddrag(tekst, 30);
    expect(r.tekst).toBe("Vi arbejder på noget nyt…");
  });
  it("ét ord længere end grænsen hårdklippes", () => {
    const r = uddrag("x".repeat(400), 50);
    expect(r.tekst.length).toBe(50);
    expect(r.tekst.endsWith("…")).toBe(true);
  });
  it("grænsen er 280 tegn", () => {
    expect(UDDRAG_MAKS_TEGN).toBe(280);
  });
});

describe("visningsnavn", () => {
  it("fallback når profilnavnet er tomt", () => {
    expect(visningsnavn(null)).toBe(NAVN_FALLBACK);
    expect(visningsnavn("  ")).toBe(NAVN_FALLBACK);
    expect(visningsnavn(" Mette Hansen ")).toBe("Mette Hansen");
  });
});

describe("opslagsMail — mailen", () => {
  const input = {
    traadId: "11111111-1111-1111-1111-111111111111",
    titel: "Hvem bruger e-conomic & Pleo?",
    indhold: "Vi overvejer at skifte. Hvad er jeres erfaringer? Alt input er velkomment.",
    forfatterNavn: "Mette Hansen",
    forfatterAvatarUrl: "https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar",
    forfatterVirksomhed: "Hansen & Co ApS",
  };

  it("bærer navn, virksomhed, portræt, titel, uddrag og knap ind til tråden", () => {
    const m = opslagsMail(input);
    expect(m.subject).toBe("Mette Hansen har skrevet i Community: Hvem bruger e-conomic & Pleo?");
    expect(m.html).toContain("Mette Hansen");
    expect(m.html).toContain("Hansen &amp; Co ApS");
    expect(m.html).toContain('<img src="https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar"');
    expect(m.html).toContain("Hvem bruger e-conomic &amp; Pleo?");
    expect(m.html).toContain("Vi overvejer at skifte. Hvad er jeres erfaringer? Alt input er velkomment.");
    expect(m.html).toContain('href="https://app.theboardroom.dk/community/11111111-1111-1111-1111-111111111111"');
    expect(m.html).toContain("Læs opslaget");
    expect(m.html).toContain("Administrer notifikationer");
    expect(m.uddrag.afkortet).toBe(false);
    expect(m.html).not.toContain("Der er mere i opslaget");
  });

  it("escaper brugerskrevet HTML i navn, virksomhed, titel og uddrag", () => {
    const m = opslagsMail({
      ...input,
      forfatterNavn: `<img src=x onerror="alert(1)">`,
      forfatterVirksomhed: "<b>Firma</b>",
      titel: "<script>alert(1)</script>",
      indhold: 'Klik <a href="https://ond.dk">her</a>.',
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<b>Firma</b>");
    expect(m.html).not.toContain('<a href="https://ond.dk">');
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(m.html).toContain("Klik &lt;a href=&quot;https://ond.dk&quot;&gt;her&lt;/a&gt;.");
    // Kun husets eget portræt-<img> må findes — og det er ikke med, når avataren er en URL uden HTML.
    expect(m.html.match(/<img /g)?.length ?? 0).toBe(1);
  });

  it("uden avatar: initial-cirkel, intet <img>", () => {
    const m = opslagsMail({ ...input, forfatterAvatarUrl: null });
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain(">M</div>");
  });

  it("uden navn og virksomhed: fallback-navn, ingen virksomhedslinje, tom cirkel", () => {
    const m = opslagsMail({ ...input, forfatterNavn: "", forfatterVirksomhed: null, forfatterAvatarUrl: "" });
    expect(m.subject).toContain(`${NAVN_FALLBACK} har skrevet i Community`);
    expect(m.html).toContain(NAVN_FALLBACK);
    expect(m.html).not.toContain("<img");
    expect(m.text).toContain(`${NAVN_FALLBACK} har skrevet et nyt opslag i Community.`);
  });

  it("afkortet opslag siger at der er mere, i både html og tekst", () => {
    const m = opslagsMail({ ...input, indhold: "En. To. Tre. Fire." });
    expect(m.uddrag).toEqual({ tekst: "En. To. Tre.", afkortet: true });
    expect(m.html).toContain("Der er mere i opslaget.");
    expect(m.text).toContain("(Der er mere i opslaget.)");
  });

  it("tekstversionen er en rigtig tekst, ikke emnet", () => {
    const m = opslagsMail(input);
    expect(m.text).toBe(
      [
        "Mette Hansen (Hansen & Co ApS) har skrevet et nyt opslag i Community.",
        "",
        "Hvem bruger e-conomic & Pleo?",
        "",
        "Vi overvejer at skifte. Hvad er jeres erfaringer? Alt input er velkomment.",
        "",
        "Læs opslaget: https://app.theboardroom.dk/community/11111111-1111-1111-1111-111111111111",
      ].join("\n"),
    );
  });
});

describe("samlNaevnteBrugere — spejl af nævnelsesfunktionen", () => {
  it("finder userId/user_id i naevnelse-noder, dedupliceret, kun via content", () => {
    const dok = {
      type: "doc",
      content: [
        { type: "paragraph", content: [
          { type: "naevnelse", attrs: { userId: "a" } },
          { type: "text", text: "hej" },
          { type: "naevnelse", attrs: { user_id: " b " } },
          { type: "naevnelse", attrs: { userId: "a" } },
        ] },
        { type: "paragraph", andet: [{ type: "naevnelse", attrs: { userId: "c" } }] },
      ],
    };
    expect(samlNaevnteBrugere(dok)).toEqual(["a", "b"]);
    expect(samlNaevnteBrugere(null)).toEqual([]);
    expect(samlNaevnteBrugere("streng")).toEqual([]);
  });
});
