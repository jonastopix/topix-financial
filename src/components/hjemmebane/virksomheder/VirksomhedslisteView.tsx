import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { useAuth } from "@/hooks/useAuth";
import { computeMembershipTier, type MembershipTier } from "@/lib/membershipTier";
import { fejledeTraekPrVirksomhed, traekBadgeTekst, type FejletTraek } from "@/lib/traek";
import { erKunde } from "@/lib/raadgiverensKunder";
import { dageSiden, erLaengeSiden, senesteAf, sidstOnlineTekst } from "@/lib/sidstOnline";
import { ADVISOR_DASHBOARD_QUERY_KEY, hentAdvisorDashboard } from "@/components/AdvisorDashboard";
import { GRUND_PARAM, VIRKSOMHEDER_STI, filterOverskrift, laesGrundParam, virksomhederForGrund } from "@/lib/hjemmebane/forsideLinks";
import { HbTag } from "../HbTag";
import { hbControlClasses } from "../admin/HbField";
import { cn } from "@/lib/utils";

/**
 * Den rene virksomhedsliste (raadgiverfladen-design.md §3.6, §11 pkt. 4):
 * ét søgefelt og én række pr. virksomhed med PRÆCIS syv felter — navn,
 * branche, kontaktperson, medlemsstatus (tier-badgen), sidste kontakt,
 * sidste rapportering og advarselsmærke ved fejlet træk. Intet andet:
 * ingen udfoldet række, ingen nøgletal, ingen tragt, ingen Indgang/
 * Fornyelse/Legat/admin-sektion — de hører andre steder hen (§11 pkt. 6)
 * eller er ikke afgjort.
 *
 * NY flade på MIDLERTIDIG rute (/virksomheder); den gamle liste på
 * /members står urørt til swappet — mønstret fra de fire tidligere
 * Hjemmebane-flytninger (ny flade på ny route, swap til sidst).
 *
 * DEFINITIONER (Jonas, 4/9):
 * - «Sidste kontakt» = conversations.last_message_at. Samme kilde som
 *   forsidens «ikke hørt fra længe» (virksomhedsSignaler: senesteBeskedAt),
 *   så de to flader er enige. Vist som hele dage siden; «Ingen dialog»
 *   når der ingen samtale er.
 * - «Sidste rapportering» = seneste committede periode i
 *   financial_report_facts (period_label, fald tilbage til period_key).
 *   IKKE seneste upload — en upload der aldrig blev godkendt er ikke en
 *   rapportering.
 * - «Kontaktperson» = OWNEREN (company_members.role = 'owner' → profilens
 *   full_name), ellers companies.contact_person. Målt i prod 4/9 kl.
 *   10:23: contact_person er udfyldt på 4 af 30, en owner med navn findes
 *   på 27; de tre hvor feltet er eneste kilde er dem uden medlemmer (Din
 *   økonomiafdeling, Two Socks, WESDEX), hvor navnet kommer fra
 *   invitationen. Owner-navnet er det medlemmet selv har skrevet og
 *   følger med når det rettes; feltet er en kopi fra Monday. Ingen
 *   mister noget. «—» når ingen af dem findes.
 *
 * Der findes ingen generisk Hb-liste-komponent (målt 4/9) — fire steder
 * bygger hver sin inline, så det gør denne også. Rækker, ikke kort: det
 * er en liste man skimmer.
 *
 * ?grund=<slags> (8/9, Mortens fejl 1): kommer man fra forsidens samlede
 * linje («12 virksomheder har du ikke hørt fra længe»), viser listen DE
 * TOLV — ikke alle 27. Listen regner ikke tavshed selv (universerne er
 * ikke ens, se lib/hjemmebane/forsideLinks.ts); den spørger forsidens
 * dom via samme hentning og cache-nøgle og filtrerer på de id'er
 * tilstandslinjen bærer. Overskriften siger hvad der vises, og «Vis alle»
 * er vejen tilbage. Ukendt eller manglende parameter → listen som før.
 */

