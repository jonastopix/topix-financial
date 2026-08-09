import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyFacts } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import {
  REPORT_OVERRIDE_SELECT,
  formatDKK,
  getEffectiveReportPeriodKey,
  type ReportData,
} from "@/lib/financialUtils";
import { AREAS, type ContentItem } from "@/lib/hjemmebane/adminContentApi";
import { listUpcomingEvents } from "@/lib/hjemmebane/akademiApi";
import { formatDuration } from "@/components/hjemmebane/admin/editors/shared";
import { handoutConfigs, moduleOrder, type HandoutModule } from "@/lib/handoutConfig";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbEventCard } from "../HbEventCard";
import { HbSection } from "../HbSection";
import { hasRichTextContent } from "@/lib/hjemmebane/richtext";
import { isTrackedEntry, useAkademiData, type AkademiItem } from "../akademi/useAkademiData";
import { HbVideoEmbed } from "../akademi/HbVideoEmbed";
import { deriveFocus, type FocusItem } from "./nextStep";
import { byPublishedDesc, pickActivePush, pickActiveWeekVideo } from "./pushSelection";
import { extractYouTubeId } from "./youtube";

/** Dit Boardroom (/boardroom) — Hb-forsiden i VANE-ANKER-IA'en (forside
    PR 2, hb-forside-recon §C/§G): de tre lag i rækkefølgen
    1) "Dit næste skridt" ØVERST — fokus-motoren (deriveFocus, PR #217)
       m. ALLE kilder: rapport-signal, beskeder, ugens fokus (læses
       INLINE så notifikations-kontrakten "Ugens fokus er klar" → "/"
       indfries), milestones, company_actions, pulse, løftestænger.
       #1 stort, #2-4 som stille linjer.
    2) "Siden sidst"-båndet — kurateret: push som hovedhistorie +
       seneste talk + kommende event, hver m. diskret tidsmarkering.
       Events fortsat uden CTA (tilmelding er egen leverance).
    3) Tal-strippen NEDERST som rolig status (uændret indhold/kilder).
    Motoren er LÅST (ingen ændringer i deriveFocus); alle nye queries er
    company-scoped og arvet ORDRET fra DashboardActionCenter (citeret
    ved hver query). Advisor-gated route i byggeperioden. */

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
};

const proseClasses =
  "prose-hb mt-6 max-w-3xl text-[15px] leading-relaxed text-hb-ink [&_a]:text-hb-rust [&_a]:underline [&_h2]:mt-8 [&_h2]:font-editorial [&_h2]:text-2xl [&_h2]:font-medium [&_h3]:mt-6 [&_h3]:font-editorial [&_h3]:text-xl [&_h3]:font-medium [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5";

// ── Uge-nøgle — ordret fra DashboardActionCenter:13-20 ──────────────────
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ── Diskrete tidsmarkeringer (lag 2: "siden sidst"-følelsen) ────────────
const publishedMarker = (iso: string | null): string | null => {
  if (!iso) return null;
  const published = new Date(iso).getTime();
  if (Number.isNaN(published)) return null;
  const days = (Date.now() - published) / 86400000;
  if (days <= 7) return "Ny i denne uge";
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long" });
};

const eventCountdown = (startsAt: string): string => {
  const days = Math.ceil((new Date(startsAt).getTime() - Date.now()) / 86400000);
  if (days <= 0) return "I dag";
  if (days === 1) return "I morgen";
  return `Om ${days} dage`;
};

/** Sidehovedet: rolig, personlig velkomst — altid til stede (pushet er
    flyttet ned i "Siden sidst"-båndet som hovedhistorie). */
const PageHeader = ({ firstName }: { firstName: string }) => (
  <section className="max-w-3xl">
    <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dit Boardroom</p>
    <h1 className="mt-4 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
      {getGreeting()}, {firstName}.
    </h1>
  </section>
);

