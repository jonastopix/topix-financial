import { describe, it, expect } from "vitest";
import {
  afgoerFornyelsestilstand,
  FORNYELSE_IKRAFT_DATO,
  FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE,
  FORNYELSES_VINDUE_DAGE,
  type Fornyelsesbeslutning,
  type FornyelseInput,
  type FornyelseStatus,
} from "@/lib/fornyelse";
// Parity import — the Deno copy is intentionally a mirror of the frontend
// copy (import path is the only allowed difference). We import it here so
// vitest fails loudly if the two drift.
import {
  afgoerFornyelsestilstand as afgoerFornyelsestilstandDeno,
  FORNYELSE_IKRAFT_DATO as FORNYELSE_IKRAFT_DATO_DENO,
  FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE as FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE_DENO,
  FORNYELSES_VINDUE_DAGE as FORNYELSES_VINDUE_DAGE_DENO,
} from "../../../supabase/functions/_shared/fornyelse.ts";

// Fast "now" EFTER ikrafttrædelsesdatoen (2026-09-10), så både
// uden_for_ordningen (slutdag ≤ 10/9, ikke-udløbet via aktivt abonnement)
// og de udløbne statusser (slutdag > 10/9, ingen abonnement) kan rammes
// med samme dato.
const NOW = new Date("2026-10-01T12:00:00Z");
const AKTIV_SUB = {
  subscription_status: "active",
  subscription_current_period_end: "2027-06-01T00:00:00Z",
};
const INGEN_SUB = {
  subscription_status: null,
  subscription_current_period_end: null,
};

/** Slutdato som "YYYY-MM-DD", n hele dage EFTER NOW's UTC-kalenderdag
    (negativt = før). Samme greb som betalingsfristParitet.forDage, blot
    regnet fra slutdatoen: dage_til_udloeb bliver præcis n. */
