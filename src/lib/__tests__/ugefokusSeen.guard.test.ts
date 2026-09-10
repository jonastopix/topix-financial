/**
 * Ugens fokus — seen_at's skrivevej (11/9). CI har ingen database, så
 * rækkedommen «ejeren må, en anden må ikke, kun den kolonne» låses som
 * kildeværn på migrationen — og forsidens markSeen låses til at LÆSE
 * svaret (den slugte «0 rows» i seks uger).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260911060000_weekly_focus_seen_at.sql"), "utf8");
const forside = readFileSync(resolve(process.cwd(), "src/components/hjemmebane/boardroom/BoardroomView.tsx"), "utf8");
const policy = migration.split('CREATE POLICY "Members set seen_at on own weekly focus"')[1]?.split(";")[0] ?? "";
const trigger = migration.split("FUNCTION public.protect_weekly_focus_seen_only()")[1]?.split("$$;")[0] ?? "";

describe("policyen: ejeren må — en anden må ikke", () => {
  it("UPDATE for authenticated, USING og WITH CHECK begge på egen virksomhed", () => {
    expect(policy).toContain("FOR UPDATE TO authenticated");
    expect(policy).toContain("USING (company_id = public.user_company_id(auth.uid()))");
    expect(policy).toContain("WITH CHECK (company_id = public.user_company_id(auth.uid()))");
  });
  it("ingen rådgiver-UPDATE: has_role optræder ikke i policyen", () => {
    expect(policy).not.toContain("has_role");
    expect(migration).not.toMatch(/CREATE POLICY[^;]*has_role[^;]*FOR UPDATE/s);
  });
});

describe("kolonnelåsen: kun seen_at, service role forbi", () => {
  it("triggeren fyrer BEFORE UPDATE på weekly_focus", () => {
    expect(migration).toContain("CREATE TRIGGER protect_weekly_focus_seen_only\nBEFORE UPDATE ON public.weekly_focus");
  });
  it("service role returnerer NEW uændret — generate-weekly-focus' upsert skal igennem", () => {
    expect(trigger).toContain("IF auth.role() = 'service_role' THEN\n    RETURN NEW;");
  });
  it("alle kolonner undtagen seen_at er låst — seen_at nævnes IKKE i låsen", () => {
    for (const k of ["company_id", "week_key", "status", "triggers_fired", "trigger_data", "headline", "summary", "actions_generated", "data_freshness_days", "generated_at", "expires_at", "created_at"]) {
      expect(trigger, `${k} skal være låst`).toContain(`NEW.${k} IS DISTINCT FROM OLD.${k}`);
    }
    expect(trigger).not.toContain("NEW.seen_at IS DISTINCT FROM OLD.seen_at");
    expect(trigger).toContain("RAISE EXCEPTION 'weekly_focus: only seen_at may be changed by members'");
  });
  it("migrationen er ikke kørt (bogført i filen)", () => {
    expect(migration).toContain("IKKE KØRT");
  });
});

describe("forsidens markSeen læser svaret (#797-lærdommen)", () => {
  const markSeen = forside.split("const markSeen = useMutation({")[1]?.split("});")[0] ?? "";
  it("select'er rækken tilbage og kaster ved fejl OG ved nul rækker", () => {
    expect(markSeen).toContain('.select("id")');
    expect(markSeen).toContain("if (error) throw new Error(");
    expect(markSeen).toContain("if (!data || data.length === 0) throw new Error(");
    expect(markSeen).toContain('mutationKey: ["boardroom", "weekly-focus", "seen"]');
  });
  it("den gamle tavse form er væk", () => {
    expect(forside).not.toContain('await supabase.from("weekly_focus").update({ seen_at: new Date().toISOString() } as any).eq("id", id);\n    },');
  });
});
