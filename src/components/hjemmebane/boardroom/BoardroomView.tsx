import * as React from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
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
import { AREAS, getAssetPreviewUrl, type ContentItem } from "@/lib/hjemmebane/adminContentApi";
import { listUpcomingEvents } from "@/lib/hjemmebane/akademiApi";
import { formatDuration } from "@/components/hjemmebane/admin/editors/shared";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbEventCard } from "../HbEventCard";
import { HbSection } from "../HbSection";
import { HbVideoCard } from "../HbVideoCard";
import { isTrackedEntry, useAkademiData, type AkademiItem } from "../akademi/useAkademiData";
import { deriveNextStep } from "./nextStep";

/** Dit Boardroom (/boardroom) — Hb-forsiden, preview-kernens IA med rigtige
    kilder: push-hero, tal-strip (facts-laget 1:1), Dit næste skridt
    (deriveNextStep-porten), kommende events (uden CTA indtil tilmeldings-
    leverancen) og Iværksætterlivet (talks m. ægte Akademi-links).
    Broer UD til gamle flader (/kpis, /reports, /milestones, /pulse) er
    bevidste og bogført i konvergens.md. Advisor-gated route i
    byggeperioden; Index ("/") er frosset indtil swap-PR'en. */

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
};

const proseClasses =
  "prose-hb mt-6 max-w-3xl text-[15px] leading-relaxed text-hb-ink [&_a]:text-hb-rust [&_a]:underline [&_h2]:mt-8 [&_h2]:font-editorial [&_h2]:text-2xl [&_h2]:font-medium [&_h3]:mt-6 [&_h3]:font-editorial [&_h3]:text-xl [&_h3]:font-medium [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-5";

const byPublishedDesc = (a: ContentItem, b: ContentItem) =>
  (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);

/** Hero: seneste published push-indslag; uden push en rolig, personaliseret
    velkomst (aldrig tom — og ingen dublet af talks-sektionen). */
