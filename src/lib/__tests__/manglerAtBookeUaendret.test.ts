import { describe, expect, it } from "vitest";
import { byggOverblik } from "@/lib/medlemsOverblik";
import { manglerAtBookeLinjer } from "@/lib/hjemmebane/manglerAtBookeBlok";

/**
 * Oprydningen 29/9-2026 (statusmailen droppet): byggOverblik mistede aktiviteten
 * og mærke-dommen og henter nu kun companies, company_members og session_bookings.
 * BEVISET for, at forsidens «Mangler at booke» er uændret: dette datasæt har ALLE
 * de gamle kilder med data (logins, events, akademi, community, rapporter …), og
 * de to linjer er de samme før og efter — prøven blev kørt grøn mod main @ ca264652
 * (før oprydningen) og mod oprydningen. De ekstra kilder ignoreres nu.
 */
const NU = new Date("2026-09-29T08:00:00Z");
const MS_DAG = 86_400_000;
const dageFoer = (n: number) => new Date(NU.getTime() - n * MS_DAG).toISOString();
const dageEfter = (n: number) => new Date(NU.getTime() + n * MS_DAG).toISOString();
const NY = "2026-09-20T10:00:00Z";
const GAMMEL = dageFoer(200);
const c = (id: string, name: string, x: Record<string, unknown> = {}) =>
  ({ id, name, status: "active", is_legat: false, er_kunde: true, is_demo: false, intro_session_used_at: dageFoer(40), jonas_session_used_at: null, jonas_session_tilbudt_at: null, ...x });
const bk = (company_id: string, advisor: string, status: string, slut: string | null) =>
  ({ company_id, advisor, amount_dkk: 0, status, start_tid: slut, slut_tid: slut, created_at: dageFoer(20) });

/** Hvert udfald er en gren i manglerAtBooke eller universfiltret. */
export const KILDER_RIG = {
  companies: [
    c("a", "Anholt Is", { intro_session_used_at: null }),                                   // Morten ikke_brugt · Jonas ikke_brugt, NY → begge
    c("b", "Bager Bo", { jonas_session_used_at: "2026-09-13T20:52:00Z" }),                  // Morten link_sendt · Jonas ikke_omfattet → Morten
    c("c", "Cafe C", { jonas_session_used_at: "2026-09-20T12:00:00Z" }),                    // Morten aflyst · Jonas markeret_uden_booking, NY → Morten
    c("d", "Dalum", { jonas_session_used_at: dageFoer(5) }),                                // Morten booket · Jonas afholdt → ingen
    c("e", "Esbjerg"),                                                                      // Morten markeret_uden_booking · Jonas ikke_brugt, GAMMEL → ingen
    c("f", "Faxe Demo", { is_demo: true, intro_session_used_at: null }),                    // uden for universet (demo)
    c("g", "Give Legat", { is_legat: true, intro_session_used_at: null }),                  // uden for universet (legat)
    c("h", "Holte", { status: "inactive", intro_session_used_at: null }),                   // uden for universet (status)
    c("i", "Ikast", { er_kunde: false, intro_session_used_at: null }),                      // uden for universet (ikke kunde)
    c("j", "Jels", { intro_session_used_at: null, status: null }),                          // Morten ikke_brugt · ingen medlemmer → Morten
  ],
  medlemmer: [
    { company_id: "a", user_id: "u1", created_at: NY },
    { company_id: "b", user_id: "u2", created_at: GAMMEL },
    { company_id: "c", user_id: "u3", created_at: NY },
    { company_id: "d", user_id: "u4", created_at: NY },
    { company_id: "e", user_id: "u5", created_at: GAMMEL },
    { company_id: "f", user_id: "u6", created_at: NY },
  ],
  bookinger: [
    bk("b", "morten", "booking_sent", null),
    bk("c", "morten", "cancelled", null),
    bk("d", "morten", "booked", dageEfter(3)),
    bk("d", "jonas", "booked", dageFoer(2)),
    { ...bk("e", "morten", "booked", dageFoer(2)), amount_dkk: 500 }, // betalt session — ikke den inkluderede (hooken filtrerer amount_dkk 0; her ville den ellers gøre e «afholdt»)
  ].filter((b) => b.amount_dkk === 0),
  // De gamle kilder — med data, så en afhængighed af dem ville vise sig.
  logins: [{ user_id: "u1", logged_in_at: dageFoer(1) }, { user_id: "u2", logged_in_at: dageFoer(90) }],
  facts: [{ company_id: "a", committed_at: dageFoer(3), data_basis: "measured" }],
  uploads: [{ company_id: "b", uploaded_at: dageFoer(10) }],
  refleksioner: [{ company_id: "c", created_at: dageFoer(4) }],
  samtaler: [{ company_id: "d", last_member_message_at: dageFoer(2) }],
  events: [{ user_id: "u3", registered_at: dageFoer(6), response: "attending", cancelled_at: null }],
  progress: [{ user_id: "u4", updated_at: dageFoer(8) }],
  traade: [{ forfatter_id: "u5", created_at: dageFoer(9) }],
  svar: [{ forfatter_id: "u1", created_at: dageFoer(2) }],
  reaktioner: [{ bruger_id: "u2", created_at: dageFoer(1) }],
  maal: [{ company_id: "e", created_at: dageFoer(30), progress_updated_at: dageFoer(3), completed_at: null }],
};

describe("«Mangler at booke» er uændret efter oprydningen (29/9)", () => {
  it("N og M på det faste datasæt — samme svar som før oprydningen (main @ ca264652)", () => {
    const linjer = manglerAtBookeLinjer(byggOverblik(KILDER_RIG as never, NU).values());
    expect(linjer).toEqual([
      { raadgiver: "morten", tekst: "Morten-session: 4", virksomheder: [{ id: "a", navn: "Anholt Is" }, { id: "b", navn: "Bager Bo" }, { id: "c", navn: "Cafe C" }, { id: "j", navn: "Jels" }] },
      { raadgiver: "jonas", tekst: "Jonas-session: 1", virksomheder: [{ id: "a", navn: "Anholt Is" }] },
    ]);
  });
  it("universet er det samme: demo, legat, inaktiv og ikke-kunde er ude; status null er inde", () => {
    expect([...byggOverblik(KILDER_RIG as never, NU).keys()].sort()).toEqual(["a", "b", "c", "d", "e", "j"]);
  });
});
