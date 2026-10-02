/**
 * /delt/webinar må ikke dø, når den GAMLE webinar-delt kører (rådets fund
 * 30/9-2026, PR #1184): et delt-svar fra før Wilson bærer ingen `maaling` på
 * sporlinjerne. Fladen skal tegne linjen uden sikkerhedslinjen. Rækkefølgen
 * er stadig `webinar-delt` FØRST, så Update — dette er nettet under den.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { WebinarVisning } from "../WebinarView";
import { udenRaekker, webinarDashboard, type Tilmelding, type WebinarDashboardSvar } from "@/lib/webinar/dashboard";

const AFHOLDT = "2026-09-22T07:00:00.000Z";
const NU = new Date("2026-09-30T12:00:00.000Z");
let nr = 0;
const R = (annonce: string, set: number | null): Tilmelding => {
  nr++;
  return {
    ewebinar_id: `id-${nr}`, email: `p${nr}@x.dk`, navn: `P ${nr}`, webinar_id: "w1", webinar_titel: "W", session_tid: AFHOLDT, session_type: "Scheduled",
    registreret_at: "2026-09-10T09:00:00.000Z", state: set === null ? "Missed" : "Watched",
    sidste_action: null, attended: set === null ? null : "true", subscribed: null, set_procent: set, set_procent_kilde: set === null ? null : "watchedPercentage",
    utm_source: "fb", utm_medium: "paid", utm_campaign: "Adv+", utm_content: annonce, utm_term: null, fbclid: null,
    origin: null, first_origin: null, referrer: null, first_referrer: null, widget_source: null, by: null, land: null, enhed: null, tidszone: null, ad_id_udledt: null,
  } as Tilmelding;
};
const gange = (n: number, lav: () => Tilmelding) => Array.from({ length: n }, lav);
const TILMELDINGER = [
  ...gange(30, () => R("a-annonce", 90)), ...gange(10, () => R("a-annonce", null)),
  ...gange(20, () => R("b-annonce", 90)), ...gange(80, () => R("b-annonce", null)),
];

const nyDom = (): WebinarDashboardSvar =>
  udenRaekker(webinarDashboard({ tilmeldinger: TILMELDINGER, ansoegninger: [], sporKolonnerFindes: true }, NU));

/** Et delt-svar fra den gamle webinar-delt: samme form, men ingen `maaling` nogen steder i sporet. */
const udenMaaling = (dom: WebinarDashboardSvar): WebinarDashboardSvar => {
  const kopi = JSON.parse(JSON.stringify(dom)) as WebinarDashboardSvar;
  for (const spor of [kopi.spor, kopi.sporNaeste]) {
    if (!spor) continue;
    for (const l of spor.kilder) delete (l as Partial<typeof l>).maaling;
    for (const k of spor.kampagner) {
      delete (k as Partial<typeof k>).maaling;
      for (const a of k.annoncer) delete (a as Partial<typeof a>).maaling;
    }
  }
  return kopi;
};

afterEach(cleanup);

describe("WebinarVisning — sporet med og uden `maaling`", () => {
  it("uden `maaling` (gammel webinar-delt) tegner fladen sporet uden sikkerhedslinjen", () => {
    const dom = udenMaaling(nyDom());
    expect(JSON.stringify(dom)).not.toContain("maaling");
    const { container } = render(<WebinarVisning tilstand="klar" dom={dom} priser={null} />);
    expect(container.querySelector("[data-webinar-kampagne='Adv+']")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Vis annoncerne i Adv\+/ }));
    expect(container.querySelector("[data-webinar-annoncer='2']")).not.toBeNull();
    expect(container.querySelector("[data-spor-sikkerhed]")).toBeNull();
  });

  it("med `maaling` står tallet med nævneren, mærket i ord og forklaringen til skærmlæseren", () => {
    const { container } = render(<WebinarVisning tilstand="klar" dom={nyDom()} priser={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Vis annoncerne i Adv\+/ }));
    const a = container.querySelector("[data-spor-sikkerhed='a-annonce']");
    expect(a).not.toBeNull();
    expect(a!.className).toContain("col-span-full");
    expect(a!.textContent).toMatch(/75 % \(\d+–\d+ %\) af 40/);
    expect([...a!.querySelectorAll("[data-spor-maerke='hoejere']")].map((m) => m.textContent))
      .toEqual(["flere mødte op end resten", "flere så færdigt end resten"]);
    const sr = a!.querySelectorAll(".sr-only");
    expect(sr.length).toBeGreaterThan(0);
    expect([...sr].map((s) => s.textContent).join(" ")).toContain("flere så færdigt end resten");
    expect(a!.querySelector("[aria-label]")).toBeNull();
  });
});
