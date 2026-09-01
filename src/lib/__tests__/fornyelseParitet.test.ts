import { describe, it, expect } from "vitest";
import {
  afgoerFornyelsestilstand,
  type FornyelseInput,
  type FornyelseStatus,
} from "@/lib/fornyelse";
// Parity import — the Deno copy is intentionally a mirror of the frontend
// copy (import path is the only allowed difference). We import it here so
// vitest fails loudly if the two drift.
import { afgoerFornyelsestilstand as afgoerFornyelsestilstandDeno } from "../../../supabase/functions/_shared/fornyelse.ts";

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

// Parity gate — the Deno copy at supabase/functions/_shared/fornyelse.ts
// must produce an identical Fornyelsestilstand (status, dage_til_udloeb,
// tier) for every input the frontend copy handles. All ten statuses are
// covered, and each case asserts the intended status so no branch is
// silently missed. If this block fails, the two files have drifted and
// must be re-synced.
describe("afgoerFornyelsestilstand — parity between src/lib and supabase/functions/_shared", () => {
  const cases: Array<{ status: FornyelseStatus; input: FornyelseInput }> = [
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
  ];

  for (const { status, input } of cases) {
    it(`parity: ${status}`, () => {
      const fe = afgoerFornyelsestilstand(input, NOW);
      const deno = afgoerFornyelsestilstandDeno(input, NOW);
      expect(fe.status).toBe(status); // inputtet rammer den tilsigtede gren
      expect(deno).toEqual(fe); // hele tilstandsobjektet: status, dage_til_udloeb, tier
    });
  }
});
