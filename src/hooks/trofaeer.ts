/**
 * src/hooks/trofaeer.ts — hentningen bag trofæerne (1/10-2026). Dommen bor i
 * src/lib/gamification/trofaeer.ts; her er kun Supabase-kaldene.
 *
 *   hentMedlemmetsTrofaeGrundlag(companyId, maaneder, kontraktStart)
 *     — MEDLEMMETS flade. Henter KUN egne data: hver tabel filtreres på
 *       virksomhedens id (milestones, budget_targets, pulse_checkins,
 *       company_members — company-scoped RLS) eller på virksomhedens egne
 *       brugere (community_traade/community_svar som forfatter); tråd-opslaget
 *       for svarene går kun på de tråde, vores egne svar står i, og vælger kun
 *       forfatteren. Månederne kommer fra useBoardroomScore (samme grundlag
 *       som scoren — ingen dobbelt hentning). Kildeværn: trofaeer.guard.test.ts.
 *   hentRaadgiverListe() — get_all_advisor_profiles + tjenestekonti som ROLLE:
 *       «er tråden skrevet af en rådgiver?». Filtreres BEVIDST ikke (en
 *       tjenestekontos tråd er heller ikke et medlems — den skal MED i mængden).
 *   hentEngagement(nu) — RÅDGIVERENS /engagement: alle kundevirksomheder i ét
 *       batch (hentAlleSider; ingen kald pr. virksomhed). Målene (Aktive mål,
 *       Sidst rørt — lib/hjemmebane/engagementMaal.ts) hentes i samme batch,
 *       men FAIL-SOFT: fejler milestones/company_actions — eller er
 *       mållæsningen tom — står kolonnerne med «—» og siden med en rolig
 *       linje (maalHentefejl = kilderne) — resten af siden vælter ikke.
 *       Akademiet (3/10-2026, lib/hjemmebane/akademiFremdrift.ts) hentes i
 *       samme batch og på samme måde FAIL-SOFT (akademiHentefejl): det
 *       publicerede katalog + ALLE member_progress-rækker (sidevis, ét kald
 *       pr. side — ingen N+1); dommen pr. lektion er itemProgressState.
 *
 * Fejl er en fejl (husets regel): kraevRaekker kaster HentningsFejl. Fladen er
 * fail-soft — kortet står roligt uden trofæer.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { hentAlleSider } from "@/lib/budgetEngine";
import { erManglendeTabel } from "@/lib/manglendeTabel";
import { kbhDele } from "@/lib/hverdage";
import { hentTjenestekonti } from "@/hooks/tjenestekonti";
import { erKunde } from "@/lib/raadgiverensKunder";
import { boardroomScore, tidligsteGodkendelse, type ScoreDom, type ScoreMaaned } from "@/lib/boardroomScore";
import { trofaeDom, type TrofaeDom, type TrofaeGrundlag } from "@/lib/gamification/trofaeer";
import { kildeAf } from "@/lib/hjemmebane/hentefejl";
import {
  engagementMaalPrVirksomhed,
  INGEN_MAAL,
  MAAL_ID_BID,
  STATUSSER_I_HENTNINGEN,
  TOM_MAAL_LAESNING,
  tomMaalLaesning,
  type EngagementMaalDom,
  type EngagementMaalRaekke,
  type EngagementSkridtRaekke,
} from "@/lib/hjemmebane/engagementMaal";
import { AREAS } from "@/lib/hjemmebane/adminContentApi";
import { listPublishedItems } from "@/lib/hjemmebane/akademiApi";
import {
  AKADEMI_FREMDRIFT_KOLONNER,
  akademiFremdriftPrVirksomhed,
  akademiKatalog,
  type AkademiFremdrift,
  type AkademiFremdriftRaekke,
} from "@/lib/hjemmebane/akademiFremdrift";
import type { Json } from "@/integrations/supabase/types";

const side = <T,>(kilde: string) =>
  (res: { data: T[] | null; error: { message: string } | null }) => ({ data: kraevRaekker(res as any, kilde) as T[], error: null });

/** Rådgivere og tjenestekonti som ROLLE (se filhovedet). */
export async function hentRaadgiverListe(): Promise<Set<string>> {
  const [res, tjenestekonti] = await Promise.all([supabase.rpc("get_all_advisor_profiles" as any) as any, hentTjenestekonti()]);
  const raekker = kraevRaekker(res, "get_all_advisor_profiles") as { user_id: string | null }[];
  const ud = new Set<string>(tjenestekonti);
  for (const r of raekker) if (r.user_id) ud.add(r.user_id);
  return ud;
}

