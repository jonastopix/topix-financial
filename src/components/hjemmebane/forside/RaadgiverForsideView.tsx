import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ADVISOR_DASHBOARD_QUERY_KEY, hentAdvisorDashboard } from "@/components/AdvisorDashboard";
import { invaliderForsiden, lukOpgave } from "@/hooks/opgaveLukning";
import { OpgavelisteView } from "@/components/hjemmebane/opgaver/OpgavelisteView";
import { TAERSKEL, type Linje, type OpgaveSlags, type Virksomhedslinje } from "@/lib/forsidensDom";
import { samletLinjeLink } from "@/lib/hjemmebane/forsideLinks";
import { LUKNINGS_UDFALD, UDFALD_TEKST, type LukningsUdfald } from "@/lib/opgaveLukning";
import { pulsLinjer } from "@/lib/pulsen";
import { SIDEN_SIDST_KEY, hentSidenSidst } from "@/hooks/sidenSidst";
import { CRON_VAGT_KEY, hentCronVagt } from "@/hooks/cronVagt";
import { vagtLinje } from "@/lib/cronVagt";
import { intetNytTekst, sidenSidstLinjer, sidenTekst } from "@/lib/sidenSidst";
import { UBESVAREDE_OPSLAG_KEY, hentUbesvaredeOpslag } from "@/hooks/ubesvaredeOpslag";
import {
  ALLE_BESVARET_TEKST,
  alderTekst,
  flereTekst,
  KORT_OVERSKRIFT,
  kortUdsnit,
  linjeTekst,
  traadSti,
  ubesvaredeOpslag,
} from "@/lib/hjemmebane/ubesvaredeOpslag";
import { KILDE_PRAESENTATION, KILDE_PRAESENTATION_LABEL } from "@/lib/hjemmebane/praesentation";
import { KOHORTE_KEY, hentKohorte } from "@/hooks/kohorte";
import { KOHORTE_OVERSKRIFT, ikkeKommetIgenTekst, kohorteLinje, kohorteTekst, startetIDagTekst } from "@/lib/hjemmebane/kohorte";
import { HbTag } from "@/components/hjemmebane/HbTag";
import { HbAvatar } from "@/components/hjemmebane/HbAvatar";
import { ONLINE_DOM_KEY, hentOnlineDom, useOnlineMedlemmer } from "@/hooks/onlineMedlemmer";
import { INGEN_ONLINE_TEKST, onlineMedlemmer, onlineOverskrift, onlineTitel, onlineUdsnit } from "@/lib/hjemmebane/online";
import { HentningsFejl } from "@/lib/kraevRaekker";
import { cn } from "@/lib/utils";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";

