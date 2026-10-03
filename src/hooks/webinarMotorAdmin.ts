/**
 * Webinarmotorens opsætning — rådgiverens I/O bag /webinar/motor (skive 3, 30/9-2026).
 * Hook = I/O, lib = dom: formularerne dømmes i src/lib/webinarMotorAdmin/opsaetning.ts.
 *
 * LÆSNING OG SKRIVNING GÅR GENNEM RLS: rådgivere har SELECT (20261003010000) og
 * INSERT/UPDATE på webinarer og webinar_sessioner og INSERT/UPDATE/DELETE på
 * KLADDEN af webinar_interaktioner (20261003030000). Databasen dømmer igen:
 * CHECK'ene, triggerne (en udgivet version ændres aldrig; tidslinje_version går
 * kun frem; en session med tilmeldte flyttes ikke) og politikkerne.
 *
 * Hver UPDATE er vagtet på den værdi, fladen så (status, tidslinje_version), så
 * to faner aldrig overskriver hinanden i tavshed: 0 rækker = «ændret imens».
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kraevRaekker } from "@/lib/kraevRaekker";
import type { CtaRaekke, InteraktionRaekke, SessionRaekke, WebinarRaekke } from "@/lib/webinarMotorAdmin/opsaetning";
import { kopierTilKladde } from "@/lib/webinarMotorAdmin/opsaetning";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabel = (navn: string) => supabase.from(navn as any) as any;

export const MOTOR_ADMIN_KEY = ["webinar", "motor", "admin"] as const;

export interface MotorWebinar {
  id: string;
  slug: string;
  titel: string;
  status: string;
  varighed_sek: number;
  bunny_video_id: string | null;
  vaert_navn: string | null;
  lobby_min: number;
  exitrum_min: number;
  tidslinje_version: number;
  created_at: string;
}

export interface MotorSession {
  id: string;
  webinar_id: string;
  starter_at: string;
  status: string;
  intern: boolean;
  kapacitet: number | null;
  tidslinje_version: number | null;
  /** Platformens tilmeldte (webinar_tilmeldinger.session_id). */
  tilmeldte: number;
}

export interface MotorInteraktion {
  id: string;
  webinar_id: string;
  version: number;
  art: string;
  vis_fra_sek: number;
  vis_til_sek: number | null;
  placering: string;
  indhold: Record<string, unknown>;
  betingelse: unknown;
  udloeber_kilde: string | null;
}

export interface MotorData {
  webinarer: MotorWebinar[];
  sessioner: MotorSession[];
  interaktioner: MotorInteraktion[];
}

export async function hentMotorData(): Promise<MotorData> {
  const webinarer = kraevRaekker(
    await tabel("webinarer").select("id, slug, titel, status, varighed_sek, bunny_video_id, vaert_navn, lobby_min, exitrum_min, tidslinje_version, created_at").order("created_at", { ascending: false }).limit(100),
    "webinarer",
  ) as MotorWebinar[];
  const sRaa = kraevRaekker(
    await tabel("webinar_sessioner").select("id, webinar_id, starter_at, status, intern, kapacitet, tidslinje_version").order("starter_at", { ascending: false }).limit(300),
    "webinar_sessioner",
  ) as Array<Omit<MotorSession, "tilmeldte">>;
  const ids = sRaa.map((s) => s.id);
  const tael = new Map<string, number>();
  if (ids.length > 0) {
    const tRaa = kraevRaekker(
      await tabel("webinar_tilmeldinger").select("session_id").eq("kilde_system", "platform").in("session_id", ids).limit(10000),
      "webinar_tilmeldinger",
    ) as Array<{ session_id: string }>;
    for (const t of tRaa) tael.set(t.session_id, (tael.get(t.session_id) ?? 0) + 1);
  }
  const interaktioner = kraevRaekker(
    await tabel("webinar_interaktioner").select("id, webinar_id, version, art, vis_fra_sek, vis_til_sek, placering, indhold, betingelse, udloeber_kilde").order("vis_fra_sek", { ascending: true }).limit(2000),
    "webinar_interaktioner",
  ) as MotorInteraktion[];
  return { webinarer, sessioner: sRaa.map((s) => ({ ...s, intern: s.intern === true, tilmeldte: tael.get(s.id) ?? 0 })), interaktioner };
}

