import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useVirksomhed, type VirksomhedsData } from "@/hooks/useVirksomhed";
import type { CompanyFact } from "@/hooks/useCompanyFacts";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { afgoerVirksomhedsSignaler, type FactPunkt, type Signal, type VirksomhedsInput } from "@/lib/virksomhedsSignaler";
import { computeMembershipTier, type MembershipTier } from "@/lib/membershipTier";
import { afgoerFornyelsestilstand, type FornyelseStatus, type Fornyelsesbeslutning } from "@/lib/fornyelse";
import { afgoerBetalingsfrist, type Betalingsfriststatus } from "@/lib/betalingsfrist";
import { beloebKr, kortDato, datoOgTid, stripeSagde, traekBadgeTekst } from "@/lib/traek";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbTag } from "../HbTag";
import { cn } from "@/lib/utils";

/**
 * Virksomhedssiden, etape 1 (raadgiverfladen-design.md §4): blok 1 «Hvad
 * skal du vide nu» og blok 7 «Aftalen». Blokkene 2–6 kommer i senere
 * etaper. Datalaget er useVirksomhed (company-nøglet, §3.3).
 *
 * Blok 1 er BULLETS der kan skimmes på to sekunder — ikke paneler. Dommen
 * er motoren (afgoerVirksomhedsSignaler, #589), som ikke røres her.
 * Blok 7 er en rolig opsummering — VISNING i denne etape, ingen
 * handlinger (omdøb, inviter, slet osv. kommer senere, §3.6).
 */

const formatDato = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
};

const formatKr = (oere: number | null | undefined): string =>
  oere == null ? "—" : `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Math.round(oere / 100))} kr.`;

const BETALINGSMODEL_LABEL: Record<string, string> = {
  fuld: "Fuld betaling",
  rate2: "2 rater",
  rate12: "12 rater",
};

/** Samme tekster som FornyelsesSektion.tsx:45-59 — kun udtrykket er Hb. */
const FORNYELSE_LABEL: Record<FornyelseStatus, string> = {
  ophoert: "Ophørt",
  udloebet_tilbyd: "Udløbet — tilbyd",
  udloebet_tilbyd_ikke: "Udløbet — tilbyd ikke",
  beslutning_mangler: "Beslutning mangler",
  klar_til_tilbud: "Klar til tilbud",
  klar_til_afsked: "Klar til afsked",
  uden_for_ordningen: "Uden for ordningen",
  i_god_tid: "I god tid",
  ingen_slutdato: "Ingen slutdato",
  selvbetjener: "Selvbetjener",
};

/** Samme tekster som IndgangsSektion.tsx:63-70. */
const INDGANG_LABEL: Record<Betalingsfriststatus, string> = {
  afventer_pris: "Mangler pris",
  klar_til_mail: "Mail på vej",
  afventer_betaling: "Afventer betaling",
  frist_overskredet: "Frist passeret",
  betalt: "Betalt",
};

/** Tier-badgen — samme fire tilstande som VirksomhedslisteView. */
const TierBadge = ({ tier, kontraktSlut }: { tier: MembershipTier; kontraktSlut: string | null }) => {
  if (tier === "full") return <HbTag className="px-2 py-0.5 text-[11px]">{kontraktSlut ? `Fuldt til ${formatDato(kontraktSlut)}` : "Fuldt"}</HbTag>;
  if (tier === "subscriber") return <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 text-[11px]">Abonnent</HbTag>;
  if (tier === "expired") return <HbTag className="bg-hb-line/60 px-2 py-0.5 text-[11px] text-hb-ink-soft">Udløbet</HbTag>;
  if (tier === "no_date") return <HbTag className="bg-hb-rust/10 px-2 py-0.5 text-[11px] text-hb-rust">Ingen slutdato</HbTag>;
  return null;
};

/** Én rolig label/værdi-linje til «Aftalen». */
const Linje = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[9rem_1fr] gap-x-4 py-1.5 text-sm">
    <span className="text-hb-ink-soft">{label}</span>
    <span className="min-w-0 text-hb-ink">{children}</span>
  </div>
);

// ── Blok 1: motorens input, bygget af hookens data ──────────────────────

const tilFactPunkt = (f: CompanyFact | null): FactPunkt | null => {
  if (!f) return null;
  const kf = factsToDanishMetrics(f.metrics);
  return {
    period_key: f.period_key,
    period_label: f.period_label,
    omsaetning: kf.omsaetning ?? null,
    resultat_foer_skat: kf.resultat_foer_skat ?? null,
    bank_balance: kf.bank_balance ?? null,
  };
};

