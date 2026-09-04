import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  ADVISOR_DASHBOARD_QUERY_KEY,
  hentAdvisorDashboard,
  type AdvisorDashboardData,
} from "@/components/AdvisorDashboard";
import FornyelsesSektion from "@/components/members/FornyelsesSektion";
import IndgangsSektion from "@/components/members/IndgangsSektion";
import { HbSection } from "../HbSection";
import { cn } from "@/lib/utils";

/**
 * ⚠️ RÅMATERIALE — IKKE DET GÆLDENDE DESIGN (4/9-2026).
 *
 * Denne flade viser KØER. Det gældende design, docs/forsiden-design.md
 * (skrevet om fra bunden 4/9, #631), beskriver OPGAVER. Fejlen var ikke
 * mængden af data, men at en kø viser alt der matcher en betingelse, mens
 * en rådgiver om morgenen har brug for at vide hvad han skal gøre.
 *
 * Set på skærm 4/9 kl. 11:35 (#630): 38 rækker, hvoraf 16 sagde «ingen
 * dialog i N dage» og intet andet — samme tilstand vist 16 gange.
 *
 * Fladen swappes ALDRIG ind som den er. Næste skridt er dommen som en ren
 * funktion med tests (designets §13), og derefter en ny flade. Indtil da
 * står den her som råmateriale; filhovedet nedenfor beskriver hvad koden
 * gør, og det er stadig sandt.
 */

/**
 * Rådgiverens Dit Boardroom i Hjemmebane, etape 1 (raadgiverfladen-design.md
 * §3.5, §11 pkt. 6). NY flade på MIDLERTIDIG rute (/forside); den gamle
 * AdvisorDashboard på "/" står urørt til swappet — samme mønster som
 * listen (#605) og virksomhedssiden (#607).
 *
 * ÉT DATALAG: siden kalder hentAdvisorDashboard — den gamle forsides
 * queryFn, flyttet ordret til modulscope (4/9) — og deler cache-nøgle med
 * den. Bunkerne og motoren (afgoerVirksomhedsSignaler, #589) bygges dér;
 * her tegnes de kun. Ingen ny hentning.
 *
 * §3.5's SYV køer i §3.5's rækkefølge — én liste man kan skimme på tredive
 * sekunder om morgenen, ikke kort i to kolonner:
 *   1 Ikke hørt fra længe (ØVERST: ingen må glemmes)  bucket stale
 *   2 Venter på dit svar                              bucket waiting
 *   3 Noget stikker ud i tallene                      bucket standsOut
 *   4 Fornyelser der skal besluttes                   FornyelsesSektion
 *   5 Indgange der ikke er betalt                     IndgangsSektion
 *   6 Agentforslag der venter på afgørelse            bucket agent (NY 4/9)
 *   7 Friske tal                                      bucket fresh
 * plus «Positive muligheder» nederst — ikke i §3.5, men den findes og er
 * godt nyt; skæres ikke uden en beslutning.
 *
 * FORNYELSER OG INDGANGE er monteret UÆNDRET (FornyelsesSektion,
 * IndgangsSektion) og står stadig også på /members, indtil listen swappes.
 * De tegner i appens gamle tokens (glass-card, shadcn Button) inde i
 * Hb-skallen — det samme accepterede skift som admin-siderne (#603) og de
 * monterede komponenter på virksomhedssiden (#613). Fornyelsesordningen
 * træder i kraft 10/9, så FornyelsesSektion skal virke uændret: den får
 * samme companies-udsnit som fra Members.tsx (:317, :464 — ikke legat,
 * status aktiv eller tom; `status` er føjet til forsidens companies-select
 * for netop det).
 *
 * UDELADT, bevidst (målt 4/9, ~/Downloads/recon-forsiden.md):
 *   - «Alle virksomheder»-tabellen: dubletten af /virksomheder (#605).
 *   - activityFeed: bygges i queryFn, men læses ingen steder.
 *   - AdvisorBroadcast: importeres i AdvisorDashboard, rendres ALDRIG —
 *     et selvstændigt åbent punkt, ikke denne etapes.
 *   - Rådgiver-fordelingens chips («Jonas 12 · 3 uden ejer»): ikke i §3.5.
 * Hver række linker til /virksomhed/:companyId; «Åbn chat» som sekundær
 * vej når samtalen findes.
 */

type BucketItem = AdvisorDashboardData["buckets"]["waiting"][number];

const hilsen = (): string => {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
};

/** Alvor → tone, som blok 1 på virksomhedssiden: rust kun til det der er
    galt (>= 70); resten ink/ink-soft. Positive og friske tal er aldrig rust. */
const tone = (alvor: number, roligt: boolean) =>
  roligt ? "text-hb-ink" : alvor >= 70 ? "text-hb-rust" : alvor >= 50 ? "text-hb-ink" : "text-hb-ink-soft";