const Hero = ({ push, firstName }: { push: ContentItem | undefined; firstName: string }) => {
  const [bodyOpen, setBodyOpen] = useState(false);

  if (!push) {
    return (
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dit Boardroom</p>
        <h1 className="mt-4 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          {getGreeting()}, {firstName}.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-hb-ink-soft">
          Her samler vi det vigtigste for dig — dine tal, dit næste skridt og det, der sker i
          miljøet lige nu.
        </p>
      </section>
    );
  }

  const author = ((push.metadata as Record<string, unknown>)?.author as string) || null;
  const date = push.published_at
    ? new Date(push.published_at).toLocaleDateString("da-DK", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <section className="max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Ugens push</p>
      <h1 className="mt-4 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
        {push.title}
      </h1>
      {push.description && (
        <p className="mt-5 text-lg leading-relaxed text-hb-ink-soft">{push.description}</p>
      )}
      {(author || date) && (
        <p className="mt-6 text-sm">
          {author && <span className="font-medium text-hb-ink">{author}</span>}
          {author && date && <span className="text-hb-ink-soft"> · </span>}
          {date && <span className="text-hb-ink-soft">{date}</span>}
        </p>
      )}
      {push.body && (
        <>
          <button
            type="button"
            onClick={() => setBodyOpen((open) => !open)}
            className="mt-5 flex items-center gap-1.5 text-sm text-hb-rust underline-offset-4 hover:underline"
          >
            {bodyOpen ? "Vis mindre" : "Læs mere"}
            {bodyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {bodyOpen && (
            <div className={proseClasses} dangerouslySetInnerHTML={{ __html: push.body }} />
          )}
        </>
      )}
    </section>
  );
};

/** Tal-strip: senest godkendte periode fra facts-laget (designsprog-
    neutralt, genbrugt 1:1). Tre tilstande: tal · under behandling · helt
    uden tal. "Se dine tal" er en bevidst bro UD (/kpis, gammel UI). */
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
      <HbCard className="mt-10 flex flex-col gap-3 p-6 md:mt-12 md:flex-row md:items-center md:justify-between">
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
    <HbCard className="mt-10 flex flex-col gap-6 p-6 md:mt-12 md:flex-row md:items-center">
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

/** Iværksætterlivet: seneste talks — nyeste som video-kort (signeret cover
    når det findes), resten som rolige rækker. Alle links er ægte
    ElementView-links. */
const TalkRow = ({ item }: { item: ContentItem }) => (
  <Link
    to={`/akademiet/talks/${item.slug}`}
    className="flex items-center gap-3 border-b border-hb-line py-3 transition-colors last:border-b-0 hover:bg-hb-sage/20"
  >
    <span className="min-w-0 flex-1 truncate text-[15px] text-hb-ink">{item.title}</span>
    {item.duration_seconds != null && (
      <span className="shrink-0 text-sm text-hb-ink-soft">
        {formatDuration(item.duration_seconds)}
      </span>
    )}
    <ArrowRight className="h-4 w-4 shrink-0 text-hb-ink-soft" />
  </Link>
);

const TalksSection = ({ talks }: { talks: ContentItem[] }) => {
  const [latest, ...rest] = talks;
  const coverQuery = useQuery({
    queryKey: ["boardroom", "talk-cover", latest?.cover_path ?? null],
    queryFn: () => getAssetPreviewUrl(latest.cover_path as string),
    enabled: Boolean(latest?.cover_path),
    staleTime: 45 * 60_000,
  });

  return (
    <HbSection
      eyebrow="Iværksætterlivet"
      linkLabel="Alle episoder"
      linkTo="/akademiet/talks"
      className="lg:col-span-4"
    >
      {latest && coverQuery.data ? (
        <>
          <Link to={`/akademiet/talks/${latest.slug}`}>
            <HbVideoCard
              image={coverQuery.data}
              imageAlt={latest.title}
              title={latest.title}
              duration={formatDuration(latest.duration_seconds) || ""}
            />
          </Link>
          {rest.length > 0 && (
            <div className="mt-6">
              {rest.map((item) => (
                <TalkRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div>
          {talks.map((item) => (
            <TalkRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </HbSection>
  );
};

export const BoardroomView = () => {
  const { user, profile, companyId } = useAuth();
  const akademi = useAkademiData();
  const { data: facts = [], isLoading: factsLoading } = useCompanyFacts();

  // ── Katalog-afledninger (deler cache med Akademiet) ─────────────────────
  const items = akademi.orderedByArea;
  const pushItem = useMemo(() => {
    const all = [...(items.get("push") ?? [])].map((entry) => entry.item).sort(byPublishedDesc);
    return all[0];
  }, [items]);
  const talks = useMemo(
    () =>
      [...(items.get("talks") ?? [])]
        .map((entry) => entry.item)
        .sort(byPublishedDesc)
        .slice(0, 3),
    [items],
  );

  // Forløbs-linket ("Eller fortsæt dit forløb") — samme dom som Akademi-
  // forsiden: første ulåste, urørte video i forløbsrækkefølgen, kun
  // akademi-områder.
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

  // ── Næste skridt-inputs (samme kilder som ActionCenter/Index) ───────────
  const { data: processedKeys } = useQuery({
    queryKey: ["boardroom", "processed-reports", companyId],
    queryFn: async () => {
      // Samme select-form som DashboardActionCenter (110-113) — override-
      // kolonnerne er uden for de genererede typer, deraf casten.
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

  const { data: milestones = [] } = useQuery({
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

  const { data: pulseRow } = useQuery({
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

  const { data: events = [] } = useQuery({
    queryKey: ["boardroom", "events"],
    queryFn: () => listUpcomingEvents(2),
    staleTime: 5 * 60_000,
  });

  const committedKeys = useMemo(() => new Set(facts.map((f) => f.period_key)), [facts]);
  const nextStep = useMemo(() => {
    if (!companyId) return null; // advisor uden company-override i byggeperioden
    return deriveNextStep({
      now: new Date(),
      processedPeriodKeys: processedKeys ?? new Set<string>(),
      committedPeriodKeys: committedKeys,
      milestones,
      hasPulseThisMonth: Boolean(pulseRow),
    });
  }, [companyId, processedKeys, committedKeys, milestones, pulseRow]);

  // ── Tal-strip-afledning (Index-mønstret) ────────────────────────────────
  const sorted = useMemo(
    () => facts.map((f) => ({ key: f.period_key, kf: factsToDanishMetrics(f.metrics), period: f.period_label })),
    [facts],
  );
  const latestFacts = sorted[sorted.length - 1];
  const bankRow = [...sorted].reverse().find((r) => r.kf.bank_balance != null);
  const processing = sorted.length === 0 && (processedKeys?.size ?? 0) > 0;

  const firstName = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "dig";

  if (akademi.loading || factsLoading) {
    return <p className="text-sm text-hb-ink-soft">Henter dit Boardroom…</p>;
  }

  return (
    <div>
      <Hero push={pushItem} firstName={firstName} />

      {companyId && (
        <TalStrip
          hasFacts={sorted.length > 0}
          processing={processing}
          periodLabel={latestFacts?.period ?? null}
          revenue={latestFacts?.kf.omsaetning ?? null}
          result={latestFacts?.kf.resultat_foer_skat ?? null}
          bank={bankRow?.kf.bank_balance ?? null}
        />
      )}

      <div className="mt-14 grid grid-cols-1 items-start gap-6 md:mt-16 lg:grid-cols-6 lg:gap-x-8 lg:gap-y-10">
        {events.length > 0 && (
          <HbSection eyebrow="Kommende events" className="lg:col-span-4">
            <div className="grid gap-6 md:grid-cols-2">
              {events.map((event) => {
                const starts = new Date(event.starts_at);
                const ends = event.ends_at ? new Date(event.ends_at) : null;
                const time = `${starts.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}${
                  ends ? `–${ends.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}` : ""
                }`;
                const kindLabel =
                  event.kind === "live_sparring" ? "Live sparring" : event.kind === "workshop" ? "Workshop" : "Event";
                return (
                  <HbEventCard
                    key={event.id}
                    day={String(starts.getDate())}
                    month={starts
                      .toLocaleDateString("da-DK", { month: "short" })
                      .replace(".", "")}
                    title={event.title}
                    meta={[kindLabel, event.meet_url ? "Online" : null, time].filter(Boolean).join(" · ")}
                    ctaLabel={null}
                  />
                );
              })}
            </div>
          </HbSection>
        )}

        <HbSection eyebrow="Dit næste skridt" className="lg:col-span-2">
          <HbCard className="flex flex-col items-start gap-4 p-6">
            {nextStep ? (
              <>
                <h3 className="font-editorial text-2xl font-medium leading-snug text-hb-ink">
                  {nextStep.title}
                </h3>
                <p className="text-sm leading-relaxed text-hb-ink-soft">{nextStep.description}</p>
                <Link to={nextStep.link}>
                  <HbButton>{nextStep.cta}</HbButton>
                </Link>
              </>
            ) : (
              <>
                <h3 className="font-editorial text-2xl font-medium leading-snug text-hb-ink">
                  Alt er ajour.
                </h3>
                <p className="text-sm leading-relaxed text-hb-ink-soft">
                  Rapport, refleksion og milestones er på plads — brug momentum i dit forløb.
                </p>
              </>
            )}
            {nextEntry && (
              <Link
                to={`/akademiet/${nextEntry.item.area}/${nextEntry.item.slug}`}
                className="text-sm text-hb-ink-soft underline-offset-4 transition-colors hover:text-hb-ink hover:underline"
              >
                Eller fortsæt dit forløb: {nextEntry.item.title}
              </Link>
            )}
          </HbCard>
        </HbSection>

        {talks.length > 0 && <TalksSection talks={talks} />}
      </div>
    </div>
  );
};
