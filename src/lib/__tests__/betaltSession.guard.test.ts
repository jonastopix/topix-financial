import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Værn for de betalte 1:1-sessioner (kort 76, 13/9): virksomhedssiden
// læser ALLE virksomhedens session_bookings-rækker og lader lib/betaltSession
// sige ordene for det betalte spor. Før filtrerede hentningen
// .eq("advisor", "morten"), og de betalte rækker blev læst ingen steder i
// rådgiverfladen. Kildelæsning frem for import (varselStempel.guard-
// mønstret): fladen er React/Supabase-kode.

const FLADE = "src/components/hjemmebane/virksomhed/VirksomhedView.tsx";
const DOM = "src/lib/betaltSession.ts";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");

describe("betaltSession.guard — virksomhedssiden", () => {
  it("henter session_bookings uden Morten-filter og dømmer gennem betaltSession", () => {
    const kilde = laes(FLADE);
    expect(kilde).toContain('from("session_bookings")');
    expect(kilde).not.toContain('.eq("advisor", "morten")');
    expect(kilde).toContain("afgoerBetaltSession(");
    expect(kilde).toContain("betaltSessionTekst(");
    // Dommen skal have det den dømmer på: pris, URI og webhookens stempel.
    expect(kilde).toMatch(/select\("[^"]*amount_dkk[^"]*calendly_event_uri[^"]*updated_at[^"]*"\)/);
  });

  it("fladen skriver ingen egen sessions-tekst — «afholdt» står kun i dommene", () => {
    const kilde = laes(FLADE);
    // Klassen på afholdt-linjen må læse tilstanden; ordet må ikke skrives frit i JSX.
    const jsxAfholdt = kilde.match(/>[^<{]*afholdt[^<{]*</gi) ?? [];
    expect(jsxAfholdt).toEqual([]);
  });

  it("dommen påstår kun «afholdt» bag calendly_event_uri", () => {
    const kilde = laes(DOM);
    const bookedGren = kilde.slice(kilde.indexOf('case "booked"'), kilde.indexOf('case "cancelled"'));
    expect(bookedGren).toContain("if (!b.calendly_event_uri) return dom(\"betalt_link_sendt\")");
    expect(bookedGren).toContain('dom("afholdt")');
    // «afholdt» som tilstand tildeles ét sted i dommen: i booked-grenen.
    expect(kilde.split('dom("afholdt")').length - 1).toBe(1);
  });
});