function slutdatoOmDage(n: number): string {
  return new Date(Date.UTC(2026, 9, 1) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Udtømmende liste over statusserne — husets mønster (FornyelsesSektion.
    STATUS_VISNING, VirksomhedView.FORNYELSE_LABEL): et Record over unionen,
    så tsc fejler den dag en status tilføjes i fornyelse.ts uden at stå her.
    Testen nedenfor kræver dernæst at hver status har mindst én case. */
const ALLE_STATUSSER: Record<FornyelseStatus, true> = {
  ingen_slutdato: true,
  uden_for_ordningen: true,
  selvbetjener: true,
  ophoert: true,
  udloebet_tilbyd: true,
  udloebet_tilbyd_ikke: true,
  udloebet_vindue_lukket: true,
  beslutning_mangler: true,
  klar_til_tilbud: true,
  klar_til_afsked: true,
  i_god_tid: true,
};

// Parity gate — the Deno copy at supabase/functions/_shared/fornyelse.ts
// must produce an identical Fornyelsestilstand (status, dage_til_udloeb,
// tier) for every input the frontend copy handles. All eleven statuses are
// covered, and each case asserts the intended status so no branch is
// silently missed. If this block fails, the two files have drifted and
// must be re-synced.
describe("afgoerFornyelsestilstand — parity between src/lib and supabase/functions/_shared", () => {
  const cases: Array<{ status: FornyelseStatus; input: FornyelseInput; navn?: string }> = [
    {
      status: "ingen_slutdato",
      input: { contract_end_date: null, ...INGEN_SUB, beslutning: null },
    },
    {
      // Slutdag ≤ 10/9, men aktivt abonnement holder tier fra "expired".
      status: "uden_for_ordningen",
      input: { contract_end_date: "2026-09-05", ...AKTIV_SUB, beslutning: null },
    },
    {
      // Slutdag > 10/9, kontrakt udløbet, men abonnementet løber.
      status: "selvbetjener",
      input: { contract_end_date: "2026-09-20", ...AKTIV_SUB, beslutning: null },
    },
    {
      status: "ophoert",
      input: { contract_end_date: "2026-09-20", ...INGEN_SUB, beslutning: null },
    },
    {
      status: "udloebet_tilbyd",
      input: { contract_end_date: "2026-09-20", ...INGEN_SUB, beslutning: "tilbyd" },
    },
    {
      status: "udloebet_tilbyd_ikke",
      input: { contract_end_date: "2026-09-20", ...INGEN_SUB, beslutning: "tilbyd_ikke" },
    },
    {
      // 31 dage til udløb — inden for 60-dages vinduet.
      status: "beslutning_mangler",
      input: { contract_end_date: "2026-11-01", ...INGEN_SUB, beslutning: null },
    },
    {
      status: "klar_til_tilbud",
      input: { contract_end_date: "2026-11-01", ...INGEN_SUB, beslutning: "tilbyd" },
    },
    {
      status: "klar_til_afsked",
      input: { contract_end_date: "2026-11-01", ...INGEN_SUB, beslutning: "tilbyd_ikke" },
    },
    {
      // 243 dage til udløb — uden for vinduet.
      status: "i_god_tid",
      input: { contract_end_date: "2027-06-01", ...INGEN_SUB, beslutning: null },
    },
    // ── Tilbudsvinduet efter slutdato (recon-fornyelsens-tilstande §2.3) ──
    // Disse cases blev tilføjet 7/9 med den DAVÆRENDE adfærd (udloebet_tilbyd
    // uanset dage) netop for at skiftet skulle blive synligt i diffen.
    // Skiftet ER sket 7/9 (samme dag): tilbudsvinduet efter udløb er bygget
    // som tilstanden udloebet_vindue_lukket, KUN efter beslutningen tilbyd.
    // Grænsen (FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE = 14) låses fra
    // begge sider: dag 14 er sidste dag med tilbud, dag 15 er første lukkede.
    // tilbyd_ikke har aldrig haft et tilbud og intet vindue: UÆNDRET.
    { navn: "udloebet_tilbyd dag 14 efter slutdato (sidste dag med tilbud)", status: "udloebet_tilbyd", input: { contract_end_date: slutdatoOmDage(-14), ...INGEN_SUB, beslutning: "tilbyd" } },
    { navn: "udloebet_vindue_lukket dag 15 efter slutdato (første lukkede)", status: "udloebet_vindue_lukket", input: { contract_end_date: slutdatoOmDage(-15), ...INGEN_SUB, beslutning: "tilbyd" } },
    { navn: "udloebet_tilbyd_ikke dag 15 efter slutdato", status: "udloebet_tilbyd_ikke", input: { contract_end_date: slutdatoOmDage(-15), ...INGEN_SUB, beslutning: "tilbyd_ikke" } },
    { navn: "udloebet_vindue_lukket dag 20 efter slutdato", status: "udloebet_vindue_lukket", input: { contract_end_date: slutdatoOmDage(-20), ...INGEN_SUB, beslutning: "tilbyd" } },
    { navn: "udloebet_tilbyd_ikke dag 20 efter slutdato", status: "udloebet_tilbyd_ikke", input: { contract_end_date: slutdatoOmDage(-20), ...INGEN_SUB, beslutning: "tilbyd_ikke" } },
    // Dag 45 låser RÆKKEFØLGEN af grenene, ikke vinduet. Med NOW = 1/10 er
    // slutdatoen 17/8, altså FØR ikrafttrædelsen 10/9. Udløbsgrenen afgøres
    // før ikrafttrædelses-reglen, så den nye gren rammer først: dag 45 med
    // tilbyd giver udloebet_vindue_lukket, ikke uden_for_ordningen — og
    // tilbyd_ikke giver stadig udloebet_tilbyd_ikke.
    { navn: "udloebet_vindue_lukket dag 45 efter slutdato (slutdato før ikrafttrædelsen)", status: "udloebet_vindue_lukket", input: { contract_end_date: slutdatoOmDage(-45), ...INGEN_SUB, beslutning: "tilbyd" } },
    { navn: "udloebet_tilbyd_ikke dag 45 efter slutdato", status: "udloebet_tilbyd_ikke", input: { contract_end_date: slutdatoOmDage(-45), ...INGEN_SUB, beslutning: "tilbyd_ikke" } },
  ];

  for (const { status, input, navn } of cases) {
    it(`parity: ${navn ?? status}`, () => {
      const fe = afgoerFornyelsestilstand(input, NOW);
      const deno = afgoerFornyelsestilstandDeno(input, NOW);
      expect(fe.status).toBe(status); // inputtet rammer den tilsigtede gren
      expect(deno).toEqual(fe); // hele tilstandsobjektet: status, dage_til_udloeb, tier
    });
  }

  it("dag 14, 15, 20 og 45 efter slutdato: dage_til_udloeb er præcis −14, −15, −20, −45", () => {
    for (const dage of [14, 15, 20, 45]) {
      for (const beslutning of ["tilbyd", "tilbyd_ikke"] as const) {
        const t = afgoerFornyelsestilstand({ contract_end_date: slutdatoOmDage(-dage), ...INGEN_SUB, beslutning }, NOW);
        expect(t.dage_til_udloeb).toBe(-dage);
        expect(t.tier).toBe("expired");
      }
    }
  });

  it("hver FornyelseStatus har mindst én case i paritetslisten", () => {
    for (const status of Object.keys(ALLE_STATUSSER) as FornyelseStatus[]) {
      expect(cases.some((c) => c.status === status), `mangler case for ${status}`).toBe(true);
    }
  });

  it("alle dage −100…+60 til slutdato × alle tre beslutninger × med/uden aktivt abonnement × now før og efter ikrafttrædelsen", () => {
    // Samme form som betalingsfristParitet's fejning. Intervallet dækker
    // godt før slutdato (i_god_tid forbi 60-dages vinduet), hele vinduet,
    // slutdagen, fjortendagesvinduet og langt efter (op til 100 dage).
    // Med now FØR ikrafttrædelsen (2026-09-01) rammes uden_for_ordningen
    // også for ikke-udløbne kontrakter uden abonnement.
    const beslutninger: (Fornyelsesbeslutning | null)[] = [null, "tilbyd", "tilbyd_ikke"];
    for (const now of [NOW, new Date("2026-09-01T12:00:00Z")]) {
      for (let dage = -100; dage <= 60; dage++) {
        for (const beslutning of beslutninger) {
          for (const sub of [INGEN_SUB, AKTIV_SUB]) {
            const i: FornyelseInput = { contract_end_date: slutdatoOmDage(dage), ...sub, beslutning };
            expect(afgoerFornyelsestilstandDeno(i, now)).toEqual(afgoerFornyelsestilstand(i, now));
          }
        }
      }
    }
  });
});

describe("låsene er ens i begge kopier", () => {
  it("beslutningsvinduet, ikrafttrædelsesdatoen og tilbudsvinduet efter udløb", () => {
    expect(FORNYELSES_VINDUE_DAGE_DENO).toBe(FORNYELSES_VINDUE_DAGE);
    expect(FORNYELSE_IKRAFT_DATO_DENO).toBe(FORNYELSE_IKRAFT_DATO);
    expect(FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE_DENO).toBe(FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE);
  });
});
