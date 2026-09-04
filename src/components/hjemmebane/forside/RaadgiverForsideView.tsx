import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  ADVISOR_DASHBOARD_QUERY_KEY,
  hentAdvisorDashboard,
  type AdvisorDashboardData,
} from "@/components/AdvisorDashboard";
import { TAERSKEL, type Linje, type OpgaveSlags } from "@/lib/forsidensDom";
import FornyelsesSektion from "@/components/members/FornyelsesSektion";
import IndgangsSektion from "@/components/members/IndgangsSektion";
import { HbSection } from "../HbSection";
import { cn } from "@/lib/utils";

/**
 * Rådgiverens forside på /forside — DOMMEN (docs/forsiden-design.md,
 * src/lib/forsidensDom.ts) øverst, de gamle KØER (#630) nedenunder som
 * råmateriale, så de to kan ses side om side og forskellen måles (4/9).
 *
 * MIDLERTIDIG rute: "/" renderer stadig AdvisorDashboard for rådgiveren
 * (Index.tsx) til swappet. Fladen swappes ikke ind før dommen er set på
 * jeres tredive virksomheder og tærsklen (TAERSKEL = 70) er målt mod
 * 4/9's 38 rækker (designets §12/§13). Køerne fjernes når dommen er bevist.
 *
 * ÉT DATALAG: hentAdvisorDashboard bygger både bunkerne og dommen; her
 * tegnes de kun. Ingen hentning i denne fil.
 *
 * LINJERNE (§1, §6): hver linje er virksomheden, grundene med den
 * vigtigste først, og handlingen — og HELE linjen er ét link til
 * /virksomhed/:companyId?grund=<slags>. Ingen knapper pr. grund, ingen
 * «Åbn chat». Parameteren `grund` bærer den vigtigste grunds slags, så
 * virksomhedssiden kan vise «derfor er du her» øverst i blok 1 (§6) —
 * den LÆSER den ikke endnu; kontrakten findes fra i dag.
 *
 * Tilstande og pukler er deres egen samlede linje (§3) og linker til
 * /virksomheder (§5: tallene er links til listen). Én virksomhed i en
 * samlet tilstand linker direkte til den.
 *
 * TOPPEN (§10): «N ting kræver dig i dag», ellers «Der er ikke noget der
 * haster i dag.» UNDER STREGEN (§5): tal, ikke lister. FLAGET (§5): når
 * dommen siger usædvanligt mange, står det her.
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

const grundLink = (companyId: string, slags: OpgaveSlags) => `/virksomhed/${companyId}?grund=${slags}`;

/** Én linje fra dommen. Virksomhed: handling + grunde; tilstand/pukkel: tekst. */
const DomLinje = ({ l }: { l: Linje }) => {
  const rust = l.alvor >= TAERSKEL || l.loeftet;
  const prik = <span aria-hidden className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current", rust ? "text-hb-rust" : "text-hb-ink-soft")} />;
  const hast = l.lukkerOmDage != null && (
    <span className="shrink-0 text-xs text-hb-ink-soft">
      {l.lukkerOmDage === 0 ? "i dag" : l.lukkerOmDage === 1 ? "i morgen" : `om ${l.lukkerOmDage} dage`}
    </span>
  );

  if (l.linje === "virksomhed") {
    const [vigtigste, ...oevrige] = l.grunde;
    return (
      <li className="flex items-start gap-3 py-3">
        {prik}
        <Link to={grundLink(l.companyId, vigtigste.slags)} className="min-w-0 flex-1 rounded-hb transition-colors hover:bg-hb-sage/20">
          <span className="block text-[15px] leading-snug text-hb-ink">
            <span className="font-medium">{l.navn}</span>
            <span className="text-hb-ink-soft"> · </span>
            {vigtigste.handling}
          </span>
          <span className={cn("block text-sm leading-snug", rust ? "text-hb-rust" : "text-hb-ink-soft")}>
            {[vigtigste, ...oevrige].map((g) => g.tekst).join(" · ")}
          </span>
        </Link>
        {hast}
      </li>
    );
  }

  // Samlet tilstand eller pukkel: én linje, ét tal. Én virksomhed → direkte til den.
  const enkelt = l.linje === "tilstand" && l.antal === 1 ? l.virksomheder[0] : null;
  const to = enkelt ? grundLink(enkelt.companyId, l.slags) : "/virksomheder";
  return (
    <li className="flex items-start gap-3 py-3">
      {prik}
      <Link to={to} className="min-w-0 flex-1 rounded-hb transition-colors hover:bg-hb-sage/20">
        <span className="block text-[15px] leading-snug text-hb-ink">
          {enkelt ? (
            <>
              <span className="font-medium">{enkelt.navn}</span>
              <span className="text-hb-ink-soft"> · </span>
              {enkelt.grund.handling}
            </>
          ) : (
            l.tekst
          )}
        </span>
        {enkelt && (
          <span className={cn("block text-sm leading-snug", rust ? "text-hb-rust" : "text-hb-ink-soft")}>{enkelt.grund.tekst}</span>
        )}
      </Link>
    </li>
  );
};

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

  const dom = data.dom;
  const b = data.buckets;
  const linjeNoegle = (l: Linje) => (l.linje === "virksomhed" ? `v:${l.companyId}` : `${l.linje}:${l.slags}`);
  const under = dom.underStregen;
  const antalUnder = under.antalVirksomhederUnderTaersklen;

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
      {/* ── Toppen (§10) ── */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Dit Boardroom</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          {hilsen()}, {fornavn}.
        </h1>
        <p className="mt-3 text-[15px] text-hb-ink">
          {dom.antalOpgaver === 0
            ? "Der er ikke noget der haster i dag."
            : `${dom.antalOpgaver} ${dom.antalOpgaver === 1 ? "ting kræver" : "ting kræver"} dig i dag.`}
        </p>
        {dom.usaedvanligtMange && (
          <p className="mt-2 text-sm text-hb-rust">
            Usædvanligt mange kræver noget i dag — så mange linjer betyder at tærsklen er forkert, ikke at dagen er (§5).
          </p>
        )}
      </section>

      {/* ── Dommen (§1–§6) ── */}
      {dom.linjer.length > 0 && (
        <section className="mt-10 max-w-3xl">
          <ul className="divide-y divide-hb-line border-y border-hb-line">
            {dom.linjer.map((l) => (
              <DomLinje key={linjeNoegle(l)} l={l} />
            ))}
          </ul>
        </section>
      )}

      {/* ── Under stregen (§5): tal, ikke lister ── */}
      <section className="mt-8 max-w-3xl space-y-1 text-sm text-hb-ink-soft">
        {antalUnder > 0 && (
          <p>
            <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">
              {antalUnder} {antalUnder === 1 ? "anden virksomhed har" : "andre virksomheder har"} noget mindre presserende
            </Link>
          </p>
        )}
        {under.tilstande.map((t) => (
          <p key={`t:${t.slags}`}>
            <Link
              to={t.antal === 1 ? grundLink(t.virksomheder[0].companyId, t.slags) : "/virksomheder"}
              className="text-hb-evergreen underline-offset-4 hover:underline"
            >
              {t.tekst}
            </Link>
          </p>
        ))}
        {under.pukler.map((p) => (
          <p key={`p:${p.slags}`}>
            <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">
              {p.tekst}
            </Link>
          </p>
        ))}
        {dom.linjer.length === 0 && antalUnder === 0 && under.tilstande.length === 0 && under.pukler.length === 0 && (
          <p>
            Ingen tavse, ingen ubesvarede, intet der stikker ud.{" "}
            <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">Se virksomhederne</Link>, hvis du alligevel vil kigge.
          </p>
        )}
        {/* Måling (§12/§13): tærsklen skal måles mod 4/9's 38 rækker. Tallene står
            her, indtil køerne nedenfor er fjernet. */}
        <p className="pt-2 text-xs">
          Måling: tærskel {TAERSKEL} · {dom.antalOpgaver} {dom.antalOpgaver === 1 ? "linje" : "linjer"} over stregen · {under.antalTilstandeSamlet} samlet i tilstande · {antalUnder} under tærsklen · køerne nedenfor: {antalIKoeer} rækker.
        </p>
      </section>

      {/* ── Råmateriale: de gamle køer (#630). Fjernes når dommen er bevist. ── */}
      <HbSection
        eyebrow="Råmateriale — de gamle køer (#630)"
        title="Det samme, som køer"
        hairline
        className="mt-16 border-t border-hb-line pt-10"
      >
        <p className="-mt-2 mb-2 text-sm text-hb-ink-soft">
          Det gamle råmateriale, som det så ud 4/9 (38 rækker, 16 «ingen dialog»). Står her midlertidigt så dommen ovenfor kan måles mod det. Fjernes når dommen er bevist.
        </p>
      </HbSection>

      {/* 1 */}
      <Koe eyebrow="Ikke hørt fra længe" items={b.stale} convByCompany={data.convByCompany} />
      {/* 2 */}
      <Koe eyebrow="Venter på dit svar" items={b.waiting} convByCompany={data.convByCompany} />
      {/* 3 */}
      <Koe eyebrow="Noget stikker ud i tallene" items={b.standsOut} convByCompany={data.convByCompany} />

      {/* 4 + 5 — monteret uændret; appens tokens. Begge er usynlige når de er
          tomme, så rækkefølgen holder uden tomme afsnit. */}
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
        <p className="mt-10 text-sm text-hb-ink-soft">Køerne er tomme.</p>
      )}
    </div>
  );
};