type Raekke = {
  id: string;
  navn: string;
  branche: string;
  cvr: string;
  /** Ownerens profilnavn; tom når virksomheden ingen owner med navn har. */
  ownerNavn: string;
  /** companies.contact_person — fald-tilbage (invitationens navn). */
  kontaktperson: string;
  /** Det der VISES i kolonnen: owneren, ellers feltet. */
  visningsnavn: string;
  kontaktEmail: string;
  tier: MembershipTier;
  kontraktSlut: string | null;
  /** Hele dage siden sidste besked; null = ingen samtale/ingen besked. */
  sidsteKontaktDage: number | null;
  /** Hele dage siden NOGEN fra virksomheden sidst loggede ind (seneste af
      alle medlemmer, auth.users.last_sign_in_at via get_users_last_login);
      null = aldrig, eller ingen medlemmer. lib/sidstOnline.ts. */
  sidstOnlineDage: number | null;
  /** Seneste committede periode (label, ellers nøgle); null = ingen facts. */
  sidsteRapportering: string | null;
  fejledeTraek: FejletTraek[];
};

const MS_PER_DOEGN = 86_400_000;

async function hentVirksomhedsliste(): Promise<Raekke[]> {
  const nu = Date.now();
  const [companiesRes, membersRes, profilesRes, convsRes, factsRes, traekRes] = await Promise.all([
    // Kun de kolonner de syv felter og søgningen læser.
    // Ét string-literal pr. select: supabase-js' typeparser kan ikke læse
    // en sammenkædet streng (giver GenericStringError) — det er derfor
    // /members bruger `as any`; her holdes typerne i stedet.
    supabase
      .from("companies")
      .select("id, name, cvr_number, industry_label, contact_person, contact_email, status, is_legat, contract_end_date, subscription_status, subscription_current_period_end, er_kunde")
      .limit(500),
    // company_members er TILBAGE (4/9, samme dag som #615 fjernede den):
    // #615 fjernede den fordi den kun bar rækkens link, og linket blev
    // virksomhedens eget id. Nu bærer den noget der VISES — kontaktperson-
    // kolonnen er owneren (role = 'owner') med profilens navn, ellers
    // contact_person (filhovedet). profiles hentes ufiltreret i samme
    // runde (~40 rækker, som Members.tsx:263) frem for en anden runde
    // nøglet på owner-id'erne; join i kode. Linket er stadig
    // /virksomhed/:companyId — det er ikke en fortrydelse af #615.
    supabase.from("company_members").select("company_id, user_id, role").limit(2000),
    supabase.from("profiles").select("user_id, full_name"),
    supabase.from("conversations").select("company_id, last_message_at"),
    // data_basis-undtagelse: virksomhedslisten viser PERIODEN for seneste committede rapportering (period_label), ikke talværdier — ingen beregning på metrics
    supabase.from("financial_report_facts").select("company_id, period_key, period_label"),
    // Fejlede månedstræk (company_traek, #572) — KUN status = 'fejlet',
    // filtreret serverside, som på /members. Kolonnerne er FejletTraek.
    supabase
      .from("company_traek")
      .select("company_id, stripe_invoice_id, beloeb_oere, fejlet_at, forsoeg, naeste_forsoeg_at, fejl_kode, fejl_decline_code, fejl_besked, hosted_invoice_url, faktura_nummer, periode_start")
      .eq("status", "fejlet")
      .order("fejlet_at", { ascending: false })
      .limit(500),
  ]);

  // DELKALDENE KASTER (7/9, recon-tavse-fejl.md pkt. 2 — samme greb som
  // forsiden, #703): fire af de seks kilder læses gennem kraevRaekker, som
  // kaster med kildens navn når svaret bærer en fejl. Før blev en fejl til
  // `[]`, TanStack så en succes, og fladen sagde «Der er ingen virksomheder
  // endnu» — for hele porteføljen. Tom data er en LØGN for: companies
  // (listen selv), conversations («Sidste kontakt» ville sige aldrig for
  // alle), financial_report_facts («Sidste rapportering» ville sige
  // ingen for alle) og company_traek (fejlede træk ville forsvinde uden
  // spor — penge). company_members og profiles er BERIGELSER: de bærer
  // ownerens navn i kontaktperson-kolonnen, og filhovedets fald-tilbage
  // til contact_person er bygget netop til «ingen owner» — de læses som
  // før. Låst af forsidenKaster.guard.test.ts.
  const companies = kraevRaekker(companiesRes, "companies");
  const conversations = kraevRaekker(convsRes, "conversations");
  const facts = kraevRaekker(factsRes, "financial_report_facts");
  const fejledeTraekByCompany = fejledeTraekPrVirksomhed(kraevRaekker(traekRes, "company_traek"));

  // Ownerens navn pr. virksomhed: første owner-række med et profilnavn.
  // Målt 4/9 kl. 10:17: alle aktive virksomheder med medlemmer har præcis
  // én owner (35 owner / 3 member efter datarettelsen), så «første» er
  // ikke et valg i praksis.
  const navnByUser = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    if (p.user_id && p.full_name?.trim()) navnByUser.set(p.user_id, p.full_name.trim());
  }
  const ownerNavnByCompany = new Map<string, string>();
  for (const m of membersRes.data ?? []) {
    if (m.role !== "owner" || !m.company_id || ownerNavnByCompany.has(m.company_id)) continue;
    const navn = navnByUser.get(m.user_id);
    if (navn) ownerNavnByCompany.set(m.company_id, navn);
  }

  // Sidst online pr. virksomhed (9/9): auth.users.last_sign_in_at for alle
  // medlemmer via get_users_last_login (advisor-gated i kroppen; RLS fra
  // marts, ingen ny rettighed), og den SENESTE pr. virksomhed — samme
  // definition som den gamle forside. BERIGELSE som ownerNavn: fejler
  // kaldet, står der «Aldrig logget ind» for ingen — feltet bliver null og
  // fladen siger det ikke forkert. IKKE user_login_log: dens rækker tæller
  // faneskift og reloads (målt 9/9: 618 for én bruger), kun datoen duer,
  // og den er ens i de to kilder (24 af 24).
  const memberIds = [...new Set((membersRes.data ?? []).map((m) => m.user_id).filter(Boolean))];
  const sidstOnlineByUser = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: loginRows, error: loginErr } = await supabase.rpc("get_users_last_login", { user_ids: memberIds });
    if (loginErr) console.warn("[virksomhedsliste] get_users_last_login fejlede — «sidst online» udelades:", loginErr.message);
    for (const r of loginRows ?? []) {
      if (r.user_id && r.last_sign_in_at) sidstOnlineByUser.set(r.user_id, r.last_sign_in_at);
    }
  }
  const sidstOnlineByCompany = new Map<string, string | null>();
  for (const m of membersRes.data ?? []) {
    if (!m.company_id) continue;
    const hidtil = sidstOnlineByCompany.get(m.company_id) ?? null;
    sidstOnlineByCompany.set(m.company_id, senesteAf([hidtil, sidstOnlineByUser.get(m.user_id)]));
  }
  const nuDato = new Date(nu);

  // Seneste besked pr. virksomhed — flere samtaler pr. virksomhed er
  // muligt, så den nyeste vinder.
  const sidsteBeskedByCompany = new Map<string, string>();
  for (const c of conversations) {
    if (!c.company_id || !c.last_message_at) continue;
    const eksisterende = sidsteBeskedByCompany.get(c.company_id);
    if (!eksisterende || c.last_message_at > eksisterende) {
      sidsteBeskedByCompany.set(c.company_id, c.last_message_at);
    }
  }

  // Seneste committede periode pr. virksomhed: højeste period_key
  // ("YYYY-MM", sorterer leksikalt).
  const sidsteFactByCompany = new Map<string, { key: string; label: string }>();
  for (const f of facts) {
    const eksisterende = sidsteFactByCompany.get(f.company_id);
    if (!eksisterende || f.period_key > eksisterende.key) {
      sidsteFactByCompany.set(f.company_id, { key: f.period_key, label: f.period_label || f.period_key });
    }
  }

  return companies
    // Som den gamle liste (Members.tsx:317, :464): legat-virksomheder har
    // deres egen sektion (ikke bygget her), og kun aktive/status-løse vises.
    // er_kunde læses her fordi listen er rådgiverens: vores egen virksomhed
    // skal ikke stå som en kunde (src/lib/raadgiverensKunder.ts, fail-open).
    .filter((c) => !c.is_legat && (c.status === "active" || !c.status) && erKunde(c))
    .map((c): Raekke => {
      const sidsteBesked = sidsteBeskedByCompany.get(c.id) ?? null;
      const ownerNavn = ownerNavnByCompany.get(c.id) ?? "";
      const kontaktperson = c.contact_person?.trim() || "";
      return {
        id: c.id,
        navn: c.name || "",
        branche: c.industry_label || "",
        cvr: c.cvr_number || "",
        ownerNavn,
        kontaktperson,
        // REGLEN (Jonas 4/9): owneren, ellers contact_person.
        visningsnavn: ownerNavn || kontaktperson,
        kontaktEmail: c.contact_email || "",
        tier: computeMembershipTier({
          contract_end_date: c.contract_end_date,
          subscription_status: c.subscription_status,
          subscription_current_period_end: c.subscription_current_period_end,
        }),
        kontraktSlut: c.contract_end_date,
        // Hele dage, samme regnestykke som motorens heleDageSiden
        // (virksomhedsSignaler.ts:205 — ikke eksporteret, én linje).
        sidsteKontaktDage: sidsteBesked
          ? Math.floor((nu - new Date(sidsteBesked).getTime()) / MS_PER_DOEGN)
          : null,
        sidsteRapportering: sidsteFactByCompany.get(c.id)?.label ?? null,
        sidstOnlineDage: dageSiden(sidstOnlineByCompany.get(c.id) ?? null, nuDato),
        fejledeTraek: fejledeTraekByCompany.get(c.id) ?? [],
      };
    })
    .sort((a, b) => a.navn.localeCompare(b.navn, "da"));
}

