/**
 * Medlemmets chat på mobil — tilbage-pilen (Jonas 29/9: «chatten er dårligt
 * skåret. Svært at arbejde i»).
 *
 * MÅLT (denne prøve renderer den RIGTIGE MemberChatPane på 390 px, med
 * Supabase erstattet af en mock, med én og med to samtaler): panen henter
 * samtalerne, vælger den første (`setActiveConvId(enriched[0].id)`) og viser
 * KUN den. Der findes ingen samtaleliste i medlemmets mobilvisning — hverken
 * ved én eller to samtaler; `showMessages` blev sat, men aldrig læst, så
 * tilbage-pilen (ArrowLeft, `handleBackToList` = `setShowMessages(false)`)
 * ændrede intet. Der er derfor intet at vende tilbage til, og pilen er fjernet
 * (den mindste rettelse: at få den til at virke krævede en hel liste-visning
 * for medlemmet, som ingen har bedt om — rådgiveren har listen, medlemmet har
 * én direkte linje). Rådgiverens tilbage-pil (CompanyChatPane) er uberørt: dér
 * findes listen (`showSidebar`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const KONV = (id: string, navn: string) => ({
  id,
  member_id: "u1",
  company_id: `c-${id}`,
  last_message_at: "2026-09-29T10:00:00Z",
  created_at: "2026-09-29T09:00:00Z",
  awaiting_reply_from: null,
  last_member_message_at: null,
  last_advisor_reply_at: null,
  companies: { id: `c-${id}`, name: navn, logo_url: null, is_legat: false, contract_end_date: null, subscription_status: "active", subscription_current_period_end: null },
});

let konversioner: ReturnType<typeof KONV>[] = [];

const tabel = (navn: string) => {
  const raekker = navn === "conversations" ? konversioner : [];
  const b: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return (res: (v: unknown) => unknown) => Promise.resolve({ data: raekker, error: null, count: raekker.length }).then(res);
        if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve({ data: null, error: null });
        return () => b;
      },
    },
  );
  return b;
};
const kanal: any = { on: () => kanal, subscribe: () => kanal, unsubscribe: () => {} };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (n: string) => tabel(n),
    rpc: (n: string) =>
      Promise.resolve({
        data: n === "get_all_advisor_profiles" ? [{ user_id: "a1", full_name: "Morten Larsen", avatar_url: null }] : [],
        error: null,
      }),
    channel: () => kanal,
    removeChannel: () => {},
    storage: { from: () => ({}) },
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, companyId: null, companyName: null, isAdvisor: false }),
}));
vi.mock("@/lib/chatNotify", () => ({ notifyChatMessage: vi.fn() }));

import MemberChatPane from "@/components/MemberChatPane";

const gengiv = () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn() as never;
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <MemberChatPane />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  konversioner = [];
});
afterEach(cleanup);

describe("MemberChatPane på mobil (390 px) — hvad medlemmet faktisk ser", () => {
  for (const [antal, samtaler] of [
    [1, [KONV("k1", "Firma Et")]],
    [2, [KONV("k1", "Firma Et"), KONV("k2", "Firma To")]],
  ] as const) {
    it(`med ${antal} samtale(r): samtalen står (header + sendefelt), der er ingen liste, og ingen tilbage-pil`, async () => {
      konversioner = [...samtaler];
      gengiv();
      // Samtalen er åbnet: rådgivernes navne i headeren og sendefeltet.
      await waitFor(() => expect(screen.getByText("Morten")).toBeTruthy());
      expect(document.querySelector(".tiptap")).not.toBeNull();
      // Ingen liste: virksomhedsnavnene fra samtalerne står ingen steder.
      expect(screen.queryByText("Firma Et")).toBeNull();
      expect(screen.queryByText("Firma To")).toBeNull();
      // Ingen knap i headeren (den eneste knap dér var den døde pil).
      const header = screen.getByText("Morten").closest("div.border-b");
      expect(header).not.toBeNull();
      expect(header!.querySelectorAll("button").length).toBe(0);
    });
  }
});

describe("MemberChatPane — kildeværn: ingen død tilstand", () => {
  const kilde = readFileSync(resolve(process.cwd(), "src/components/MemberChatPane.tsx"), "utf8");
  const kode = kilde.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  it("showMessages / handleBackToList / ArrowLeft findes ikke (der er ingen liste at vende tilbage til)", () => {
    expect(kode).not.toMatch(/showMessages|setShowMessages|handleBackToList|ArrowLeft/);
  });
});