function bygSignalInput(d: VirksomhedsData, facts: CompanyFact[]): VirksomhedsInput {
  // useCompanyFacts sorterer på period_key stigende — seneste sidst.
  const seneste = facts[facts.length - 1] ?? null;
  const forrige = facts.length >= 2 ? facts[facts.length - 2] : null;
  // Budgetmål for senestes periode — samme opslag som MemberDetail.tsx:752-757.
  const budgetOmsaetning = (() => {
    if (!seneste) return null;
    const [y, m] = seneste.period_key.split("-");
    const baseKey = `${y}-base-${parseInt(m, 10) - 1}`;
    return d.budgetter.find((b) => b.period === baseKey && b.category === "omsaetning")?.budget_amount ?? null;
  })();
  // Seneste besked på tværs af virksomhedens samtaler (flere er muligt).
  const senesteBeskedAt = d.samtaler.reduce<string | null>(
    (acc, s) => (s.last_message_at && (!acc || s.last_message_at > acc) ? s.last_message_at : acc),
    null,
  );
  // «Ulæste» = samtaler der venter på rådgiverens svar — SAMME definition
  // som forsiden (AdvisorDashboard unreadByCompany: awaiting_reply_from ===
  // "advisor"), så blok 1 og forsidens kø er enige. Ingen messages-query.
  const ulaesteBeskeder = d.samtaler.filter((s) => s.awaiting_reply_from === "advisor").length;
  const nu = Date.now();
  return {
    senesteFact: tilFactPunkt(seneste),
    forrigeFact: tilFactPunkt(forrige),
    senesteCommittedAt: seneste?.committed_at ?? null,
    budgetOmsaetning,
    forfaldneMilestones: d.milestones.filter((m) => m.deadline && new Date(m.deadline).getTime() < nu && m.status !== "completed").length,
    loeftestaenger: d.handouts.reduce((n, h) => n + (Array.isArray(h.levers) ? h.levers.length : 0), 0),
    ulaesteBeskeder,
    // Nu udfyldt RIGTIGT — MemberDetail sendte null (siden hentede ikke
    // last_message_at), så motoren gav «aldrig skrevet» for alle.
    senesteBeskedAt,
    harCommittedeTal: facts.length > 0,
    // Nu udfyldt RIGTIGT — MemberDetail sendte 0.
    agentforslagVenter: d.agentforslagVenter,
  };
}

/** Alvor → tone. Rust kun til det der er galt (>= 70); resten dæmpet. */
const signalTone = (alvor: number) => (alvor >= 70 ? "text-hb-rust" : alvor >= 50 ? "text-hb-ink" : "text-hb-ink-soft");

const Blok1 = ({ d, facts }: { d: VirksomhedsData; facts: CompanyFact[] }) => {
  const signaler: Signal[] = useMemo(() => afgoerVirksomhedsSignaler(bygSignalInput(d, facts)), [d, facts]);
  /* Køer der vises: ALLE fem. §4 blok 1 nævner præcis dem: ny rapportering
     siden sidst (friske_tal), hvad stikker ud i tallene (stikker_ud),
     agentforslag der venter (agentforslag_venter), hvor længe siden I talte
     sammen (ikke_hoert_fra_laenge) og beskeder der venter (venter_paa_svar).
     For ÉN virksomhed er der ingen kø at sortere i — alt er værd at vide.
     MemberDetail viste kun stikker_ud, fordi den ikke kunne fodre resten;
     det kan denne side. Motorens sortering (alvor faldende) bevares; intet
     loft (motorens valg 7: loftet er fladens, og fem køer på én virksomhed
     giver højst en håndfuld). */
  // «Opgaver der venter på svar» (§4 blok 1) laver motoren ikke (valg 6:
  // aktivitet). Den er en data-linje herunder, ikke et signal — bevidst
  // adskilt, så motorens dom og fladens tælling ikke blandes.
  const opgaverVenter = d.opgaver.filter((o) => o.status === "proposed" || o.status === "open").length;
  const tom = signaler.length === 0 && opgaverVenter === 0;
  return (
    <HbSection eyebrow="Hvad skal du vide nu" hairline>
      {tom ? (
        <p className="text-sm text-hb-ink-soft">Intet der stikker ud lige nu.</p>
      ) : (
        <ul className="space-y-2">
          {signaler.map((s) => (
            <li key={s.noegle} className="flex items-baseline gap-3 text-[15px] leading-snug">
              <span aria-hidden className={cn("mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-current", signalTone(s.alvor))} />
              <span className={signalTone(s.alvor)}>
                {s.tekst}
                {s.detalje && <span className="ml-2 text-sm text-hb-ink-soft">{s.detalje}</span>}
              </span>
            </li>
          ))}
          {opgaverVenter > 0 && (
            <li className="flex items-baseline gap-3 text-[15px] leading-snug text-hb-ink">
              <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
              <span>{opgaverVenter} {opgaverVenter === 1 ? "opgave venter" : "opgaver venter"} på svar</span>
            </li>
          )}
        </ul>
      )}
    </HbSection>
  );
};

