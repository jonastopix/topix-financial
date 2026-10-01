/**
 * Målstregerne på fladen (udkast 1/10-2026; rettet af Jonas 1/10 kl. 20:13):
 *   · målene tegnes med dommens ord og en målstreg; uden `maalstreger` (gammel
 *     webinar-delt) tegnes intet — siden dør ikke;
 *   · overskriften er «Vores mål» — ingen persons navn på målene;
 *   · rækkefølgen: «Det næste webinar» ØVERST, så målene, så «Afholdt», så
 *     tragten («Hele vejen»), så resten;
 *   · varme leads er FJERNET — ingen sektion, ingen mail på fladen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { WebinarVisning } from "../WebinarView";
import { TRAGT_EYEBROW, udenRaekker, webinarDashboard, type Tilmelding } from "@/lib/webinar/dashboard";
import { MAAL_EYEBROW, MAAL_TITEL, maalstreger } from "@/lib/webinar/maalstreger";

const NU = new Date("2026-09-22T12:00:00.000Z");
const S = "2026-09-22T07:00:00.000Z";
const R = (n: number, set: number | null): Tilmelding => ({
  ewebinar_id: `id-${n}`, email: `p${n}@x.dk`, navn: `Person ${n}`, webinar_id: "w1", webinar_titel: "W", session_tid: S, session_type: "Scheduled",
  registreret_at: "2026-09-10T09:00:00.000Z", state: set === null ? "Missed" : "Watched", sidste_action: null,
  attended: set === null ? null : "true", subscribed: null, set_procent: set, set_procent_kilde: set === null ? null : "watchedPercentage",
}) as Tilmelding;
const TILMELDINGER = [...Array.from({ length: 6 }, (_, n) => R(n, 90)), ...Array.from({ length: 4 }, (_, n) => R(10 + n, null))];
const dom = udenRaekker(webinarDashboard({ tilmeldinger: TILMELDINGER, ansoegninger: [], sporKolonnerFindes: true }, NU));
const maal = maalstreger({ tilmeldinger: TILMELDINGER, ansoegninger: [], forbrug: null }, NU);

afterEach(cleanup);

describe("WebinarVisning — målstregerne", () => {
  it("fire linjer med dommens ord og en målstreg hver", () => {
    const { container } = render(<WebinarVisning tilstand="klar" dom={dom} priser={null} maal={maal} />);
    expect(container.querySelector("[data-maalstreger='4']")).not.toBeNull();
    expect(container.querySelectorAll("[data-maal-streg]")).toHaveLength(4);
    const fremmoede = container.querySelector("[data-maal='fremmoede']")!;
    expect(fremmoede.textContent).toContain(maal.linjer[0].vaerdiOrd);
    expect(fremmoede.textContent).toContain("mål over 55 %");
    expect(container.querySelector("[data-maal='pris_pr_ansoegning']")!.textContent).toContain("ingen data");
    // B7: grundlaget står under hver række; R2: badgens sr-tekst siger det samme ord som badgen.
    expect(container.querySelectorAll("[data-maal-grundlag]")).toHaveLength(4);
    expect(fremmoede.querySelector("[data-maal-grundlag]")!.textContent).toBe(maal.linjer[0].grundlagOrd);
    expect(fremmoede.querySelector(".sr-only")!.textContent).toContain(`— ${maal.linjer[0].udfaldOrd}.`);
    expect(["nået", "ikke nået", "kan ikke afgøres"]).toContain(maal.linjer[0].udfaldOrd);
  });
  it("uden `maalstreger` (gammel webinar-delt) tegnes ingen sektion", () => {
    const { container } = render(<WebinarVisning tilstand="klar" dom={dom} priser={null} />);
    expect(container.querySelector("[data-maalstreger]")).toBeNull();
  });
});

describe("Jonas 1/10 kl. 20:13 — vores mål, rækkefølgen, ingen varme leads", () => {
  it("overskriften er «Vores mål», og ingen persons navn står på fladen", () => {
    const { container } = render(<WebinarVisning tilstand="klar" dom={dom} priser={null} maal={maal} />);
    expect(MAAL_TITEL).toBe("Vores mål");
    expect(container.textContent).toContain("Vores mål");
    expect(container.innerHTML).not.toMatch(/Nicklas/i);
    expect(container.textContent).not.toMatch(/Det styrer vi efter/);
  });
  it("«Det næste webinar» øverst, så målene, så «Afholdt», så tragten, så «Hvor kom de fra»", () => {
    const { container } = render(<WebinarVisning tilstand="klar" dom={dom} priser={null} maal={maal} />);
    const eyebrows = Array.from(container.querySelectorAll("section"))
      .filter((s) => s.parentElement?.closest("section") === null)
      .map((s) => s.querySelector("p")?.textContent);
    expect(eyebrows.slice(0, 5)).toEqual(["Det næste webinar", MAAL_EYEBROW, "Afholdt", TRAGT_EYEBROW, "Hvor kom de fra"]);
  });
  it("ingen varme leads og ingen mail på fladen", () => {
    const { container } = render(<WebinarVisning tilstand="klar" dom={dom} priser={null} maal={maal} />);
    expect(container.querySelector("[data-varme-leads]")).toBeNull();
    expect(container.querySelectorAll("a[href^='mailto:']")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/@/);
    expect(container.textContent).not.toMatch(/Varme leads/i);
  });
});
