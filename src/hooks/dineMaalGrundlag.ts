/**
 * dineMaalGrundlag — hentning og skrivning bag det nye «Dine mål» (1/10-2026,
 * Jonas 21:04 ja til designet; docs/dine-maal-design.md). Motoren er ren
 * (lib/hjemmebane/maalTal.ts); denne fil henter og skriver, så fladen
 * bagefter KUN tegner.
 *
 * Tre kilder, ét batch:
 *   1. Månederne: SAMME query som Boardroom Score (boardroomScoreKey +
 *      hentScoreGrundlag) — react-query deler cachen på nøglen, så forsiden,
 *      hvor Score-kortet og «Dine mål» står sammen, henter facts ÉN gang.
 *      kontraktStart (tidslinjens start) kommer med derfra. Står Score
 *      «afventer_migration» (maaned_foerste_godkendelse findes ikke), er
 *      månederne null, og tal-målene siger «Tallet kan ikke læses endnu» —
 *      ingen egen facts-hentning ved siden af.
 *   2. Målene: milestones med de nye kolonner (migration 20261001210000).
 *      FAIL-SOFT: svarer databasen «kolonnen findes ikke» (42703/PGRST204,
 *      lib/manglendeTabel.erManglendeKolonne), læses de gamle kolonner, de
 *      nye sættes til null, og `afventerMigration` er sand — alle mål står så
 *      som «Gør målet skarpt», og en skrivning af de nye felter afvises med
 *      grunden. Enhver ANDEN fejl kaster HentningsFejl (en fejl er ikke «ingen mål»).
 *   3. Skridtene: company_actions med maal_id (alle statusser — gjorte er
 *      historik og tidslinjens punkter), med created_at (naesteSkridt: nyeste
 *      forslag). Egen nøgle under «dine-maal», så DineMaalView's
 *      invalidateQueries(["dine-maal"]) også rammer den.
 *
 * SKRIVNINGEN går gennem den EKSISTERENDE vej: medlemmets klientskrivning på
 * milestones (som useMilestones — RLS uændret, politikkerne er på rækken;
 * migrationens filhoved). Rådgiveren skriver gennem maal-skriv, som IKKE kender
 * de nye felter endnu — den udvidelse kræver eksplicit udrulning og er ikke en
 * del af motoren. Ingen ny edge function.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { boardroomScoreKey, GRUNDLAG_GENHENT_MS, DOM_UR_MS, hentScoreGrundlag } from "@/hooks/useBoardroomScore";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { erManglendeKolonne } from "@/lib/manglendeTabel";
import { maalFejlTekst } from "@/lib/hjemmebane/maalFejl";
import type { ScoreMaaned } from "@/lib/boardroomScore";
import {
  doemNytMaal,
  maalKort,
  tidslinje,
  tidslinjeStart,
  type MaalKort,
  type MaalMedTal,
  type NytMaalInput,
  type SkridtTilMaal,
  type TidslinjeDom,
} from "@/lib/hjemmebane/maalTal";

/** Kolonnerne FØR migrationen — dem, alle mål har i dag. */
export const MAAL_KOLONNER_GAMLE = "id, title, status, deadline, created_at, target_value, current_value, unit";
/** Kolonnerne EFTER migrationen 20261001210000. */
export const MAAL_KOLONNER_NYE = `${MAAL_KOLONNER_GAMLE}, art, maal_noegle, udgangspunkt, udgangspunkt_dato`;
export const SKRIDT_KOLONNER = "id, title, status, due_date, maal_id, closed_at, created_at";

export const dineMaalMaalKey = (companyId: string | undefined | null) => ["dine-maal", "maal-med-tal", companyId] as const;
export const dineMaalSkridtKey = (companyId: string | undefined | null) => ["dine-maal", "skridt-til-maal", companyId] as const;

export interface MaalHentning {
  maal: MaalMedTal[];
  /** Migrationen 20261001210000 er ikke kørt: de nye kolonner findes ikke (læst som null). */
  afventerMigration: boolean;
}

type Raekke = Partial<MaalMedTal> & { id: string; title: string; status: string; created_at: string };