/** Push som lag 2-hovedhistorie (kilde/udløbsdom uændret — pickActivePush).
    Afsender-bylinen (bølge 1, PR 3): findes metadata.author_user_id, vises
    portræt (40 px) + navn — profilen slås op af forælderen (rolle-sikkert
    via get_all_advisor_profiles-RPC'en); manglende avatar → initial-cirkel
    i Hb-toner (admin-vælgerens fallback-mønster). Uden author_user_id:
    fri-tekst-bylinen uændret (bagudkompatibelt). */
const PushStory = ({
  push,
  sender,
}: {
  push: ContentItem;
  sender: { full_name: string; avatar_url: string | null } | null;
}) => {
  const [bodyOpen, setBodyOpen] = useState(false);
  const metadata = (push.metadata as Record<string, unknown>) ?? {};
  const author = (metadata.author as string) || null;
  const hasSenderId = Boolean(metadata.author_user_id);
  const marker = publishedMarker(push.published_at ?? push.created_at);
  const senderName = sender?.full_name ?? author;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
        Ugens push{marker && <span className="ml-2 normal-case tracking-normal text-hb-ink-soft">· {marker}</span>}
      </p>
      <h2 className="mt-3 font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">
        {push.title}
      </h2>
      {push.description && (
        <p className="mt-3 text-[15px] leading-relaxed text-hb-ink-soft">{push.description}</p>
      )}
      {hasSenderId && senderName ? (
        <p className="mt-4 flex items-center gap-3">
          {sender?.avatar_url ? (
            <img
              src={sender.avatar_url}
              alt={senderName}
              className="h-10 w-10 shrink-0 rounded-full border border-hb-line object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 text-sm text-hb-ink-soft">
              {senderName.charAt(0)}
            </span>
          )}
          <span className="text-sm font-medium text-hb-ink">{senderName}</span>
        </p>
      ) : (
        author && <p className="mt-4 text-sm font-medium text-hb-ink">{author}</p>
      )}
      {hasRichTextContent(push.body) && (
        <>
          <button
            type="button"
            onClick={() => setBodyOpen((open) => !open)}
            className="mt-4 flex items-center gap-1.5 text-sm text-hb-rust underline-offset-4 hover:underline"
          >
            {bodyOpen ? "Vis mindre" : "Læs mere"}
            {bodyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {bodyOpen && (
            <div className={proseClasses} dangerouslySetInnerHTML={{ __html: push.body as string }} />
          )}
        </>
      )}
    </div>
  );
};

/** "Denne uges video"-kortet (bølge 1, PR 3): valgt m. den DELTE dom
    (pickActiveWeekVideo). Bunny → det EKSISTERENDE get-video-embed-flow
    via HbVideoEmbed genbrugt 1:1 inkl. loading-/fejltilstandene
    (ElementView:206-215-mønstret) — men m. no-op-callbacks: fremdrifts-
    sporing er Akademiets domæne, forsiden skriver ikke progress.
    Ekstern YouTube-URL → inline youtube-nocookie-iframe (lazy, aspect-
    video); alt andet eksternt → "Åbn"-knap i nyt vindue. */
