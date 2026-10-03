/**
 * Værtskonsollen — rådgiverens I/O bag /webinar/motor/session/:id (3/10-2026,
 * docs/webinarmotor.md §7.7). Hook = I/O, dommen i lib/webinarMotorAdmin/konsol.ts.
 *
 * ALT GÅR GENNEM RLS (ingen edge function): rådgivere har SELECT på
 * webinar_sessioner, webinarer, webinar_deltagelser, webinar_spoergsmaal og
 * webinar_tilmeldinger (20261003010000 / 20260919130000) og UPDATE på
 * webinar_spoergsmaal fra 20261003050000 — kolonnerne afgrænses af triggeren.
 *
 * INGEN REALTIME (spec §D3): køen og «i rummet» hentes hvert KONSOL_POLL_MS.
 * PERSONDATA: af tilmeldingen hentes KUN fornavn (værn webinarKonsol.guard dom 3).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { urForskydning } from "@/lib/webinarMotor/ur";
import { SVAR_MAIL_LAAS_NOEGLE } from "@/lib/webinarMotor/svarMail";
import {
  iRummetSiden,
  laasFraRaekke,
  KONSOL_POLL_MS,
  KONSOL_UR_MAAL_MS,
  type KonsolSpoergsmaal,
  laesSvar,
  NUL_RAEKKER_TEKST,
  nulRaekkerGrund,
  SVAR_FEJL_TEKST,
} from "@/lib/webinarMotorAdmin/konsol";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabel = (navn: string) => supabase.from(navn as any) as any;

/** En fejl med Supabases kode bevaret, så fladen kan dømme «migration» roligt. */
export class KonsolFejl extends Error {
  readonly code: string | null;
  constructor(kilde: string, e: { message?: string; code?: string } | null) {
    super(`${kilde}: ${e?.message ?? "ukendt fejl"}`);
    this.name = "KonsolFejl";
    this.code = e?.code ?? null;
  }
}

export interface KonsolSession {
  id: string;
  starter_at: string;
  status: string;
  intern: boolean;
  webinar: {
    titel: string;
    slug: string;
    varighed_sek: number;
    intro_sek: number;
    lobby_min: number;
    exitrum_min: number;
  };
}

const KONSOL_KEY = ["webinar", "motor", "konsol"] as const;

export function useKonsolSession(sessionId: string | undefined) {
  const { user, isAdvisor } = useAuth();
  return useQuery({
    queryKey: [...KONSOL_KEY, "session", sessionId],
    enabled: !!user && isAdvisor === true && !!sessionId,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<KonsolSession | null> => {
      const { data, error } = await tabel("webinar_sessioner")
        .select("id, starter_at, status, intern, webinar:webinarer(titel, slug, varighed_sek, intro_sek, lobby_min, exitrum_min)")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw new KonsolFejl("webinar_sessioner", error);
      if (!data || !data.webinar) return null;
      return { ...data, intern: data.intern === true } as KonsolSession;
    },
  });
}

/**
 * Serverens ur: webinar_server_nu() (20261003050000). Forskydningen regnes af
 * motorens urForskydning (samme regnestykke som seerens rum). Før migrationen
 * findes funktionen ikke — så står forskydningen null, og fladen siger «dit ur».
 */
export function useServerForskydning() {
  const { user, isAdvisor } = useAuth();
  return useQuery({
    queryKey: [...KONSOL_KEY, "ur"],
    enabled: !!user && isAdvisor === true,
    refetchInterval: KONSOL_UR_MAAL_MS,
    retry: false,
    queryFn: async (): Promise<number | null> => {
      const sendtMs = Date.now();
      const { data, error } = await (supabase.rpc as any)("webinar_server_nu");
      const modtagetMs = Date.now();
      const serverMs = typeof data === "string" ? Date.parse(data) : NaN;
      if (error || Number.isNaN(serverMs)) return null;
      return urForskydning([{ sendtMs, modtagetMs, serverMs }]);
    },
  });
}

