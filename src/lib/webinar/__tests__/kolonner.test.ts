import { describe, expect, it } from "vitest";
import { ANNONCESPOR_KOLONNER, erUkendtKolonne, medAnnoncespor, udenAnnoncespor } from "@/lib/webinar/kolonner";

/** hooks/webinar.ts's liste, som den ser ud ved HEAD — kopieret hertil, så
    testen ikke rejser en Supabase-klient. Kildeværnet holder den ens. */
const TILMELDING_KOLONNER =
  "ewebinar_id, email, navn, webinar_id, webinar_titel, session_tid, session_type, registreret_at, state, sidste_action, attended, subscribed, set_procent, set_procent_kilde";

/**
 * Hentningens to beslutninger (udkast 19/9-2026) — de eneste dele af I/O-laget
 * der kan testes som rene funktioner, og præcis dem der afgør om siden virker
 * FØR migration 20260919150000 er kørt i Lovable:
 *
 *   1. Kolonnelisterne: med og uden annoncesporet, uanset om
 *      hooks/webinar.ts's liste allerede har det.
 *   2. erUkendtKolonne: KUN 42703 må udløse en genhentning uden sporet. En
 *      netværksfejl der læses som «kolonnen mangler» ville give et halvt svar
 *      der ligner et helt — den værste af alle fejl på en talflade.
 */

describe("kolonnelisterne — én kilde, to former", () => {
  it("udenAnnoncespor fjerner præcis annoncesporets kolonner og intet andet", () => {
    const uden = udenAnnoncespor("ewebinar_id, email, utm_source, set_procent, fbclid, by");
    expect(uden).toBe("ewebinar_id, email, set_procent");
  });

  it("medAnnoncespor har hver annoncespor-kolonne præcis én gang, også når listen allerede har dem", () => {
    for (const grund of [TILMELDING_KOLONNER, `${TILMELDING_KOLONNER}, utm_source, fbclid`]) {
      const felter = medAnnoncespor(grund).split(",").map((k) => k.trim());
      for (const k of ANNONCESPOR_KOLONNER) {
        expect(felter.filter((f) => f === k), `${k} i «${grund.slice(0, 30)}…»`).toHaveLength(1);
      }
      expect(new Set(felter).size).toBe(felter.length);
    }
  });

  it("grundkolonnerne beholder det dommen ikke kan undvære", () => {
    const uden = udenAnnoncespor(TILMELDING_KOLONNER).split(",").map((k) => k.trim());
    for (const k of ["email", "webinar_id", "session_tid", "registreret_at", "state", "set_procent"]) {
      expect(uden).toContain(k);
    }
  });

  it("tomme led og mellemrum i listen falder fra", () => {
    expect(udenAnnoncespor(" email ,, webinar_id , ")).toBe("email, webinar_id");
  });
});

describe("erUkendtKolonne — kun 42703 må føre til en genhentning uden sporet", () => {
  it("kender PostgREST's kode", () => {
    expect(erUkendtKolonne({ code: "42703", message: 'column webinar_tilmeldinger.utm_source does not exist' })).toBe(true);
  });

  it("kender beskeden, når koden mangler", () => {
    expect(erUkendtKolonne({ message: 'column "fbclid" does not exist' })).toBe(true);
  });

  it("siger NEJ til alt andet — netværk, rettigheder, tomt svar", () => {
    expect(erUkendtKolonne(null)).toBe(false);
    expect(erUkendtKolonne(undefined)).toBe(false);
    expect(erUkendtKolonne({ message: "Failed to fetch" })).toBe(false);
    expect(erUkendtKolonne({ code: "42501", message: "permission denied for table webinar_tilmeldinger" })).toBe(false);
    expect(erUkendtKolonne({ code: "42P01", message: 'relation "public.webinar_tilmeldinger" does not exist' })).toBe(false);
  });
});
