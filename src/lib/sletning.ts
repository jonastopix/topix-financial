/**
 * src/lib/sletning.ts
 *
 * Spejlet i supabase/functions/_shared/sletning.ts — enhver ændring her
 * SKAL også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/sletningParitet.test.ts. Importstierne er den ENESTE
 * tilladte forskel mellem de to filer ud over filhovederne.
 *
 * Ren, testbar dom: skal en virksomheds data slettes NU, og ad hvilken
 * vej? Ingen I/O, ingen Supabase, ingen React — samme input giver altid
 * samme output. Samme mønster som afgoerFornyelsestilstand.
 *
 * BAGGRUND (Alina-sagen, OVERLEVERING DEL 2, 8/9-2026): «Ja, slet min
 * data» skrev companies.offboarding_requested_at, som ingen læste — en
 * sletteanmodning lå 103 dage. Denne dom er den ene læser.
 *
 * TRE VEJE, besluttet af Jonas 8/9:
 *   1. anmodning      — medlemmet trykkede «slet min data»: 7 dage efter
 *                       offboarding_requested_at. Fristen er MEDLEMMETS
 *                       fortrydelsesret, ikke vores betænkningstid.
 *   2. tilbud_ubesvaret — medlemmet fik et tilbud (beslutning = tilbyd)
 *                       og svarede aldrig: 30 dage efter tilbudsvinduet
 *                       lukkede. Vinduet lukker dag 15 efter slutdatoen
 *                       (udloebet_vindue_lukket i fornyelsesmotoren), så
 *                       fristen er dag 45 efter slutdatoen.
 *   3. aldrig_tilbudt — der blev aldrig tilbudt noget (ingen beslutning,
 *                       eller tilbyd_ikke): samme 30 dage, regnet fra
 *                       slutdatoen plus de 14 dage vinduet ville have
 *                       varet — også dag 45. Ellers ligger de for evigt,
 *                       som de otte gjorde.
 *
 * AFGRÆNSNINGEN AF DE GAMLE: vej 2 og 3 gælder KUN virksomheder inden
 * for fornyelsesordningen — slutdato EFTER FORNYELSE_IKRAFT_DATO
 * (10/9-2026). De syv der står som 'tidligere' med slutdato maj–september
 * er en beslutning Jonas traf 8/9, ikke en regel; de køres som engangssag
 * med eksplicitte id'er. Grænsen er den SAMME som fornyelsesmotorens
 * «uden_for_ordningen» (slutdag på eller før 10/9), så der findes ét
 * skel, ikke to. Vej 1 er IKKE gated på ikrafttrædelsen: en anmodning er
 * en anmodning, uanset hvornår kontrakten udløb. Alinas række (anmodning
 * 2/6, slettet i hånden 8/9) stemples derfor i migrationen der opretter
 * data_slettet_at, så den ikke bliver kandidat igen.
 *
 * Dage regnes i hele kalenderdage på UTC-komponenter, som i fornyelse.ts,
 * så tallet er det samme uanset maskinens tidszone.
 */
import {
  afgoerFornyelsestilstand,
  FORNYELSE_IKRAFT_DATO,
  FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE,
  type Fornyelsesbeslutning,
} from "./fornyelse";

/** Vej 1: hele dage efter offboarding_requested_at før der slettes. Dag 7 sletter; dag 6 gør ikke. */
export const SLETTEFRIST_ANMODNING_DAGE = 7;

/** Vej 2 og 3: hele dage efter at tilbudsvinduet lukkede (eller ville have lukket). */
export const SLETTEFRIST_EFTER_VINDUE_DAGE = 30;

/**
 * Vej 2 og 3 målt fra slutdatoen: vinduet lukker dag 15 (dag 0–14 er
 * inde, jf. fornyelse.ts), plus 30 dage = dag 45. Dag 45 sletter; dag 44
 * gør ikke.
 */
export const SLETTEFRIST_EFTER_SLUTDATO_DAGE =
  FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE + 1 + SLETTEFRIST_EFTER_VINDUE_DAGE;

export type Slettevej = "anmodning" | "tilbud_ubesvaret" | "aldrig_tilbudt";

export interface SletningInput {
  contract_end_date: string | null;
  offboarding_requested_at: string | null;
  beslutning: Fornyelsesbeslutning | null;
  /** companies.status — bæres i grunden, dømmer ikke. */
  status: string | null;
  /** companies.data_slettet_at — sat = allerede slettet, aldrig igen. */
  data_slettet_at: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
}

export interface Slettedom {
  skal_slettes: boolean;
  vej: Slettevej | null;
  /** Skrevet til at blive læst i tørkørslens rapport. */
  grund: string;
  /** Fristens kalenderdag (UTC, YYYY-MM-DD) for den vej der gælder; null når ingen vej gælder. */
  frist: string | null;
  /** Hele dage siden fristen (negativ = fristen er ikke nået); null uden frist. */
  dage_over_frist: number | null;
}

const MS_PER_DOEGN = 86_400_000;

