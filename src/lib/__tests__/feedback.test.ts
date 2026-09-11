/**
 * Feedback-motoren (11/9, kort 85): de rene dele flyttet ud af
 * FeedbackDialog uden ændret adfærd — og stiens første mappe låst mod
 * storage-policyens mappetjek.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Motoren bærer også skrivevejen (sendFeedback) og importerer derfor
// Supabase-klienten på modulniveau; i jsdom starter klienten auth-refresh
// uden storage (unhandled rejection). Mockes som memberProfile.test.ts:7 —
// de rene dele der testes her rører den aldrig.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  doemSkaermbillede,
  FEEDBACK_BESKRIVELSE_MAX,
  FEEDBACK_KATEGORIER,
  FEEDBACK_STANDARD_KATEGORI,
  FEEDBACK_TITEL_MAX,
  kanSendeFeedback,
  klargoerBeskrivelse,
  klargoerTitel,
  SKAERMBILLEDE_BUCKET,
  SKAERMBILLEDE_MAX_BYTES,
  skaermbilledeSti,
} from "@/lib/feedback";

describe("kategorierne", () => {
  it("værdierne er uændrede (admin og databasen læser dem); etiketterne er danske", () => {
    expect(FEEDBACK_KATEGORIER.map((k) => k.key)).toEqual(["bug", "suggestion", "other"]);
    expect(FEEDBACK_KATEGORIER.map((k) => k.label)).toEqual(["Fejl", "Forslag", "Andet"]);
    expect(FEEDBACK_STANDARD_KATEGORI).toBe("suggestion");
  });
});

describe("skærmbilledet — image/* og 5 MB, som FeedbackDialog.tsx:54 og :58", () => {
  it("et billede under grænsen går igennem", () => {
    expect(doemSkaermbillede({ type: "image/png", size: 1024 })).toEqual({ ok: true });
    expect(doemSkaermbillede({ type: "image/jpeg", size: SKAERMBILLEDE_MAX_BYTES })).toEqual({ ok: true });
  });
  it("ikke et billede → «Kun billeder» med dialogens tekst", () => {
    expect(doemSkaermbillede({ type: "application/pdf", size: 10 })).toEqual({
      ok: false, titel: "Kun billeder", tekst: "Upload venligst et billede (PNG, JPG, etc.).",
    });
    expect(doemSkaermbillede({ type: "", size: 10 }).ok).toBe(false);
  });
  it("over 5 MB → «For stort»", () => {
    expect(SKAERMBILLEDE_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(doemSkaermbillede({ type: "image/png", size: SKAERMBILLEDE_MAX_BYTES + 1 })).toEqual({
      ok: false, titel: "For stort", tekst: "Billedet må max fylde 5 MB.",
    });
  });
  it("typen dømmes før størrelsen", () => {
    expect(doemSkaermbillede({ type: "text/plain", size: SKAERMBILLEDE_MAX_BYTES + 1 }).ok).toBe(false);
    const d = doemSkaermbillede({ type: "text/plain", size: SKAERMBILLEDE_MAX_BYTES + 1 });
    expect(d.ok === false && d.titel).toBe("Kun billeder");
  });
});

describe("stien — `{userId}/{tidsstempel}.{ext}` som FeedbackDialog.tsx:81-82", () => {
  it("første mappe er brugerens id, filen er tidsstemplet med filnavnets endelse", () => {
    expect(skaermbilledeSti("u1", "skaerm.png", 1700000000000)).toBe("u1/1700000000000.png");
    expect(skaermbilledeSti("u1", "Skærmbillede 2026-09-11.JPG", 5)).toBe("u1/5.JPG");
  });
  it("uden endelse: filnavnets sidste led (som før — `split('.').pop()`), tomt navn → png", () => {
    expect(skaermbilledeSti("u1", "billede", 5)).toBe("u1/5.billede");
    expect(skaermbilledeSti("u1", "", 5)).toBe("u1/5.png");
  });
});

/* KILDEVÆRN: storage-policyen kræver auth.uid() som første mappe. Stien
   og policyen skal blive ved med at passe sammen — ændres én af dem,
   fejler uploaden i prod uden at nogen test ellers ville se det. */
describe("kildeværn: stiens første mappe er den policyen kræver", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260911030000_feedback_bucket_mappetjek.sql"), "utf8");
  const policy = migration.split('CREATE POLICY "Users can upload own feedback screenshots"')[1]?.split(";")[0] ?? "";

  it("policyen: INSERT på bucketen med (storage.foldername(name))[1] = auth.uid()::text", () => {
    expect(policy).toContain(`bucket_id = '${SKAERMBILLEDE_BUCKET}'`);
    expect(policy).toContain("(storage.foldername(name))[1] = auth.uid()::text");
  });
  it("stien: første mappe er præcis userId, intet præfiks og ingen mappe før", () => {
    const sti = skaermbilledeSti("3f9c1c2e-0000-4000-8000-000000000000", "x.png", 1);
    expect(sti.split("/")).toHaveLength(2);
    expect(sti.split("/")[0]).toBe("3f9c1c2e-0000-4000-8000-000000000000");
  });
});

describe("titel og beskrivelse — 120 og 2000 tegn, trimmet (FeedbackDialog.tsx:158, :167, :102-103)", () => {
  it("grænserne", () => {
    expect(FEEDBACK_TITEL_MAX).toBe(120);
    expect(FEEDBACK_BESKRIVELSE_MAX).toBe(2000);
    expect(klargoerTitel("x".repeat(200))).toHaveLength(120);
    expect(klargoerBeskrivelse("y".repeat(3000))).toHaveLength(2000);
  });
  it("trimning efter afgrænsning — som inputtets maxLength efterfulgt af trim()", () => {
    expect(klargoerTitel("  Knappen virker ikke  ")).toBe("Knappen virker ikke");
    expect(klargoerBeskrivelse("  ")).toBe("");
    expect(klargoerTitel(" " + "x".repeat(120))).toBe("x".repeat(119));
  });
  it("kan sende: kun når titlen ikke er tom efter trimning", () => {
    expect(kanSendeFeedback("")).toBe(false);
    expect(kanSendeFeedback("   ")).toBe(false);
    expect(kanSendeFeedback(" a ")).toBe(true);
  });
});