/** Seere med en puls inden for I_RUMMET_SEK — det reelle tal (rådgiveren ser også under 10). */
export function useIRummet(sessionId: string | undefined, serverNu: () => number) {
  const { user, isAdvisor } = useAuth();
  return useQuery({
    queryKey: [...KONSOL_KEY, "i-rummet", sessionId],
    enabled: !!user && isAdvisor === true && !!sessionId,
    refetchInterval: KONSOL_POLL_MS,
    retry: false,
    queryFn: async (): Promise<number> => {
      const { count, error } = await tabel("webinar_deltagelser")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .gt("sidste_puls_at", iRummetSiden(serverNu()));
      if (error) throw new KonsolFejl("webinar_deltagelser", error);
      return count ?? 0;
    },
  });
}

/**
 * Svarmailens lås (app_config.webinar_svar_mail_aktiv) — FAIL-SOFT: en fejl giver
 * null (fladen siger, at det ikke vides), en manglende række false. Konsollens
 * tekst følger den gennem svarLoefteTekst.
 */
export function useSvarMailLaas() {
  const { user, isAdvisor } = useAuth();
  return useQuery({
    queryKey: [...KONSOL_KEY, "svar-mail-laas"],
    enabled: !!user && isAdvisor === true,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<boolean | null> => {
      try {
        const { data, error } = await supabase.from("app_config").select("config_value").eq("config_key", SVAR_MAIL_LAAS_NOEGLE).maybeSingle();
        return laasFraRaekke((data ?? null) as { config_value?: unknown } | null, error);
      } catch {
        return null;
      }
    },
  });
}

/** Spørgsmålskøen — hvert 10. sekund. Af tilmeldingen KUN fornavn. */
export function useSpoergsmaalKoe(sessionId: string | undefined) {
  const { user, isAdvisor } = useAuth();
  return useQuery({
    queryKey: [...KONSOL_KEY, "koe", sessionId],
    enabled: !!user && isAdvisor === true && !!sessionId,
    refetchInterval: KONSOL_POLL_MS,
    retry: false,
    queryFn: async (): Promise<KonsolSpoergsmaal[]> => {
      const { data, error } = await tabel("webinar_spoergsmaal")
        .select("id, tekst, pos_sek, stillet_at, art, status, svar_tekst, svaret_at, leveret, leveret_at, tilmelding:webinar_tilmeldinger(fornavn)")
        .eq("session_id", sessionId)
        .order("stillet_at", { ascending: false })
        .limit(500);
      if (error) throw new KonsolFejl("webinar_spoergsmaal", error);
      return ((data ?? []) as Array<Record<string, any>>).map((r) => ({
        id: r.id,
        tekst: r.tekst,
        pos_sek: r.pos_sek === null || r.pos_sek === undefined ? null : Number(r.pos_sek),
        stillet_at: r.stillet_at,
        art: r.art,
        status: r.status,
        svar_tekst: r.svar_tekst ?? null,
        svaret_at: r.svaret_at ?? null,
        leveret: r.leveret ?? null,
        leveret_at: r.leveret_at ?? null,
        fornavn: (r.tilmelding?.fornavn as string | null | undefined) ?? null,
      }));
    },
  });
}

/**
 * Svaret: KUN status, svar_tekst og svaret_af (svaret_at sætter triggeren).
 * Vagtet på status «ny» — ét svar pr. spørgsmål. 0 rækker → læs status igen og
 * sig hvorfor (RLS før migrationen, eller en anden svarede imens).
 */
export function useSvarSpoergsmaal(sessionId: string | undefined) {
  const { user, erTjenestekonto } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id: string; svar: string }): Promise<void> => {
      const dom = laesSvar(a.svar);
      if (dom.ok === false) throw new Error(SVAR_FEJL_TEKST[dom.fejl]);
      if (!user) throw new Error("Du er ikke logget ind.");
      if (erTjenestekonto) throw new Error(NUL_RAEKKER_TEKST[nulRaekkerGrund(null, true)]);
      const { data, error } = await tabel("webinar_spoergsmaal")
        .update({ status: "besvaret", svar_tekst: dom.svar, svaret_af: user.id })
        .eq("id", a.id)
        .eq("status", "ny")
        .select("id");
      if (error) throw new KonsolFejl("svaret", error);
      if ((data ?? []).length === 0) {
        const { data: nu } = await tabel("webinar_spoergsmaal").select("status").eq("id", a.id).maybeSingle();
        throw new Error(NUL_RAEKKER_TEKST[nulRaekkerGrund((nu?.status as string | undefined) ?? null, erTjenestekonto)]);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [...KONSOL_KEY, "koe", sessionId] }),
  });
}