const Koe = ({
  eyebrow, items, convByCompany, roligt = false,
}: {
  eyebrow: string;
  items: BucketItem[];
  convByCompany: AdvisorDashboardData["convByCompany"];
  /** Køer der er godt nyt (friske tal, positive): ingen rust uanset alvor. */
  roligt?: boolean;
}) => {
  if (items.length === 0) return null;
  return (
    <HbSection eyebrow={`${eyebrow} · ${items.length}`} hairline className="mt-10">
      <ul className="divide-y divide-hb-line">
        {items.map((item) => {
          const convId = convByCompany.get(item.company.company_id)?.[0]?.id;
          return (
            <li key={item.company.company_id} className="flex items-center gap-3 py-2.5">
              <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full bg-current", tone(item.sortValue, roligt))} />
              <Link to={`/virksomhed/${item.company.company_id}`} className="min-w-0 flex-1 rounded-hb transition-colors hover:bg-hb-sage/20">
                <span className="block truncate text-[15px] leading-snug text-hb-ink">{item.company.company_name}</span>
                <span className={cn("block truncate text-sm leading-snug", tone(item.sortValue, roligt) === "text-hb-rust" ? "text-hb-rust" : "text-hb-ink-soft")}>{item.subtext}</span>
              </Link>
              {item.assigned_advisor_name && (
                <span className="hidden shrink-0 text-xs text-hb-ink-soft sm:inline">{item.assigned_advisor_name.split(" ")[0]}</span>
              )}
              {convId && (
                <Link to={`/chat?conversationId=${convId}`} className="shrink-0 text-xs text-hb-evergreen underline-offset-4 hover:underline">
                  Åbn chat
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </HbSection>
  );
};

export const RaadgiverForsideView = () => {
  const { user, profile } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ADVISOR_DASHBOARD_QUERY_KEY(user?.id),
    queryFn: hentAdvisorDashboard,
    enabled: !!user,
    staleTime: 2 * 60_000,
  });
  const fornavn = profile?.full_name?.split(" ")[0] || "dig";

  if (isError) {
    return <p className="text-sm text-hb-rust">Forsiden kunne ikke hentes. Prøv igen.</p>;
  }
  if (isLoading || !data) {
    return (
      <div aria-hidden>
        <div className="h-4 w-24 animate-pulse rounded bg-hb-line/60" />
        <div className="mt-4 h-10 w-2/3 animate-pulse rounded bg-hb-line/60" />
        <div className="mt-10 h-4 w-1/2 animate-pulse rounded bg-hb-line/40" />
      </div>
    );
  }

  const b = data.buckets;
  // FornyelsesSektion vil have samme udsnit som fra Members.tsx (:317, :464):
  // ikke legat, status aktiv eller tom. Kun de fem felter den læser.
  const fornyelsesVirksomheder = (data.companies as unknown as {
    id: string; name: string; is_legat?: boolean | null; status?: string | null;
    contract_end_date: string | null; subscription_status: string | null; subscription_current_period_end: string | null;
  }[])
    .filter((c) => !c.is_legat && (c.status === "active" || !c.status))
    .map((c) => ({
      id: c.id,
      name: c.name,
      contract_end_date: c.contract_end_date,
      subscription_status: c.subscription_status,
      subscription_current_period_end: c.subscription_current_period_end,
    }));
  const antalIKoeer = b.stale.length + b.waiting.length + b.standsOut.length + b.agent.length + b.fresh.length + b.positive.length;

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dit Boardroom</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          {hilsen()}, {fornavn}.
        </h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          {antalIKoeer === 0
            ? "Der venter intet i køerne i dag."
            : `${antalIKoeer} ${antalIKoeer === 1 ? "ting venter" : "ting venter"} — de tavse øverst.`}
        </p>
      </section>

      {/* 1 */}
      <Koe eyebrow="Ikke hørt fra længe" items={b.stale} convByCompany={data.convByCompany} />
      {/* 2 */}
      <Koe eyebrow="Venter på dit svar" items={b.waiting} convByCompany={data.convByCompany} />
      {/* 3 */}
      <Koe eyebrow="Noget stikker ud i tallene" items={b.standsOut} convByCompany={data.convByCompany} />

      {/* 4 + 5 — monteret uændret; appens tokens (se filhovedet). Begge er
          usynlige når de er tomme, så rækkefølgen holder uden tomme afsnit. */}
      <div className="mt-10 [&>div]:mb-0 [&>div+div]:mt-4">
        <FornyelsesSektion companies={fornyelsesVirksomheder} />
        <IndgangsSektion />
      </div>

      {/* 6 */}
      <Koe eyebrow="Agentforslag der venter på afgørelse" items={b.agent} convByCompany={data.convByCompany} roligt />
      {/* 7 */}
      <Koe eyebrow="Friske tal, fortjener sparring" items={b.fresh} convByCompany={data.convByCompany} roligt />
      {/* Ikke i §3.5 — beholdes nederst, godt nyt. */}
      <Koe eyebrow="Positive muligheder" items={b.positive} convByCompany={data.convByCompany} roligt />

      {antalIKoeer === 0 && (
        <p className="mt-10 text-sm text-hb-ink-soft">
          Ingen tavse, ingen ubesvarede, intet der stikker ud. <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">Se virksomhederne</Link>, hvis du alligevel vil kigge.
        </p>
      )}
    </div>
  );
};