/** Tråd-id → forfatter, i bidder á 200 (URL-længden). */
async function traadForfattere(traadIds: string[]): Promise<Map<string, string>> {
  const ud = new Map<string, string>();
  for (let i = 0; i < traadIds.length; i += 200) {
    const res = await supabase.from("community_traade").select("id, forfatter_id").in("id", traadIds.slice(i, i + 200));
    for (const r of kraevRaekker(res, "community_traade") as { id: string; forfatter_id: string }[]) ud.set(r.id, r.forfatter_id);
  }
  return ud;
}

export async function hentMedlemmetsTrofaeGrundlag(
  companyId: string,
  maaneder: readonly ScoreMaaned[],
  kontraktStart: string | null,
): Promise<TrofaeGrundlag> {
  const medlemmerRes = await supabase.from("company_members").select("user_id").eq("company_id", companyId);
  const egneBrugere = new Set((kraevRaekker(medlemmerRes, "company_members") as { user_id: string }[]).map((m) => m.user_id));
  const egne = [...egneBrugere];

  const [maalRes, budgetRes, refleksionRes, opslagRes, svarRes, raadgivere] = await Promise.all([
    supabase.from("milestones").select("status, completed_at").eq("company_id", companyId).eq("status", "completed"),
    supabase.from("budget_targets").select("created_at").eq("company_id", companyId).like("period", "%-base-%").order("created_at", { ascending: true }).limit(1),
    supabase.from("pulse_checkins").select("created_at").eq("company_id", companyId).order("created_at", { ascending: true }).limit(1),
    egne.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("community_traade").select("created_at").in("forfatter_id", egne).order("created_at", { ascending: true }).limit(1),
    egne.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("community_svar").select("created_at, traad_id").in("forfatter_id", egne).order("created_at", { ascending: true }).limit(500),
    hentRaadgiverListe(),
  ]);

  const svarRaekker = kraevRaekker(svarRes as any, "community_svar") as { created_at: string; traad_id: string }[];
  const forfattere = await traadForfattere([...new Set(svarRaekker.map((s) => s.traad_id))]);

  return {
    maaneder,
    kontraktStart,
    maal: kraevRaekker(maalRes, "milestones") as { status: string | null; completed_at: string | null }[],
    budgetOprettet: (kraevRaekker(budgetRes, "budget_targets") as { created_at: string }[]).map((r) => r.created_at),
    refleksioner: (kraevRaekker(refleksionRes, "pulse_checkins") as { created_at: string }[]).map((r) => r.created_at),
    opslag: kraevRaekker(opslagRes as any, "community_traade") as { created_at: string }[],
    svar: svarRaekker.map((s) => ({ created_at: s.created_at, traadForfatterId: forfattere.get(s.traad_id) ?? null })),
    egneBrugere,
    raadgivere,
  };
}

