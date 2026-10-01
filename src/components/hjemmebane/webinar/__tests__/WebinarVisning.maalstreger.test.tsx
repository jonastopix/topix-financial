/**
 * Målstregerne og de varme leads på fladen (udkast 1/10-2026):
 *   · målene tegnes med dommens ord og en målstreg; uden `maalstreger` (gammel
 *     webinar-delt) tegnes intet — siden dør ikke;
 *   · varme leads står KUN, når de gives ind (rådgiveren) — WebinarVisning alene
 *     (som den delte side bruger den) viser dem aldrig.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { WebinarVisning } from "../WebinarView";
import { VarmeLeadsAfsnit } from "../VarmeLeads";
import { udenRaekker, webinarDashboard, type Tilmelding } from "@/lib/webinar/dashboard";
import { maalstreger } from "@/lib/webinar/maalstreger";
import { varmeLeads } from "@/lib/webinar/varmeLeads";

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
  });
  it("uden `maalstreger` (gammel webinar-delt) tegnes ingen sektion", () => {
    const { container } = render(<WebinarVisning tilstand="klar" dom={dom} priser={null} />);
    expect(container.querySelector("[data-maalstreger]")).toBeNull();
  });
});

describe("varme leads — kun når rådgiveren giver dem ind", () => {
  it("WebinarVisning alene (den delte sides brug) viser ingen leads og ingen mail", () => {
    const { container } = render(<WebinarVisning tilstand="klar" dom={dom} priser={null} maal={maal} />);
    expect(container.querySelector("[data-varme-leads]")).toBeNull();
    expect(container.textContent).not.toMatch(/@/);
  });
  it("rådgiverens flade: seks varme med mailto, alle inden for 24 timer", () => {
    const leads = varmeLeads(TILMELDINGER, [], NU);
    const { container } = render(<WebinarVisning tilstand="klar" dom={dom} priser={null} maal={maal} varme={<VarmeLeadsAfsnit leads={leads} />} />);
    expect(container.querySelector("[data-varme-leads='6']")).not.toBeNull();
    expect(container.querySelectorAll("a[href^='mailto:']")).toHaveLength(6);
    expect(container.querySelectorAll("[data-varmt-lead='inden-24']")).toHaveLength(6);
  });
  it("tom liste har sin sætning", () => {
    const { container } = render(<VarmeLeadsAfsnit leads={[]} />);
    expect(container.querySelector("[data-varme-leads='tom']")).not.toBeNull();
  });
});
