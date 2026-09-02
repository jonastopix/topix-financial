/**
 * supabase/functions/_shared/indgangspris.ts
 *
 * Spejlet ordret fra src/lib/indgangspris.ts — enhver ændring her SKAL
 * også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/indgangsprisParitet.test.ts.
 *
 * Filen har nul imports og kan derfor loades af både Vite/Vitest (Node)
 * og Deno uden ændringer.
 *
 * Indgangsprisen som ren funktion. Ingen IO, ingen datoer, ingen Stripe.
 * Samme mønster som fornyelsespris.ts: motoren afgør, fladen viser.
 *
 * Reglen (docs/fornyelseskaeden-1-september.md §1, docs/indgangen-design.md
 * §12): et nyt medlem kommer ind til ét af to PRISNIVEAUER, som rådgiveren
 * beslutter — normalt 50.000, undtagelsesvis 40.000 (Nordic By Hand 25/8).
 * Medlemmet vælger ikke niveauet, kun betalingsmodellen. Niveauet ligger i
 * company_betalingslink.prisniveau_oere (migration 20260902080000) og må
 * aldrig ligge i linket (§15).
 *
 * Hvorfor ikke beregnFornyelsespris: samme tillæg og samme trækantal, men
 * andre prispunkter (15/20/25.000 mod 40/50.000) og andet nøglepræfiks
 * (fornyelse_ mod nyt_). Målt 2/9: den giver ukendt_prispunkt for begge
 * indgangsniveauer. To motorer, fordi kataloget har to sæt priser.
 *
 * Kataloget i Stripe (acct_1U6mzp3CvBmCx5Pt, oprettet 1-2/9) har præcis
 * SEKS indgangspriser med lookup_keys nyt_<kr>_<model>. Lander beregningen
 * uden for dem, findes der ingen pris at sende nogen hen til — og så skal
 * det fejle højt frem for at ramme det nærmeste.
 *
 * Bemærk skelnen (rettelsen 1/9 i fornyelseskæde-dokumentet): grundbeløbet
 * her er LISTEPRISEN medlemmet kommer ind på — det der senere skrives som
 * companies.indgangspris_oere. Ratetillægget er finansiering, ikke pris:
 * en der betaler 52.500 i tolv rater er kommet ind på 50.000.
 */

export type Betalingsmodel = "fuld" | "rate2" | "rate12";

/**
 * Prisniveauer i øre der findes som priser i Stripe. Stigende rækkefølge.
 * Ændres listen, skal kataloget ændres først — og omvendt.
 */
export const INDGANGS_PRISPUNKTER_OERE = [4_000_000, 5_000_000] as const;

/** Tillæg ved 12 rater. To rater og fuld betaling bærer intet tillæg. */
export const RATE12_TILLAEG_PCT = 5;

export interface IndgangsprisInput {
  /** company_betalingslink.prisniveau_oere — NULL = rådgiveren har ikke sat prisen. */
  prisniveau_oere: number | null;
  betalingsmodel: Betalingsmodel;
}

export interface IndgangsprisOk {
  ok: true;
  /** Listeprisen i øre — det der bliver companies.indgangspris_oere ved betaling. */
  grundbeloeb_oere: number;
  /** Det medlemmet betaler i alt for modellen, inkl. evt. tillæg. */
  samlet_oere: number;
  /** Pr. træk. Lig samlet_oere ved fuld betaling. */
  rate_oere: number;
  antal_traek: number;
  /** Stripe lookup_key — nøglen, aldrig et price-id (_shared/stripePris.ts). */
  lookup_key: string;
}

export interface IndgangsprisFejl {
  ok: false;
  grund: "intet_prisniveau" | "ukendt_prispunkt";
  detalje: string;
}

export type IndgangsprisResultat = IndgangsprisOk | IndgangsprisFejl;

export function erFejl(r: IndgangsprisResultat): r is IndgangsprisFejl {
  return r.ok === false;
}

/** Mulighed i et samlet tilbud — samme felter som hent-fornyelsestilbuds `muligheder[]`. */
export interface Indgangsmulighed {
  betalingsmodel: Betalingsmodel;
  samlet_oere: number;
  rate_oere: number;
  antal_traek: number;
  lookup_key: string;
}

export interface IndgangsmulighederOk {
  ok: true;
  grundbeloeb_oere: number;
  /** I rækkefølgen fuld, rate2, rate12 — kun dem der lykkedes. */
  muligheder: Indgangsmulighed[];
}

export type IndgangsmulighederResultat = IndgangsmulighederOk | IndgangsprisFejl;

/** Rækkefølgen betalingssiden viser — og den rækkefølge muligheder[] altid har. */
const MODELLER: readonly Betalingsmodel[] = ["fuld", "rate2", "rate12"];

const TRAEK: Record<Betalingsmodel, number> = { fuld: 1, rate2: 2, rate12: 12 };

/**
 * Niveau-dommen, delt af begge indgange: null → intet_prisniveau; uden for
 * kataloget → ukendt_prispunkt. Prisniveauet SKAL være ét af punkterne.
 * Kataloget har præcis disse; et beløb udenfor har ingen pris at sende
 * nogen hen til, og det skal fejle højt frem for at ramme det nærmeste.
 */