/** Medlemmets trofæer. `maaneder` og `kontraktStart` er scorens grundlag (useBoardroomScore). */
export function useMedlemmetsTrofaeer(
  companyId: string | undefined,
  grundlag: { maaneder: readonly ScoreMaaned[]; kontraktStart: string | null } | undefined,
  afventerMigration: boolean,
) {
  const klar = !!companyId && (!!grundlag || afventerMigration);
  const maaneder = grundlag?.maaneder ?? [];
  const kontraktStart = grundlag?.kontraktStart ?? null;
  return useQuery({
    queryKey: ["trofaeer", "medlem", companyId, maaneder.length, maaneder.map((m) => `${m.key}:${m.foersteGodkendtAt}`).join(",")],
    queryFn: async (): Promise<TrofaeDom[]> => trofaeDom(await hentMedlemmetsTrofaeGrundlag(companyId!, maaneder, kontraktStart)),
    enabled: klar,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/* ───────────────────────── Rådgiverens /engagement ───────────────────────── */

export interface EngagementRaekke {
  companyId: string;
  navn: string;
  dom: ScoreDom;
  trofaeer: TrofaeDom[];
  /** Seneste tidspunkt for godkendte tal, mål nået, refleksion, opslag eller svar. */
  senesteAktivitet: string | null;
  /** Aktive mål og bevægelse (engagementMaal.ts); null = målene kunne ikke hentes («—»). */
  maal: EngagementMaalDom | null;
  /** Akademiet: «N af M set» (akademiFremdrift.ts); null = kunne ikke hentes («—»). */
  akademi: AkademiFremdrift | null;
}

export interface EngagementSvar {
  raekker: EngagementRaekke[];
  /** Kilderne (HentningsFejl.kilde), der fejlede for målkolonnerne; tom = alt hentet. */
  maalHentefejl: string[];
  /** Kilderne, der fejlede for Akademi-kolonnen; tom = hentet. */
  akademiHentefejl: string[];
}

/** Katalog + fremdriftsrækker for Akademi-kolonnen. Fejl fanges HER (som
    målene): kolonnen er sekundær for siden. Rækkerne hentes ALLE (sidevis,
    ordnet på id) og afgrænses til kataloget i dommen — ingen .in() med 77
    id'er i URL'en. Rådgivere læser alle rækker under RLS («Advisors can
    view all progress», has_role(…,'advisor'), PERMISSIVE — målt i pg_policy
    3/10). */
type AkademiGrundlag = { grundlag: { katalog: Set<string>; raekker: AkademiFremdriftRaekke[] } | null; kilder: string[] };

async function hentAkademiGrundlag(): Promise<AkademiGrundlag> {
  const [lektioner, raekker] = await Promise.allSettled([
    listPublishedItems(),
    hentAlleSider<AkademiFremdriftRaekke>((fra, til) =>
      supabase
        .from("member_progress")
        .select(AKADEMI_FREMDRIFT_KOLONNER)
        .order("id")
        .range(fra, til)
        .then(side("member_progress")),
    ),
  ]);
  if (lektioner.status === "fulfilled" && raekker.status === "fulfilled") {
    return { grundlag: { katalog: akademiKatalog(lektioner.value, AREAS), raekker: raekker.value }, kilder: [] };
  }
  const kilder: string[] = [];
  if (lektioner.status === "rejected") kilder.push("content_items");
  if (raekker.status === "rejected") kilder.push(kildeAf(raekker.reason));
  return { grundlag: null, kilder };
}

/** grundlag = null, når blot én af de to hentninger fejlede eller læsningen
    var tom (kilder siger hvilke). */
type MaalGrundlag = { grundlag: { maal: EngagementMaalRaekke[]; skridt: EngagementSkridtRaekke[] } | null; kilder: string[] };

/** Målene for universets virksomheder (company_id IN ids i bidder á
    MAAL_ID_BID — URL-længden) og skridtene under mål med de statusser,
    dommen bruger (STATUSSER_I_HENTNINGEN). Ikke et statusfilter på
    milestones: not.in taber status null (engagementMaal.ts filhoved, B3).
    Fejl er en fejl (kraevRaekker), men fanges HER: kolonnerne er sekundære
    for siden. En tom læsning (kundevirksomheder, 0 målrækker, ingen fejl)
    er en hentefejl (B4, tomMaalLaesning). */
async function hentMaalGrundlag(ids: readonly string[]): Promise<MaalGrundlag> {
  const hentMaal = async (): Promise<EngagementMaalRaekke[]> => {
    const alle: EngagementMaalRaekke[] = [];
    for (let i = 0; i < ids.length; i += MAAL_ID_BID) {
      const bid = ids.slice(i, i + MAAL_ID_BID);
      alle.push(
        ...(await hentAlleSider<EngagementMaalRaekke>((fra, til) =>
          supabase
            .from("milestones")
            .select("id, company_id, status, progress, deadline, progress_updated_at, created_at")
            .in("company_id", bid)
            .order("id")
            .range(fra, til)
            .then(side("milestones")),
        )),
      );
    }
    return alle;
  };
  const [maal, skridt] = await Promise.allSettled([
    hentMaal(),
    hentAlleSider<EngagementSkridtRaekke>((fra, til) =>
      supabase
        .from("company_actions")
        .select("maal_id, status, accepted_at, closed_at, created_at, source_type")
        .not("maal_id", "is", null)
        .in("status", [...STATUSSER_I_HENTNINGEN])
        .order("id")
        .range(fra, til)
        .then(side("company_actions")),
    ),
  ]);
  const kilder = [maal, skridt].filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => kildeAf(r.reason));
  if (maal.status === "fulfilled" && skridt.status === "fulfilled") {
    if (tomMaalLaesning(ids.length, maal.value.length)) return { grundlag: null, kilder: [TOM_MAAL_LAESNING] };
    return { grundlag: { maal: maal.value, skridt: skridt.value }, kilder: [] };
  }
  return { grundlag: null, kilder };
}

interface VirksomhedRaekke {
  id: string;
  name: string;
  status: string | null;
  contract_start_date: string | null;
  er_kunde: boolean | null;
  is_demo: boolean | null;
  is_legat: boolean | null;
  vis_i_netvaerk: boolean | null;
  data_slettet_at: string | null;
}

/**
 * Universet: kundevirksomheder — som /virksomheder (iUniverset: aktiv/status-løs,
 * ikke legat, ikke demo, er_kunde) og som klaviyoMedlem (ikke slettet, ikke gæst).
 */
export function iEngagementUniverset(c: VirksomhedRaekke): boolean {
  if (c.data_slettet_at) return false;
  if (c.is_demo === true) return false;
  if (c.is_legat) return false;
  if (c.vis_i_netvaerk === false) return false;
  if (!(c.status === "active" || !c.status)) return false;
  return erKunde(c);
}

function parseMetrics(raw: Json): Record<string, number | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (v === null) out[k] = null;
  }
  return out;
}