/**
 * Rådgiverens forside på /forside — DOMMEN (docs/forsiden-design.md,
 * src/lib/forsidensDom.ts) tegnet som linjer: hvad rådgiveren skal gøre i
 * dag, én linje pr. virksomhed, tilstande og pukler samlet, og to tal
 * under stregen. Det er fladen; den er ikke råmateriale.
 *
 * HISTORIK — hvorfor den ser sådan ud. Den første udgave (#630, 4/9)
 * viste syv KØER under hinanden efter raadgiverfladen-design.md §3.5. Set
 * på skærm kl. 11:35: 38 rækker, hvoraf 16 sagde «ingen dialog i N dage»
 * og intet andet. Fejlen var ikke mængden af data, men at en KØ viser alt
 * der matcher en betingelse, mens en rådgiver om morgenen har brug for at
 * vide hvad han skal gøre. Derfor designet (forsiden-design.md, #631),
 * dommen som ren funktion (#635), og denne flade oven på den (#637), med
 * køerne stående nedenunder som sammenligning. Dommen blev BEVIST på
 * skærm 4/9 kl. 13:04: syv linjer, hvor køerne gav 38 rækker. Køerne blev
 * fjernet herfra samme dag. hentAdvisorDashboard bygger stadig bunkerne
 * (til AdvisorDashboards JSX, som nu er uden aftager); her læses kun `dom`.
 *
 * SWAPPET IND PÅ RODEN (4/9): Index.tsx renderer denne flade for
 * rådgiveren på "/"; /forside viderestiller hertil (Forside.tsx).
 * AdvisorDashboard (AppLayout) er ikke længere nogens landingsside.
 *
 * ÉT DATALAG: hentAdvisorDashboard kører motorerne og dommen; her tegnes
 * den kun. Ingen hentning i denne fil.
 *
 * LINJERNE (§1, §6): hver linje er virksomheden, grundene med den
 * vigtigste først, og handlingen — og HELE linjen er ét link til
 * /virksomhed/:companyId?grund=<slags>. Ingen knapper pr. grund, ingen
 * «Åbn chat». Parameteren `grund` bærer den vigtigste grunds slags, så
 * virksomhedssiden kan vise «derfor er du her» øverst i blok 1 (§6) —
 * den LÆSER den ikke endnu; kontrakten findes.
 *
 * Tilstande og pukler er deres egen samlede linje (§3) og linker til
 * /virksomheder (§5: tallene er links til listen). Én virksomhed i en
 * samlet tilstand eller pukkel linker direkte til den (se samletLinjeLink).
 *
 * TOPPEN (§10): «N ting kræver dig i dag», ellers «Der er ikke noget der
 * haster i dag.» UNDER STREGEN (§5): tal, ikke lister. FLAGET (§5): når
 * dommen siger usædvanligt mange, står det her. MÅLINGEN nederst bliver
 * stående til tærsklen (TAERSKEL) er justeret efter drift (§12).
 *
 * TO KOLONNER (Jonas 8/9): på desktop står dommen og jeres to-do-liste i
 * venstre kolonne (to tredjedele) — det man læser først og handler på —
 * og det der orienterer i højre (en tredjedel, smallere): tallene under
 * stregen nu, pulsen og «siden sidst» senere. På mobil én kolonne: dom,
 * liste, højre. Listen står HER med skrivefelt — ikke bag et menupunkt
 * («et menupunkt vi aldrig nogensinde kommer til at arbejde med»). Se
 * OpgavelisteViews filhoved.
 *
 * LUKNINGEN (Jonas 8/9, lib/opgaveLukning): hver virksomhedslinje har to
 * handlinger, «Færdiggjort» og «Ikke relevant». Ingen «Udsæt». Fladen
 * gemmer det grundlag dommen selv gav linjen (Virksomhedslinje.grundlag)
 * gennem den ene skrivevej (hooks/opgaveLukning), invaliderer forsiden og
 * lader dommen afgøre hvad der står — ingen optimistisk patch. Linjen
 * kommer igen når noget NYT er sket (andet grundlag). Tilstandslinjerne
 * («N virksomheder har du ikke hørt fra længe») har ingen knapper —
 * de er næste PR.
 */

const hilsen = (): string => {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
};

const grundLink = (companyId: string, slags: OpgaveSlags) => `/virksomhed/${companyId}?grund=${slags}`;

/** Samlede linjer (tilstand eller pukkel) peger via samletLinjeLink
    (lib/hjemmebane/forsideLinks, #743): ÉN virksomhed → direkte til den med
    grunden; FLERE → /virksomheder?grund=<slags>, så listen viser præcis de
    virksomheder dommen bar (13/9 — før pegede de på listen uden parameter,
    og rådgiveren så alle 27 for et tal der sagde 12). Puklen (agentforslag)
    kan stadig kun afgøres i AgentForslagPanel på /virksomhed/:companyId;
    udsnittet på listen er det nærmeste for flere. */

/** Én linje fra dommen. Virksomhed: handling + grunde; tilstand/pukkel: tekst.
    Rust kun til det der er galt (>= TAERSKEL) eller haster (løftet). */
const DomLinje = ({ l, onLuk, lukker }: { l: Linje; onLuk: (linje: Virksomhedslinje, udfald: LukningsUdfald) => void; lukker: boolean }) => {
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
        <span className="flex shrink-0 flex-col items-end gap-1">
          {hast}
          {/* Lukningen: to ord, evergreen (husets handlingsfarve), ingen knapflade. */}
          <span className="flex items-center gap-2 text-xs">
            {LUKNINGS_UDFALD.map((udfald) => (
              <button
                key={udfald}
                type="button"
                disabled={lukker}
                onClick={() => onLuk(l, udfald)}
                className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50"
              >
                {UDFALD_TEKST[udfald]}
              </button>
            ))}
          </span>
        </span>
      </li>
    );
  }

  // Samlet tilstand eller pukkel: én linje, ét tal. Én virksomhed → direkte til den.
  const enkelt = l.linje === "tilstand" && l.antal === 1 ? l.virksomheder[0] : null;
  const to = samletLinjeLink(l);
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

