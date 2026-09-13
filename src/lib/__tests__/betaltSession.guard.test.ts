import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Værn for de betalte 1:1-sessioner (kort 76, 13/9): virksomhedssiden
// læser ALLE virksomhedens session_bookings-rækker og lader lib/betaltSession
// sige ordene for det betalte spor. Før filtrerede hentningen
// .eq("advisor", "morten"), og de betalte rækker blev læst ingen steder i
// rådgiverfladen. Kildelæsning frem for import (varselStempel.guard-
// mønstret): fladen er React/Supabase-kode.
//
// VÆRNET SKIFTEDE 13/9 aften: det låste før at «afholdt» krævede
// calendly_event_uri. URI'en var kun porten fordi calendly-webhook plejede
// at sætte den SAMMEN med tiden — og håndsatte rækker (Rallysupports to
// køb, tid taget fra Calendly 13/9) får aldrig en: deres links (juni) bar
// intet booking-id, så webhooken kan ikke ramme dem. (Webhookens filter på
// advisor='morten' er åbnet samme aften; det ændrer intet for de to rækker.)
// Beviset for «afholdt» er nu TIDEN: slut_tid når den findes, ellers
// start_tid. Værnet låser samtidig at URI-kravet ikke genindføres uden at
// ændre denne test med vilje.

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
    // Dommen skal have det den dømmer på (13/9): pris, status, tiden og
    // betalingsdatoen (created_at — updated_at flyttes af triggeren ved
    // enhver admin-rettelse, og calendly_event_uri læses ikke længere).
    expect(kilde).toMatch(/select\("[^"]*\bstatus\b[^"]*amount_dkk[^"]*start_tid[^"]*slut_tid[^"]*created_at[^"]*"\)/);
  });

  it("fladen skriver ingen egen sessions-tekst — «afholdt» står kun i dommene", () => {
    const kilde = laes(FLADE);
    // Klassen på afholdt-linjen må læse tilstanden; ordet må ikke skrives frit i JSX.
    const jsxAfholdt = kilde.match(/>[^<{]*afholdt[^<{]*</gi) ?? [];
    expect(jsxAfholdt).toEqual([]);
  });

  it("dommen påstår kun «afholdt» bag en tidsgrænse (slut_tid, ellers start_tid) — ikke bag calendly_event_uri", () => {
    const kilde = laes(DOM);
    const bookedGren = kilde.slice(kilde.indexOf('case "booked"'), kilde.indexOf('case "cancelled"'));
    // Grænsen er sluttiden når den findes, ellers starttiden — ingen opfundet varighed.
    expect(bookedGren).toContain("const graense = slut ?? start;");
    // Uden nogen tid beviser ordet booked intet: tilbage til «link sendt».
    expect(bookedGren).toContain('if (graense == null) return dom("betalt_link_sendt");');
    // «afholdt» kun når grænsen er passeret (nu >= grænse, som introSession.erAfholdt).
    expect(bookedGren).toContain('if (graense.getTime() <= nu.getTime()) return dom("afholdt");');
    // URI'en er IKKE længere porten — booked-grenen må ikke læse den.
    expect(bookedGren).not.toContain("calendly_event_uri");
    // «afholdt» som tilstand tildeles ét sted i dommen: i booked-grenen.
    expect(kilde.split('dom("afholdt")').length - 1).toBe(1);
    // Ingen anden gren når «afholdt» — den står kun mellem booked og cancelled.
    expect(bookedGren).toContain('dom("afholdt")');
  });
});