/** Søgning klientside over det hentede — i navn, branche, CVR,
    kontaktperson (BÅDE owner-navnet og contact_person, så «Nille» rammer
    PHILBERT uanset hvilken kilde der vandt) og kontakt-email.
    Placeholderen lover præcis det. */
const matcher = (r: Raekke, query: string): boolean => {
  const q = query.trim().toLocaleLowerCase("da");
  if (!q) return true;
  return [r.navn, r.branche, r.cvr, r.ownerNavn, r.kontaktperson, r.kontaktEmail].some((felt) =>
    felt.toLocaleLowerCase("da").includes(q),
  );
};

const sidsteKontaktTekst = (dage: number | null): string => {
  if (dage === null) return "Ingen dialog";
  if (dage <= 0) return "I dag";
  if (dage === 1) return "1 dag siden";
  return `${dage} dage siden`;
};

/** Tier-badgen — samme fire tilstande og tekster som MemberCompanyRow
    (:102-119), i Hb-udtryk: sage for det løbende, dæmpet for det udløbne,
    rust for det der mangler en dato (rust = advarsel, som HbTreeList:122). */
const TierBadge = ({ tier, kontraktSlut }: { tier: MembershipTier; kontraktSlut: string | null }) => {
  if (tier === "full") {
    return (
      <HbTag className="px-2 py-0.5 text-[11px]">
        {kontraktSlut ? `til ${format(new Date(kontraktSlut), "MMM yyyy", { locale: da })}` : "Fuldt"}
      </HbTag>
    );
  }
  if (tier === "subscriber") {
    return <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 text-[11px]">Abonnent</HbTag>;
  }
  if (tier === "expired") {
    return <HbTag className="bg-hb-line/60 px-2 py-0.5 text-[11px] text-hb-ink-soft">Udløbet</HbTag>;
  }
  if (tier === "no_date") {
    return <HbTag className="bg-hb-rust/10 px-2 py-0.5 text-[11px] text-hb-rust">Ingen slutdato</HbTag>;
  }
  return null;
};

