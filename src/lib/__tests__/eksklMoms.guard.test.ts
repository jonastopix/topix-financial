import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (16/9-2026, Jonas: «Priserne vi vil se er dem ex. moms.»): de
// elleve steder platformen viser et beløb der ER ekskl. moms (listepriser,
// Stripe-priser med tax_behavior exclusive, company_perioder) SIGER det —
// «… kr. ekskl. moms», husets form. Kun ordet; ingen beløb eller regnestykke
// ændres. Kildelæsning (forsidenKaster.guard-mønstret) med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const VIRKSOMHED = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const STAMDATA = "src/components/hjemmebane/virksomhed/VirksomhedStamdata.tsx";
const INDSTILLINGER = "src/lib/hjemmebane/indstillinger.ts";
const BETAL = "src/pages/Betal.tsx";
const GATE = "src/components/MembershipExpiredGate.tsx";
const BAAND = "src/lib/hjemmebane/fornyelsesbaand.ts";

/** De elleve steder — hvert som den præcise streng kilden skal bære. */
export const STEDER: readonly { fil: string; hvad: string; streng: string }[] = [
  { fil: VIRKSOMHED, hvad: "Prisniveau", streng: '{formatKr(prisniveau)}{prisniveau != null && " ekskl. moms"}' },
  { fil: VIRKSOMHED, hvad: "Fornyelsespris", streng: '<Linje label="Fornyelsespris">{formatKr(c.fornyelsespris_oere)} ekskl. moms</Linje>' },
  { fil: STAMDATA, hvad: "prisknapperne", streng: '{arbejder === oere ? "Gemmer…" : `${formatKr(oere)} ekskl. moms`}' },
  { fil: INDSTILLINGER, hvad: "Aftalen: Pris", streng: "vaerdi: `${beloebKr(a.indgangspris_oere)} ekskl. moms for medlemskabet`" },
  { fil: INDSTILLINGER, hvad: "Aftalen: Fornyelsespris", streng: 'label: "Fornyelsespris", vaerdi: `${beloebKr(a.fornyelsespris_oere)} ekskl. moms`' },
  { fil: BETAL, hvad: "rate2", streng: "`2 rater à ${kr(m.rate_oere)} kr. ekskl. moms — nu og om 6 måneder`" },
  { fil: BETAL, hvad: "rate12", streng: "`12 rater à ${kr(m.rate_oere)} kr. ekskl. moms — i alt ${kr(m.samlet_oere)} kr. ekskl. moms`" },
  { fil: GATE, hvad: "rate2", streng: "`2 rater à ${kr(m.rate_oere)} kr. ekskl. moms — nu og om 6 måneder`" },
  { fil: GATE, hvad: "rate12", streng: "`12 rater à ${kr(m.rate_oere)} kr. ekskl. moms — i alt ${kr(m.samlet_oere)} kr. ekskl. moms`" },
  { fil: BAAND, hvad: "rate2", streng: "`2 rater à ${kr(m.rate_oere)} kr. ekskl. moms — nu og om 6 måneder`" },
  { fil: BAAND, hvad: "rate12", streng: "`12 rater à ${kr(m.rate_oere)} kr. ekskl. moms — i alt ${kr(m.samlet_oere)} kr. ekskl. moms`" },
];

/** Dommen: stedet bærer strengen, og den umærkede form findes ikke længere. */
export const stedetHolder = (kode: string, streng: string): boolean => {
  if (!kode.includes(streng)) return false;
  const umaerket = streng.replace(/ ekskl\. moms/g, "");
  return !kode.includes(umaerket);
};

describe("eksklMoms.guard — de elleve steder siger «ekskl. moms»", () => {
  it("elleve steder, seks filer", () => {
    expect(STEDER).toHaveLength(11);
    expect(new Set(STEDER.map((s) => s.fil)).size).toBe(6);
  });
  for (const s of STEDER) {
    it(`${s.fil.split("/").pop()} — ${s.hvad}`, () => {
      expect(stedetHolder(udenKommentarer(laes(s.fil)), s.streng)).toBe(true);
    });
  }
  it("selvbevis: en kopi hvor ordet er fjernet falder — for hvert af de elleve steder", () => {
    for (const s of STEDER) {
      const kode = udenKommentarer(laes(s.fil));
      const uden = kode.replace(s.streng, s.streng.replace(/ ekskl\. moms/g, ""));
      expect(uden, `${s.hvad}: kopien ændrede sig ikke`).not.toBe(kode);
      expect(stedetHolder(uden, s.streng), `${s.fil} ${s.hvad}`).toBe(false);
    }
  });
  it("selvbevis: kun det ene af to beløb mærket i rate12 falder (begge beløb skal bære ordet)", () => {
    const kode = udenKommentarer(laes(BETAL));
    const halvt = kode.replace("kr. ekskl. moms — i alt ${kr(m.samlet_oere)} kr. ekskl. moms", "kr. ekskl. moms — i alt ${kr(m.samlet_oere)} kr.");
    expect(halvt).not.toBe(kode);
    expect(stedetHolder(halvt, STEDER[6].streng)).toBe(false);
  });
});