const WeekVideoCard = ({ video }: { video: ContentItem }) => {
  const marker = publishedMarker(video.published_at ?? video.created_at);
  const youTubeId = video.media_provider === "external" ? extractYouTubeId(video.external_url) : null;

  return (
    <HbCard className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
        Denne uges video
        {marker && <span className="ml-2 normal-case tracking-normal">· {marker}</span>}
      </p>
      <p className="mt-2 font-editorial text-lg font-medium leading-snug text-hb-ink">{video.title}</p>
      {video.description && (
        <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{video.description}</p>
      )}
      {video.duration_seconds != null && (
        <p className="mt-1.5 text-xs text-hb-ink-soft">{formatDuration(video.duration_seconds)}</p>
      )}
      <div className="mt-4">
        {video.media_provider === "bunny" && video.bunny_video_id ? (
          <HbVideoEmbed itemId={video.id} resumeAt={null} onPosition={() => {}} onCompleted={() => {}} />
        ) : youTubeId ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youTubeId}`}
            title={video.title}
            loading="lazy"
            className="aspect-video w-full rounded-hb border border-hb-line bg-black"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : video.external_url ? (
          <a href={video.external_url} target="_blank" rel="noopener noreferrer">
            <HbButton variant="secondary" className="h-9 px-4 text-sm">
              <ExternalLink className="h-4 w-4" />
              Åbn videoen
            </HbButton>
          </a>
        ) : null}
      </div>
    </HbCard>
  );
};

/** Tal-strip (lag 3): senest godkendte periode fra facts-laget — indhold
    og kilder uændret; kun placeringen er flyttet nederst. */
const TalStrip = ({
  hasFacts,
  processing,
  periodLabel,
  revenue,
  result,
  bank,
}: {
  hasFacts: boolean;
  processing: boolean;
  periodLabel: string | null;
  revenue: number | null;
  result: number | null;
  bank: number | null;
}) => {
  if (!hasFacts) {
    return (
      <HbCard className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
          <p className="mt-1 text-sm text-hb-ink-soft">
            {processing
              ? "Dine tal er ved at blive behandlet — de lander her, så snart de er godkendt."
              : "Ingen godkendte tal endnu — upload din første rapport, så fylder vi båndet ud."}
          </p>
        </div>
        <Link
          to="/reports"
          className="shrink-0 whitespace-nowrap text-sm text-hb-rust underline-offset-4 hover:underline"
        >
          {processing ? "Se status" : "Kom i gang med dine tal"}
        </Link>
      </HbCard>
    );
  }

  const figures: { label: string; value: number | null }[] = [
    { label: "Omsætning", value: revenue },
    { label: "Resultat f. skat", value: result },
    { label: "Bank", value: bank },
  ];

  return (
    <HbCard className="flex flex-col gap-6 p-6 md:flex-row md:items-center">
      <div className="shrink-0 md:w-48">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dine tal</p>
        <p className="mt-1 whitespace-nowrap text-sm text-hb-ink-soft">
          Senest godkendt: {periodLabel}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-4 md:flex-row md:items-center md:justify-around md:gap-6">
        {figures.map((figure) => (
          <div key={figure.label}>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
              {figure.label}
            </p>
            <p className="mt-1 font-editorial text-2xl font-medium text-hb-ink">
              {figure.value != null ? formatDKK(figure.value) : "—"}
            </p>
          </div>
        ))}
      </div>
      <Link
        to="/kpis"
        className="shrink-0 whitespace-nowrap text-sm text-hb-rust underline-offset-4 hover:underline"
      >
        Se dine tal
      </Link>
    </HbCard>
  );
};

/** Lag 1-kortet: #1 stort, #2-4 som stille linjer. weekly_focus læses
    INLINE (headline + summary) — kontrakten "Ugens fokus er klar" → "/".
    CTA-knap vises kun når punktet peger VÆK fra forsiden (ctaHref ≠ "/").
    Skeleton m. reserveret højde — ingen layout-hop. */
const FocusCard = ({
  loading,
  items,
  weeklySummary,
  nextEntry,
}: {
  loading: boolean;
  items: FocusItem[];
  weeklySummary: string | null;
  nextEntry: AkademiItem | undefined;
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const displayed = items.slice(0, 4);
  const primary = displayed[0];
  const quiet = displayed.slice(1);

  const inlineBody = (item: FocusItem) =>
    item.kind === "weekly-focus" && weeklySummary ? weeklySummary : null;

  return (
    <HbCard className="min-h-[190px] p-6">
      {loading ? (
        <div className="space-y-3" aria-hidden>
          <div className="h-7 w-2/3 animate-pulse rounded bg-hb-line/60" />
          <div className="h-4 w-full animate-pulse rounded bg-hb-line/40" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-hb-line/40" />
          <div className="h-10 w-40 animate-pulse rounded-full bg-hb-line/40" />
        </div>
      ) : primary ? (
        <div className="flex flex-col items-start gap-4">
          <h3 className="font-editorial text-2xl font-medium leading-snug text-hb-ink">
            {primary.title}
          </h3>
          <p className="text-sm leading-relaxed text-hb-ink-soft">{primary.description}</p>
          {inlineBody(primary) && (
            <p className="text-[15px] leading-relaxed text-hb-ink">{inlineBody(primary)}</p>
          )}
          {primary.ctaHref !== "/" && (
            <Link to={primary.ctaHref}>
              <HbButton>{primary.ctaLabel}</HbButton>
            </Link>
          )}
          {quiet.length > 0 && (
            <ul className="mt-2 w-full border-t border-hb-line pt-3">
              {quiet.map((item) => (
                <li key={item.key}>
                  {item.ctaHref !== "/" ? (
                    <Link
                      to={item.ctaHref}
                      className="flex items-center gap-3 py-2 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedKey((k) => (k === item.key ? null : item.key))}
                      className="flex w-full items-center gap-3 py-2 text-left text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      {expandedKey === item.key ? (
                        <ChevronUp className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      )}
                    </button>
                  )}
                  {expandedKey === item.key && (
                    <p className="pb-2 pl-0 text-sm leading-relaxed text-hb-ink-soft">
                      {item.description}
                      {inlineBody(item) && <span className="mt-1 block text-hb-ink">{inlineBody(item)}</span>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-4">
          <h3 className="font-editorial text-2xl font-medium leading-snug text-hb-ink">
            Alt er ajour.
          </h3>
          <p className="text-sm leading-relaxed text-hb-ink-soft">
            Rapport, refleksion og milestones er på plads — brug momentum i dit forløb.
          </p>
        </div>
      )}
      {!loading && nextEntry && (
        <Link
          to={`/akademiet/${nextEntry.item.area}/${nextEntry.item.slug}`}
          className="mt-4 inline-block text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-ink hover:underline"
        >
          Eller fortsæt dit forløb: {nextEntry.item.title}
        </Link>
      )}
    </HbCard>
  );
};

export const BoardroomView = () => {
  const { user, profile, companyId } = useAuth();
  const akademi = useAkademiData();
  const { data: facts = [], isLoading: factsLoading } = useCompanyFacts();

  // ── Katalog-afledninger (deler cache med Akademiet) ─────────────────────
  const items = akademi.orderedByArea;
  const pushItem = useMemo(
    () =>
      pickActivePush(
        (items.get("push") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );
  const latestTalk = useMemo(
    () =>
      [...(items.get("talks") ?? [])]
        .map((entry) => entry.item)
        .sort(byPublishedDesc)[0],
    [items],
  );
  const weekVideo = useMemo(
    () =>
      pickActiveWeekVideo(
        (items.get("ugens_video") ?? []).map((entry) => entry.item),
        new Date(),
      ),
    [items],
  );

  // Afsender-portrættet (PR 3): profiler slås op via den SAMME RPC som
  // medlems-chatten bruger ("Fetch all advisors for member header",
  // CompanyChatPane:163-176 — get_all_advisor_profiles er security definer,
  // så MEDLEMMER må kalde den; direkte profiles-select er ikke garanteret
  // for medlemmer). Kun når pushet bærer et author_user_id.
  const pushAuthorUserId =
    ((pushItem?.metadata as Record<string, unknown> | null)?.author_user_id as string) || null;
  const { data: pushSender = null } = useQuery({
    queryKey: ["boardroom", "push-sender", pushAuthorUserId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_advisor_profiles" as any);
      if (error) {
        console.error("Failed to fetch advisor profiles:", error);
        return null;
      }
      const match = ((data as any[]) || []).find((r: any) => r.user_id === pushAuthorUserId);
      return match
        ? { full_name: match.full_name as string, avatar_url: (match.avatar_url as string) ?? null }
        : null;
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!pushAuthorUserId,
  });

  // Forløbs-linket — samme dom som Akademi-forsiden.
  const nextEntry = useMemo(() => {
    const inAkademi = (entry: AkademiItem) =>
      AREAS.find((a) => a.key === entry.item.area)?.akademi === true;
    return AREAS.filter((area) => area.akademi)
      .flatMap((area) => akademi.orderedByArea.get(area.key) ?? [])
      .find(
        (entry) =>
          isTrackedEntry(entry) && inAkademi(entry) && entry.drip.unlocked && entry.state !== "done",
      );
  }, [akademi.orderedByArea]);

  // ── Fokus-motorens inputs (kilderne arvet ordret fra ActionCenter) ──────
  const processedQuery = useQuery({
    queryKey: ["boardroom", "processed-reports", companyId],
    queryFn: async () => {
      // Samme select-form som DashboardActionCenter (110-113).
      const { data } = await (supabase
        .from("financial_reports")
        .select(`report_period, ${REPORT_OVERRIDE_SELECT}`) as any)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .eq("status", "processed");
      const keys = ((data ?? []) as ReportData[])
        .map((r) => getEffectiveReportPeriodKey(r))
        .filter(Boolean) as string[];
      return new Set(keys);
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  const milestonesQuery = useQuery({
    queryKey: ["boardroom", "milestones", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("milestones")
        .select("title, deadline, progress, status")
        .eq("company_id", companyId!);
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  const pulseQuery = useQuery({
    queryKey: ["boardroom", "pulse", companyId],
    queryFn: async () => {
      const prev = new Date();
      prev.setMonth(prev.getMonth() - 1);
      const periodKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      const { data } = await supabase
        .from("pulse_checkins")
        .select("id")
        .eq("company_id", companyId!)
        .eq("period_key", periodKey)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  // Ugens fokus — query ordret fra DashboardActionCenter:71-85
  // (company_id + week_key + status-listen).
  const weekKey = getISOWeekKey(new Date());
  const weeklyFocusQuery = useQuery({
    queryKey: ["boardroom", "weekly-focus", companyId, weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_focus")
        .select("*")
        .eq("company_id", companyId!)
        .eq("week_key", weekKey)
        .in("status", ["active", "quiet", "no_data"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Åbne handlinger — query + sortering ordret fra
  // DashboardActionCenter:200-208 (high → medium → low, dernæst ældste).
  const actionsQuery = useQuery({
    queryKey: ["boardroom", "company-actions", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("company_actions").select("id, title, context, priority, status, created_at")
        .eq("company_id", companyId!).eq("status", "open").order("created_at", { ascending: false }).limit(10) as any;
      return ((data || []) as any[]).sort((a: any, b: any) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] ?? 1) - (order[b.priority] ?? 1) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    },
    enabled: !!companyId,
    staleTime: 3 * 60_000,
  });

  // Ulæste beskeder — begge tællinger ordret fra
  // DashboardActionCenter:150-160 (user-beskeder + agent-beskeder).
  const unreadQuery = useQuery({
    queryKey: ["boardroom", "unread", companyId, user?.id],
    queryFn: async () => {
      const { data: conv } = await supabase.from("conversations").select("id").eq("company_id", companyId!).maybeSingle();
      if (!conv?.id) return { userCount: 0, agentCount: 0 };
      const { count } = await supabase.from("messages").select("*", { count: "exact", head: true })
        .eq("conversation_id", conv.id).neq("sender_id", user!.id).is("read_at", null).eq("message_type", "user");
      const { count: agentCount } = await supabase.from("messages").select("*", { count: "exact", head: true })
        .eq("conversation_id", conv.id).is("read_at", null).eq("message_type", "system").eq("context_type", "agent");
      return { userCount: count ?? 0, agentCount: agentCount ?? 0 };
    },
    enabled: !!companyId && !!user,
    staleTime: 60_000,
  });

  // Løftestænger uden milestone — handouts.levers minus junction-rækkerne
  // (handout_lever_milestones); deterministisk orden: moduleOrder → index.
  const leversQuery = useQuery({
    queryKey: ["boardroom", "unlinked-levers", companyId],
    queryFn: async () => {
      const { data: handoutRows } = await supabase
        .from("handouts")
        .select("id, module, levers")
        .eq("company_id", companyId!);
      const rows = (handoutRows ?? []) as { id: string; module: string; levers: unknown }[];
      if (rows.length === 0) return [];
      const { data: links } = await supabase
        .from("handout_lever_milestones" as any)
        .select("handout_id, lever_index")
        .in("handout_id", rows.map((r) => r.id));
      const linked = new Set(((links ?? []) as any[]).map((l) => `${l.handout_id}:${l.lever_index}`));
      const result: { lever: string; moduleTitle: string }[] = [];
      for (const module of moduleOrder) {
        const row = rows.find((r) => r.module === module);
        if (!row) continue;
        const levers = (row.levers as string[]) || [];
        levers.forEach((lever, index) => {
          if (lever.trim() && !linked.has(`${row.id}:${index}`)) {
            result.push({ lever: lever.trim(), moduleTitle: handoutConfigs[module as HandoutModule]?.title ?? module });
          }
        });
      }
      return result;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  const committedKeys = useMemo(() => new Set(facts.map((f) => f.period_key)), [facts]);

  const focus = useMemo(() => {
    if (!companyId) return []; // advisor uden company-override i byggeperioden
    return deriveFocus({
      now: new Date(),
      processedPeriodKeys: processedQuery.data ?? new Set<string>(),
      committedPeriodKeys: committedKeys,
      milestones: milestonesQuery.data ?? [],
      hasPulseThisMonth: Boolean(pulseQuery.data),
      unreadUserMessages: unreadQuery.data?.userCount ?? 0,
      unreadAgentMessages: unreadQuery.data?.agentCount ?? 0,
      weeklyFocus: weeklyFocusQuery.data
        ? { headline: weeklyFocusQuery.data.headline ?? null, seen: Boolean(weeklyFocusQuery.data.seen_at) }
        : null,
      openActions: (actionsQuery.data ?? []).map((a: any) => ({ id: a.id, title: a.title, priority: a.priority })),
      unlinkedLevers: leversQuery.data ?? [],
    });
  }, [companyId, processedQuery.data, committedKeys, milestonesQuery.data, pulseQuery.data, unreadQuery.data, weeklyFocusQuery.data, actionsQuery.data, leversQuery.data]);

  // Markér ugens fokus som SET når punktet faktisk vises — samme mekanik
  // som DashboardActionCenter:87-98 (mutation + engangs-ref).
  const seenMarked = useRef(false);
  const markSeen = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("weekly_focus").update({ seen_at: new Date().toISOString() } as any).eq("id", id);
    },
  });
  const weeklyDisplayed = focus.slice(0, 4).some((i) => i.kind === "weekly-focus");
  useEffect(() => {
    const row = weeklyFocusQuery.data;
    if (weeklyDisplayed && row && !row.seen_at && !seenMarked.current) {
      seenMarked.current = true;
      markSeen.mutate(row.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyDisplayed, weeklyFocusQuery.data]);

  const focusLoading =
    !!companyId &&
    (processedQuery.isPending ||
      milestonesQuery.isPending ||
      pulseQuery.isPending ||
      weeklyFocusQuery.isPending ||
      actionsQuery.isPending ||
      unreadQuery.isPending ||
      leversQuery.isPending);

  // ── Lag 2-data ──────────────────────────────────────────────────────────
  const { data: events = [] } = useQuery({
    queryKey: ["boardroom", "events"],
    queryFn: () => listUpcomingEvents(1),
    staleTime: 5 * 60_000,
  });
  const nextEvent = events[0];

  // ── Tal-strip-afledning (uændret) ───────────────────────────────────────
  const sorted = useMemo(
    () => facts.map((f) => ({ key: f.period_key, kf: factsToDanishMetrics(f.metrics), period: f.period_label })),
    [facts],
  );
  const latestFacts = sorted[sorted.length - 1];
  const bankRow = [...sorted].reverse().find((r) => r.kf.bank_balance != null);
  const processing = sorted.length === 0 && (processedQuery.data?.size ?? 0) > 0;

  const firstName = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "dig";

  if (akademi.loading || factsLoading) {
    return <p className="text-sm text-hb-ink-soft">Henter dit Boardroom…</p>;
  }

  const hasBand = Boolean(pushItem || weekVideo || latestTalk || nextEvent);

  return (
    <div>
      <PageHeader firstName={firstName} />

      {/* ── LAG 1: Dit næste skridt (fuld bredde, øverst) ── */}
      <HbSection eyebrow="Dit næste skridt" className="mt-10 md:mt-12">
        <FocusCard
          loading={focusLoading}
          items={focus}
          weeklySummary={weeklyFocusQuery.data?.summary ?? null}
          nextEntry={nextEntry}
        />
      </HbSection>

      {/* ── LAG 2: Siden sidst (kurateret bånd) ── */}
      {hasBand && (
        <HbSection eyebrow="Siden sidst" linkLabel="Se Akademiet" linkTo="/akademiet" className="mt-12 md:mt-14">
          {/* Bånd-balance (PR 3, begrundet valg): findes pushet, står det
              som hovedhistorie (col-span-4) og videoen ØVERST i højre
              spalte over talk/event — grid'et er items-start, så spalterne
              stakker uden tomme huller uanset player-højden. Mangler
              pushet, rykker videoen op som hovedhistorie i venstre spalte
              (afspilleren bærer bredden fint), og talk/event beholder
              højre spalte — båndet har aldrig en tom hovedplads. */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-6">
            {pushItem ? (
              <HbCard className="p-6 lg:col-span-4">
                <PushStory push={pushItem} sender={pushSender} />
              </HbCard>
            ) : weekVideo ? (
              <div className="lg:col-span-4">
                <WeekVideoCard video={weekVideo} />
              </div>
            ) : null}
            <div className={pushItem || weekVideo ? "flex flex-col gap-4 lg:col-span-2" : "flex flex-col gap-4 lg:col-span-6"}>
              {pushItem && weekVideo && <WeekVideoCard video={weekVideo} />}
              {latestTalk && (
                <Link to={`/akademiet/talks/${latestTalk.slug}`} className="block">
                  <HbCard className="p-5 transition-colors hover:bg-hb-sage/20">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                      Seneste talk
                      {publishedMarker(latestTalk.published_at ?? latestTalk.created_at) && (
                        <span className="ml-2 normal-case tracking-normal">
                          · {publishedMarker(latestTalk.published_at ?? latestTalk.created_at)}
                        </span>
                      )}
                    </p>
                    <p className="mt-2 font-editorial text-lg font-medium leading-snug text-hb-ink">
                      {latestTalk.title}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-hb-ink-soft">
                      {latestTalk.duration_seconds != null && formatDuration(latestTalk.duration_seconds)}
                      <ArrowRight className="h-4 w-4" />
                    </p>
                  </HbCard>
                </Link>
              )}
              {nextEvent && (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                    Kommende event · {eventCountdown(nextEvent.starts_at)}
                  </p>
                  <HbEventCard
                    day={String(new Date(nextEvent.starts_at).getDate())}
                    month={new Date(nextEvent.starts_at)
                      .toLocaleDateString("da-DK", { month: "short" })
                      .replace(".", "")}
                    title={nextEvent.title}
                    meta={[
                      nextEvent.kind === "live_sparring" ? "Live sparring" : nextEvent.kind === "workshop" ? "Workshop" : "Event",
                      nextEvent.meet_url ? "Online" : null,
                      new Date(nextEvent.starts_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    ctaLabel={null}
                  />
                </div>
              )}
            </div>
          </div>
        </HbSection>
      )}

      {/* ── LAG 3: Tal-strippen (rolig status, nederst) ── */}
      {companyId && (
        <div className="mt-12 md:mt-14">
          <TalStrip
            hasFacts={sorted.length > 0}
            processing={processing}
            periodLabel={latestFacts?.period ?? null}
            revenue={latestFacts?.kf.omsaetning ?? null}
            result={latestFacts?.kf.resultat_foer_skat ?? null}
            bank={bankRow?.kf.bank_balance ?? null}
          />
        </div>
      )}
    </div>
  );
};
