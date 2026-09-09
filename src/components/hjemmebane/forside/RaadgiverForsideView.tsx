import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ADVISOR_DASHBOARD_QUERY_KEY, hentAdvisorDashboard } from "@/components/AdvisorDashboard";
import { invaliderForsiden, lukOpgave } from "@/hooks/opgaveLukning";
import { OpgavelisteView } from "@/components/hjemmebane/opgaver/OpgavelisteView";
import { TAERSKEL, type Linje, type OpgaveSlags, type Pukkellinje, type Virksomhedslinje } from "@/lib/forsidensDom";
import { LUKNINGS_UDFALD, UDFALD_TEKST, type LukningsUdfald } from "@/lib/opgaveLukning";
import { cn } from "@/lib/utils";

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
 * samlet tilstand eller pukkel linker direkte til den (se pukkelLink).
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

/** Puklen (agentforslag). Forslag kan KUN afgøres i AgentForslagPanel, som
    er monteret alene på /virksomhed/:companyId (VirksomhedView). Dækker
    puklen præcis ÉN virksomhed, peger linjen derfor direkte på den — dommen
    bærer virksomhederne med netop til det (Pukkellinje.virksomheder, 6/9).
    Dækker den FLERE, peger den på /virksomheder som hidtil: der findes
    ingen flade der viser forslag på tværs af virksomheder, så listen er det
    nærmeste rådgiveren kan komme. KENDT begrænsning, ikke en forglemmelse.
    Ingen ny rute, ingen ny parameter. */
const pukkelLink = (p: Pukkellinje) =>
  p.virksomheder.length === 1 ? grundLink(p.virksomheder[0].companyId, p.slags) : "/virksomheder";

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
  const to = enkelt ? grundLink(enkelt.companyId, l.slags) : l.linje === "pukkel" ? pukkelLink(l) : "/virksomheder";
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
  const { data, isLoading, isError } = useQuery({
    queryKey: ADVISOR_DASHBOARD_QUERY_KEY(user?.id),
    queryFn: hentAdvisorDashboard,
    enabled: !!user,
    staleTime: 2 * 60_000,
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
            <Link to={pukkelLink(p)} className="text-hb-evergreen underline-offset-4 hover:underline">
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