function tilMaal(r: Raekke): MaalMedTal {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    deadline: r.deadline ?? null,
    created_at: r.created_at,
    target_value: r.target_value ?? null,
    current_value: r.current_value ?? null,
    unit: r.unit ?? null,
    art: r.art ?? null,
    maal_noegle: r.maal_noegle ?? null,
    udgangspunkt: r.udgangspunkt ?? null,
    udgangspunkt_dato: r.udgangspunkt_dato ?? null,
  };
}

/** Virksomhedens mål — med de nye kolonner, eller de gamle + afventerMigration. */
export async function hentMaalMedTal(companyId: string): Promise<MaalHentning> {
  const ny = await supabase.from("milestones").select(MAAL_KOLONNER_NYE).eq("company_id", companyId).order("created_at", { ascending: true });
  if (ny.error && erManglendeKolonne(ny.error)) {
    const gammel = await supabase.from("milestones").select(MAAL_KOLONNER_GAMLE).eq("company_id", companyId).order("created_at", { ascending: true });
    const raekker = kraevRaekker(gammel as { data: Raekke[] | null; error: { message: string } | null }, "milestones");
    return { maal: raekker.map(tilMaal), afventerMigration: true };
  }
  const raekker = kraevRaekker(ny as unknown as { data: Raekke[] | null; error: { message: string } | null }, "milestones");
  return { maal: raekker.map(tilMaal), afventerMigration: false };
}

/** Skridtene under virksomhedens mål (alle statusser). */
export async function hentSkridtTilMaal(companyId: string): Promise<SkridtTilMaal[]> {
  const res = await supabase
    .from("company_actions")
    .select(SKRIDT_KOLONNER)
    .eq("company_id", companyId)
    .not("maal_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(500);
  return kraevRaekker(res as unknown as { data: SkridtTilMaal[] | null; error: { message: string } | null }, "company_actions");
}

export interface DineMaalGrundlag {
  maal: MaalMedTal[];
  skridt: SkridtTilMaal[];
  /** De målte måneder fra Score-grundlaget; null mens Score afventer sin migration. */
  maaneder: ScoreMaaned[] | null;
  kontraktStart: string | null;
  afventerMigration: boolean;
}

export interface DineMaalSvar {
  grundlag: DineMaalGrundlag | undefined;
  /** Ét kort pr. AKTIVT mål (højst tre vises af fladen — MAX_AKTIVE_MAAL), ældste først. */
  kort: MaalKort[];
  tidslinje: TidslinjeDom | null;
  afventerMigration: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

/** Den rene samling: kort for de aktive mål + tidslinjen. Eksporteret, så den kan prøves uden React. */
export function byggDineMaal(g: DineMaalGrundlag, nu: Date): { kort: MaalKort[]; tidslinje: TidslinjeDom } {
  const aktive = g.maal.filter((m) => m.status === "active");
  return {
    kort: aktive.map((m) => maalKort(m, g.skridt, g.maaneder, nu)),
    tidslinje: tidslinje(g.maal, g.skridt, tidslinjeStart(g.kontraktStart, g.maal, nu), nu),
  };
}

export function useDineMaalGrundlag(overrideCompanyId?: string): DineMaalSvar {
  const { user, companyId: authCompanyId } = useAuth();
  const companyId = overrideCompanyId ?? authCompanyId;
  const aktiv = !!user && !!companyId;

  // Samme nøgle og samme hentning som useBoardroomScore — én facts-hentning pr. side.
  const score = useQuery({
    queryKey: boardroomScoreKey(companyId ?? undefined),
    queryFn: () => hentScoreGrundlag(companyId!, new Date()),
    enabled: aktiv,
    staleTime: GRUNDLAG_GENHENT_MS,
    refetchInterval: GRUNDLAG_GENHENT_MS,
  });
  const maal = useQuery({ queryKey: dineMaalMaalKey(companyId), queryFn: () => hentMaalMedTal(companyId!), enabled: aktiv, staleTime: 60_000 });
  const skridt = useQuery({ queryKey: dineMaalSkridtKey(companyId), queryFn: () => hentSkridtTilMaal(companyId!), enabled: aktiv, staleTime: 60_000 });

  // Uret (som Score): sporet og fristerne afhænger af `nu`.
  const [nuMs, setNuMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNuMs(Date.now()), DOM_UR_MS);
    return () => window.clearInterval(id);
  }, []);

  const grundlag: DineMaalGrundlag | undefined = useMemo(() => {
    if (!maal.data || !skridt.data || !score.data) return undefined;
    const klar = score.data.tilstand === "klar" ? score.data.grundlag : null;
    return {
      maal: maal.data.maal,
      skridt: skridt.data,
      maaneder: klar ? [...klar.maaneder] : null,
      kontraktStart: klar?.kontraktStart ?? null,
      afventerMigration: maal.data.afventerMigration,
    };
  }, [maal.data, skridt.data, score.data]);

  const bygget = useMemo(() => (grundlag ? byggDineMaal(grundlag, new Date(nuMs)) : null), [grundlag, nuMs]);

  return {
    grundlag,
    kort: bygget?.kort ?? [],
    tidslinje: bygget?.tidslinje ?? null,
    afventerMigration: maal.data?.afventerMigration ?? false,
    isLoading: score.isLoading || maal.isLoading || skridt.isLoading,
    isError: score.isError || maal.isError || skridt.isError,
    error: score.error ?? maal.error ?? skridt.error,
  };
}