const RaekkeIndhold = ({ r }: { r: Raekke }) => {
  const traekTekst = traekBadgeTekst(r.fejledeTraek);
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[2fr_1.2fr_1fr_1fr_1fr] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium leading-snug text-hb-ink">{r.navn}</p>
        <p className="truncate text-xs text-hb-ink-soft">{r.branche || "—"}</p>
      </div>
      <p className="truncate text-sm text-hb-ink-soft">{r.visningsnavn || "—"}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <TierBadge tier={r.tier} kontraktSlut={r.kontraktSlut} />
        {/* Advarselsmærket står ved siden af tier-badgen med vilje (som på
            /members): den siger at KONTRAKTEN løber, dette at et TRÆK er
            fejlet. */}
        {traekTekst && (
          <HbTag className="bg-hb-rust/10 px-2 py-0.5 text-[11px] text-hb-rust">{traekTekst}</HbTag>
        )}
      </div>
      {/* Sidste kontakt + sidst online i SAMME kolonne (9/9): begge svarer
          på «hvor længe siden» og taler i «N dage siden». Kontakten er
          chatten (designets definition, ikke login); linjen under er
          loginet — én kolonne, to linjer, ingen ny gitterkolonne og intet
          der viger. Rust kun når det er længe siden (lib/sidstOnline.ts). */}
      <div className="min-w-0">
        <p className="text-sm text-hb-ink-soft">
          <span className="sm:hidden">Sidste kontakt: </span>
          {sidsteKontaktTekst(r.sidsteKontaktDage)}
        </p>
        <p className={cn("truncate text-xs", erLaengeSiden(r.sidstOnlineDage) ? "text-hb-rust" : "text-hb-ink-soft")}>
          {sidstOnlineTekst(r.sidstOnlineDage)}
        </p>
      </div>
      <p className="text-sm text-hb-ink-soft">
        <span className="sm:hidden">Sidste rapportering: </span>
        {r.sidsteRapportering ?? "Ingen rapportering"}
      </p>
    </div>
  );
};

