/**
 * HbKlokke — set på skærm 14/9 kl. 19:43, tre fejl låst her:
 *   1. rå HTML i et uddrag vises aldrig som tekst (tags er væk i DOM'en);
 *   2. driftsbeskedens JSON-mur står ikke i klokken, og teksten er klippet
 *      med line-clamp-2 UDEN `block` (block overskrev -webkit-box, og klippet
 *      var dødt — Tailwinds display ligger efter lineClamp);
 *   3. «Markér alle som læst» ligger FØR listen i DOM'en.
 *
 * useAuth og de to notifikations-hooks er mocket; klokken rendres i en
 * MemoryRouter fordi linjerne er Links.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MedlemsNotifikation, RaadgiverNotifikation } from "@/lib/hjemmebane/klokke";

const auth = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null, isAdvisor: true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

const raadgiver = vi.hoisted(() => ({
  notifications: [] as RaadgiverNotifikation[],
  markAsRead: vi.fn(async () => {}),
  markAllRead: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useAdvisorNotifications", () => ({ useAdvisorNotifications: () => raadgiver }));

const medlem = vi.hoisted(() => ({
  notifications: [] as MedlemsNotifikation[],
  unseenCount: 0,
  markAllSeen: vi.fn(async () => {}),
  markRead: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useNotifications", () => ({ useNotifications: () => medlem }));

import { HbKlokke } from "../HbKlokke";

afterEach(() => {
  cleanup();
  raadgiver.notifications = [];
  medlem.notifications = [];
  auth.isAdvisor = true;
});

const r = (over: Partial<RaadgiverNotifikation> = {}): RaadgiverNotifikation => ({
  id: "a1", type: "new_message", title: "Ny besked fra Dans", body: "Dans uden formatering", company_id: "c1", member_id: "u2",
  reference_id: "m1", reference_type: "chat", read_at: null, created_at: "2026-09-14T17:43:00Z", ...over,
});

const HTML_SET_PAA_SKAERM =
  "<p>Hej Jonas, </p><p>Jo, det virkede ok! :-)<br>Når forretningen er så lille som her (går også ud fra det er en enkeltmandsvirksomhed)</p>";

const aabn = () => {
  render(<MemoryRouter><HbKlokke /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /Notifikationer/ }));
};

describe("HbKlokke — uddraget er ren tekst", () => {
  it("en besked med afsnit og linjeskift viser ordene, aldrig taggene", () => {
    raadgiver.notifications = [r({ id: "a1", title: "Ny besked fra Floren", body: HTML_SET_PAA_SKAERM })];
    aabn();
    const liste = screen.getByRole("list");
    expect(liste.textContent).toContain("Hej Jonas, Jo, det virkede ok! :-) Når forretningen er så lille som her");
    expect(liste.textContent).not.toMatch(/<[^>]*>/);
    expect(liste.querySelector("p")).toBeNull(); // ingen <p> rendret som element heller
  });

  it("medlemmets klokke renser også (samme lib)", () => {
    auth.isAdvisor = false;
    medlem.notifications = [{
      id: "n1", title: "Din rådgiver har svaret", body: "<p>Godt spørgsmål.</p><p>Se rapporten.</p>", priority: "important",
      deep_link: "/chat", seen_at: null, read_at: null, created_at: "2026-09-14T17:43:00Z",
    }];
    aabn();
    const liste = screen.getByRole("list");
    expect(liste.textContent).toContain("Godt spørgsmål. Se rapporten.");
    expect(liste.textContent).not.toContain("<p>");
  });
});

describe("HbKlokke — driftsbeskeden er læselig", () => {
  it("JSON-muren står ikke i klokken; teksten er klippet med line-clamp-2 uden block", () => {
    raadgiver.notifications = [r({
      id: "d1", type: "drift", company_id: null, reference_type: "cron_vagt_log", reference_id: null,
      title: 'Driften: 3 cron-jobs svarede ikke 200 den seneste time ({"200": 40, "500": 3}; 2 timeouts)',
      body: 'Cron-vagten (vagt_cron) kl. 19:00. Tallene: {"vault_noegler": 1, "kald_60m": 44, "koder": {"200": 40, "500": 3}, "usendte_30m": 0}',
    })];
    aabn();
    const liste = screen.getByRole("list");
    expect(liste.textContent).toContain("Driften: 3 cron-jobs svarede ikke 200 den seneste time (3 × 500; 2 timeouts)");
    expect(liste.textContent).toContain("Cron-vagten (vagt_cron) kl. 19:00. Tallene står i cron_vagt_log.");
    expect(liste.textContent).not.toContain("vault_noegler");
    expect(liste.textContent).not.toContain("{");
    const tekst = liste.querySelector("[data-klokke-tekst]")!;
    expect(tekst).toHaveClass("line-clamp-2");
    expect(tekst).not.toHaveClass("block");
  });
});

describe("HbKlokke — «Markér alle som læst» ligger øverst", () => {
  it("knappen står FØR listen i DOM'en og kalder markAllRead", () => {
    raadgiver.notifications = Array.from({ length: 10 }, (_, i) => r({ id: `a${i}`, created_at: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00Z` }));
    aabn();
    const knap = screen.getByRole("button", { name: "Markér alle som læst" });
    const liste = screen.getByRole("list");
    expect(knap.compareDocumentPosition(liste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(knap);
    expect(raadgiver.markAllRead).toHaveBeenCalledTimes(1);
  });

  it("ingen knap når alt er læst — og aldrig hos medlemmet", () => {
    raadgiver.notifications = [r({ read_at: "2026-09-14T18:00:00Z" })];
    aabn();
    expect(screen.queryByRole("button", { name: "Markér alle som læst" })).toBeNull();
    cleanup();
    auth.isAdvisor = false;
    medlem.notifications = [{
      id: "n1", title: "x", body: null, priority: "important", deep_link: null, seen_at: null, read_at: null, created_at: "2026-09-14T17:43:00Z",
    }];
    aabn();
    expect(screen.queryByRole("button", { name: "Markér alle som læst" })).toBeNull();
  });
});