// ── Skrivning (medlemmets klientvej, som useMilestones) ──────────────────────

export type SkriveSvar = { ok: true; id: string | null } | { ok: false; grund: string; afventerMigration: boolean };

export const AFVENTER_MIGRATION_TEKST = "Målene kan ikke gemmes med tal endnu — opdateringen er på vej.";

function fejlSvar(error: { code?: string | null; message?: string | null }, ellers: string): SkriveSvar {
  if (erManglendeKolonne(error)) return { ok: false, grund: AFVENTER_MIGRATION_TEKST, afventerMigration: true };
  return { ok: false, grund: maalFejlTekst(error, ellers), afventerMigration: false };
}

/**
 * Opret et mål fra guiden. Dommen (doemNytMaal) først — fail-closed; derefter
 * ÉN insert gennem medlemmets RLS. «Højst tre aktive» dømmes af databasen
 * (trigger 20260917150000) og oversættes af maalFejlTekst.
 */
export async function opretMaalMedTal(args: { companyId: string; userId: string; input: NytMaalInput; nu: Date }): Promise<SkriveSvar> {
  const dom = doemNytMaal(args.input, args.nu);
  if (dom.ok === false) return { ok: false, grund: dom.grund, afventerMigration: false };
  const payload = {
    ...dom.felter,
    company_id: args.companyId,
    user_id: args.userId,
    source: "manual",
    category: "other",
    progress: 0,
    status: "active",
  };
  const { data, error } = await supabase.from("milestones").insert(payload).select("id").maybeSingle();
  if (error) return fejlSvar(error, "Kunne ikke oprette målet");
  return { ok: true, id: (data as { id: string } | null)?.id ?? null };
}

/**
 * «Gør målet skarpt»: et eksisterende mål får art, nøgle, tal og frist —
 * samme dom som oprettelsen. Status, progress og skridt røres ikke.
 */
export async function goerMaalSkarpt(args: { maalId: string; input: NytMaalInput; nu: Date }): Promise<SkriveSvar> {
  const dom = doemNytMaal(args.input, args.nu);
  if (dom.ok === false) return { ok: false, grund: dom.grund, afventerMigration: false };
  const { data, error } = await supabase.from("milestones").update(dom.felter).eq("id", args.maalId).select("id");
  if (error) return fejlSvar(error, "Kunne ikke gemme målet");
  // RLS kan afvise en UPDATE med NUL rækker uden fejl — det er ikke et «gemt».
  if (!data || (data as unknown[]).length === 0) return { ok: false, grund: "Målet blev ikke gemt — det findes ikke, eller du har ikke adgang til det.", afventerMigration: false };
  return { ok: true, id: args.maalId };
}