const grupper = <T,>(rows: readonly T[], noegle: (r: T) => string | null | undefined): Map<string, T[]> => {
  const ud = new Map<string, T[]>();
  for (const r of rows) {
    const k = noegle(r);
    if (!k) continue;
    const liste = ud.get(k);
    if (liste) liste.push(r);
    else ud.set(k, [r]);
  }
  return ud;
};

function senest(vaerdier: readonly (string | null | undefined)[]): string | null {
  let bedst: string | null = null;
  for (const v of vaerdier) if (v && (bedst === null || Date.parse(v) > Date.parse(bedst))) bedst = v;
  return bedst;
}

export async function hentEngagement(nu: Date): Promise<EngagementSvar> {
  const aar = kbhDele(nu).aar;
  const virksomheder = (kraevRaekker(
    await supabase
      .from("companies")
      .select("id, name, status, contract_start_date, er_kunde, is_demo, is_legat, vis_i_netvaerk, data_slettet_at"),
    "companies",
  ) as VirksomhedRaekke[]).filter(iEngagementUniverset);
  const ids = new Set(virksomheder.map((v) => v.id));

  const [facts, hukommelseRes, medlemmer, maal, budget, kpi, refleksioner, traade, svar, raadgivere, maalGrundlag, akademiGrundlag] = await Promise.all([
    hentAlleSider<{ company_id: string; period_key: string; data_basis: string; metrics: Json; created_at: string }>((fra, til) =>
      supabase.from("financial_report_facts").select("company_id, period_key, data_basis, metrics, created_at").order("id").range(fra, til).then(side("financial_report_facts")),
    ),
    hentAlleSider<{ company_id: string; period_key: string; foerst_godkendt_at: string | null }>((fra, til) =>
      (supabase.from("maaned_foerste_godkendelse" as any).select("company_id, period_key, foerst_godkendt_at").order("company_id").order("period_key").range(fra, til) as any),
    ).catch((e: unknown) => {
      // Migrationen ikke kørt → ingen hukommelse (created_at alene), som før tabellen; anden fejl kaster.
      if (erManglendeTabel(e as any)) return [];
      throw e;
    }),
    hentAlleSider<{ company_id: string; user_id: string }>((fra, til) =>
      supabase.from("company_members").select("company_id, user_id").order("id").range(fra, til).then(side("company_members")),
    ),
    hentAlleSider<{ company_id: string; status: string | null; completed_at: string | null }>((fra, til) =>
      supabase.from("milestones").select("company_id, status, completed_at").eq("status", "completed").order("id").range(fra, til).then(side("milestones")),
    ),
    hentAlleSider<{ company_id: string; period: string; created_at: string }>((fra, til) =>
      supabase.from("budget_targets").select("company_id, period, created_at").like("period", "%-base-%").order("id").range(fra, til).then(side("budget_targets")),
    ),
    hentAlleSider<{ company_id: string }>((fra, til) => supabase.from("kpi_targets").select("company_id").order("id").range(fra, til).then(side("kpi_targets"))),
    hentAlleSider<{ company_id: string; created_at: string }>((fra, til) =>
      supabase.from("pulse_checkins").select("company_id, created_at").order("id").range(fra, til).then(side("pulse_checkins")),
    ),
    hentAlleSider<{ id: string; forfatter_id: string; created_at: string }>((fra, til) =>
      supabase.from("community_traade").select("id, forfatter_id, created_at").eq("status", "aktiv").order("id").range(fra, til).then(side("community_traade")),
    ),
    hentAlleSider<{ forfatter_id: string; traad_id: string; created_at: string }>((fra, til) =>
      supabase.from("community_svar").select("forfatter_id, traad_id, created_at").eq("status", "aktiv").order("id").range(fra, til).then(side("community_svar")),
    ),
    hentRaadgiverListe(),
    hentMaalGrundlag([...ids]),
    hentAkademiGrundlag(),
  ]);

  const maalDomPr = maalGrundlag.grundlag ? engagementMaalPrVirksomhed(maalGrundlag.grundlag.maal, maalGrundlag.grundlag.skridt, nu) : null;
  const hukommelse = new Map((hukommelseRes as { company_id: string; period_key: string; foerst_godkendt_at: string | null }[]).map((h) => [`${h.company_id}|${h.period_key}`, h.foerst_godkendt_at]));
  const factsPr = grupper(facts, (f) => f.company_id);
  const brugerePr = grupper(medlemmer, (m) => m.company_id);
  const virksomhedAfBruger = new Map<string, string>();
  for (const m of medlemmer) if (ids.has(m.company_id)) virksomhedAfBruger.set(m.user_id, m.company_id);
  const maalPr = grupper(maal, (m) => m.company_id);
  const budgetPr = grupper(budget, (b) => b.company_id);
  const kpiPr = new Set(kpi.map((k) => k.company_id));
  const refleksionPr = grupper(refleksioner, (r) => r.company_id);
  const traadForfatter = new Map(traade.map((t) => [t.id, t.forfatter_id]));
  const traadePr = grupper(traade, (t) => virksomhedAfBruger.get(t.forfatter_id));
  const svarPr = grupper(svar, (s) => virksomhedAfBruger.get(s.forfatter_id));
  // Akademiet: rådgivere og tjenestekonti (raadgivere) er ikke medlemmer — dommen trækker dem fra.
  const akademiPr = akademiGrundlag.grundlag
    ? akademiFremdriftPrVirksomhed(
        akademiGrundlag.grundlag.raekker,
        new Map([...brugerePr].map(([c, m]) => [c, m.map((x) => x.user_id)])),
        raadgivere,
        [...ids],
        akademiGrundlag.grundlag.katalog,
      )
    : null;

  const raekker = virksomheder.map((v) => {
    const maaneder: ScoreMaaned[] = (factsPr.get(v.id) ?? []).map((f) => ({
      key: f.period_key,
      basis: f.data_basis === "estimated" ? "estimated" : "measured",
      foersteGodkendtAt: tidligsteGodkendelse(hukommelse.get(`${v.id}|${f.period_key}`), f.created_at),
      metrics: parseMetrics(f.metrics),
    }));
    const budgetRaekker = budgetPr.get(v.id) ?? [];
    const dom = boardroomScore(
      {
        maaneder,
        kontraktStart: v.contract_start_date,
        harBudgetForAaret: budgetRaekker.some((b) => b.period.startsWith(`${aar}-base-`)),
        harMaal: kpiPr.has(v.id),
      },
      nu,
    );
    const egneBrugere = new Set((brugerePr.get(v.id) ?? []).map((m) => m.user_id));
    const egneSvar = svarPr.get(v.id) ?? [];
    const egneTraade = traadePr.get(v.id) ?? [];
    const egneMaal = maalPr.get(v.id) ?? [];
    const egneRefleksioner = refleksionPr.get(v.id) ?? [];
    const trofaeer = trofaeDom({
      maaneder,
      kontraktStart: v.contract_start_date,
      maal: egneMaal,
      budgetOprettet: budgetRaekker.map((b) => b.created_at),
      refleksioner: egneRefleksioner.map((r) => r.created_at),
      opslag: egneTraade,
      svar: egneSvar.map((s) => ({ created_at: s.created_at, traadForfatterId: traadForfatter.get(s.traad_id) ?? null })),
      egneBrugere,
      raadgivere,
    });
    const senesteAktivitet = senest([
      ...maaneder.map((m) => m.foersteGodkendtAt),
      ...egneMaal.map((m) => m.completed_at),
      ...egneRefleksioner.map((r) => r.created_at),
      ...egneTraade.map((t) => t.created_at),
      ...egneSvar.map((s) => s.created_at),
    ]);
    const maalDom = maalDomPr ? (maalDomPr.get(v.id) ?? INGEN_MAAL) : null;
    const akademi = akademiPr ? (akademiPr.get(v.id) ?? null) : null;
    return { companyId: v.id, navn: v.name, dom, trofaeer, senesteAktivitet, maal: maalDom, akademi };
  });
  return { raekker, maalHentefejl: maalGrundlag.kilder, akademiHentefejl: akademiGrundlag.kilder };
}

export function useEngagement() {
  return useQuery({ queryKey: ["engagement"], queryFn: () => hentEngagement(new Date()), staleTime: 5 * 60_000 });
}