function tjekPrisniveau(prisniveau_oere: number | null | undefined): number | IndgangsprisFejl {
  if (prisniveau_oere === null || prisniveau_oere === undefined) {
    return {
      ok: false,
      grund: "intet_prisniveau",
      detalje: "Virksomheden har intet prisniveau — rådgiveren har ikke sat prisen endnu.",
    };
  }
  if (!(INDGANGS_PRISPUNKTER_OERE as readonly number[]).includes(prisniveau_oere)) {
    return {
      ok: false,
      grund: "ukendt_prispunkt",
      detalje:
        `Prisniveauet ${prisniveau_oere / 100} kr. findes ikke som pris i Stripe. ` +
        `Kendte: ${INDGANGS_PRISPUNKTER_OERE.map((p) => p / 100).join(", ")}.`,
    };
  }
  return prisniveau_oere;
}

/**
 * Én betalingsmodel for ét prisniveau.
 *
 * Regnestykket:
 *   fuld:    samlet = grundbeløb;                 rate = samlet / 1
 *   rate2:   samlet = grundbeløb (intet tillæg);  rate = samlet / 2
 *   rate12:  samlet = round(grundbeløb × 1,05);   rate = samlet / 12
 *
 *   5.000.000 øre → rate12: 5.250.000 → 437.500 øre (4.375,00 kr.) × 12
 *   4.000.000 øre → rate12: 4.200.000 → 350.000 øre (3.500,00 kr.) × 12
 *   5.000.000 øre → rate2:  5.000.000 → 2.500.000 øre (25.000 kr.) × 2
 *   4.000.000 øre → rate2:  4.000.000 → 2.000.000 øre (20.000 kr.) × 2
 *
 * Begge kendte niveauer går op i hele ører ved alle tre modeller. Et
 * resultat der ikke gør (fx et fremtidigt niveau på 45.000: 4.725.000 / 12
 * = 393.750 går op — men 4.725.000 er ikke i kataloget), stoppes af
 * prispunkt-tjekket først; heltalstjekket står som sidste værn, så en ny
 * pris i listen aldrig kan give en rate Stripe ikke kan opkræve.
 */
export function beregnIndgangspris(input: IndgangsprisInput): IndgangsprisResultat {
  const { prisniveau_oere, betalingsmodel } = input;

  const niveau = tjekPrisniveau(prisniveau_oere);
  if (typeof niveau !== "number") return niveau;

  const grundbeloeb = niveau;
  const antal_traek = TRAEK[betalingsmodel];
  const samlet_oere =
    betalingsmodel === "rate12"
      ? Math.round((grundbeloeb * (100 + RATE12_TILLAEG_PCT)) / 100)
      : grundbeloeb;
  const rate_oere = samlet_oere / antal_traek;

  if (!Number.isInteger(rate_oere)) {
    return {
      ok: false,
      grund: "ukendt_prispunkt",
      detalje: `Raten ${rate_oere} øre er ikke et helt ørebeløb.`,
    };
  }

  return {
    ok: true,
    grundbeloeb_oere: grundbeloeb,
    samlet_oere,
    rate_oere,
    antal_traek,
    // Nøglerne findes i Stripe med præcis disse navne: nyt_50000_fuld,
    // nyt_50000_rate2, nyt_50000_rate12, nyt_40000_fuld, nyt_40000_rate2,
    // nyt_40000_rate12 (docs/fornyelseskaeden-1-september.md, rettelsen).
    lookup_key: `nyt_${grundbeloeb / 100}_${betalingsmodel}`,
  };
}

/**
 * Alle tre modeller for ét prisniveau — det betalingssiden viser.
 *
 * Samme svarform som hent-fornyelsestilbud ({ grundbeloeb_oere,
 * muligheder[] }), så betalingssiden og fornyelsesgaten kan formatere ens
 * (MembershipExpiredGate.beskrivMulighed). Fornyelsen har ikke brug for
 * denne funktion, fordi dens edge function selv løber modellerne igennem;
 * indgangen har, fordi den samme liste skal kunne bygges uden en edge
 * function bagved.
 *
 * Kun modeller der lykkes, kommer med. Fejler niveauet selv
 * (intet_prisniveau, ukendt_prispunkt), fejler hele svaret — der er ingen
 * halv prisliste at vise. Fejler én model på heltalstjekket, udelades den
 * og de øvrige returneres; med de to kendte niveauer sker det ikke (målt i
 * testen), men reglen står, så en fremtidig pris ikke kan skjule en fejl.
 */
export function alleIndgangsmuligheder(prisniveau_oere: number | null): IndgangsmulighederResultat {
  // Niveau-dommen afgøres én gang, før modellerne: den er den samme for
  // alle tre, og kalderen skal have den præcise grund, ikke en tom liste.
  const niveau = tjekPrisniveau(prisniveau_oere);
  if (typeof niveau !== "number") return niveau;

  const muligheder: Indgangsmulighed[] = [];
  for (const betalingsmodel of MODELLER) {
    const r = beregnIndgangspris({ prisniveau_oere: niveau, betalingsmodel });
    if (erFejl(r)) continue; // kun heltalstjekket kan fejle her — modellen udelades
    muligheder.push({
      betalingsmodel,
      samlet_oere: r.samlet_oere,
      rate_oere: r.rate_oere,
      antal_traek: r.antal_traek,
      lookup_key: r.lookup_key,
    });
  }

  if (muligheder.length === 0) {
    return {
      ok: false,
      grund: "ukendt_prispunkt",
      detalje: "Ingen af de tre betalingsmodeller gav en gyldig pris.",
    };
  }

  return { ok: true, grundbeloeb_oere: niveau, muligheder };
}
