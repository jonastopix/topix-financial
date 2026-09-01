/**
 * src/lib/fornyelsespris.ts
 *
 * Spejlet ordret i supabase/functions/_shared/fornyelsespris.ts — enhver
 * ændring her SKAL også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/fornyelsesprisParitet.test.ts.
 *
 * Filen har nul imports og kan derfor loades af både Vite/Vitest (Node)
 * og Deno uden ændringer.
 *
 * Fornyelsesprisen som ren funktion. Ingen IO, ingen datoer, ingen Stripe.
 * Samme mønster som fornyelse.ts: motoren afgør, fladen viser.
 *
 * Reglen: fornyelsen er 50 % af INDGANGSPRISEN — ikke af listeprisen i dag,
 * og ikke af det senest betalte. KJ AUTO kom ind på 30.000 i 2025 og fornyede
 * til 15.000 i 2026, hvor listeprisen var 50.000. Prisen følger aftalen.
 *
 * Afvigelser gemmes, ikke beregnes: fornyelsespris_oere vinder når den er sat.
 *
 * Kataloget i Stripe har præcis TRE fornyelses-prispunkter. Lander beregningen
 * uden for dem, findes der ingen pris at sende nogen hen til — og så skal det
 * fejle højt frem for at ramme det nærmeste.
 */

export type Betalingsmodel = "fuld" | "rate2" | "rate12";

/** Grundbeløb i øre der findes som pris i Stripe. */
export const PRISPUNKTER_OERE = [1_500_000, 2_000_000, 2_500_000] as const;

/** Tillæg ved 12 rater. To rater og fuld betaling bærer intet tillæg. */
export const RATE12_TILLAEG_PCT = 5;

export interface FornyelsesprisInput {
  indgangspris_oere: number | null;
  fornyelsespris_oere: number | null;
  betalingsmodel: Betalingsmodel;
}

export interface FornyelsesprisOk {
  ok: true;
  grundbeloeb_oere: number;
  samlet_oere: number;
  rate_oere: number;
  antal_traek: number;
  lookup_key: string;
  kilde: "beregnet" | "afvigelse";
}

export interface FornyelsesprisFejl {
  ok: false;
  grund: "ingen_indgangspris" | "ukendt_prispunkt";
  detalje: string;
}

export type FornyelsesprisResultat = FornyelsesprisOk | FornyelsesprisFejl;

export function erFejl(r: FornyelsesprisResultat): r is FornyelsesprisFejl {
  return r.ok === false;
}

const TRAEK: Record<Betalingsmodel, number> = { fuld: 1, rate2: 2, rate12: 12 };

export function beregnFornyelsespris(
  input: FornyelsesprisInput
): FornyelsesprisResultat {
  const { indgangspris_oere, fornyelsespris_oere, betalingsmodel } = input;

  let grundbeloeb: number;
  let kilde: "beregnet" | "afvigelse";

  if (fornyelsespris_oere !== null && fornyelsespris_oere !== undefined) {
    grundbeloeb = fornyelsespris_oere;
    kilde = "afvigelse";
  } else {
    if (indgangspris_oere === null || indgangspris_oere === undefined) {
      return {
        ok: false,
        grund: "ingen_indgangspris",
        detalje:
          "Virksomheden har hverken indgangspris eller en registreret afvigelse.",
      };
    }
    grundbeloeb = Math.floor(indgangspris_oere / 2);
    kilde = "beregnet";
  }

  if (!(PRISPUNKTER_OERE as readonly number[]).includes(grundbeloeb)) {
    return {
      ok: false,
      grund: "ukendt_prispunkt",
      detalje:
        `Grundbeløbet ${grundbeloeb / 100} kr. findes ikke som pris i Stripe. ` +
        `Kendte: ${PRISPUNKTER_OERE.map((p) => p / 100).join(", ")}.`,
    };
  }

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
    lookup_key: `fornyelse_${grundbeloeb / 100}_${betalingsmodel}`,
    kilde,
  };
}
