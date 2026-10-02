import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ADVISOR_DASHBOARD_QUERY_KEY, hentAdvisorDashboard } from "@/components/AdvisorDashboard";
import { invaliderForsiden, lukOpgave } from "@/hooks/opgaveLukning";
import { OpgavelisteView } from "@/components/hjemmebane/opgaver/OpgavelisteView";
import { ANSOEGNINGER_STI, TAERSKEL, usaedvanligtMangeTekst, type Betaltlinje, type Boelgelinje, type Linje, type OpgaveSlags, type Tilstandslinje, type Ventelistelinje, type Virksomhedslinje } from "@/lib/forsidensDom";
import { samletLinjeLink } from "@/lib/hjemmebane/forsideLinks";
import { LUKNINGS_UDFALD, UDFALD_TEKST, type LukningsUdfald } from "@/lib/opgaveLukning";
import { SIDEN_SIDST_KEY, hentSidenSidst } from "@/hooks/sidenSidst";
import { CRON_VAGT_KEY, hentCronVagt } from "@/hooks/cronVagt";
import { vagtLinje } from "@/lib/cronVagt";
import { intetNytTekst, sidenSidstLinjeDele, sidenSidstNavneSep, sidenTekst } from "@/lib/sidenSidst";
import { UBESVAREDE_OPSLAG_KEY, hentUbesvaredeOpslag } from "@/hooks/ubesvaredeOpslag";
import { VENTER_PAA_BETALING_KEY, hentVenterPaaBetaling } from "@/hooks/venterPaaBetaling";
import {
  KORT_OVERSKRIFT as VENTER_OVERSKRIFT,
  VIRKSOMHEDER_STI,
  flereTekst as venterFlereTekst,
  kortUdsnit as venterUdsnit,
  venterPaaBetaling,
  virksomhedsSti,
} from "@/lib/hjemmebane/venterPaaBetaling";
import {
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
import { DAGENS_SESSIONER_KEY, hentDagensSessioner } from "@/hooks/dagensSessioner";
import { SESSIONER_OVERSKRIFT, dagensSessioner, sessionLinjeTekst } from "@/lib/hjemmebane/dagensSessioner";
import { IKKE_KOMMET_IGEN_PRAEFIKS, KOHORTE_OVERSKRIFT, ikkeKommetIgenDele, ikkeKommetIgenHale, kohorteLinje, kohorteTekst, startetIDagTekst } from "@/lib/hjemmebane/kohorte";
import { HbTag } from "@/components/hjemmebane/HbTag";
import { HbAvatar } from "@/components/hjemmebane/HbAvatar";
import { ONLINE_DOM_KEY, hentOnlineDom, useOnlineMedlemmer } from "@/hooks/onlineMedlemmer";
import { onlineChatSti, onlineLinkEtiket, onlineMedlemmer, onlineOverskrift, onlineTitel, onlineUdsnit } from "@/lib/hjemmebane/online";
import { HentningsFejl } from "@/lib/kraevRaekker";
import { cn } from "@/lib/utils";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { useMedlemsOverblik } from "@/hooks/medlemsOverblik";
import { ManglerAtBooke } from "./ManglerAtBooke";
import { KvartalstjekVenter } from "./KvartalstjekVenter";
import { useKvartalstjekOverblik } from "@/hooks/kvartalstjekOverblik";
import { SVARTID_KEY, hentSvartid } from "@/hooks/svartid";
import { SvartidsUret } from "./SvartidsUret";
import { EYEBROW, Fremdrift, KORT, Maerke, MIKRO, TalFelt, type FeltTilstand } from "./HoejreKolonne";
import { KOHORTE_BJAELKE_ETIKET, ONLINE_FELT_LOFT, pulsVisning } from "@/lib/hjemmebane/hoejreKolonne";

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
 * «Åbn chat». Parameteren `grund` bærer den vigtigste grunds slags, og
 * virksomhedssiden LÆSER den (VirksomhedView: laesGrund(searchParams.get
 * ("grund")) → ankrene section-chat/-tal/-aftale/-milestones/-refleksion)
 * som «derfor er du her» øverst i blok 1 (§6).
 *
 * Tilstande og pukler er deres egen samlede linje (§3) og linker til
 * /virksomheder (§5: tallene er links til listen). Én virksomhed i en
 * samlet tilstand eller pukkel linker direkte til den (se samletLinjeLink).
 *
 * TOPPEN (§10): «N ting kræver dig i dag», ellers «Der er ikke noget der
 * haster i dag.» UNDER STREGEN (§5): tal, ikke lister. FLAGET (§5): når
 * dommen siger usædvanligt mange, står det her. Målingslinjen («Måling:
 * tærskel 70 · …», 4/9) er taget af fladen 17/9 (PR 1): tærsklen blev
 * aldrig justeret, og tallene måles i SQL når det skal ske — ikke som
 * debug-tekst til rådgiveren.
 *
 * TO KOLONNER (Jonas 8/9): på desktop står dommen og jeres to-do-liste i
 * venstre kolonne (to tredjedele) — det man læser først og handler på —
 * og det der orienterer i højre (en tredjedel, smallere). Listen står HER
 * med skrivefelt — ikke bag et menupunkt («et menupunkt vi aldrig
 * nogensinde kommer til at arbejde med»). Se OpgavelisteViews filhoved.
 *
 * HØJRE EFTER TID og UNDER STREGEN I VENSTRE (Jonas 17/9 «AA», valg 1;
 * analyse-raadgivernes-forside.md §5–§6 forslag 2): «Under stregen» er
 * dommens egen rest og står nu lige under linjerne, før listen. Højre er
 * tre grupper — «I dag» (Sessioner i dag, Online nu, Ubesvarede opslag,
 * Driften KUN når rød, Venter på betaling), «Ugen» (Siden sidst), «Måneden» (Pulsen, Nye
 * medlemmer) — så det der er nu står øverst og månedstallene nederst. På
 * mobil: dommen → Under stregen → «I dag» → Jeres liste → Ugen/Måneden.
 * Målingslinjen er væk (PR 1).
 *
 * HØJRE SOM KORT (30/9, Jonas: «højre kolonne … er blevet uoverskuelig. Der
 * er meget almindelig tekst i én lang køre»; godkendt redesign): hver
 * sektion er et kort (hvid flade, hairline, rounded-hb), tal før tekst.
 * «I dag» er fire felter i et 2×2-gitter med prik + ord, listerne under
 * gitteret kun for de felter der har noget; «Mangler at booke» to foldbare
 * rækker; Svartids-uret en tabel og en pille; Pulsen og Nye medlemmer
 * fremdriftsbjælker og mærker; «Ugen» én rolig linje når intet er nyt.
 * INGEN ændring af data, hentning eller domme — kun opsætning (lib/
 * hjemmebane/hoejreKolonne + HoejreKolonne.tsx). Rækkefølgen og felterne
 * i gridet er de samme.
 *
 * LUKNINGEN (Jonas 8/9, lib/opgaveLukning): hver virksomhedslinje har to
 * handlinger, «Færdiggjort» og «Ikke relevant». Ingen «Udsæt». Fladen
 * gemmer det grundlag dommen selv gav linjen (Virksomhedslinje.grundlag)
 * gennem den ene skrivevej (hooks/opgaveLukning), invaliderer forsiden og
 * lader dommen afgøre hvad der står — ingen optimistisk patch. Linjen
 * kommer igen når noget NYT er sket (andet grundlag).
 *
 * TILSTANDSLINJERNE (PR 5, 17/9 — analyse-raadgivernes-forside.md §3.1 pkt.
 * 3 / §6 forslag 6; før: «har ingen knapper — de er næste PR»): «11 kunder
 * har ingen mål», «2 virksomheder har mål til gennemgang», «N har du ikke
 * hørt fra længe» er nu folde (TilstandFold) — over OG under stregen —
 * med ét navn pr. virksomhed, dens grund, og «Færdiggjort · Ikke relevant»
 * PR. NAVN; linjens egne to ord kvitterer alle. Hver kvittering er én
 * lukOpgave pr. virksomhed med DENS grundlag for netop tilstanden
 * (Tilstandslinje.virksomheder[].grundlag: {ingen_maal: «ingen:0»},
 * {maal_uden_bevaegelse: «gennemgang:4»}, {tavshed: sidste besked}) — så
 * linjen tæller kun de ikke-kvitterede, og en ny virksomhed i tilstanden
 * eller et andet grundlag står igen. Ingen ny tabel eller kolonne.
 */

const hilsen = (): string => {
  const h = new Date().getHours();
  if (h < 5) return "God nat";
  if (h < 12) return "Godmorgen";
  if (h < 18) return "God eftermiddag";
  return "God aften";
};

const grundLink = (companyId: string, slags: OpgaveSlags) => `/virksomhed/${companyId}?grund=${slags}`;

/** Husets tekstlink i højre spalte (samme klasser som Pulsens og «Under
    stregen»s links): ingen knapflade. Navnene i «Siden sidst» og «Nye
    medlemmer» linker hermed til virksomheden (17/9, PR 3) — kommaer og «og»
    står som tekst mellem linkene, ikke inde i dem. */
const TEKSTLINK = "text-hb-evergreen underline-offset-4 hover:underline";
const virksomhedsLink = (companyId: string) => `/virksomhed/${companyId}`;

/** Samlede linjer (tilstand eller pukkel) peger via samletLinjeLink
    (lib/hjemmebane/forsideLinks, #743): ÉN virksomhed → direkte til den med
    grunden; FLERE → /virksomheder?grund=<slags>, så listen viser præcis de
    virksomheder dommen bar (13/9 — før pegede de på listen uden parameter,
    og rådgiveren så alle 27 for et tal der sagde 12). Puklen (agentforslag)
    kan stadig kun afgøres i AgentForslagPanel på /virksomhed/:companyId;
    udsnittet på listen er det nærmeste for flere. */

type LukbarLinje = Virksomhedslinje | Boelgelinje | Betaltlinje | Tilstandslinje | Ventelistelinje;

/** PR 5 (17/9): en samlet tilstand som fold — summary er linjens tekst (linket
    til udsnittet, samletLinjeLink, som før), folden ét navn pr. virksomhed
    med link til grunden, grundens tekst, og «Færdiggjort · Ikke relevant»
    PR. NAVN (`kun` = virksomhedens id). Bruges over og under stregen; de to
    ord for HELE linjen står hos kalderen. */
const TilstandFold = ({ t, onLuk, lukker, summaryClass }: { t: Tilstandslinje; onLuk: (linje: LukbarLinje, udfald: LukningsUdfald, kun?: string) => void; lukker: boolean; summaryClass?: string }) => (
  <details className="min-w-0 flex-1" data-tilstand-fold={t.slags} data-tilstand-antal={t.antal}>
    <summary className={cn("cursor-pointer list-none rounded-hb transition-colors hover:bg-hb-sage/20 [&::-webkit-details-marker]:hidden", summaryClass)}>
      <Link to={samletLinjeLink(t)} className="text-hb-evergreen underline-offset-4 hover:underline">
        {t.tekst}
      </Link>
    </summary>
    <ul className="mt-2 space-y-1 text-sm">
      {t.virksomheder.map((v) => (
        <li key={v.companyId} className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1">
            <Link to={grundLink(v.companyId, v.grund.slags)} className={TEKSTLINK}>
              {v.navn}
            </Link>
            <span className="text-hb-ink-soft"> · {v.grund.tekst}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs">
            {LUKNINGS_UDFALD.map((udfald) => (
              <button
                key={udfald}
                type="button"
                disabled={lukker}
                onClick={() => onLuk(t, udfald, v.companyId)}
                className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50"
              >
                {UDFALD_TEKST[udfald]}
              </button>
            ))}
          </span>
        </li>
      ))}
    </ul>
  </details>
);

/** Én linje fra dommen. Virksomhed: handling + grunde; tilstand: fold med
    kvittering (PR 5); pukkel: tekst. Rust kun til det der er galt
    (>= TAERSKEL) eller haster (løftet). */
const DomLinje = ({ l, onLuk, lukker }: { l: Linje; onLuk: (linje: LukbarLinje, udfald: LukningsUdfald, kun?: string) => void; lukker: boolean }) => {
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

  if (l.linje === "venteliste") {
    /* VENTELISTEN (udkast 18/9): «Homie er ude. Nordic Byg har ventet siden
       3. maj — tilbyd pladsen?» — én linje pr. virksomhed, ved navn. Linket
       fører til virksomhedssiden (Aftalen), hvor «Tilbyd pladsen til X» bor;
       der går ingen mail før det tryk. De to ord lukker linjen med grundlaget
       «venteliste:{ansøgning}» — skifter den første i køen, står den igen. */
    return (
      <li className="flex items-start gap-3 py-3" data-venteliste={l.antal}>
        {prik}
        <Link to={grundLink(l.companyId, "venteliste")} className="min-w-0 flex-1 rounded-hb transition-colors hover:bg-hb-sage/20">
          <span className="block text-[15px] leading-snug text-hb-ink">
            <span className="font-medium">{l.navn}</span>
            <span className="text-hb-ink-soft"> · </span>
            {l.handling}
          </span>
          <span className="block text-sm leading-snug text-hb-ink-soft">{l.tekst}</span>
        </Link>
        <span className="flex shrink-0 flex-col items-end gap-1">
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

  if (l.linje === "betalt") {
    /* BETALT, IKKE OPRETTET KONTO (før 22/9, Jonas «1. Ja»): én foldet linje
       som bølgen — teksten er summary, folden bærer ét link pr. navn til
       virksomhedssiden (dér står «Invitationer» med gensend/inviter), og de
       to ord kvitterer ALLE (én lukning pr. virksomhed med dens eget
       grundlag «betalt:{dag}» — ingen ny kolonne). */
    return (
      <li className="flex items-start gap-3 py-3" data-betalt-ikke-oprettet={l.antal}>
        {prik}
        <details data-betalt-fold className="min-w-0 flex-1">
          <summary data-betalt-summary className="cursor-pointer list-none rounded-hb text-[15px] leading-snug text-hb-ink transition-colors hover:bg-hb-sage/20 [&::-webkit-details-marker]:hidden">
            <span className="font-medium">{l.tekst}</span>
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {l.virksomheder.map((v) => (
              <li key={v.companyId}>
                <Link to={virksomhedsLink(v.companyId)} className={TEKSTLINK}>
                  {v.navn}
                </Link>
                <span className="text-hb-ink-soft"> · {v.grund.tekst}</span>
              </li>
            ))}
          </ul>
        </details>
        <span className="flex shrink-0 flex-col items-end gap-1">
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

  if (l.linje === "ansoegninger") {
    /* ANSØGNINGER DER VENTER (18/9): én foldet linje som bølgen — teksten er
       summary med link til /ansoegninger, folden ét link pr. ansøgning til
       dens egen side. INGEN kvittering: «Ikke relevant» er beslutningen
       «afvis», som træffes dér — ikke her. */
    return (
      <li className="flex items-start gap-3 py-3" data-ansoegninger-venter={l.antal}>
        {prik}
        <details data-ansoegninger-fold className="min-w-0 flex-1">
          <summary data-ansoegninger-summary className="cursor-pointer list-none rounded-hb text-[15px] leading-snug text-hb-ink transition-colors hover:bg-hb-sage/20 [&::-webkit-details-marker]:hidden">
            <Link to={ANSOEGNINGER_STI} className="font-medium">{l.tekst}</Link>
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {l.ansoegninger.map((a) => (
              <li key={a.id}>
                <Link to={`${ANSOEGNINGER_STI}/${a.id}`} className={TEKSTLINK}>
                  {a.navn}
                </Link>
                <span className="text-hb-ink-soft"> · {a.trin === "ny" ? "ny ansøgning" : "samtale afholdt"}</span>
              </li>
            ))}
          </ul>
        </details>
      </li>
    );
  }

  if (l.linje === "boelge") {
    /* BØLGEN (Jonas 17/9 «AA»): ≥ 3 velkomster med samme startdag som ÉN
       foldet linje — teksten er summary, folden bærer ét link pr. navn til
       samme mål som velkomstlinjen (grundLink … venter_paa_velkomst → chatten
       på virksomhedssiden), og de to ord kvitterer ALLE i bølgen (mutationen
       lukker én virksomhed ad gangen med dens eget grundlag). */
    return (
      <li className="flex items-start gap-3 py-3" data-boelge={l.dag} data-boelge-antal={l.antal}>
        {prik}
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer list-none rounded-hb text-[15px] leading-snug text-hb-ink transition-colors hover:bg-hb-sage/20 [&::-webkit-details-marker]:hidden">
            <span className="font-medium">{l.tekst}</span>
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {l.virksomheder.map((v) => (
              <li key={v.companyId}>
                <Link to={grundLink(v.companyId, "venter_paa_velkomst")} className="text-hb-evergreen underline-offset-4 hover:underline">
                  {v.navn}
                </Link>
                <span className="text-hb-ink-soft"> · {v.grund.tekst}</span>
              </li>
            ))}
          </ul>
        </details>
        <span className="flex shrink-0 flex-col items-end gap-1">
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
  if (l.linje === "tilstand") {
    /* TILSTANDEN (PR 5): én virksomhed → navn + handling som en virksomhedslinje;
       flere → folden (TilstandFold) med kvittering pr. navn. De to ord til højre
       kvitterer ALLE i tilstanden (én lukning pr. virksomhed med dens grundlag). */
    return (
      <li className="flex items-start gap-3 py-3" data-tilstand={l.slags} data-tilstand-antal={l.antal}>
        {prik}
        {enkelt ? (
          <Link to={to} className="min-w-0 flex-1 rounded-hb transition-colors hover:bg-hb-sage/20">
            <span className="block text-[15px] leading-snug text-hb-ink">
              <span className="font-medium">{enkelt.navn}</span>
              <span className="text-hb-ink-soft"> · </span>
              {enkelt.grund.handling}
            </span>
            <span className={cn("block text-sm leading-snug", rust ? "text-hb-rust" : "text-hb-ink-soft")}>{enkelt.grund.tekst}</span>
          </Link>
        ) : (
          <TilstandFold t={l} onLuk={onLuk} lukker={lukker} summaryClass="text-[15px] leading-snug text-hb-ink [&>a]:text-hb-ink [&>a]:font-medium" />
        )}
        <span className="flex shrink-0 flex-col items-end gap-1">
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
  // Puklen: tekst og link — ingen kvittering (den afgøres på virksomhedssiden).
  return (
    <li className="flex items-start gap-3 py-3">
      {prik}
      <Link to={to} className="min-w-0 flex-1 rounded-hb transition-colors hover:bg-hb-sage/20">
        <span className="block text-[15px] leading-snug text-hb-ink">{l.tekst}</span>
      </Link>
    </li>
  );
};

export const RaadgiverForsideView = () => {
  const { user, profile, isAdvisor } = useAuth();
  // Tjenestekonti (30/9): stemplet «siden sidst» — se sidenSidstQuery.
  const { laeseMarkeringTilladt } = useAuth();
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
    // Flaget i nøglen (30/9, tjenestekonto.guard dom 6): en tjenestekonto
    // flytter aldrig stemplet; for alle andre sættes det, når svaret er kommet.
    queryKey: [...SIDEN_SIDST_KEY(user?.id), laeseMarkeringTilladt],
    queryFn: () => hentSidenSidst(user!.id, new Date(), laeseMarkeringTilladt),
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
  // Venter på betaling (19/9, recon-indgangspaamindelser §5; hooks/
  // venterPaaBetaling + lib/hjemmebane/venterPaaBetaling): ÉN liste over dem
  // der har skrevet under og ikke betalt — den fandtes ikke før. Forsidens
  // egne indgangslinjer kommer først fra dag 23 (alvor 60, vinduesporten), og
  // femten på én gang drukner hinanden; kortet samler dem fra dag 0 med
  // højst fem linjer. Egen hentning, så en fejl her ikke vælter dommen.
  // Hook i topblokken, før nogen betinget return (React #310).
  const venterQuery = useQuery({
    queryKey: VENTER_PAA_BETALING_KEY,
    queryFn: () => hentVenterPaaBetaling(),
    enabled: !!user,
    staleTime: 5 * 60_000,
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
  // Online nu (Jonas 16/9; hjerteslag 30/9; hooks/onlineMedlemmer +
  // lib/hjemmebane/online): rådgiveren henter friske hjerteslag (hvert 30. s
  // og ved fokus) og slår navn, billede og virksomhed op for netop de id'er
  // der er online — nøglen bærer id'erne, så et nyt medlem online giver ét
  // opslag. Hjerteslagene har deres egen status (henter · live · fejl);
  // opslaget er en query. Hooks i topblokken, før nogen betinget return
  // (React #310).
  const online = useOnlineMedlemmer(!!user);
  const onlineQuery = useQuery({
    queryKey: ONLINE_DOM_KEY(online.ids),
    queryFn: () => hentOnlineDom(online.ids),
    enabled: !!user && online.status === "live" && online.ids.length > 0,
    staleTime: 5 * 60_000,
  });
  // Sessioner i dag (17/9, PR 2; hooks/dagensSessioner + lib/hjemmebane/
  // dagensSessioner): bookede sessioner med start på dagens danske dato —
  // «10:00 Floren Engros · Morten» → virksomhedssiden. Én nøgle, egen
  // hentning. Hook i topblokken, før nogen betinget return (React #310).
  const sessionerQuery = useQuery({
    queryKey: DAGENS_SESSIONER_KEY,
    queryFn: () => hentDagensSessioner(),
    enabled: !!user,
    staleTime: 60_000,
  });
  // Mangler at booke (Jonas 29/9: «Jeg skal bare vide hvor mange der
  // mangler»; lib/medlemsOverblik.manglerAtBooke): medlemsoverblikkets egen
  // hentning og nøgle — en fejl her lader forsiden stå. Hook i topblokken,
  // før nogen betinget return (React #310).
  const overblikQuery = useMedlemsOverblik(!!user);
  // Skive 3 (2/10): kvartalstjekkene — egen nøgle, fail-soft på migrationen (hooks/kvartalstjekOverblik).
  const kvartalstjekQuery = useKvartalstjekOverblik(!!user);
  // Svartids-uret (30/9, hooks/svartid + lib/svartid): median svartid i
  // chatten, ældste ubesvarede og «Intet venter»-streaken. KUN rådgivere:
  // query'en kører kun med rollen, og kortet tegner intet uden den
  // (svartidsUret.guard). Egen nøgle — en fejl her lader forsiden stå.
  // Hook i topblokken, før nogen betinget return (React #310).
  const svartidQuery = useQuery({
    queryKey: SVARTID_KEY,
    queryFn: () => hentSvartid(),
    enabled: !!user && isAdvisor,
    staleTime: 5 * 60_000,
  });
  // Lukningen — hook i TOPBLOKKEN, før nogen betinget return (React #310).
  // Skriv, så hent igen: dommen afgør hvad der står; ingen lokal patch.
  const lukning = useMutation({
    mutationFn: async (input: { linje: LukbarLinje; udfald: LukningsUdfald; kun?: string }) => {
      if (!user) throw new Error("Ikke logget ind");
      if (input.linje.linje === "boelge" || input.linje.linje === "betalt") {
        // Bølgen: én kvittering pr. virksomhed, med dens eget grundlag — som
        // om rådgiveren havde lukket hver linje selv. Sekventielt, så en fejl
        // stopper med kildens besked; de allerede lukkede forbliver lukket.
        for (const v of input.linje.virksomheder) {
          await lukOpgave({ companyId: v.companyId, advisorId: user.id, udfald: input.udfald, grundlag: v.grundlag });
        }
      } else if (input.linje.linje === "tilstand") {
        // Tilstanden (PR 5): én kvittering pr. virksomhed med DENS grundlag for
        // netop tilstanden; `kun` = ét navn i folden, ellers alle i linjen.
        const liste = input.kun ? input.linje.virksomheder.filter((v) => v.companyId === input.kun) : input.linje.virksomheder;
        for (const v of liste) {
          await lukOpgave({ companyId: v.companyId, advisorId: user.id, udfald: input.udfald, grundlag: v.grundlag });
        }
      } else {
        await lukOpgave({ companyId: input.linje.companyId, advisorId: user.id, udfald: input.udfald, grundlag: input.linje.grundlag });
      }
      await invaliderForsiden(queryClient);
    },
    onSuccess: (_d, input) => {
      const navn =
        input.linje.linje === "boelge" ? `${input.linje.antal} nye`
        : input.linje.linje === "betalt" ? `${input.linje.antal} betalt uden konto`
        : input.linje.linje === "venteliste" ? `${input.linje.navn} (venteliste)`
        : input.linje.linje === "tilstand"
          ? (input.kun ? (input.linje.virksomheder.find((v) => v.companyId === input.kun)?.navn ?? "1 virksomhed") : `${input.linje.antal} ${input.linje.antal === 1 ? "virksomhed" : "virksomheder"}`)
          : input.linje.navn;
      toast.success(`${navn} · ${UDFALD_TEKST[input.udfald]}`, { description: "Linjen kommer igen, når der er sket noget nyt." });
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
  const linjeNoegle = (l: Linje) =>
    l.linje === "virksomhed" ? `v:${l.companyId}` : l.linje === "boelge" ? `b:${l.dag}` : l.linje === "betalt" ? "betalt" : l.linje === "venteliste" ? `vl:${l.companyId}` : l.linje === "ansoegninger" ? "ansoegninger" : `${l.linje}:${l.slags}`;
  const under = dom.underStregen;
  const antalUnder = under.antalVirksomhederUnderTaersklen;

  // «I DAG» (30/9, redesignet): hver dom køres ÉN gang her — feltet i
  // gitteret og listen under det læser samme værdi. Ingen hooks (de står i
  // topblokken); kun de samme dommekald som før, flyttet ud af JSX'en.
  // Rækkefølgen i hver kæde er den gamle: henter → fejl → tal. En fejl giver
  // ALDRIG et 0, der ligner «alt i orden».
  const nu = new Date();
  const iDagFejl: { noegle: string; tekst: string }[] = [];
  const felt = (q: { isLoading: boolean; isError: boolean; error: unknown }, noegle: string, antal: number | null): FeltTilstand => {
    if (q.isLoading) return { art: "henter" };
    if (q.isError) {
      iDagFejl.push({ noegle, tekst: raadgiverHentefejlTekst(q.error, "forsiden") });
      return { art: "fejl" };
    }
    return antal === null ? { art: "henter" } : { art: "tal", antal };
  };
  const sessionerListe = sessionerQuery.data ? dagensSessioner({ ...sessionerQuery.data, nu }) : null;
  const sessionerFelt = felt(sessionerQuery, "sessioner", sessionerListe ? sessionerListe.length : null);
  // Online: hjerteslagene har deres egen status (henter · live · fejl), opslaget
  // er en query. Hjerteslagsfejl FØRST, så skelet, så opslagsfejl, så listen
  // (onlineMedlemmer).
  let onlineFelt: FeltTilstand;
  let onlineListe: ReturnType<typeof onlineMedlemmer> | null = null;
  if (online.status === "fejl") {
    iDagFejl.push({ noegle: "online", tekst: raadgiverHentefejlTekst(new HentningsFejl("online_hjerteslag", "hjerteslagene kunne ikke hentes"), "forsiden") });
    onlineFelt = { art: "fejl" };
  } else if (online.status === "henter" || (online.ids.length > 0 && !onlineQuery.data && !onlineQuery.isError)) {
    onlineFelt = { art: "henter" };
  } else if (onlineQuery.isError) {
    iDagFejl.push({ noegle: "online", tekst: raadgiverHentefejlTekst(onlineQuery.error, "forsiden") });
    onlineFelt = { art: "fejl" };
  } else {
    onlineListe = online.ids.length === 0 || !onlineQuery.data ? [] : onlineMedlemmer({ ids: online.ids, ...onlineQuery.data });
    onlineFelt = { art: "tal", antal: onlineListe.length };
  }
  const opslagDom = ubesvaredeQuery.data ? ubesvaredeOpslag({ ...ubesvaredeQuery.data, nu }) : null;
  const opslagFelt = felt(ubesvaredeQuery, "opslag", opslagDom ? opslagDom.ialt : null);
  const venterDom = venterQuery.data ? venterPaaBetaling(venterQuery.data, nu) : null;
  const venterFelt = felt(venterQuery, "betaling", venterDom ? venterDom.ialt : null);
  const iDag = {
    nu,
    fejl: iDagFejl,
    // Listerne kun når feltet står med et tal — ved fejl står fejlen, ikke gamle rækker.
    sessionerIDag: { felt: sessionerFelt, liste: sessionerFelt.art === "tal" ? sessionerListe : null },
    online: { felt: onlineFelt, liste: onlineListe },
    opslag: { felt: opslagFelt, dom: opslagFelt.art === "tal" ? opslagDom : null },
    venter: { felt: venterFelt, dom: venterFelt.art === "tal" ? venterDom : null },
  };

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
            : `${dom.antalOpgaver} ting kræver dig i dag.`}
        </p>
        {dom.usaedvanligtMange && (
          <p className="mt-2 text-sm text-hb-rust">{usaedvanligtMangeTekst(dom)}</p>
        )}
      </section>

      {/* ── TO KOLONNER, FIRE FELTER (Jonas 8/9 to kolonner; 17/9 «AA», valg 1
          — højre kolonne efter TID, «Under stregen» op i venstre):
            venstre  række 1: dommen + Under stregen · række 2: Jeres liste
            højre    række 1: «I dag» (Sessioner i dag, Online nu, Ubesvarede
                     opslag, Driften kun når rød, Venter på betaling) ·
                     række 2: «Ugen» (Siden sidst) og «Måneden» (Pulsen, Nye
                     medlemmer)
          Under lg falder gridet til én kolonne i DOM-rækkefølgen: dommen →
          Under stregen → «I dag» → Jeres liste → Ugen/Måneden — det der er
          «nu» før listen, listen før månedstallene (medlemmets forside PR 3
          løste mobilen på samme måde: col-/row-start på md+, DOM-orden under).
          AFVEJNINGEN: to grid-rækker frem for én højre spalte der spænder
          begge rækker — prisen er at række 1 er så høj som den højeste af
          dommen og «I dag»; er dommen kort (0 linjer) og «I dag» lang,
          begynder Jeres liste lidt under dommens slutning. Vundet: den
          mobile rækkefølge uden order-klasser eller dobbeltrendering. */}
      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-x-12" data-forside-grid>
        <div className="min-w-0 lg:col-start-1 lg:row-start-1" data-forside-felt="dommen">
          {/* ── Dommen (§1–§6) ── */}
          {dom.linjer.length > 0 && (
            <section className="max-w-3xl">
              <ul className="divide-y divide-hb-line border-y border-hb-line">
                {dom.linjer.map((l) => (
                  <DomLinje
                    key={linjeNoegle(l)}
                    l={l}
                    lukker={lukning.isPending}
                    onLuk={(linje, udfald, kun) => lukning.mutate({ linje, udfald, kun })}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* ── UNDER STREGEN (§5) — flyttet fra højre spalte til VENSTRE, lige
              under dommens linjer og før «Jeres liste» (Jonas 17/9 «AA», valg 1):
              det er dommens egen rest — «ni andre har noget mindre presserende»
              — ikke orientering. Samme linjer og links som før (samletLinjeLink). */}
          <section className="mt-6 max-w-3xl space-y-1 text-sm text-hb-ink-soft" data-under-stregen>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Under stregen</p>
          {antalUnder > 0 && (
            <p>
              <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">
                {antalUnder} {antalUnder === 1 ? "anden virksomhed har" : "andre virksomheder har"} noget mindre presserende
              </Link>
            </p>
          )}
          {/* Tilstande under stregen (PR 5): samme fold og kvittering som over. */}
          {under.tilstande.map((t) => (
            <div key={`t:${t.slags}`} className="flex items-start gap-3" data-tilstand-under={t.slags}>
              <TilstandFold t={t} onLuk={(linje, udfald, kun) => lukning.mutate({ linje, udfald, kun })} lukker={lukning.isPending} />
              <span className="flex shrink-0 items-center gap-2 text-xs">
                {LUKNINGS_UDFALD.map((udfald) => (
                  <button
                    key={udfald}
                    type="button"
                    disabled={lukning.isPending}
                    onClick={() => lukning.mutate({ linje: t, udfald })}
                    className="text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    {UDFALD_TEKST[udfald]}
                  </button>
                ))}
              </span>
            </div>
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
          </section>
        </div>

        {/* ── Højre, række 1: «I DAG» — det der er nu ──
            OPSÆTNINGEN (30/9, Jonas' godkendte redesign): ét kort med fire
            felter i et 2×2-gitter — Sessioner i dag, Online nu, Ubesvarede
            opslag, Venter på betaling — tal før tekst, prik + ord (grøn = i
            orden, orange = noget venter; lib/hjemmebane/hoejreKolonne). Et
            felt på 0 er lille og roligt. Under gitteret: Driften (KUN når
            rød), fejllinjerne med husets hentefejltekst, og listerne bag de
            felter der har noget (sessionerne, opslagene, betalingerne) — så
            navnene stadig er ét klik væk. Sidst i kortet: Mangler at booke.
            Dommene køres ÉN gang (iDag ovenfor) — feltet og listen læser
            samme værdi. */}
        <aside className="mt-10 min-w-0 space-y-4 text-sm text-hb-ink-soft lg:col-start-2 lg:row-start-1 lg:mt-0" data-forside-felt="i-dag">
        <div className={KORT} data-i-dag-kort>
        <p className={EYEBROW}>I dag</p>
        <div className="mt-4 grid grid-cols-2 gap-3" data-i-dag-gitter>
          <TalFelt slags="sessioner" etiket={SESSIONER_OVERSKRIFT} tilstand={iDag.sessionerIDag.felt} />
          <TalFelt slags="online" etiket={onlineOverskrift(0)} tilstand={iDag.online.felt}>
            {/* Profilbillederne bliver i feltet (højst ONLINE_FELT_LOFT, resten
                «+N»); navn (+ « · Legat») ved hover og for skærmlæsere. */}
            {iDag.online.liste && iDag.online.liste.length > 0 && (() => {
              const { viste, flere } = onlineUdsnit(iDag.online.liste, ONLINE_FELT_LOFT);
              return (
                <ul className="mt-2 flex flex-wrap gap-1" data-online-antal={iDag.online.liste.length}>
                  {viste.map((m) => (
                    <li key={m.user_id}>
                      {/* Klikbart (Jonas 1/10): et rigtigt link direkte til
                          virksomhedens samtale (onlineChatSti =
                          /chat?companyId=…); uden virksomhed intet link. */}
                      {(() => {
                        const sti = onlineChatSti(m);
                        const avatar = <HbAvatar navn={m.navn} avatarUrl={m.avatar_url} stoerrelse="sm" title={onlineTitel(m)} />;
                        return sti ? (
                          <Link
                            to={sti}
                            aria-label={onlineLinkEtiket(m)}
                            data-online-chat-link
                            className="block rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2"
                          >
                            {avatar}
                          </Link>
                        ) : avatar;
                      })()}
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
              );
            })()}
          </TalFelt>
          <TalFelt slags="opslag" etiket={KORT_OVERSKRIFT} tilstand={iDag.opslag.felt} />
          <TalFelt slags="betaling" etiket={VENTER_OVERSKRIFT} tilstand={iDag.venter.felt} />
        </div>
        {/* DRIFTEN (9/9, lib/cronVagt): vagten i databasen dømmer hver time —
            vault, cron-svarene, mailkøen — og skriver til cron_vagt_log. Her
            står kun én linje: grøn er ink-soft, rød er rust med hvad der er
            galt og siden hvornår. 9/9 fik alle ni jobs 401 i 17 timer uden
            at nogen så det; denne linje er dét der skal ses. */}
        {vagtQuery.isLoading ? null : vagtQuery.isError ? (
          <p className="mt-4">Driften: vagten kunne ikke hentes lige nu.</p>
        ) : (() => {
          const v = vagtLinje(vagtQuery.data ?? [], new Date());
          // KUN når rød (17/9, PR 2): grøn drift er ingen nyhed og får ingen
          // plads i «I dag»; klokkens drift-notifikation lander på «/», hvor
          // den røde linje står. Fejl siges stadig.
          return v.tone === "rust" ? <p className="mt-4 rounded-hb border border-hb-rust/40 bg-hb-rust/5 p-3 text-hb-rust">{v.tekst}</p> : null;
        })()}
        {/* FEJLENE — aldrig et 0 der ligner «alt i orden»: feltet siger «Kunne
            ikke hentes», og linjen her siger HVAD (husets rådgivertekst). */}
        {iDag.fejl.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs" data-i-dag-fejl={iDag.fejl.length}>
            {iDag.fejl.map((f) => <li key={f.noegle}>{f.tekst}</li>)}
          </ul>
        )}
        {/* SESSIONER I DAG (17/9, PR 2; lib/hjemmebane/dagensSessioner):
            «10:00 Floren Engros · Morten» → virksomhedssiden. */}
        {iDag.sessionerIDag.liste && iDag.sessionerIDag.liste.length > 0 && (
          <div className="mt-5 border-t border-hb-line pt-4">
            <p className={MIKRO}>{SESSIONER_OVERSKRIFT}</p>
            <ul className="mt-2 space-y-1" data-sessioner-i-dag={iDag.sessionerIDag.liste.length}>
              {iDag.sessionerIDag.liste.map((s) => (
                <li key={s.id}>
                  {s.companyId ? (
                    <Link to={virksomhedsLink(s.companyId)} className={TEKSTLINK}>{sessionLinjeTekst(s)}</Link>
                  ) : (
                    sessionLinjeTekst(s)
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* UBESVAREDE OPSLAG (Jonas 16/9, valg B): medlemmers opslag fra de
            sidste 14 dage uden svar fra en rådgiver, et link til hvert. Højst
            fem; flere → «og N mere i fællesskabet». */}
        {iDag.opslag.dom && iDag.opslag.dom.ialt > 0 && (() => {
          const { viste, flere } = kortUdsnit(iDag.opslag.dom.liste);
          return (
            <div className="mt-5 border-t border-hb-line pt-4">
              <p className={MIKRO}>{KORT_OVERSKRIFT}</p>
              <ul className="mt-2 space-y-1" data-ubesvarede-opslag={iDag.opslag.dom.ialt}>
                {viste.map((t) => (
                  <li key={t.id}>
                    <Link to={traadSti(t.id)} className="text-hb-evergreen underline-offset-4 hover:underline">
                      {linjeTekst(t)}
                    </Link>
                    <span className="text-hb-ink-soft"> · {alderTekst(t.created_at, iDag.nu)}</span>
                    {t.kilde_type === KILDE_PRAESENTATION && <HbTag className="ml-2">{KILDE_PRAESENTATION_LABEL}</HbTag>}
                  </li>
                ))}
                {flere > 0 && (
                  <li>
                    <Link to="/community" className="text-hb-evergreen underline-offset-4 hover:underline">{flereTekst(flere)}</Link>
                  </li>
                )}
              </ul>
            </div>
          );
        })()}
        {/* VENTER PÅ BETALING (19/9, recon-indgangspaamindelser §5): hvem har
            skrevet under og ikke betalt — med hvor længe, og hvad vi har sendt
            dem. Rust på de to hvor nogen skal gøre noget nu (prisen mangler,
            fristen er passeret). Højst fem; flere → «og N mere i indgangen». */}
        {iDag.venter.dom && iDag.venter.dom.ialt > 0 && (() => {
          const { viste, flere } = venterUdsnit(iDag.venter.dom.liste);
          return (
            <div className="mt-5 border-t border-hb-line pt-4">
              <p className={MIKRO}>{VENTER_OVERSKRIFT}</p>
              <ul className="mt-2 space-y-1" data-venter-paa-betaling={iDag.venter.dom.ialt}>
                {viste.map((l) => (
                  <li key={l.companyId}>
                    <Link to={virksomhedsSti(l.companyId)} className={cn(TEKSTLINK, l.haster && "text-hb-rust")}>
                      {l.navn}
                    </Link>
                    <span className="text-hb-ink-soft"> · {l.tekst}</span>
                  </li>
                ))}
                {flere > 0 && (
                  <li>
                    <Link to={VIRKSOMHEDER_STI} className={TEKSTLINK}>{venterFlereTekst(flere)}</Link>
                  </li>
                )}
              </ul>
            </div>
          );
        })()}
        {/* MANGLER AT BOOKE (Jonas 29/9): to foldbare rækker — Morten- og
            Jonas-session — med tallet i et mærke og navnene bag klikket
            (ManglerAtBooke.tsx). Sidst i «I dag»: dagens arbejde, ikke det
            første man skal se. Dommen er motorens manglerAtBooke. */}
        <div className="mt-5 border-t border-hb-line pt-4">
        <ManglerAtBooke hentning={overblikQuery} virksomhedsLink={virksomhedsLink} linkKlasse={TEKSTLINK} />
        </div>
        {/* KVARTALSTJEK (skive 3, 2/10 — Jonas 1/10: «rådgiverne skal have som en linje på
            forsiden»): «N kvartalstjek venter hos medlemmerne», foldbar med
            virksomhederne (KvartalstjekVenter.tsx). Tjekket sker hos medlemmet. */}
        <div className="mt-5 border-t border-hb-line pt-4">
        <KvartalstjekVenter hentning={kvartalstjekQuery} virksomhedsLink={virksomhedsLink} linkKlasse={TEKSTLINK} />
        </div>
        </div>
        </aside>

        {/* ── Venstre, række 2: Jeres liste (Jonas 8/9): UNDER DOMMEN, med
            skrivefeltet synligt — dommen er stadig det første man læser, og
            listen er det man skriver i, når man kommer fra en chat. Samme
            komponent som /opgaver, i forsidens udgave. */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-2" data-forside-felt="liste">
          <OpgavelisteView paaForsiden />
        </div>

        {/* ── Højre, række 2: «UGEN» og «MÅNEDEN» — det der orienterer ──
            Tre kort (30/9): Svartids-uret, Ugen, Måneden. */}
        <aside className="mt-10 min-w-0 space-y-4 text-sm text-hb-ink-soft lg:col-start-2 lg:row-start-2 lg:mt-12" data-forside-felt="ugen-maaneden">
        {/* SVARTIDS-URET (30/9, lib/svartid): teamets median svartid 7 dage i
            hverdagstimer med farve og trend, 7 og 30 dage i en lille tabel,
            ældste ubesvarede med knap til chatten og «Intet venter»-pillen.
            Fælles teamtal, aldrig en rangliste. Øverst i Ugen/Måneden: det
            orienterer, det er ikke dagens arbejde. */}
        <SvartidsUret hentning={svartidQuery} />
        <div className={KORT} data-ugen-kort>
        <p className={cn(EYEBROW, "mb-3")}>Ugen</p>
        {/* SIDEN SIDST (Jonas 8/9, lib/sidenSidst + hooks/sidenSidst): hvad der
            har flyttet sig siden du sidst åbnede — pr. rådgiver, syv dages
            loft. Tom tilstand er ÉN rolig linje. */}
        <p className={MIKRO}>
          Siden sidst{sidenSidstQuery.data ? ` · ${sidenTekst(sidenSidstQuery.data.siden, new Date())}` : ""}
        </p>
        {sidenSidstQuery.isLoading ? (
          <div aria-hidden className="pt-2"><div className="h-3 w-2/3 animate-pulse rounded bg-hb-line/60" /></div>
        ) : sidenSidstQuery.isError ? (
          <p className="pt-2 text-xs">Kunne ikke hente hvad der er sket siden sidst.</p>
        ) : sidenSidstQuery.data ? (
          (() => {
            const linjer = sidenSidstLinjeDele(sidenSidstQuery.data.raekker);
            return linjer.length > 0 ? (
              <ul className="mt-2 divide-y divide-hb-line/70">
                {linjer.map((l) => (
                  <li key={l.slags} className="py-1.5 first:pt-0 last:pb-0">
                    <span className="text-hb-ink">{l.hoved}</span>
                    {l.viste.length > 0 && " · "}
                    {l.viste.map((v, i) => (
                      <Fragment key={`${v.id ?? "navn"}:${v.navn}:${i}`}>
                        {sidenSidstNavneSep(i, l.viste.length, l.efter !== "")}
                        {v.id ? (
                          <Link to={virksomhedsLink(v.id)} className={TEKSTLINK}>{v.navn}</Link>
                        ) : (
                          v.navn
                        )}
                      </Fragment>
                    ))}
                    {l.efter && ` og ${l.efter}`}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pt-2">{intetNytTekst(sidenSidstQuery.data.siden, new Date())}</p>
            );
          })()
        ) : null}
        </div>
        <div className={KORT} data-maaneden-kort>
        <p className={cn(EYEBROW, "mb-3")}>Måneden</p>
        {/* PULSEN (Jonas 8/9, lib/pulsen): porteføljens tal som to
            fremdriftsbjælker (rapporteret, svaret på forslag — X af Y) og
            mærker (tavse med fordelingen, fornyelser). Tallene er MOTORERNES
            (afgoerPulsen), linkene pulsLinjers; pulsVisning sætter dem kun
            op. Rust kun på de tavse, som før. */}
        <p className={MIKRO}>Pulsen</p>
        {(() => {
          const { bjaelker, maerker } = pulsVisning(data.pulsen);
          return (
            <div className="mt-2 space-y-3" data-pulsen>
              {bjaelker.map((b) => (
                <Fremdrift key={b.noegle} noegle={b.noegle} etiket={b.etiket} x={b.x} y={b.y} to={b.to} linkKlasse={TEKSTLINK} />
              ))}
              <div className="flex flex-wrap gap-1.5" data-puls-maerker>
                {maerker.map((m) => (
                  <Maerke key={m.noegle} tekst={m.tekst} to={m.to} advarsel={m.advarsel} linkKlasse="underline-offset-4 hover:underline" />
                ))}
              </div>
            </div>
          );
        })()}
        {/* NYE MEDLEMMER (Jonas 16/9, lib/hjemmebane/kohorte + hooks/kohorte):
            «N af M kom igen efter dag 1» — nu som bjælke — med navnene på dem
            der ikke er kommet igen (højst fem) som links. Startet i dag
            tælles ikke i M, men siges. Intet tal før hentningen er klar; fejl
            siges med husets hentefejltekst — aldrig «Ingen nye medlemmer». */}
        <div className="mt-5 border-t border-hb-line pt-4">
        <p className={MIKRO}>{KOHORTE_OVERSKRIFT}</p>
        {kohorteQuery.isLoading ? (
          <div aria-hidden className="pt-2"><div className="h-3 w-2/3 animate-pulse rounded bg-hb-line/60" /></div>
        ) : kohorteQuery.isError ? (
          <p className="pt-2 text-xs">{raadgiverHentefejlTekst(kohorteQuery.error, "forsiden")}</p>
        ) : kohorteQuery.data ? (
          (() => {
            const linje = kohorteLinje({ ...kohorteQuery.data, nu: new Date() });
            const idag = startetIDagTekst(linje.udeladtIDag);
            const ikke = ikkeKommetIgenDele(linje.ikkeKommetIgenVirksomheder);
            return (
              <div className="mt-2 space-y-2" data-kohorte-m={linje.m} data-kohorte-n={linje.n}>
                {linje.m > 0 ? (
                  <Fremdrift noegle="kohorte" etiket={KOHORTE_BJAELKE_ETIKET} x={linje.n} y={linje.m} to={null} linkKlasse={TEKSTLINK} />
                ) : (
                  <p>{kohorteTekst(linje)}</p>
                )}
                {idag && <p className="text-xs">{idag}</p>}
                {ikke && (
                  <p className="text-xs leading-relaxed">
                    {IKKE_KOMMET_IGEN_PRAEFIKS}
                    {ikke.viste.map((v, i) => (
                      <Fragment key={v.id}>
                        {i > 0 && ", "}
                        <Link to={virksomhedsLink(v.id)} className={TEKSTLINK}>{v.navn}</Link>
                      </Fragment>
                    ))}
                    {ikkeKommetIgenHale(ikke.flere)}
                  </p>
                )}
              </div>
            );
          })()
        ) : null}
        </div>
        </div>
        </aside>
      </div>
    </div>
  );
};