function utcMidnat(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function kalenderdag(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function utcKalenderdato(s: string): string | null {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Hele UTC-kalenderdage fra `fra` til `now` (positivt når now er efter). */
function dageSiden(fra: string, now: Date): number | null {
  const d = new Date(fra);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((utcMidnat(now) - utcMidnat(d)) / MS_PER_DOEGN);
}

function fristDag(fra: string, dage: number): string | null {
  const d = new Date(fra);
  if (Number.isNaN(d.getTime())) return null;
  return kalenderdag(utcMidnat(d) + dage * MS_PER_DOEGN);
}

const NEJ = (grund: string): Slettedom => ({
  skal_slettes: false,
  vej: null,
  grund,
  frist: null,
  dage_over_frist: null,
});

/**
 * Dommen. Rækkefølgen er bindende:
 *   0. allerede slettet → nej, altid.
 *   1. anmodning har forrang: har medlemmet bedt, gælder vej 1 alene —
 *      også selv om slutdatoen ville give vej 2/3 senere eller tidligere.
 *   2. ingen slutdato, eller slutdato på/før ikrafttrædelsen → nej (de
 *      gamle er en beslutning, ikke en regel).
 *   3. fornyelsesmotoren dømmer tilstanden; kun de udløbne tilstande kan
 *      give vej 2/3, og aktivt abonnement (selvbetjener) giver aldrig
 *      sletning.
 */
export function afgoerSletning(input: SletningInput, now: Date = new Date()): Slettedom {
  if (input.data_slettet_at) {
    return NEJ(`allerede slettet ${utcKalenderdato(input.data_slettet_at) ?? input.data_slettet_at}`);
  }

  // ── Vej 1: medlemmets egen anmodning ──
  if (input.offboarding_requested_at) {
    const dage = dageSiden(input.offboarding_requested_at, now);
    const frist = fristDag(input.offboarding_requested_at, SLETTEFRIST_ANMODNING_DAGE);
    if (dage === null || frist === null) {
      return NEJ("offboarding_requested_at kan ikke læses som dato — afgøres af et menneske");
    }
    const dage_over_frist = dage - SLETTEFRIST_ANMODNING_DAGE;
    if (dage_over_frist >= 0) {
      return {
        skal_slettes: true,
        vej: "anmodning",
        grund: `medlemmet bad om sletning ${utcKalenderdato(input.offboarding_requested_at)}; fristen (${SLETTEFRIST_ANMODNING_DAGE} dage) udløb ${frist}`,
        frist,
        dage_over_frist,
      };
    }
    return {
      skal_slettes: false,
      vej: "anmodning",
      grund: `medlemmet bad om sletning ${utcKalenderdato(input.offboarding_requested_at)}; fortrydelsesfristen løber til ${frist}`,
      frist,
      dage_over_frist,
    };
  }

  // ── Vej 2 og 3: kun inden for ordningen ──
  if (!input.contract_end_date) {
    return NEJ("ingen slutdato — intet at regne en frist fra");
  }
  const slutdag = utcKalenderdato(input.contract_end_date);
  if (slutdag === null) {
    return NEJ("slutdatoen kan ikke læses som dato — afgøres af et menneske");
  }
  if (slutdag <= FORNYELSE_IKRAFT_DATO) {
    return NEJ(
      `slutdato ${slutdag} er på eller før ordningens ikrafttrædelse ${FORNYELSE_IKRAFT_DATO} — uden for ordningen; de gamle er en beslutning, ikke en regel`,
    );
  }

  const tilstand = afgoerFornyelsestilstand(
    {
      contract_end_date: input.contract_end_date,
      subscription_status: input.subscription_status,
      subscription_current_period_end: input.subscription_current_period_end,
      beslutning: input.beslutning,
    },
    now,
  );

  if (tilstand.tier !== "expired") {
    return NEJ(`medlemskabet er ikke udløbet (${tilstand.status}, tier ${tilstand.tier})`);
  }

  const frist = fristDag(input.contract_end_date, SLETTEFRIST_EFTER_SLUTDATO_DAGE);
  const dageEfterSlut = tilstand.dage_til_udloeb === null ? null : -tilstand.dage_til_udloeb;
  if (frist === null || dageEfterSlut === null) {
    return NEJ("slutdatoen kan ikke læses som dato — afgøres af et menneske");
  }
  const dage_over_frist = dageEfterSlut - SLETTEFRIST_EFTER_SLUTDATO_DAGE;
  const vej: Slettevej = input.beslutning === "tilbyd" ? "tilbud_ubesvaret" : "aldrig_tilbudt";
  const hvad =
    vej === "tilbud_ubesvaret"
      ? `tilbuddet blev aldrig besvaret; vinduet lukkede dag ${FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE + 1} efter slutdatoen ${slutdag}`
      : `der blev aldrig tilbudt noget (${input.beslutning ?? "ingen beslutning"}); vinduet ville have lukket dag ${FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE + 1} efter slutdatoen ${slutdag}`;

  if (dage_over_frist >= 0) {
    return {
      skal_slettes: true,
      vej,
      grund: `${hvad}; ${SLETTEFRIST_EFTER_VINDUE_DAGE} dage senere er ${frist} passeret`,
      frist,
      dage_over_frist,
    };
  }
  return {
    skal_slettes: false,
    vej,
    grund: `${hvad}; slettes tidligst ${frist}`,
    frist,
    dage_over_frist,
  };
}
