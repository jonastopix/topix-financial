import { describe, expect, it } from "vitest";
import { erManglendeKolonne, erManglendeTabel } from "@/lib/manglendeTabel";

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

/* «Findes KOLONNEN ikke?» — kun da falder Dine måls læser tilbage på de gamle kolonner (1/10-2026). */
describe("erManglendeKolonne", () => {
  it("42703 (SELECT) og PGRST204 (INSERT/UPDATE) er en manglende kolonne", () => {
    expect(erManglendeKolonne({ code: "42703", message: "column milestones.art does not exist" })).toBe(true);
    expect(erManglendeKolonne({ code: "PGRST204", message: "Could not find the 'art' column of 'milestones' in the schema cache" })).toBe(true);
  });
  it("en manglende TABEL, RLS, en trigger og netværk er IKKE en manglende kolonne", () => {
    expect(erManglendeKolonne({ code: "PGRST205", message: "Could not find the table 'public.x' in the schema cache" })).toBe(false);
    expect(erManglendeKolonne({ code: "42P01", message: 'relation "x" does not exist' })).toBe(false);
    expect(erManglendeKolonne({ code: "42501", message: "permission denied for table milestones" })).toBe(false);
    expect(erManglendeKolonne({ code: "P0001", message: "column x does not exist" })).toBe(false);
    expect(erManglendeKolonne({ message: "Failed to fetch" })).toBe(false);
  });
  it("uden kode: kun en entydig besked", () => {
    expect(erManglendeKolonne({ message: 'column "art" does not exist' })).toBe(true);
    expect(erManglendeKolonne({ message: "Could not find the 'art' column of 'milestones' in the schema cache" })).toBe(true);
    expect(erManglendeKolonne(null)).toBe(false);
  });
});