/** Rådgivere alene — RLS ville ellers give tomme lister. */
export function useMotorData() {
  const { user, isAdvisor } = useAuth();
  return useQuery({
    queryKey: MOTOR_ADMIN_KEY,
    enabled: !!user && isAdvisor === true,
    staleTime: 30 * 1000,
    queryFn: hentMotorData,
  });
}

export type MotorHandling =
  | { art: "opret_webinar"; webinar: WebinarRaekke; cta: CtaRaekke | null; brugerId: string | null }
  | { art: "status"; webinarId: string; fra: string; til: string }
  | { art: "opret_session"; webinarId: string; session: SessionRaekke }
  | { art: "aflys_session"; sessionId: string; fra: string }
  | { art: "opret_interaktion"; webinarId: string; kladde: number; raekke: InteraktionRaekke }
  | { art: "slet_interaktion"; id: string }
  | { art: "kladde_fra_udgivet"; webinarId: string; udgivne: MotorInteraktion[]; kladde: number }
  | { art: "udgiv"; webinarId: string; udgivet: number; kladde: number };

function fejlTekst(e: { message?: string; code?: string } | null): string {
  if (!e) return "ukendt fejl";
  if (e.code === "23505") return "Findes allerede (slug'en eller tidspunktet er taget).";
  if (e.code === "55000") return e.message ?? "Ikke tilladt.";
  if (e.code === "42501") return "Kun rådgivere kan det her.";
  return e.message ?? "ukendt fejl";
}

/** Én UPDATE, der SKAL ramme præcis én række. */
async function enRaekke(p: PromiseLike<{ data: unknown[] | null; error: { message?: string; code?: string } | null }>): Promise<void> {
  const { data, error } = await p;
  if (error) throw new Error(fejlTekst(error));
  if (!data || data.length !== 1) throw new Error("Ændret imens — genindlæs og prøv igen.");
}

export async function udfoerMotorHandling(h: MotorHandling): Promise<void> {
  switch (h.art) {
    case "opret_webinar": {
      const { data, error } = await tabel("webinarer").insert({ ...h.webinar, oprettet_af: h.brugerId }).select("id").single();
      if (error) throw new Error(fejlTekst(error));
      if (h.cta) {
        const { error: cFejl } = await tabel("webinar_interaktioner").insert({ ...h.cta, webinar_id: (data as { id: string }).id, version: 1 });
        if (cFejl) throw new Error(`Webinaret er oprettet, men CTA'en ikke: ${fejlTekst(cFejl)}`);
      }
      return;
    }
    case "status":
      return enRaekke(tabel("webinarer").update({ status: h.til }).eq("id", h.webinarId).eq("status", h.fra).select("id"));
    case "opret_session": {
      const { error } = await tabel("webinar_sessioner").insert({ ...h.session, webinar_id: h.webinarId });
      if (error) throw new Error(fejlTekst(error));
      return;
    }
    case "aflys_session":
      return enRaekke(tabel("webinar_sessioner").update({ status: "aflyst" }).eq("id", h.sessionId).eq("status", h.fra).select("id"));
    case "opret_interaktion": {
      const { error } = await tabel("webinar_interaktioner").insert({ ...h.raekke, webinar_id: h.webinarId, version: h.kladde });
      if (error) throw new Error(fejlTekst(error));
      return;
    }
    case "slet_interaktion": {
      const { data, error } = await tabel("webinar_interaktioner").delete().eq("id", h.id).select("id");
      if (error) throw new Error(fejlTekst(error));
      if (!data || data.length !== 1) throw new Error("Kun kladdens interaktioner kan slettes.");
      return;
    }
    case "kladde_fra_udgivet": {
      const raekker = kopierTilKladde(h.udgivne, h.webinarId, h.kladde);
      if (raekker.length === 0) return;
      const { error } = await tabel("webinar_interaktioner").insert(raekker);
      if (error) throw new Error(fejlTekst(error));
      return;
    }
    case "udgiv":
      return enRaekke(tabel("webinarer").update({ tidslinje_version: h.kladde }).eq("id", h.webinarId).eq("tidslinje_version", h.udgivet).select("id"));
  }
}

export function useMotorHandling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: udfoerMotorHandling,
    onSettled: () => qc.invalidateQueries({ queryKey: MOTOR_ADMIN_KEY }),
  });
}
