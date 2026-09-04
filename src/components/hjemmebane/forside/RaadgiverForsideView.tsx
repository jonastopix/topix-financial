import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ADVISOR_DASHBOARD_QUERY_KEY, hentAdvisorDashboard } from "@/components/AdvisorDashboard";
import { TAERSKEL, type Linje, type OpgaveSlags } from "@/lib/forsidensDom";
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
 * til den gamle forside (AdvisorDashboard på "/"), som står urørt til
 * swappet; her læses kun `dom`.
 *
 * MIDLERTIDIG rute: "/" renderer stadig AdvisorDashboard for rådgiveren
 * (Index.tsx) til swappet.
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
 * samlet tilstand linker direkte til den.
 *
 * TOPPEN (§10): «N ting kræver dig i dag», ellers «Der er ikke noget der
 * haster i dag.» UNDER STREGEN (§5): tal, ikke lister. FLAGET (§5): når
 * dommen siger usædvanligt mange, står det her. MÅLINGEN nederst bliver
 * stående til tærsklen (TAERSKEL) er justeret efter drift (§12).
 */

const hilsen = (): string => {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
};

const grundLink = (companyId: string, slags: OpgaveSlags) => `/virksomhed/${companyId}?grund=${slags}`;

/** Én linje fra dommen. Virksomhed: handling + grunde; tilstand/pukkel: tekst.
    Rust kun til det der er galt (>= TAERSKEL) eller haster (løftet). */
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
        {/* Måling (§12): tærsklen justeres efter drift. Tallene bliver stående
            til det er sket. Målt 4/9 kl. 13:04: 7 linjer mod køernes 38 rækker. */}
        <p className="pt-2 text-xs">
          Måling: tærskel {TAERSKEL} · {dom.antalOpgaver} {dom.antalOpgaver === 1 ? "linje" : "linjer"} over stregen · {under.antalTilstandeSamlet} samlet i tilstande · {antalUnder} under tærsklen.
        </p>
      </section>
    </div>
  );
};
