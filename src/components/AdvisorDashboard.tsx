import { supabase } from "@/integrations/supabase/client";
import * as Sentry from "@sentry/react";
import { computeMembershipTier } from "@/lib/membershipTier";
import { afgoerVirksomhedsSignaler, type FactPunkt, type Signal, type VirksomhedsInput } from "@/lib/virksomhedsSignaler";
import { budgetOmsaetningFor, type BudgetRaekke } from "@/lib/budgetSignalInput";
import { afgoerForsidensDom, type OpgaveTilDom, type VirksomhedTilDom, type BetaltIkkeOprettet } from "@/lib/forsidensDom";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { hentAlleSider } from "@/lib/budgetEngine";
import type { MaalRaekke } from "@/lib/hjemmebane/planen";
import { fletKvitteringer, laesKvittering, type Kvittering } from "@/lib/opgaveLukning";
import { afgoerPulsen, SVAR_VINDUE_DAGE, type PulsSvar } from "@/lib/pulsen";
import { erForslagGyldigt } from "@/lib/forslagUdloeb";
// Fase 0b («Én plan»): puklen lover «din afgørelse» kun for forslag med en
// godkend-vej — fladens spejl af motorens UNDERSTOETTEDE_SKRIVEVEJE.
import { UNDERSTOETTEDE_SKRIVEVEJE_FLADE } from "@/lib/forslagFlade";
import { afgoerFornyelsestilstand, type Fornyelsesbeslutning } from "@/lib/fornyelse";
import { afgoerBetalingsfrist } from "@/lib/betalingsfrist";
import { erKunde } from "@/lib/raadgiverensKunder";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { momErGyldig, type DataBasis } from "@/lib/dataGrundlag";

// ── Helpers ──