export const RaadgiverForsideView = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ADVISOR_DASHBOARD_QUERY_KEY(user?.id),
    queryFn: hentAdvisorDashboard,
    enabled: !!user,
    staleTime: 2 * 60_000,
  });
  // Driften (9/9, hooks/cronVagt + lib/cronVagt): cron-vagtens dom fra det
  // sidste døgn — ren SQL i databasen, uafhængig af vault og edge functions.
  // Én linje under pulsen; fejler hentningen, siges det roligt.
  const vagtQuery = useQuery({
    queryKey: CRON_VAGT_KEY,
    queryFn: hentCronVagt,
    staleTime: 60_000,
  });
  // Siden sidst (9/9, hooks/sidenSidst): egen hentning — stemplet og RPC'en —
  // adskilt fra forsidens datalag, så en fejl her ikke vælter dommen.
  // Hook i topblokken, før nogen betinget return (React #310).
  const sidenSidstQuery = useQuery({
    queryKey: SIDEN_SIDST_KEY(user?.id),
    queryFn: () => hentSidenSidst(user!.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  // Ubesvarede opslag (Jonas 16/9, valg B; hooks/ubesvaredeOpslag +
  // lib/hjemmebane/ubesvaredeOpslag): medlemmers opslag fra de sidste 14
  // dage uden svar fra en rådgiver. Én nøgle, egen hentning — tråde, svar
  // og rådgiverlisten i samme query, så kortet aldrig dømmer på en delmængde.
  // Hook i topblokken, før nogen betinget return (React #310).
  const ubesvaredeQuery = useQuery({
    queryKey: UBESVAREDE_OPSLAG_KEY,
    queryFn: () => hentUbesvaredeOpslag(),
    enabled: !!user,
    staleTime: 60_000,
  });
  // Nye medlemmer (Jonas 16/9; hooks/kohorte + lib/hjemmebane/kohorte):
  // «N af M kom igen efter dag 1» med navnene på dem der ikke er kommet
  // igen. Nulpunktets regel (16/9 00:57) som ren dom over companies,
  // company_members og user_login_log — rådgiverens egen RLS, ingen SQL.
  // Én nøgle, egen hentning; staleTime som «Siden sidst». Hook i
  // topblokken, før nogen betinget return (React #310).
  const kohorteQuery = useQuery({
    queryKey: KOHORTE_KEY,
    queryFn: () => hentKohorte(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  // Online nu (Jonas 16/9; hooks/onlineMedlemmer + lib/hjemmebane/online):
  // rådgiveren lytter på den private Presence-kanal (tracker aldrig) og slår
  // navn, billede og virksomhed op for netop de id'er der er online — nøglen
  // bærer id'erne, så et nyt medlem online giver ét opslag. Kanalen har sin
  // egen status (henter · live · fejl); hentningen er en query. Hooks i
  // topblokken, før nogen betinget return (React #310).
  const online = useOnlineMedlemmer(!!user);
  const onlineQuery = useQuery({
    queryKey: ONLINE_DOM_KEY(online.ids),
    queryFn: () => hentOnlineDom(online.ids),
    enabled: !!user && online.status === "live" && online.ids.length > 0,
    staleTime: 5 * 60_000,
  });
  // Lukningen — hook i TOPBLOKKEN, før nogen betinget return (React #310).
  // Skriv, så hent igen: dommen afgør hvad der står; ingen lokal patch.
  const lukning = useMutation({
    mutationFn: async (input: { linje: Virksomhedslinje; udfald: LukningsUdfald }) => {
      if (!user) throw new Error("Ikke logget ind");
      await lukOpgave({ companyId: input.linje.companyId, advisorId: user.id, udfald: input.udfald, grundlag: input.linje.grundlag });
      await invaliderForsiden(queryClient);
    },
    onSuccess: (_d, input) => {
      toast.success(`${input.linje.navn} · ${UDFALD_TEKST[input.udfald]}`, { description: "Linjen kommer igen, når der er sket noget nyt." });
    },
    onError: (e: Error) => {
      toast.error("Kunne ikke lukke linjen", { description: e.message });
    },
  });
  const fornavn = profile?.full_name?.split(" ")[0] || "dig";

  if (isError) {
    // 10/9: siger HVAD der ikke kunne hentes — rådgiveren skal vide at
    // dommen ikke er hel (lib/raadgiverHentefejl). Alle forsidens
    // hentninger kaster nu med kildens navn.
    return <p className="text-sm text-hb-rust">{raadgiverHentefejlTekst(error, "forsiden")}</p>;
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
  const linjeNoegle = (l: Linje) => (l.linje === "virksomhed" ? `v:${l.companyId}` : `${l.linje}:${l.slags}`);
  const under = dom.underStregen;
  const antalUnder = under.antalVirksomhederUnderTaersklen;

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

      {/* ── TO KOLONNER (Jonas 8/9): venstre to tredjedele — dommen øverst,
          jeres liste under den; højre en tredjedel — det der ORIENTERER
          frem for at kræve (tallene under stregen nu; pulsen og «siden
          sidst» kommer i en senere PR). Højre er smallere med vilje: er de
          lige brede, ved man ikke hvor man skal starte. Formen er husets
          (CommunityView:158: lg:grid + minmax(0, …) + lg:items-start +
          lg:gap-12); under lg falder det til én kolonne i DOM-rækkefølgen
          dom → liste → højre. Fuldhøjde og papir-grunden ejes af
          HbMemberShell (hbFuldhoejde.guard), ikke af denne flade. */}
      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div className="min-w-0">
          {/* ── Dommen (§1–§6) ── */}
          {dom.linjer.length > 0 && (
            <section className="max-w-3xl">
              <ul className="divide-y divide-hb-line border-y border-hb-line">
                {dom.linjer.map((l) => (
                  <DomLinje
                    key={linjeNoegle(l)}
                    l={l}
                    lukker={lukning.isPending}
                    onLuk={(linje, udfald) => lukning.mutate({ linje, udfald })}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* ── Jeres liste (Jonas 8/9): UNDER DOMMEN, i venstre kolonne, med
              skrivefeltet synligt — dommen er stadig det første man læser, og
              listen er det man skriver i, når man kommer fra en chat. Samme
              komponent som /opgaver, i forsidens udgave: skrivefeltet først,
              forfaldne og dagens altid, resten op til et loft, «vis alle» til
              siden. */}
          <OpgavelisteView paaForsiden />
        </div>

        {/* ── Højre: det der orienterer. Under stregen (§5): tal, ikke lister ── */}
        <aside className="mt-10 min-w-0 space-y-1 text-sm text-hb-ink-soft lg:mt-0 lg:border-l lg:border-hb-line lg:pl-8">
        {/* ONLINE NU (Jonas 16/9, lib/hjemmebane/online + hooks/onlineMedlemmer):
            profilbilleder af de medlemmer der har appen åben lige nu — det
            eneste på siden der er «nu», derfor øverst. Navn (+ « · Legat») ved
            hover og for skærmlæsere; højst ONLINE_LOFT billeder, resten «+ N».
            Skelet før første sync; «Ingen medlemmer online lige nu.» når
            kanalen er live og tom; kanalfejl (CHANNEL_ERROR/TIMED_OUT/CLOSED)
            og opslagsfejl siges med husets hentefejltekst — aldrig «ingen
            online» ved en fejl. Dommen (hvem vises) er onlineMedlemmer. */}
        {(() => {
          const overskrift = (antal: number) => (
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{onlineOverskrift(antal)}</p>
          );
          const skelet = (
            <div aria-hidden className="flex gap-2 pb-4">
              {[0, 1, 2].map((i) => <div key={i} className="h-8 w-8 animate-pulse rounded-full bg-hb-line/40" />)}
            </div>
          );
          if (online.status === "fejl") {
            return (
              <>
                {overskrift(0)}
                <p className="pb-4 text-xs">{raadgiverHentefejlTekst(new HentningsFejl("realtime_presence", "kanalen kunne ikke åbnes"), "forsiden")}</p>
              </>
            );
          }
          if (online.status === "henter" || (online.ids.length > 0 && !onlineQuery.data && !onlineQuery.isError)) {
            return <>{overskrift(0)}{skelet}</>;
          }
          if (onlineQuery.isError) {
            return (
              <>
                {overskrift(0)}
                <p className="pb-4 text-xs">{raadgiverHentefejlTekst(onlineQuery.error, "forsiden")}</p>
              </>
            );
          }
          const liste = online.ids.length === 0 || !onlineQuery.data ? [] : onlineMedlemmer({ ids: online.ids, ...onlineQuery.data });
          if (liste.length === 0) {
            return <>{overskrift(0)}<p className="pb-4">{INGEN_ONLINE_TEKST}</p></>;
          }
          const { viste, flere } = onlineUdsnit(liste);
          return (
            <>
              {overskrift(liste.length)}
              <ul className="flex flex-wrap gap-2 pb-4" data-online-antal={liste.length}>
                {viste.map((m) => (
                  <li key={m.user_id}>
                    <HbAvatar navn={m.navn} avatarUrl={m.avatar_url} stoerrelse="sm" title={onlineTitel(m)} />
                  </li>
                ))}
                {flere > 0 && (
                  <li>
                    <span
                      title={`og ${flere} mere`}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-hb-line bg-hb-paper text-xs font-medium text-hb-ink-soft"
                    >
                      +{flere}
                    </span>
                  </li>
                )}
              </ul>
            </>
          );
        })()}
        {/* PULSEN (Jonas 8/9, lib/pulsen): fire tal for hele porteføljen, læses
            hver morgen. Tallene er MOTORERNES — tavshed er virksomhedsSignalers
            21 dage, fornyelser er dommens FORNYELSE_VENTER_STATUSSER, «har
            rapporteret» er seneste afsluttede måned med målte tal. Ingen
            grafer; klik hvor der er nogen at klikke på. */}
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Pulsen</p>
        <ul className="space-y-1 pb-4">
          {pulsLinjer(data.pulsen).map((l) => (
            <li key={l.noegle} className={cn(l.noegle === "tavse" && data.pulsen.tavse.antal > 0 && "text-hb-rust")}>
              {l.to ? (
                <Link to={l.to} className={cn("underline-offset-4 hover:underline", l.noegle === "tavse" && data.pulsen.tavse.antal > 0 ? "text-hb-rust" : "text-hb-evergreen")}>
                  {l.tekst}
                </Link>
              ) : (
                l.tekst
              )}
            </li>
          ))}
        </ul>
        {/* DRIFTEN (9/9, lib/cronVagt): vagten i databasen dømmer hver time —
            vault, cron-svarene, mailkøen — og skriver til cron_vagt_log. Her
            står kun én linje: grøn er ink-soft, rød er rust med hvad der er
            galt og siden hvornår. 9/9 fik alle ni jobs 401 i 17 timer uden
            at nogen så det; denne linje er dét der skal ses. */}
        {vagtQuery.isLoading ? null : vagtQuery.isError ? (
          <p className="pb-4">Driften: vagten kunne ikke hentes lige nu.</p>
        ) : (() => {
          const v = vagtLinje(vagtQuery.data ?? [], new Date());
          return <p className={cn("pb-4", v.tone === "rust" && "text-hb-rust")}>{v.tekst}</p>;
        })()}
        {/* SIDEN SIDST (Jonas 8/9, lib/sidenSidst + hooks/sidenSidst): hvad der
            har flyttet sig siden du sidst åbnede — pr. rådgiver, syv dages
            loft. Fem-seks linjer med tal og navne; tom tilstand er rolig. */}
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
          Siden sidst{sidenSidstQuery.data ? ` · ${sidenTekst(sidenSidstQuery.data.siden, new Date())}` : ""}
        </p>
        {sidenSidstQuery.isLoading ? (
          <div aria-hidden className="pb-4"><div className="h-3 w-2/3 animate-pulse rounded bg-hb-line/60" /></div>
        ) : sidenSidstQuery.isError ? (
          <p className="pb-4 text-xs">Kunne ikke hente hvad der er sket siden sidst.</p>
        ) : sidenSidstQuery.data ? (
          (() => {
            const linjer = sidenSidstLinjer(sidenSidstQuery.data.raekker);
            return linjer.length > 0 ? (
              <ul className="space-y-1 pb-4">
                {linjer.map((l) => <li key={l.slags}>{l.tekst}</li>)}
              </ul>
            ) : (
              <p className="pb-4">{intetNytTekst(sidenSidstQuery.data.siden, new Date())}</p>
            );
          })()
        ) : null}
        {/* NYE MEDLEMMER (Jonas 16/9, lib/hjemmebane/kohorte + hooks/kohorte):
            «N af M kom igen efter dag 1» — nulpunktets regel (16/9 00:57)
            som linje, med navnene på dem der ikke er kommet igen (højst fem).
            Startet i dag tælles ikke i M — de har ikke kunnet komme igen
            endnu — men siges. Intet tal før hentningen er klar; fejl siges
            med husets hentefejltekst — aldrig «Ingen nye medlemmer». */}
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{KOHORTE_OVERSKRIFT}</p>
        {kohorteQuery.isLoading ? (
          <div aria-hidden className="pb-4"><div className="h-3 w-2/3 animate-pulse rounded bg-hb-line/60" /></div>
        ) : kohorteQuery.isError ? (
          <p className="pb-4 text-xs">{raadgiverHentefejlTekst(kohorteQuery.error, "forsiden")}</p>
        ) : kohorteQuery.data ? (
          (() => {
            const linje = kohorteLinje({ ...kohorteQuery.data, nu: new Date() });
            const idag = startetIDagTekst(linje.udeladtIDag);
            const ikke = ikkeKommetIgenTekst(linje.ikkeKommetIgen);
            return (
              <div className="space-y-1 pb-4" data-kohorte-m={linje.m} data-kohorte-n={linje.n}>
                <p>{kohorteTekst(linje)}{idag ? ` ${idag}` : ""}</p>
                {ikke && <p>{ikke}</p>}
              </div>
            );
          })()
        ) : null}
        {/* UBESVAREDE OPSLAG (Jonas 16/9, valg B): «et eget kort på forsiden
            … med medlemmers opslag fra de sidste 14 dage som ingen rådgiver
            har svaret på, og et link til hvert». Forsvinder af sig selv når
            en af rådgiverne har svaret (dommen læser svarene). Højst fem
            linjer; flere → «og N mere i fællesskabet». Fejl siges med husets
            hentefejltekst — aldrig en tom liste der ligner «alt besvaret». */}
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{KORT_OVERSKRIFT}</p>
        {ubesvaredeQuery.isLoading ? (
          <div aria-hidden className="pb-4"><div className="h-3 w-2/3 animate-pulse rounded bg-hb-line/60" /></div>
        ) : ubesvaredeQuery.isError ? (
          <p className="pb-4 text-xs">{raadgiverHentefejlTekst(ubesvaredeQuery.error, "forsiden")}</p>
        ) : ubesvaredeQuery.data ? (
          (() => {
            const nu = new Date();
            const { liste, ialt } = ubesvaredeOpslag({ ...ubesvaredeQuery.data, nu });
            if (ialt === 0) return <p className="pb-4">{ALLE_BESVARET_TEKST}</p>;
            const { viste, flere } = kortUdsnit(liste);
            return (
              <ul className="space-y-1 pb-4" data-ubesvarede-opslag={ialt}>
                {viste.map((t) => (
                  <li key={t.id}>
                    <Link to={traadSti(t.id)} className="text-hb-evergreen underline-offset-4 hover:underline">
                      {linjeTekst(t)}
                    </Link>
                    <span className="text-hb-ink-soft"> · {alderTekst(t.created_at, nu)}</span>
                    {t.kilde_type === KILDE_PRAESENTATION && <HbTag className="ml-2">{KILDE_PRAESENTATION_LABEL}</HbTag>}
                  </li>
                ))}
                {flere > 0 && (
                  <li>
                    <Link to="/community" className="text-hb-evergreen underline-offset-4 hover:underline">{flereTekst(flere)}</Link>
                  </li>
                )}
              </ul>
            );
          })()
        ) : null}
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Under stregen</p>
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
              to={samletLinjeLink(t)}
              className="text-hb-evergreen underline-offset-4 hover:underline"
            >
              {t.tekst}
            </Link>
          </p>
        ))}
        {under.pukler.map((p) => (
          <p key={`p:${p.slags}`}>
            <Link to={samletLinjeLink(p)} className="text-hb-evergreen underline-offset-4 hover:underline">
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
        {/* Måling (§12): tærsklen justeres efter drift. Tallene bliver stående
            til det er sket. Målt 4/9 kl. 13:04: 7 linjer mod køernes 38 rækker. */}
        <p className="pt-2 text-xs">
          Måling: tærskel {TAERSKEL} · {dom.antalOpgaver} {dom.antalOpgaver === 1 ? "linje" : "linjer"} over stregen · {under.antalTilstandeSamlet} samlet i tilstande · {antalUnder} under tærsklen.
        </p>
        </aside>
      </div>
    </div>
  );
};
