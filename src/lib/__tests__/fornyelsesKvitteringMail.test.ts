import { describe, expect, it } from "vitest";
import {
  formatKrOere,
  FORNYELSE_FORSIDE_URL,
  kvitteringMail,
  LABEL_KVITTERING,
} from "../../../supabase/functions/_shared/fornyelsesMail.ts";

// Kvitteringen efter fornyelsen (8/9): ren funktion i _shared, testet
// herfra som varslerne (fornyelsesMail.test.ts). Beløbene kommer i ØRE
// som Stripe og company_perioder bærer dem; slutdatoen som tekst.

const BASE = { fornavn: "Philip", virksomhed: "PHILBERT ApS", nySlutDato: "29. september 2027" };

describe("formatKrOere — ører må ikke forsvinde", () => {
  it("hele beløb uden decimaler, skæve med to", () => {
    expect(formatKrOere(2_000_000)).toBe("20.000");
    expect(formatKrOere(218_750)).toBe("2.187,50");
    expect(formatKrOere(1_000_000 / 12 * 12)).toBe("10.000");
    expect(formatKrOere(105)).toBe("1,05");
  });
});

describe("kvitteringMail", () => {
  it("emnet bærer den nye slutdato, og labelen er husets", () => {
    const m = kvitteringMail({ ...BASE, betalingsmodel: "fuld", samletOere: 2_000_000 });
    expect(m.subject).toBe("Tak — dit medlemskab er fornyet til 29. september 2027");
    expect(LABEL_KVITTERING).toBe("fornyelse-kvittering");
  });

  it("fuld: tak, virksomhed, beløb betalt på én gang, slutdato, link, Jonas' underskrift", () => {
    const m = kvitteringMail({ ...BASE, betalingsmodel: "fuld", samletOere: 2_000_000 });
    expect(m.html).toContain("Kære Philip,");
    expect(m.html).toContain("Tak for fornyelsen");
    expect(m.html).toContain("PHILBERT ApS");
    expect(m.html).toContain("20.000 kr. ekskl. moms, betalt på én gang");
    expect(m.html).toContain("løber til og med 29. september 2027");
    expect(m.html).toContain(FORNYELSE_FORSIDE_URL);
    expect(m.html).toContain("Gå til The Boardroom");
    expect(m.html).toContain("Jonas Herlev");
    expect(m.html).toContain("kommer fra Stripe i en separat mail");
  });

  it("rate2: to rater à halvdelen — nu og om seks måneder", () => {
    const m = kvitteringMail({ ...BASE, betalingsmodel: "rate2", samletOere: 2_000_000 });
    expect(m.html).toContain("i to rater à 10.000 kr.");
    expect(m.html).toContain("den første er trukket nu, den anden om seks måneder");
  });

  it("rate12: tolv rater med 5 %-tillægget og ører — 21.000 i alt, 1.750 pr. rate", () => {
    const m = kvitteringMail({ ...BASE, betalingsmodel: "rate12", samletOere: 2_100_000 });
    expect(m.html).toContain("21.000 kr. ekskl. moms i tolv rater à 1.750 kr.");
    expect(m.html).toContain("én gang om måneden i elleve måneder");
  });

  it("rate12 med skæve rater bærer ørerne: 26.250 / 12 = 2.187,50", () => {
    const m = kvitteringMail({ ...BASE, betalingsmodel: "rate12", samletOere: 2_625_000 });
    expect(m.html).toContain("26.250 kr. ekskl. moms i tolv rater à 2.187,50 kr.");
  });

  it("uden fornavn: «Kære,» — aldrig «Kære ,»", () => {
    const m = kvitteringMail({ ...BASE, fornavn: null, betalingsmodel: "fuld", samletOere: 2_000_000 });
    expect(m.html).toContain("Kære,");
    expect(m.html).not.toContain("Kære ,");
  });

  it("virksomhedens navn escapes af layoutet", () => {
    const m = kvitteringMail({ ...BASE, virksomhed: "A & B <ApS>", betalingsmodel: "fuld", samletOere: 2_000_000 });
    expect(m.html).toContain("A &amp; B &lt;ApS&gt;");
    expect(m.html).not.toContain("<ApS>");
  });

  it("ingen «by Topix», ingen «2 hverdage»", () => {
    const m = kvitteringMail({ ...BASE, betalingsmodel: "fuld", samletOere: 2_000_000 });
    expect(m.html).not.toContain("by Topix");
    expect(m.html).not.toMatch(/hverdage/);
  });
});