function getMissingReportKey(): string {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  return `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
}

// isFiguresFresh er flyttet ordret til src/lib/virksomhedsSignaler.ts (#589);
// den eneste læser her (bunke «positive») er pensioneret sammen med JSX'en (PR 1, 17/9).

// ── Types ──

interface ConversationRow {
  id: string;
  company_id: string | null;
  awaiting_reply_from: string | null;
  assigned_advisor_id: string | null;
  last_member_message_at: string | null;
  last_message_at: string | null;
  /** Seneste menneskebesked fra en rådgiver (trigger, kun message_type 'user') — «venter på velkomst» (10/9). */
  last_advisor_reply_at?: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  logo_url: string | null;
  er_kunde?: boolean | null;
  /** Betalingsdagen (stripe-webhook) — «betalt, ikke oprettet konto» (før 22/9). */
  contract_start_date?: string | null;
}

interface MilestoneData {
  title: string;
  deadline: string | null;
  progress: number;
}

interface CompanyMetricSummary {
  company_id: string;
  company_name: string;
  logo_url: string | null;
  has_verified_metrics: boolean;
  effective_period_label: string | null;
  effective_period_key: string | null;
  revenue: number | null;
  ebt: number | null;
  cash: number | null;
  missing_current_period: boolean;
}

interface InvestorCompanySummary extends CompanyMetricSummary {
  revenueTrendPct: number | null;
  latestPulse: { went_well: string; biggest_challenge: string; help_needed?: string | null; created_at: string; period_key: string | null } | null;
  needsAttention: boolean;
  unreadMessages: number;
  milestones: MilestoneData[];
  // ── Spor 2-overblik (additivt datalag) ──
  reflectionStatus: "with_reflection" | "report_no_reflection" | "no_report";
  isNewMember: boolean;
  expiresAt: string | null;
}

// ── Datalaget ──

/**
 * HVAD DENNE FIL ER EFTER SWAPPET (4/9): forsidens DATALAG, ikke en
 * forside. hentAdvisorDashboard nedenfor er den hentning rådgiverens
 * forside (RaadgiverForsideView, nu på "/" via Index.tsx) bygger på — den
 * kører motorerne og dommen (afgoerForsidensDom) og returnerer `dom` og
 * `pulsen` med bunkerne ved siden af.
 *
 * PR 1 (17/9, analyse-raadgivernes-forside.md §6 forslag 1): komponenten
 * AdvisorDashboard (default export), MemberCard og de syv hentninger der
 * KUN fødte dem — aktivitetsfeedet (financial_reports 7 dage), kpi_targets,
 * nyligt fuldførte milestones og handouts, målsætnings-handoutet,
 * medlemsnavne (profiles) og sidste login (get_users_last_login) — er
 * fjernet. Målt 17/9 før fjernelsen: `grep -rn "<AdvisorDashboard" src` →
 * kun filens egen kommentar; activityFeed, recentReportsData, kpiTargets,
 * goalHandoutDone, companyMemberNameMap, lastActiveAt og buckets.positive
 * læses ingen steder uden for denne fil. Filnavnet beholdes: to flader
 * importerer hentningen herfra, og kildeværnene (forsidenKaster,
 * varselStempel, agentforslagVenter, forsideMaal) læser filen ved sti.
 * Tabellerne uden loft (conversations, companies, financial_report_facts,
 * company_members, budget_targets) hentes gennem hentAlleSider — samme
 * mønster som milestones — med stabil orden (…, id), så PostgREST-loftet
 * på 1.000 rækker aldrig stille skærer en virksomhed fra dommen.
 *
 * PROD-TAL (Jonas' SQL 17/9 12:36, …_12-36-20.csv): financial_report_facts
 * 300 rækker (180 målte), 14–72 nye pr. måned (2026-03: 14 · 04: 64 · 05: 72
 * · 06: 45 · 07: 20 · 08: 60 · 09: 18) — loftet på 1.000 ville være ramt om
 * ca. et år; 14 committed de sidste 14 dage (recentFacts-loftet 20 holder i
 * dag — et nyt medlem med et års backfill sprænger det; eget kort).
 * budget_targets 4.808 i alt, 120 omsætning-base; companies 40 (29 kunder);
 * company_members 30; conversations 29; company_actions 198;
 * financial_reports 206; milestones aktive 44; pulse_checkins 28.
 *
 * Forsidens datalag — ÉT sted (4/9, raadgiverfladen-design.md §11 pkt. 6):
 * den gamle forside (AdvisorDashboard, AppLayout) og den nye i Hjemmebane
 * (RaadgiverForsideView) kalder SAMME hentning og deler cache
 * via ADVISOR_DASHBOARD_QUERY_KEY. Indholdet er queryFn'en som den stod
 * inline i komponenten — flyttet ordret op i modulscope, ikke omskrevet.
 * Den er selvforsynende: ingen closure over user/queryClient (målt 4/9).
 */
export const ADVISOR_DASHBOARD_QUERY_KEY = (userId: string | undefined) =>
  ["advisor-dashboard", userId, "assignment-display-v2"] as const;

export const hentAdvisorDashboard = () =>
      Sentry.startSpan({ name: "advisor-dashboard.load", op: "advisor.query" }, async (span) => {
      const svarGraense = new Date(Date.now() - SVAR_VINDUE_DAGE * 86400000).toISOString();
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      // Paginerede hentninger (PR 1, 17/9): hentAlleSider kaster den rå fejl;
      // her oversættes den til { data: null, error: { message } }, så
      // kraevRaekker nedenfor kaster HentningsFejl MED kildens navn — som
      // de øvrige delkald (forsidenKaster.guard: kilden skal kunne nævnes).
      type Svar<T> = { data: T[] | null; error: { message: string } | null };
      const fejlbesked = (e: unknown): string =>
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && typeof (e as { message?: unknown }).message === "string"
            ? (e as { message: string }).message
            : String(e);
      const sider = <T,>(byg: (fra: number, til: number) => PromiseLike<unknown>): Promise<Svar<T>> =>
        hentAlleSider<T>(byg as (fra: number, til: number) => PromiseLike<{ data: T[] | null; error: unknown }>).then(
          (data): Svar<T> => ({ data, error: null }),
          (e: unknown): Svar<T> => ({ data: null, error: { message: fejlbesked(e) } }),
        );
      const [
        convRes, companiesRes, factsRes,
        pulseRes,
        milestonesRes, companyMembersRes, advisorProfilesRes,
        companyInvitationsRes,
        agentProposalsRes,
        // Forsidens dom (docs/forsiden-design.md, src/lib/forsidensDom.ts):
        // de tre slags motoren ikke bærer — fornyelse, indgang, opgave nær
        // deadline — hentes her, hvor alt andet hentes, så dommen får alle
        // seks slags fra ét datalag.
        fornyelseRes, betalingslinkRes, aktiveOpgaverRes,
        // Lukningen (Jonas 8/9, lib/opgaveLukning): den nyeste kvittering
        // med grundlag pr. virksomhed — «Færdiggjort»/«Ikke relevant».
        kvitteringerRes,
        // Pulsen (9/9, lib/pulsen): svar på forslag — det eneste af de fire
        // tal forsiden ikke allerede havde data til.
        svarRes,
        // Ny og ikke i gang (9/9, lib/ikkeIGang): uploads pr. virksomhed —
        // ændrer ordene («har uploadet — ikke godkendt»), ikke dommen.
        uploadsRes,
        // Budgetafvigelse (#119, 10/9, lib/budgetSignalInput): budgetteret
        // omsætning i base-scenariet — dommen læste feltet, men fik aldrig tallet.
        budgetRes,
      ] = await Promise.all([
        // Uden loft før (PR 1): én række pr. samtale — nyeste først, id som
        // tie-break for stabil paginering (convByCompany læser [0] som nyeste).
        sider<ConversationRow>((fra, til) =>
          supabase
            .from("conversations")
            .select("id, company_id, awaiting_reply_from, assigned_advisor_id, last_member_message_at, last_message_at, last_advisor_reply_at")
            .order("last_message_at", { ascending: false })
            .order("id")
            .range(fra, til),
        ),
        sider<CompanyRow & Record<string, unknown>>((fra, til) =>
          supabase
            .from("companies")
            .select("id, name, logo_url, is_legat, status, contract_end_date, subscription_status, subscription_current_period_end, created_at, er_kunde, contract_start_date")
            .order("name")
            .order("id")
            .range(fra, til),
        ),
        // ÉN KILDE TIL TALLENE (raadgiverfladen-design.md §11 pkt. 1, 4/9):
        // nøgletallene regnes af financial_report_facts, som resten af huset
        // (NoegletalView, virksomhedssiden via useCompanyFacts) — ikke længere
        // af financial_reports. Målt 3/9 kl. 23:56: nul uenigheder hvor begge
        // kilder har en værdi; flytningen ændrer ikke tal, kun hvilke perioder
        // der findes. FORVENTEDE FORSKELLE i drift, begge bevidste:
        //   - forsiden BEGYNDER at bruge estimater fra årsrapporter og
        //     baselines (144 punkter, data_basis = 'estimated') som den ikke
        //     havde — de tæller med som perioder og som seneste tal, og
        //     has_verified_metrics bliver sand for en virksomhed med kun
        //     estimater; M/M gates med momErGyldig nedenfor.
        //   - forsiden HOLDER OP med at bruge rapporter der aldrig blev
        //     committet (Brick Works, april 2026, 1.349.013 kr.).
        // Manuelle overrides (manual_report_period_key/manual_normalized_data)
        // er indregnet ved commit: resolve_report_commit_candidate (migration
        // 20260420190823, gentaget i 20260722130000) tager manual-grenen FØRST
        // og sætter period_key := manual_report_period_key. Derfor er
        // getEffectiveKeyFigures/getEffectiveReportPeriodKey uden aftager her.
        // Hentningen spejler den tidligere rapport-hentnings begrænsninger:
        // alle virksomheder (ingen .eq("company_id") — RLS «Advisors can view
        // all facts» bærer det), intet loft (rapporterne havde heller intet),
        // og kun de kolonner dommene læser (perf/advisor-dashboard-nyttelast).
        // Rapporternes deleted_at/status-filtre har ingen facts-pendant: facts
        // findes kun for committede, processerede rapporter, og hard-delete
        // fjerner dem (companyHardDelete.ts).
        // recentFacts (committed_at >= 14 dage, nyeste først, højst 20) er
        // «friske tal»-signalets vindue (senesteCommittedAt) — udsnittet
        // lægges på i kode nedenfor.
        // data_basis-undtagelse: friske tal: signalet læser HVORNÅR der blev committet, ikke talværdier; nøgletallene fra SAMME hentning læser data_basis og gates med momErGyldig
        // PR 1 (17/9): gennem hentAlleSider — tabellen vokser 20–91 rækker om
        // måneden (forsiden-design «Målt 4/9») og slettes aldrig; uden
        // paginering ville PostgREST-loftet (1.000) stille skære de ældste
        // rækker fra og med dem harMaaltRapport, latestKf og tavshedens
        // grundlag for de virksomheder der ligger sidst. INGEN periode-
        // afgrænsning: harMaaltRapport (ikke_i_gang) er «findes NOGEN målt
        // række», også en historisk (juni–august uploadet ved ankomst), og
        // latestKfByCompany er «seneste periode uanset alder».
        sider<{ company_id: string; period_key: string; period_label: string; metrics: Record<string, number | null> | null; data_basis: DataBasis; committed_at: string }>((fra, til) =>
          supabase
            .from("financial_report_facts")
            .select("company_id, period_key, period_label, metrics, data_basis, committed_at")
            .order("company_id")
            .order("period_key")
            .order("id")
            .range(fra, til),
        ),
        // id med (fase 4): refleksionen med «hjælp ønskes» lukkes på sit id.
        supabase
          .from("pulse_checkins")
          .select("id, company_id, period_key, went_well, biggest_challenge, help_needed, created_at")
          .order("created_at", { ascending: false })
          .limit(2000),
        // Aktive mål — ALLE kolonner planen.ts læser (fase 4: «mål uden
        // bevægelse» og gennemgang på forsiden regnes af samme dom som
        // Planen på virksomhedssiden). Uden loft før: PostgREST giver højst
        // 1.000 rækker stille — 87 i prod 16/9, men hentAlleSider bærer det.
        hentAlleSider<MaalRaekke & { company_id: string }>((fra, til) =>
          supabase
            .from("milestones")
            .select("id, company_id, title, deadline, progress, status, category, source, progress_updated_at, completed_at, created_at")
            .eq("status", "active")
            .order("deadline", { ascending: true })
            .order("id")
            .range(fra, til),
        ).then(
          (data): Svar<MaalRaekke & { company_id: string }> => ({ data, error: null }),
          (e: unknown): Svar<MaalRaekke & { company_id: string }> => ({ data: null, error: { message: fejlbesked(e) } }),
        ),
        // Uden loft før (PR 1): medlemsrækker vokser med hvert medlem —
        // ældste først, id som tie-break (medlemSiden læser min(created_at)
        // selv, så ordenen ændrer ingen dom).
        sider<{ user_id: string; company_id: string; created_at: string | null }>((fra, til) =>
          supabase
            .from("company_members")
            .select("user_id, company_id, created_at")
            .order("created_at", { ascending: true })
            .order("id")
            .range(fra, til),
        ),
        supabase.rpc("get_all_advisor_profiles"),
        // Pending-gate: virksomheder med hængende (ikke-accepterede) invitationer.
        (supabase
          .from("company_invitations")
          .select("company_id, status")
          .eq("status", "pending")
          .limit(2000) as any),
        // Agentforslag der VENTER PÅ AFGØRELSE (4/9, §3.5 kø 6): samme dom
        // som useVirksomhed, men porteføljebredt — tælles pr. company_id i
        // kode. Advisor-SELECT findes (20260825200000).
        // FILTRET ER PÅ status, IKKE PÅ decided_at (rettet 7/9): en
        // 'expired'-række har decided_at = NULL, fordi ingen afgjorde den —
        // evnen blev fjernet (fire write_session_prep-forslag sat i hånden
        // 1/9). decided_at er derfor ikke et svar på «kan det afgøres»;
        // det er status. AgentForslagPanel viser kun knapper for
        // 'proposed', så kun dem må puklen tælle — ellers klikker
        // rådgiveren ind på noget der ikke kan afgøres.
        // UDLØBSDOMMEN LIGGER IKKE I SQL (besluttet 7/9): et forslag udløber
        // når dets ISO-uge er passeret (@/lib/forslagUdloeb), og den dom er
        // en ren funktion på proposed_at og et «nu». At udtrykke den som et
        // Supabase-filter ville kræve en kopi af ISO-uge-beregningen i SQL —
        // to domme. Derfor hentes proposed_at med, og optællingen nedenfor
        // filtrerer i kode med samme funktion som panelet og afgørelsen.
        (supabase
          .from("agent_proposals")
          .select("company_id, proposed_at, tool")
          .eq("status", "proposed")
          .limit(2000) as any),
        // Forsidens dom, slags 1: fornyelsesbeslutninger — samme læsning som
        // FornyelsesSektion (:91-93). Ingen række = ingen beslutning.
        // varsel_1_sendt_at (7/9): stemplet fornyelsesvarsel-cron sætter når
        // varsel 1 er gået — dommen siger så «skriv til» frem for «send
        // tilbuddet». varsel_2_sendt_at (7/9 aften): påmindelsen, som VINDER
        // over varslet (lib/varselTrin) — CARMA havde kun varsel 2, og uden
        // kolonnen sagde forsiden «Varslet er sendt» mens virksomhedssiden
        // sagde «Påmindelse sendt». Samme kolonner hentes i useVirksomhed;
        // de to skal sige det samme (varselStempel.guard.test.ts).
        (supabase
          .from("company_fornyelse" as any)
          .select("company_id, beslutning, varsel_1_sendt_at, varsel_2_sendt_at")
          .limit(2000) as any),
        // Forsidens dom, slags 2: indgangen — samme læsning som IndgangsSektion
        // (:128-132), uden companies-join (contract_end_date tages fra
        // companiesRes). Ingen række = ikke i indgangen.
        (supabase
          .from("company_betalingslink")
          .select("company_id, prisniveau_oere, underskrevet_at, betalingsmail_sendt_at, sidste_paamindelse_dag")
          .limit(2000) as any),
        // Forsidens dom, slags 7: aktive opgaver med frist (opgaveEngine B3:
        // aktive har altid due_date). Advisor-læsning som useVirksomhed (:215).
        (supabase
          .from("company_actions")
          .select("id, company_id, title, status, due_date")
          .eq("status", "active")
          .not("due_date", "is", null)
          .limit(2000) as any),
        // Lukningen: alle rækker med grundlag, nyeste først; den nyeste pr.
        // virksomhed vinder i kode. Kolonnerne udfald/grundlag er fra
        // 20260908150000 og står ikke i de genererede typer endnu (Lovable
        // regenererer) — derfor `as any`, som company_fornyelse ovenfor.
        // Læses på tværs af rådgivere (SELECT-policy, samme migration):
        // opgaven er virksomhedens.
        (supabase
          .from("advisor_company_acknowledgments" as any)
          .select("company_id, udfald, grundlag, acknowledged_at")
          .not("grundlag", "is", null)
          .order("acknowledged_at", { ascending: false })
          .limit(2000) as any),
        // Pulsen, tal 2: forslag der er SVARET på inden for SVAR_VINDUE_DAGE —
        // accepteret (accepted_at) eller lukket (closed_at; status afgør i
        // motoren om lukningen var et svar). Uden status = active-filtret,
        // som opgave-hentningen ovenfor har; ét lille kald, ingen RPC.
        // completed_at er ARVENS stempel (opgaveEngine §7): «done» fra før
        // modellen har kun det. Et svar er et svar, også et gammelt (9/9).
        (supabase
          .from("company_actions")
          .select("company_id, status, accepted_at, closed_at, completed_at")
          .or(`accepted_at.gte.${svarGraense},closed_at.gte.${svarGraense},completed_at.gte.${svarGraense}`)
          .limit(5000) as any),
        (supabase
          .from("financial_reports")
          .select("company_id")
          .is("deleted_at", null)
          .limit(5000) as any),
        // Budgetafvigelse (#119): alle virksomheders base-budget for omsætning —
        // RLS «Advisors can view all budget targets» bærer det; kun de kolonner
        // opslaget læser. Kategorien filtreres i DB, perioden i kode (base-nøglen
        // udledes af hver virksomheds seneste facts-periode).
        // Uden loft før (PR 1): prod-beviset 24/8 var netop budget_targets
        // (1.378 rækker hos én virksomhed — hentAlleSiders eget ophav).
        sider<BudgetRaekke>((fra, til) =>
          supabase
            .from("budget_targets")
            .select("company_id, period, category, budget_amount")
            .eq("category", "omsaetning")
            .like("period", "%-base-%")
            .order("company_id")
            .order("period")
            .order("id")
            .range(fra, til),
        ),
      ]);

      // DELKALDENE KASTER (7/9, recon-tavse-fejl.md pkt. 1): de ni kilder
      // dommen hviler på læses gennem kraevRaekker, som kaster med kildens
      // navn når svaret bærer en fejl. Før blev en fejl til `[]`, TanStack
      // så en succes, og forsiden sagde «ikke noget der haster» — udløbne
      // kontrakter og ubetalte indgange forsvandt uden spor. De ti øvrige
      // delkald (pulse, aktivitetsfeed, milestones, kpi_targets, rådgiver-
      // profiler, handouts, medlemsnavne, sidste login) føder kun den
      // pensionerede AdvisorDashboard-komponent eller er berigelser og
      // læses som før — tom er et gyldigt svar dér (forsidenKaster.guard).
      // (PR 1, 17/9: de syv delkald der KUN fødte den pensionerede komponent
      // er fjernet — se filhovedet.)
      const allConversations = kraevRaekker(convRes, "conversations") as ConversationRow[];
      const companies = kraevRaekker(companiesRes, "companies") as CompanyRow[];
      // Facts-rækkerne som de kommer fra tabellen. metrics er kanoniske
      // engelske nøgler — factsToDanishMetrics oversætter til de danske
      // nøgler dommene bruger (omsaetning, resultat_foer_skat, bank_balance),
      // præcis som NoegletalView og useCompanyFacts' paritets-tjek gør.
      // period_key/period_label kommer direkte fra rækken (§11 pkt. 1).
      type FactRaekke = {
        company_id: string;
        period_key: string;
        period_label: string;
        metrics: Record<string, number | null> | null;
        data_basis: DataBasis;
        committed_at: string;
      };
      const facts = kraevRaekker(factsRes, "financial_report_facts") as FactRaekke[];
      // Budgetafvigelse (#119): rækkerne til opslaget pr. virksomhed nedenfor.
      const budgetRaekker = kraevRaekker(budgetRes, "budget_targets") as BudgetRaekke[];
      // «Friske tal»-vinduet (senesteCommittedAt nedenfor) — de tidligere
      // aktivitetsfeed-filtre, uændret: committed_at >= 14 dage, nyeste
      // først, højst 20. (PR 1: feedet er væk; udsnittet bæres KUN af
      // signalet, og dets loft er derfor bevidst ikke rørt her.)
      const twoWeeksAgoMs = Date.parse(twoWeeksAgo);
      const recentFacts = facts
        .filter((f) => Date.parse(f.committed_at) >= twoWeeksAgoMs)
        .sort((a, b) => b.committed_at.localeCompare(a.committed_at))
        .slice(0, 20);
      // 10/9: ingen af forsidens hentninger må fejle stille — dommen får
      // færre linjer, og forsiden ser normal ud. Alt går gennem kraevRaekker.
      const advisorProfiles = (kraevRaekker(advisorProfilesRes, "get_all_advisor_profiles") as any[]).map((advisor) => ({
        user_id: advisor.user_id,
        full_name: advisor.full_name || "Ukendt",
      }));

      const companyMap = new Map(companies.map(c => [c.id, c]));
      const legatCompanyIds = new Set(
        companies
          .filter((c: any) => c.is_legat)
          .map((c: any) => c.id)
      );
      const companyMembers = kraevRaekker(companyMembersRes, "company_members") as any[];
      // user_id → company_id
      const userToCompany = new Map<string, string>();
      for (const m of companyMembers) {
        userToCompany.set(m.user_id, m.company_id);
      }

      const companyToUser = new Map<string, string>();
      for (const m of companyMembers) {
        companyToUser.set(m.company_id, m.user_id);
      }

      // company_id → active milestones[]
      const milestonesByCompany = new Map<string, MilestoneData[]>();
      // Fase 4: de samme rækker, hele, til forsidens dom (maal_uden_bevaegelse).
      const maalByCompany = new Map<string, MaalRaekke[]>();
      for (const m of kraevRaekker(milestonesRes, "milestones") as (MaalRaekke & { company_id: string })[]) {
        const cid = m.company_id;
        if (!cid) continue;
        if (!milestonesByCompany.has(cid)) milestonesByCompany.set(cid, []);
        milestonesByCompany.get(cid)!.push({ title: m.title, deadline: m.deadline, progress: m.progress });
        if (!maalByCompany.has(cid)) maalByCompany.set(cid, []);
        maalByCompany.get(cid)!.push(m);
      }

      // Latest pulse by company
      const latestPulseByCompany = new Map<string, { went_well: string; biggest_challenge: string; help_needed?: string | null; created_at: string; period_key: string | null }>();
      // Fase 4: den NYESTE refleksion med «søger hjælp til» pr. virksomhed —
      // forsidens slags refleksion_hjaelp (lukkes på refleksionens id).
      // periodKey med (17/9): linjen viser «Refleksion {måned år}». Længdekravet
      // (REFLEKSION_MIN_TEGN) og «besvaret i chatten» dømmes i forsidensDom — ikke her.
      const refleksionHjaelpByCompany = new Map<string, { id: string; helpNeeded: string; createdAt: string; periodKey: string | null }>();
      for (const p of kraevRaekker(pulseRes, "pulse_checkins") as any[]) {
        if (!latestPulseByCompany.has(p.company_id)) {
          latestPulseByCompany.set(p.company_id, {
            went_well: p.went_well || "",
            biggest_challenge: p.biggest_challenge || "",
            help_needed: p.help_needed || null,
            created_at: p.created_at,
            period_key: p.period_key ?? null,
          });
        }
        if (p.company_id && p.id && typeof p.help_needed === "string" && p.help_needed.trim() && !refleksionHjaelpByCompany.has(p.company_id)) {
          refleksionHjaelpByCompany.set(p.company_id, { id: p.id, helpNeeded: p.help_needed, createdAt: p.created_at, periodKey: p.period_key ?? null });
        }
      }

      // Alle refleksions-perioder pr. virksomhed (ikke kun den nyeste pulse), så
      // reflectionStatus kan spørge "findes en refleksion for RAPPORTENS periode",
      // uafhængigt af hvilken pulse der er nyest (rapport/refleksion er forskudt i takt).
      const pulsePeriodsByCompany = new Map<string, Set<string>>();
      for (const p of kraevRaekker(pulseRes, "pulse_checkins") as any[]) {
        if (!p.company_id || !p.period_key) continue;
        let set = pulsePeriodsByCompany.get(p.company_id);
        if (!set) { set = new Set<string>(); pulsePeriodsByCompany.set(p.company_id, set); }
        set.add(p.period_key);
      }

      // Unread messages per company
      const unreadByCompany = new Map<string, number>();
      for (const c of allConversations) {
        if (c.company_id && c.awaiting_reply_from === "advisor") {
          unreadByCompany.set(c.company_id, (unreadByCompany.get(c.company_id) || 0) + 1);
        }
      }

      // Build report keys per company + KFs by period — af FACTS. Hver
      // periode bærer sit grundlag (data_basis) og sin label med, så M/M-
      // gaten og motoren kan læse dem uden nyt opslag. UNIQUE(company_id,
      // period_key) på facts gør «første vinder»-tjekket fra rapport-vejen
      // overflødigt.
      type PeriodeFact = { kf: Record<string, number>; data_basis: DataBasis; period_label: string };
      const reportKeysByCompany = new Map<string, Set<string>>();
      const kfByCompanyPeriod = new Map<string, Map<string, PeriodeFact>>();
      const latestKfByCompany = new Map<string, { key: string } & PeriodeFact>();

      for (const f of facts) {
        const key = f.period_key;
        if (!key) continue;
        if (!reportKeysByCompany.has(f.company_id)) reportKeysByCompany.set(f.company_id, new Set());
        reportKeysByCompany.get(f.company_id)!.add(key);

        const kf = factsToDanishMetrics(f.metrics);
        if (Object.keys(kf).length === 0) continue;
        const punkt: PeriodeFact = { kf, data_basis: f.data_basis, period_label: f.period_label };

        if (!kfByCompanyPeriod.has(f.company_id)) kfByCompanyPeriod.set(f.company_id, new Map());
        kfByCompanyPeriod.get(f.company_id)!.set(key, punkt);

        const latestExisting = latestKfByCompany.get(f.company_id);
        if (!latestExisting || key > latestExisting.key) {
          latestKfByCompany.set(f.company_id, { key, ...punkt });
        }
      }

      // Latest report key per company
      const latestReportKey = new Map<string, string>();
      for (const [compId, keys] of reportKeysByCompany) {
        const sorted = [...keys].sort();
        latestReportKey.set(compId, sorted[sorted.length - 1]);
      }

      // Missing report check
      const missingKey = getMissingReportKey();
      const companiesMissingReport = new Set<string>();
      for (const c of companies) {
        const keys = reportKeysByCompany.get(c.id);
        if (!keys || !keys.has(missingKey)) companiesMissingReport.add(c.id);
      }

      // Revenue trend per company — M/M af facts, gated på data_basis.
      // momErGyldig (src/lib/dataGrundlag, samme dom som NoegletalView:783)
      // er sand KUN når begge de to seneste punkter er 'measured'; ellers
      // intet M/M-tal (null). En M/M mod et /12-estimat måler afstanden til
      // en regnekonstruktion, ikke en måneds udvikling.
      // Regnestykket (arvet uændret fra rapport-vejen):
      //   pct = (seneste.omsaetning − forrige.omsaetning) / forrige.omsaetning × 100
      //   kun når begge > 0; ellers null. Nævneren er forrige (ikke abs) —
      //   motoren regner sin egen M/M med abs-nævner (valg 3), det er
      //   bevidst forskelligt og rører ikke denne.
      const revenueTrendByCompany = new Map<string, number | null>();
      for (const [compId, periodMap] of kfByCompanyPeriod) {
        const sortedKeys = [...periodMap.keys()].sort();
        const latest = periodMap.get(sortedKeys[sortedKeys.length - 1]);
        const prev = sortedKeys.length >= 2 ? periodMap.get(sortedKeys[sortedKeys.length - 2]) : undefined;
        if (latest && prev && momErGyldig([prev, latest])) {
          const latestRev = latest.kf.omsaetning;
          const prevRev = prev.kf.omsaetning;
          if (latestRev != null && prevRev != null && latestRev > 0 && prevRev > 0) {
            revenueTrendByCompany.set(compId, ((latestRev - prevRev) / prevRev) * 100);
          } else {
            revenueTrendByCompany.set(compId, null);
          }
        } else {
          revenueTrendByCompany.set(compId, null);
        }
      }

      const now = new Date();

      // Build InvestorCompanySummary[]
      // er_kunde læses her fordi dette er forsidens datalag: vores egen
      // virksomhed (Topix.dk ApS) må ikke stå i rådgiverens køer og tællere
      // som var den en kunde (src/lib/raadgiverensKunder.ts, fail-open).
      const investorSummaries: InvestorCompanySummary[] = companies.filter(c => !legatCompanyIds.has(c.id) && erKunde(c)).map(c => {
        const latest = latestKfByCompany.get(c.id);
        const latestKey = latestReportKey.get(c.id) || null;
        const missingReport = companiesMissingReport.has(c.id);
        const revenue = latest?.kf.omsaetning ?? null;
        const ebt = latest?.kf.resultat_foer_skat ?? null;
        const cash = latest?.kf.bank_balance ?? null;
        const revenueTrendPct = revenueTrendByCompany.get(c.id) ?? null;
        const pulse = latestPulseByCompany.get(c.id) ?? null;

        // ── Spor 2-felter (additivt) ──
        // reflectionStatus: "no_report" når der slet ingen committet rapport er
        // (effective_period_key == null, sandeste "ingen rapport"-test). Ellers spørges
        // om der findes en refleksion for RAPPORTENS periode blandt ALLE virksomhedens
        // pulses (set-opslag), ikke om den NYESTE pulse tilfældigvis er for den periode.
        const reflectionStatus: "with_reflection" | "report_no_reflection" | "no_report" =
          latestKey == null
            ? "no_report"
            : (pulsePeriodsByCompany.get(c.id)?.has(latestKey) ? "with_reflection" : "report_no_reflection");
        const memberSince = (c as any).created_at ?? null;
        const isNewMember = memberSince != null && (now.getTime() - new Date(memberSince).getTime()) < 30 * 86400000;
        const tier = computeMembershipTier({
          contract_end_date: (c as any).contract_end_date,
          subscription_status: (c as any).subscription_status,
          subscription_current_period_end: (c as any).subscription_current_period_end,
        });
        const expiresAt = tier === "full"
          ? ((c as any).contract_end_date ?? null)
          : tier === "subscriber"
            ? ((c as any).subscription_current_period_end ?? null)
            : null;

        const needsAttention =
          (cash != null && cash < 0)
          || (revenueTrendPct != null && revenueTrendPct < -15)
          || (missingReport && !latestKey);

        return {
          company_id: c.id,
          company_name: c.name,
          logo_url: c.logo_url,
          has_verified_metrics: !!latest,
          // period_label direkte fra facts-rækken (§11 pkt. 1) — samme format
          // som før («Marts 2026»): commit skriver report_period/manual-label,
          // estimat-skriverne skriver DANISH_MONTHS[i] + år. Falder tilbage
          // til nøglen hvis den seneste nøgle ikke har en fact med tal.
          effective_period_label: latestKey ? (latest?.key === latestKey ? latest.period_label : latestKey) : null,
          effective_period_key: latestKey,
          revenue,
          ebt,
          cash,
          missing_current_period: missingReport,
          revenueTrendPct,
          latestPulse: pulse,
          needsAttention,
          unreadMessages: unreadByCompany.get(c.id) || 0,
          milestones: milestonesByCompany.get(c.id) || [],
          reflectionStatus,
          isNewMember,
          expiresAt,
        };
      });

      // Conversations grouped by company
      const convByCompany = new Map<string, ConversationRow[]>();
      for (const c of allConversations) {
        if (c.company_id) {
          if (!convByCompany.has(c.company_id)) convByCompany.set(c.company_id, []);
          convByCompany.get(c.company_id)!.push(c);
        }
      }

      // Alerts-hentningen (notifications fra detect-financial-alerts) er fjernet
      // 3/9 sen aften: motoren dømmer ikke på alerts (virksomhedsSignaler.ts,
      // valg 4), og den havde ingen anden aftager i filen (grep: alertsByCompany
      // blev kun læst af bunke 4).

      // Udløbs-gate: skjul tier === "expired" fra dagligt arbejde (display-niveau).
      // Rører ikke kilden, så investorSummaries/companyMap/tællere forbliver hele.
      // no_date/full/subscriber beholdes (fail-open, test !== "expired").
      const expiredCompanyIds = new Set<string>();
      for (const c of (companies as any[])) {
        if (computeMembershipTier({
          contract_end_date: c.contract_end_date,
          subscription_status: c.subscription_status,
          subscription_current_period_end: c.subscription_current_period_end,
        }) === "expired") {
          expiredCompanyIds.add(c.id);
        }
      }

      // Pending-gate: skjul virksomheder der KUN har en hængende invitation og INGEN
      // accepteret/aktiv bruger (samme display-niveau-mønster som expiredCompanyIds;
      // spejler Members.tsx' invitationStatus === 'pending'). En virksomhed med mindst
      // ét aktivt company_members-medlem er ALDRIG pending (selv med hængende invite).
      const companiesWithActiveMembers = new Set<string>(
        companyMembers.map(m => m.company_id)
      );
      const pendingCompanyIds = new Set<string>();
      for (const inv of kraevRaekker(companyInvitationsRes, "company_invitations") as any[]) {
        if (inv.company_id && !companiesWithActiveMembers.has(inv.company_id)) {
          pendingCompanyIds.add(inv.company_id);
        }
      }

      // Priority queue — score each company
      // ── Fem handlingsbunker (afløser den ene scorede liste + proaktiv sparring) ──
      // ÉN gennemløbning af investorSummaries udleder bunke-medlemskab pr. virksomhed
      // (kan stå i FLERE). Begge gates anvendes ÉN gang på virksomheds-sættet, så en
      // kvitteret/udløbet virksomhed forsvinder fra ALLE fem bunker.
      type BucketItem = {
        company: { company_id: string; company_name: string; logo_url: string | null };
        subtext: string;
        assigned_advisor_id: string | null;
        assigned_advisor_name: string | null;
        sortValue: number;
      };
      const bWaiting: BucketItem[] = [];
      const bFresh: BucketItem[] = [];
      const bStale: BucketItem[] = [];
      const bStandsOut: BucketItem[] = [];
      // Kø 6 (§3.5): agentforslag der venter — læses af den nye forside
      // (RaadgiverForsideView); AdvisorDashboards render kender den ikke.
      const bAgent: BucketItem[] = [];
      const signalerByCompany = new Map<string, { signaler: Signal[]; agentforslagVenter: number; agentforslagMedGodkendVej: number; senestePeriode: string | null }>();
      const agentforslagByCompany = new Map<string, number>();
      // 0b: hvor mange af de ventende der kan GODKENDES (tool med skrivevej).
      const godkendbareByCompany = new Map<string, number>();
      // Kun forslag der stadig kan AFGØRES tælles (besluttet 7/9): udløbne
      // (passeret ISO-uge) kan kun forkastes, og puklen lover en afgørelse.
      // Samme dom som AgentForslagPanel og agent-forslag-afgoer, samme «nu»
      // som resten af queryFn.
      for (const p of kraevRaekker(agentProposalsRes, "agent_proposals") as { company_id: string; proposed_at: string; tool: string | null }[]) {
        if (!p.company_id || !erForslagGyldigt(p.proposed_at, now)) continue;
        agentforslagByCompany.set(p.company_id, (agentforslagByCompany.get(p.company_id) || 0) + 1);
        if (p.tool && UNDERSTOETTEDE_SKRIVEVEJE_FLADE.has(p.tool)) {
          godkendbareByCompany.set(p.company_id, (godkendbareByCompany.get(p.company_id) || 0) + 1);
        }
      }

      for (const c of investorSummaries) {
        // Gates: udløbede springes helt over. Pending (invitation uden
        // medlemmer) får MOTORENS signaler regnet (pulsen tæller dem som
        // porteføljen, 9/9 — en inviteret der ikke er kommet ind, er tavs),
        // men kommer ikke i bunkerne og ikke i dommen (gaten nedenfor).
        if (expiredCompanyIds.has(c.company_id)) continue;
        const erPending = pendingCompanyIds.has(c.company_id);

        const conv = convByCompany.get(c.company_id)?.[0];
        const base = {
          company: { company_id: c.company_id, company_name: c.company_name, logo_url: c.logo_url },
          assigned_advisor_id: conv?.assigned_advisor_id ?? null,
          assigned_advisor_name: advisorProfiles.find(a => a.user_id === conv?.assigned_advisor_id)?.full_name ?? null,
        };

        // ── Bunke 1–4 kommer fra motoren (src/lib/virksomhedsSignaler.ts, #589):
        //    én dom i huset, ikke to. Inputtet bygges af det queryFn ALLEREDE
        //    har hentet — ingen ny query. Signalerne fordeles i de eksisterende
        //    bunker efter `koe`; subtext = signalets tekst, sortValue = alvor.
        //
        //    FORSKELLE I UDFALD efter omlægningen (3/9 sen aften):
        //      - «Ikke hørt fra længe» er VENDT (designets §3.5): kravet om
        //        has_verified_metrics er væk, og en virksomhed UDEN samtale får
        //        «Har aldrig skrevet» (alvor 95, øverst). Målt 1/9 var fjorten af
        //        treogtredive uden ét måltal — de dukker nu op. Køen bliver
        //        LÆNGERE; det er meningen: ingen må glemmes.
        //      - Sortering i «stale» er nu alvor (60 + dage over 21, loft 90;
        //        aldrig skrevet 95), ikke rå dage. Rækkefølgen er den samme for
        //        dem der har skrevet; de tavse ligger øverst.
        //      - «Venter på dit svar» sorteres på 70 + antal (før: antal).
        //      - «Friske tal» sorteres på fast 30 (før: committed_at-tidsstempel),
        //        så rækkefølgen inden for bunken er indlæsningsrækkefølgen.
        //      - «Stikker ud»: alerts er UDE (motorens valg 4); MoM regnes med
        //        Math.abs(prev) og uden kravet latestRev > 0 && prevRev > 0 fra
        //        revenueTrendByCompany; resultatfald ≥ 15 % MoM er NYT (alvor 70).
        //      - Budgetafvigelse (#119, 10/9): queryFn henter nu budget_targets
        //        (base-scenariet, omsaetning); opslaget i lib/budgetSignalInput.
        const companyFacts = kfByCompanyPeriod.get(c.company_id);
        const factKeys = companyFacts ? [...companyFacts.keys()].sort() : [];
        const tilFactPunkt = (key: string | undefined): FactPunkt | null => {
          if (!key || !companyFacts) return null;
          const f = companyFacts.get(key);
          if (!f) return null;
          return {
            period_key: key,
            period_label: f.period_label,
            omsaetning: f.kf.omsaetning ?? null,
            resultat_foer_skat: f.kf.resultat_foer_skat ?? null,
            bank_balance: f.kf.bank_balance ?? null,
          };
        };
        // Motorens M/M (omsætningsfald/resultatfald i «stikker ud») gates med
        // SAMME momErGyldig-dom som revenueTrendByCompany: er et af de to
        // seneste punkter et estimat, får motoren forrigeFact = null, og dens
        // M/M-gren (`if (frisk && seneste && forrige)`) kører ikke — så et
        // 'estimated' punkt udløser aldrig et faldsignal mod et 'measured'
        // (§11 pkt. 1's betingelse). Motoren selv er urørt; FactPunkt bærer
        // ikke data_basis, så dommen falder her i fodringen.
        const senesteNoegle = factKeys[factKeys.length - 1];
        const forrigeNoegle = factKeys[factKeys.length - 2];
        const momGyldig =
          !!companyFacts && !!senesteNoegle && !!forrigeNoegle &&
          momErGyldig([companyFacts.get(forrigeNoegle)!, companyFacts.get(senesteNoegle)!]);
        const freshFact = recentFacts.find((f) => f.company_id === c.company_id);
        const signalInput: VirksomhedsInput = {
          senesteFact: tilFactPunkt(senesteNoegle),
          forrigeFact: momGyldig ? tilFactPunkt(forrigeNoegle) : null,
          // recentFacts bærer kun facts committet inden for 14 dage — præcis
          // det vindue «friske tal» dømmer på. Ældre → null → intet signal.
          senesteCommittedAt: freshFact?.committed_at ?? null,
          // Budgetafvigelse (#119, 10/9): base-budgettet for senestes periode —
          // kun når seneste række er MÅLT (data_basis-kontrakten); intet budget
          // → null → motoren giver intet signal (aldrig et signal om nul).
          budgetOmsaetning: budgetOmsaetningFor(budgetRaekker, c.company_id, senesteNoegle, senesteNoegle ? companyFacts?.get(senesteNoegle)?.data_basis : null),
          forfaldneMilestones: 0, // motoren bruger dem ikke (valg 6); queryFn har kun aktive milestones
          loeftestaenger: 0, // queryFn henter ikke levers
          ulaesteBeskeder: c.unreadMessages,
          // null når der ingen samtale er — det er dét der gør «har aldrig skrevet» muligt.
          senesteBeskedAt: conv?.last_message_at ?? null,
          harCommittedeTal: c.has_verified_metrics,
          agentforslagVenter: agentforslagByCompany.get(c.company_id) ?? 0,
        };
        const signaler = afgoerVirksomhedsSignaler(signalInput, now);
        // Forsidens dom får motorens udfald uændret (én dom i huset).
        // senestePeriode: talsignalernes grundlag (lukningen) — perioden de er regnet af.
        signalerByCompany.set(c.company_id, { signaler, agentforslagVenter: signalInput.agentforslagVenter, agentforslagMedGodkendVej: godkendbareByCompany.get(c.company_id) ?? 0, senestePeriode: senesteNoegle ?? null });
        // Pending: signalerne er regnet (til pulsen); bunkerne er fladens.
        if (erPending) continue;
        for (const s of signaler) {
          const item: BucketItem = { ...base, subtext: s.tekst, sortValue: s.alvor };
          if (s.koe === "ikke_hoert_fra_laenge") bStale.push(item);
          else if (s.koe === "venter_paa_svar") bWaiting.push(item);
          else if (s.koe === "stikker_ud") bStandsOut.push(item);
          else if (s.koe === "friske_tal") bFresh.push(item);
          else if (s.koe === "agentforslag_venter") bAgent.push(item);
        }

        // Bunke 5 «positive muligheder» er pensioneret (PR 1, 17/9): den byggede
        // på nyligt fuldførte milestones/handouts, som ingen læste (§11).
      }

      const bySortDesc = (a: BucketItem, b: BucketItem) => b.sortValue - a.sortValue;
      const buckets = {
        waiting: bWaiting.sort(bySortDesc),
        fresh: bFresh.sort(bySortDesc),
        stale: bStale.sort(bySortDesc),
        standsOut: bStandsOut.sort(bySortDesc),
        agent: bAgent.sort(bySortDesc),
      };

      // ── Forsidens dom (docs/forsiden-design.md; src/lib/forsidensDom.ts) ──
      // Samme virksomheds-sæt som bunkerne (udløbede og pending sprunget
      // over, legat allerede ude af investorSummaries). Fornyelse dømmes for
      // samme udsnit som FornyelsesSektion får (status aktiv eller tom);
      // indgang kun hvor der er en linkrække; opgaver kun aktive med frist.
      // Motorerne køres her — dommen tager deres UDFALD, ikke deres råstof.
      const beslutningByCompany = new Map<string, Fornyelsesbeslutning>();
      const varsel1ByCompany = new Map<string, string | null>();
      const varsel2ByCompany = new Map<string, string | null>();
      for (const r of kraevRaekker(fornyelseRes, "company_fornyelse") as { company_id: string; beslutning: string; varsel_1_sendt_at: string | null; varsel_2_sendt_at: string | null }[]) {
        if (r.beslutning === "tilbyd" || r.beslutning === "tilbyd_ikke") beslutningByCompany.set(r.company_id, r.beslutning);
        varsel1ByCompany.set(r.company_id, r.varsel_1_sendt_at ?? null);
        varsel2ByCompany.set(r.company_id, r.varsel_2_sendt_at ?? null);
      }
      const betalingslinkByCompany = new Map<string, {
        prisniveau_oere: number | null; underskrevet_at: string; betalingsmail_sendt_at: string | null; sidste_paamindelse_dag: number | null;
      }>();
      for (const r of kraevRaekker(betalingslinkRes, "company_betalingslink") as any[]) {
        if (r.company_id) betalingslinkByCompany.set(r.company_id, r);
      }
      const opgaverByCompany = new Map<string, OpgaveTilDom[]>();
      for (const o of kraevRaekker(aktiveOpgaverRes, "company_actions") as { id: string; company_id: string; title: string; status: string; due_date: string | null }[]) {
        if (!o.company_id) continue;
        const liste = opgaverByCompany.get(o.company_id) ?? [];
        // due_date er en date-kolonne ("YYYY-MM-DD"); som lokal kalenderdag,
        // ikke UTC-midnat — ellers skrider den en dag vest for Greenwich.
        const [aar, md, dag] = (o.due_date ?? "").split("-").map((x) => parseInt(x, 10));
        liste.push({ id: o.id, title: o.title, status: o.status, due_date: aar && md && dag ? new Date(aar, md - 1, dag) : null });
        opgaverByCompany.set(o.company_id, liste);
      }
      // Lukningen: ALLE kvitteringer med grundlag pr. virksomhed, flettet
      // (lib/opgaveLukning.fletKvitteringer — nøgle for nøgle vinder den
      // nyeste; rækkerne kommer nyeste først). PR 5 (17/9): før vandt kun den
      // nyeste række («if (!r.company_id || kvitteringByCompany.has(r.company_id))
      // continue;»), så «Ikke relevant» på «ingen mål» blev ophævet af en
      // senere lukning af tavsheden for samme virksomhed. Gamle snooze-rækker
      // læses som null af laesKvittering og lukker intet.
      const kvitteringerByCompany = new Map<string, Kvittering[]>();
      for (const r of kraevRaekker(kvitteringerRes, "advisor_company_acknowledgments") as { company_id: string; udfald: string | null; grundlag: unknown; acknowledged_at: string | null }[]) {
        if (!r.company_id) continue;
        const k = laesKvittering(r);
        if (!k) continue;
        const liste = kvitteringerByCompany.get(r.company_id) ?? [];
        liste.push(k);
        kvitteringerByCompany.set(r.company_id, liste);
      }
      const kvitteringByCompany = new Map<string, Kvittering>();
      for (const [cid, liste] of kvitteringerByCompany) {
        const k = fletKvitteringer(liste);
        if (k) kvitteringByCompany.set(cid, k);
      }
      // Den ulæstes grundlag: seneste medlemsbesked på tværs af virksomhedens samtaler.
      // Seneste rådgiverbesked pr. virksomhed — «venter på velkomst» (10/9):
      // null = ingen rådgiver har nogensinde skrevet en menneskebesked.
      const sidsteRaadgiverBeskedByCompany = new Map<string, string>();
      for (const c of allConversations) {
        if (!c.company_id || !c.last_advisor_reply_at) continue;
        const eks = sidsteRaadgiverBeskedByCompany.get(c.company_id);
        if (!eks || c.last_advisor_reply_at > eks) sidsteRaadgiverBeskedByCompany.set(c.company_id, c.last_advisor_reply_at);
      }
      const senesteMedlemsbeskedByCompany = new Map<string, string>();
      for (const c of allConversations) {
        if (!c.company_id || !c.last_member_message_at) continue;
        const eks = senesteMedlemsbeskedByCompany.get(c.company_id);
        if (!eks || c.last_member_message_at > eks) senesteMedlemsbeskedByCompany.set(c.company_id, c.last_member_message_at);
      }
      // Ny og ikke i gang (lib/ikkeIGang): medlemskabets begyndelse = første
      // company_members-række; bevis = en MÅLT facts-række; uploads til ordene.
      const medlemSidenByCompany = new Map<string, string>();
      for (const m of companyMembers as { company_id: string; created_at?: string | null }[]) {
        if (!m.company_id || !m.created_at) continue;
        const hidtil = medlemSidenByCompany.get(m.company_id);
        if (!hidtil || m.created_at < hidtil) medlemSidenByCompany.set(m.company_id, m.created_at);
      }
      const maaltByCompany = new Set<string>();
      for (const f of facts) if (f.data_basis === "measured") maaltByCompany.add(f.company_id);
      const uploadsByCompany = new Map<string, number>();
      for (const r of (kraevRaekker(uploadsRes, "uploads") as { company_id: string | null }[])) {
        if (r.company_id) uploadsByCompany.set(r.company_id, (uploadsByCompany.get(r.company_id) ?? 0) + 1);
      }
      const companyById = new Map<string, any>((companies as any[]).map((c) => [c.id, c]));
      // Ét motor-udfald pr. virksomhed — to universer (9/9): dommen får
      // fladens (uden pending), pulsen får porteføljens (listens 27: status
      // aktiv/tom, ikke udløbet; pending MED). Samme funktion, så tallene
      // er regnet af det samme.
      const tilDom = (c: (typeof investorSummaries)[number]): VirksomhedTilDom => {
          const row = companyById.get(c.company_id);
          const sig = signalerByCompany.get(c.company_id);
          const iFornyelsesUdsnit = !!row && (row.status === "active" || !row.status);
          const link = betalingslinkByCompany.get(c.company_id);
          return {
            companyId: c.company_id,
            navn: c.company_name,
            signaler: sig?.signaler ?? [],
            agentforslagVenter: sig?.agentforslagVenter ?? 0,
            agentforslagMedGodkendVej: sig?.agentforslagMedGodkendVej ?? 0,
            fornyelse: iFornyelsesUdsnit
              ? afgoerFornyelsestilstand({
                  contract_end_date: row.contract_end_date ?? null,
                  subscription_status: row.subscription_status ?? null,
                  subscription_current_period_end: row.subscription_current_period_end ?? null,
                  beslutning: beslutningByCompany.get(c.company_id) ?? null,
                }, now)
              : null,
            varsel1SendtAt: varsel1ByCompany.get(c.company_id) ?? null,
            varsel2SendtAt: varsel2ByCompany.get(c.company_id) ?? null,
            indgang: link
              ? afgoerBetalingsfrist({
                  prisniveau_oere: link.prisniveau_oere,
                  underskrevet_at: link.underskrevet_at,
                  betalingsmail_sendt_at: link.betalingsmail_sendt_at,
                  sidste_paamindelse_dag: link.sidste_paamindelse_dag,
                  contract_end_date: row?.contract_end_date ?? null,
                }, now)
              : null,
            opgaver: opgaverByCompany.get(c.company_id) ?? [],
            // Lukningen (lib/opgaveLukning): grundlagene dommen sammenligner
            // kvitteringen med — samme kilder som signalerne selv.
            senestePeriode: sig?.senestePeriode ?? null,
            senesteBeskedAt: convByCompany.get(c.company_id)?.[0]?.last_message_at ?? null,
            senesteMedlemsbeskedAt: senesteMedlemsbeskedByCompany.get(c.company_id) ?? null,
            fornyelseBeslutning: beslutningByCompany.get(c.company_id) ?? null,
            kvittering: kvitteringByCompany.get(c.company_id) ?? null,
            // Ny og ikke i gang (lib/ikkeIGang, 9/9).
            medlemSiden: medlemSidenByCompany.get(c.company_id) ?? null,
            sidsteRaadgiverBeskedAt: sidsteRaadgiverBeskedByCompany.get(c.company_id) ?? null,
            harMaaltRapport: maaltByCompany.has(c.company_id),
            antalUploads: uploadsByCompany.get(c.company_id) ?? 0,
            // «Én plan» fase 4: målene (aktive) og refleksionen med hjælp.
            maal: maalByCompany.get(c.company_id) ?? [],
            refleksionHjaelp: refleksionHjaelpByCompany.get(c.company_id) ?? null,
          };
        };
      const virksomhederTilDom: VirksomhedTilDom[] = investorSummaries
        .filter((c) => !expiredCompanyIds.has(c.company_id) && !pendingCompanyIds.has(c.company_id))
        .map(tilDom);
      // BETALT, IKKE OPRETTET KONTO (før 22/9 — forsidensDom.BetaltIkkeOprettet):
      // kunder (ikke legat) med contract_start_date, gældende kontrakt (ikke
      // udløbet) og INGEN company_members-række. De er *pending* i gaten
      // ovenfor og står derfor ikke i virksomhederTilDom — dommen får dem
      // som egen liste, med hver virksomheds kvittering (lukningen). Legat
      // og ikke-kunder tælles ikke (de kommer ikke ind ad indgangen).
      const betaltIkkeOprettet: BetaltIkkeOprettet[] = (companies as CompanyRow[])
        .filter((c) => !legatCompanyIds.has(c.id) && erKunde(c) && !!c.contract_start_date && !expiredCompanyIds.has(c.id) && !companiesWithActiveMembers.has(c.id))
        .map((c) => ({ companyId: c.id, navn: c.name, betaltDag: c.contract_start_date as string, kvittering: kvitteringByCompany.get(c.id) ?? null }));
      const dom = afgoerForsidensDom(virksomhederTilDom, now, { betaltIkkeOprettet });
      // Pulsen (lib/pulsen): PORTEFØLJENS univers = listens (VirksomhedslisteView:
      // kunde, ikke legat, status aktiv/tom) — pending OG udløbne er MED
      // (10/9: «af 26» mod listens 27 var den udløbne; en udløbet er i
      // porteføljen til den bliver «tidligere», og udloebet_tilbyd kan kun
      // tælles hvis den er med). Dommens to gates gives videre som
      // udenForDommen, så pulsens tekst kan gøre rede for hver tavs.
      const virksomhederTilPuls: VirksomhedTilDom[] = investorSummaries
        .filter((c) => {
          const row = companyById.get(c.company_id);
          return !!row && (row.status === "active" || !row.status);
        })
        .map(tilDom);
      const pulsen = afgoerPulsen({
        virksomheder: virksomhederTilPuls,
        facts: facts.map((f) => ({ company_id: f.company_id, period_key: f.period_key, data_basis: f.data_basis ?? null })),
        maanedNoegle: missingKey,
        svar: (kraevRaekker(svarRes, "company_actions") as PulsSvar[]),
        nu: now,
        dom,
        udenForDommen: { ikkeKommetInd: pendingCompanyIds, udloebet: expiredCompanyIds },
      });

      const svarBytes = [
        convRes, companiesRes, factsRes, pulseRes,
        milestonesRes, companyMembersRes, advisorProfilesRes,
        companyInvitationsRes, agentProposalsRes,
        fornyelseRes, betalingslinkRes, aktiveOpgaverRes, kvitteringerRes, svarRes, uploadsRes, budgetRes,
      ].reduce((sum, res) => {
        try {
          return sum + (JSON.stringify((res as { data?: unknown })?.data ?? null)?.length ?? 0);
        } catch {
          return sum;
        }
      }, 0);
      span.setAttribute("svar_kb", Math.round(svarBytes / 1024));
      // Lokal udvikling: samme miljø-betingelse som Sentry-opsætningen
      // (main.tsx:39 enabled: PROD) — konsol-linjen lever kun udenfor prod.
      if (!import.meta.env.PROD) {
        console.info(`[advisor-dashboard] hentning: ~${Math.round(svarBytes / 1024)} kB svar`);
      }

      return {
        investorSummaries, companyMap, convByCompany, expiredCompanyIds, pendingCompanyIds,
        buckets, dom, pulsen, advisorProfiles,
        allConversations, companyToUser, companies, legatCompanyIds,
      };
      });

export type AdvisorDashboardData = Awaited<ReturnType<typeof hentAdvisorDashboard>>;
