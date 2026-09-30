import { describe, expect, it } from "vitest";
import { erManglendeTabel } from "@/lib/manglendeTabel";

/* «Findes tabellen slet ikke?» — kun da må Score-kortet stå roligt «på vej». */

describe("erManglendeTabel", () => {
  it("PGRST205 (PostgREST ≥ 12) og 42P01 (Postgres) er en manglende tabel", () => {
    expect(erManglendeTabel({ code: "PGRST205", message: "Could not find the table 'public.maaned_foerste_godkendelse' in the schema cache" })).toBe(true);
    expect(erManglendeTabel({ code: "42P01", message: 'relation "public.maaned_foerste_godkendelse" does not exist' })).toBe(true);
  });
  it("en manglende KOLONNE, RLS, netværk og timeouts er IKKE en manglende tabel", () => {
    expect(erManglendeTabel({ code: "42703", message: 'column "x" does not exist' })).toBe(false);
    expect(erManglendeTabel({ code: "PGRST204", message: "Could not find the 'x' column of 'y' in the schema cache" })).toBe(false);
    expect(erManglendeTabel({ code: "42501", message: "permission denied for table maaned_foerste_godkendelse" })).toBe(false);
    expect(erManglendeTabel({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(erManglendeTabel({ message: "TypeError: Failed to fetch" })).toBe(false);
  });
  it("koden vinder over beskeden: en anden kode med «does not exist» i teksten er ikke en manglende tabel", () => {
    expect(erManglendeTabel({ code: "XX000", message: 'relation "x" does not exist' })).toBe(false);
  });
  it("uden kode: kun entydige beskeder", () => {
    expect(erManglendeTabel({ message: 'relation "public.x" does not exist' })).toBe(true);
    expect(erManglendeTabel({ message: "Could not find the table 'public.x' in the schema cache" })).toBe(true);
    expect(erManglendeTabel({ code: "", message: "noget gik galt" })).toBe(false);
  });
  it("intet svar er ingen fejl", () => {
    expect(erManglendeTabel(null)).toBe(false);
    expect(erManglendeTabel(undefined)).toBe(false);
  });
});