const RaekkeSkelet = () => (
  <li aria-hidden className="px-4 py-3">
    <div className="h-4 w-2/5 animate-pulse rounded bg-hb-line/60" />
    <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-hb-line/40" />
  </li>
);

export const VirksomhedslisteView = () => {
  const { user, isAdvisor } = useAuth();
  const [query, setQuery] = useState("");
  const [searchParams] = useSearchParams();
  // Forsidens grund (?grund=tavshed …) — kun de slags der kan blive en
  // samlet linje; alt andet ignoreres stille (laesGrundParam).
  const grund = laesGrundParam(searchParams.get(GRUND_PARAM));

  const listeQuery = useQuery({
    queryKey: ["virksomhedsliste"],
    queryFn: hentVirksomhedsliste,
    enabled: !!user && !!isAdvisor,
    staleTime: 2 * 60_000,
  });

  // Forsidens dom — SAMME hentning og cache-nøgle som RaadgiverForsideView,
  // så de tolv her er de tolv dér. Hentes kun når der ER en grund i URL'en.
  const domQuery = useQuery({
    queryKey: ADVISOR_DASHBOARD_QUERY_KEY(user?.id),
    queryFn: hentAdvisorDashboard,
    enabled: !!user && !!isAdvisor && grund !== null,
    staleTime: 2 * 60_000,
  });
  const grundUdsnit = grund && domQuery.data ? virksomhederForGrund(domQuery.data.dom, grund) : null;

  const alle = useMemo(() => listeQuery.data ?? [], [listeQuery.data]);
  const soeger = query.trim().length > 0;
  const filtreret = useMemo(() => {
    let resultat = alle;
    if (grund && grundUdsnit) {
      // Forsidens udsnit: præcis de virksomheder dommen samlede. Dommen
      // har allerede udelukket udløbede, så expired-skjulet nedenfor er
      // overflødigt her — og søgning søger INDEN FOR udsnittet.
      const ids = new Set(grundUdsnit.ids);
      resultat = resultat.filter((r) => ids.has(r.id));
    } else if (!soeger) {
      // Skjul udløbede («tidligere») fra den u-søgte default-liste; aktiv
      // søgning afslører dem (Members.tsx:1002-1005, spejlet).
      resultat = resultat.filter((r) => r.tier !== "expired");
    }
    return resultat.filter((r) => matcher(r, query));
  }, [alle, query, soeger, grund, grundUdsnit]);
  // Venter listen på dommen (grund i URL'en, dom ikke hentet endnu), vises
  // skelettet — ikke alle 27 et øjeblik før de tolv.
  const venterPaaDom = grund !== null && domQuery.isLoading;
  // Antal i udsnittet FØR søgning — det er det overskriften taler om.
  const vistIUdsnit = grund && grundUdsnit ? alle.filter((r) => grundUdsnit.ids.includes(r.id)).length : 0;

  return (
    <div>
      {/* Header (Netværket-mønstret): fladens navn som eyebrow, en sætning
          som rubrik. */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Virksomheder</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Alle virksomheder, ét sted.
        </h1>
        {/* Forsidens udsnit (8/9): listen SIGER hvad den viser, med forsidens
            ord, og «Vis alle» er vejen tilbage. Findes grunden ikke længere i
            dommen (tilstanden er væk siden klikket), siges det — og listen
            viser alle, ikke ingenting. */}
        {grund && domQuery.isError && (
          <p className="mt-4 text-sm text-hb-rust">Forsidens udsnit kunne ikke hentes — listen viser alle virksomheder.</p>
        )}
        {grund && domQuery.data && !grundUdsnit && (
          <p className="mt-4 text-sm text-hb-ink-soft">
            Forsiden har ikke længere en samlet linje for det, du klikkede på — listen viser alle virksomheder.
          </p>
        )}
        {grund && grundUdsnit && (
          <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px] text-hb-ink">
            <span className="font-medium">{filterOverskrift(grund, vistIUdsnit, grundUdsnit.antalIDommen)}</span>
            <Link to={VIRKSOMHEDER_STI} className="text-sm text-hb-evergreen underline-offset-4 hover:underline">
              Vis alle
            </Link>
          </p>
        )}
      </section>

      <div className="mt-10">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søg på virksomhed, branche, CVR, kontaktperson eller e-mail…"
          className={cn(hbControlClasses, "max-w-md rounded-full px-5")}
        />
      </div>

      <div className="mt-8 overflow-hidden rounded-hb border border-hb-line bg-hb-surface">
        <div className="hidden border-b border-hb-line px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft sm:grid sm:grid-cols-[2fr_1.2fr_1fr_1fr_1fr] sm:gap-x-4">
          <span>Virksomhed</span>
          <span>Kontaktperson</span>
          <span>Medlemsstatus</span>
          <span>Sidste kontakt</span>
          <span>Sidste rapportering</span>
        </div>
        {listeQuery.isLoading || venterPaaDom ? (
          <ul className="divide-y divide-hb-line">
            <RaekkeSkelet />
            <RaekkeSkelet />
            <RaekkeSkelet />
          </ul>
        ) : listeQuery.isError ? (
          // Fejl og tom liste er to forskellige ting (7/9): en fejlet
          // hentning må ikke ligne «ingen virksomheder». Formen er
          // RaadgiverForsideViews fejllinje.
          <p className="px-4 py-10 text-center text-sm text-hb-rust">Listen kunne ikke hentes. Prøv igen.</p>
        ) : filtreret.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-hb-ink-soft">
            {soeger
              ? `Ingen virksomheder matcher "${query.trim()}"`
              : grund && grundUdsnit
                ? "Ingen af forsidens virksomheder er på listen"
                : "Der er ingen virksomheder endnu"}
          </p>
        ) : (
          <ul className="divide-y divide-hb-line">
            {filtreret.map((r) => (
              <li key={r.id}>
                {/* Klik åbner virksomhedssiden (#607), nøglet på
                    virksomhedens eget id — også for en virksomhed uden
                    medlemmer (§3.3: virksomheden er aftalen). Før linkede
                    rækken til /members/:userId og var død uden medlem. */}
                <Link to={`/virksomhed/${r.id}`} className="block transition-colors hover:bg-hb-sage/20">
                  <RaekkeIndhold r={r} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!listeQuery.isLoading && !venterPaaDom && filtreret.length > 0 && (
          <p className="border-t border-hb-line px-4 py-2 text-xs text-hb-ink-soft">
            Viser {filtreret.length} af {alle.length} virksomheder
          </p>
        )}
      </div>
    </div>
  );
};