// ── Blok 7: Aftalen ─────────────────────────────────────────────────────

const Blok7 = ({ d }: { d: VirksomhedsData }) => {
  const c = d.company;
  const tier = computeMembershipTier({
    contract_end_date: c.contract_end_date,
    subscription_status: c.subscription_status,
    subscription_current_period_end: c.subscription_current_period_end,
  });
  const fornyelse = afgoerFornyelsestilstand({
    contract_end_date: c.contract_end_date,
    subscription_status: c.subscription_status,
    subscription_current_period_end: c.subscription_current_period_end,
    beslutning: (d.fornyelse?.beslutning as Fornyelsesbeslutning | undefined) ?? null,
  });
  const indgang = d.betalingslink
    ? afgoerBetalingsfrist({
        prisniveau_oere: d.betalingslink.prisniveau_oere,
        underskrevet_at: d.betalingslink.underskrevet_at,
        betalingsmail_sendt_at: d.betalingslink.betalingsmail_sendt_at,
        sidste_paamindelse_dag: d.betalingslink.sidste_paamindelse_dag,
        contract_end_date: c.contract_end_date,
      })
    : null;
  // Prisniveau: indgangens pris når den findes, ellers virksomhedens egne
  // felter (indgangspris_oere / fornyelsespris_oere).
  const prisniveau = d.betalingslink?.prisniveau_oere ?? c.indgangspris_oere ?? null;
  const fejlede = d.traek.filter((t) => t.status === "fejlet");
  const fejletBadge = traekBadgeTekst(fejlede);
  const afventende = d.invitationer.filter((i) => i.status === "pending");

  return (
    <HbSection eyebrow="Aftalen" hairline className="mt-12">
      <div className="grid gap-4 md:grid-cols-2">
        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Kontrakt</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <TierBadge tier={tier} kontraktSlut={c.contract_end_date} />
            <HbTag className="bg-hb-paper border border-hb-line px-2 py-0.5 text-[11px] text-hb-ink-soft">{FORNYELSE_LABEL[fornyelse.status]}</HbTag>
            {indgang && indgang.status !== "betalt" && (
              <HbTag className="bg-hb-rust/10 px-2 py-0.5 text-[11px] text-hb-rust">{INDGANG_LABEL[indgang.status]}</HbTag>
            )}
            {fejletBadge && <HbTag className="bg-hb-rust/10 px-2 py-0.5 text-[11px] text-hb-rust">{fejletBadge}</HbTag>}
          </div>
          <div className="mt-3 divide-y divide-hb-line">
            <Linje label="Start">{formatDato(c.contract_start_date)}</Linje>
            <Linje label="Slut">{formatDato(c.contract_end_date)}</Linje>
            <Linje label="Prisniveau">{formatKr(prisniveau)}</Linje>
            {c.fornyelsespris_oere != null && <Linje label="Fornyelsespris">{formatKr(c.fornyelsespris_oere)}</Linje>}
            {c.subscription_status && <Linje label="Abonnement">{c.subscription_status}{c.subscription_current_period_end ? ` · til ${formatDato(c.subscription_current_period_end)}` : ""}</Linje>}
            {d.betalingslink && <Linje label="Underskrevet">{formatDato(d.betalingslink.underskrevet_at)}</Linje>}
            {d.fornyelse && (
              <Linje label="Fornyelse">
                {d.fornyelse.beslutning === "tilbyd" ? "Tilbyd" : "Tilbyd ikke"} · {formatDato(d.fornyelse.besluttet_at)}
                {d.fornyelse.note && <span className="block text-xs text-hb-ink-soft">{d.fornyelse.note}</span>}
              </Linje>
            )}
          </div>
        </HbCard>

        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Betaling</p>
          {d.perioder.length === 0 && d.traek.length === 0 ? (
            <p className="mt-3 text-sm text-hb-ink-soft">Ingen perioder eller træk registreret.</p>
          ) : (
            <div className="mt-3 divide-y divide-hb-line">
              {d.perioder.map((p) => (
                <Linje key={p.id} label={`${formatDato(p.periode_start)} – ${formatDato(p.periode_slut)}`}>
                  {formatKr(p.beloeb_oere)} · {BETALINGSMODEL_LABEL[p.betalingsmodel] ?? p.betalingsmodel} · {p.art}
                  {p.note && <span className="block text-xs text-hb-ink-soft">{p.note}</span>}
                </Linje>
              ))}
              {d.traek.map((t) => (
                <Linje key={t.stripe_invoice_id} label={t.faktura_nummer ? `Træk ${t.faktura_nummer}` : "Træk"}>
                  <span className={t.status === "fejlet" ? "text-hb-rust" : undefined}>
                    {beloebKr(t.beloeb_oere)} · {t.status}
                    {t.status === "fejlet" && kortDato(t.fejlet_at) ? ` ${kortDato(t.fejlet_at)}` : ""}
                    {t.status === "betalt" && kortDato(t.betalt_at) ? ` ${kortDato(t.betalt_at)}` : ""}
                  </span>
                  {t.status === "fejlet" && (
                    <span className="block text-xs text-hb-ink-soft">
                      {stripeSagde(t) ? `Stripe: ${stripeSagde(t)} · ` : ""}
                      {datoOgTid(t.naeste_forsoeg_at) ? `næste forsøg ${datoOgTid(t.naeste_forsoeg_at)}` : "ingen flere forsøg fra Stripe"}
                      {t.hosted_invoice_url && (
                        <>
                          {" · "}
                          <a href={t.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-hb-evergreen underline-offset-4 hover:underline">Faktura</a>
                        </>
                      )}
                    </span>
                  )}
                </Linje>
              ))}
            </div>
          )}
        </HbCard>

        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Medlemmer</p>
          {d.medlemmer.length === 0 ? (
            // Gyldig tilstand, ikke en fejl (§3.3): virksomheden findes uden adgang.
            <p className="mt-3 text-sm text-hb-ink-soft">Ingen medlemmer endnu.</p>
          ) : (
            <ul className="mt-3 divide-y divide-hb-line">
              {d.medlemmer.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 py-2">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full border border-hb-line object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hb-sage/40 text-sm text-hb-ink-soft">{m.full_name.charAt(0)}</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-hb-ink">{m.full_name}</p>
                    <p className="truncate text-xs text-hb-ink-soft">{[m.email, m.role].filter(Boolean).join(" · ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </HbCard>

        <HbCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">Invitationer</p>
          {d.invitationer.length === 0 ? (
            <p className="mt-3 text-sm text-hb-ink-soft">Ingen invitationer.</p>
          ) : (
            <ul className="mt-3 divide-y divide-hb-line">
              {d.invitationer.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-hb-ink">{i.email}</span>
                  <span className="shrink-0 text-xs text-hb-ink-soft">
                    {i.status === "pending" ? `Afventer · sendt ${formatDato(i.created_at)}` : i.status === "accepted" ? `Accepteret ${formatDato(i.accepted_at)}` : i.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {afventende.length > 0 && d.medlemmer.length === 0 && (
            <p className="mt-3 text-xs text-hb-ink-soft">Virksomheden har endnu ingen aktiv bruger — invitationen er ikke taget i brug.</p>
          )}
        </HbCard>
      </div>
    </HbSection>
  );
};

// ── Siden ───────────────────────────────────────────────────────────────

export const VirksomhedView = ({ companyId }: { companyId: string | undefined }) => {
  const { data, facts, isLoading, isError, findesIkke } = useVirksomhed(companyId);

  if (!companyId || findesIkke) {
    return (
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Virksomhed</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">Virksomheden findes ikke.</h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Der er ingen virksomhed med denne adresse. <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">Tilbage til listen</Link>
        </p>
      </section>
    );
  }
  if (isError) {
    return <p className="text-sm text-hb-rust">Virksomheden kunne ikke hentes. Prøv igen.</p>;
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

  const c = data.company;
  const metaLinje = [c.industry_label, c.cvr_number ? `CVR ${c.cvr_number}` : null, c.contact_person, c.contact_email].filter(Boolean).join(" · ");
  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          <Link to="/virksomheder" className="underline-offset-4 hover:underline">Virksomheder</Link>
        </p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{c.name}</h1>
        {metaLinje && <p className="mt-3 text-sm text-hb-ink-soft">{metaLinje}</p>}
      </section>

      <div className="mt-10">
        <Blok1 d={data} facts={facts} />
      </div>
      <Blok7 d={data} />
    </div>
  );
};
