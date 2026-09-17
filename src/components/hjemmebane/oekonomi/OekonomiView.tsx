import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbSection } from "@/components/hjemmebane/HbSection";
import { useOekonomiOverblik } from "@/hooks/oekonomiOverblik";
import { kr } from "@/lib/oekonomi/omsaetning";
import {
  anerkendtModMrrTekst,
  dashboardDom,
  datoKort,
  FORVENTET_FORNYELSE_KOMMER,
  krMedFortegn,
  kundevaerdiTekst,
  kurveKoordinater,
  maanedsLabel,
  maanedsNavn,
  OEKONOMI_EYEBROW,
  OEKONOMI_FEJL_TEKST,
  OEKONOMI_MOMS_LINJE,
  OEKONOMI_TITEL,
  pct,
  RADAR_DAGE,
  RADAR_UKENDT_TEKST,
  UDESTAAENDE_LINJE,
  type BroMaaned,
  type DashboardDom,
  type KurvePunkt,
  type RadarBeslutning,
} from "@/lib/oekonomi/dashboard";

/**
 * /oekonomi — økonomioverblikket for partnerne (Ø3, 18/9-2026).
 *
 * JONAS 17/9 (ordret): «Jeg vil gerne vi får et super fedt dashboard direkte
 * på platformen, så vi har det fulde overblik over vores forretning. … Vi
 * elsker tal og data. Så tænk ud af boksen.»
 *
 * ÉN KILDE: useOekonomiOverblik (RPC'en hent_oekonomi_overblik, partner-
 * gated). Intet andet hentes her — ingen from("kontrakter"), ingen egen
 * Supabase. ÉN DOM: dashboardDom (lib/oekonomi/dashboard.ts) — fladen
 * regner intet selv; alle tal, koordinater og ord er dommens.
 *
 * FORMEN (docs/hjemmebane-designsprog.md): HbSection-rytme, Fraunces til
 * de store tal («Din måned»s typografi: font-editorial, font-medium,
 * leading-none; negative i rust), rammeløse rækker med hairline, fold-ud
 * frem for navigation (broens navne), sparkline-mønstret til kurven
 * (viewBox 0 0 100 H, preserveAspectRatio none, vectorEffect
 * non-scaling-stroke). «ekskl. moms» står ÉT sted: linjen under titlen.
 */

const nul = (n: number) => n === 0;

const StortTal = ({ label, oere, linje, negativErRust = true, testId, fold }: { label: string; oere: number; linje?: string; negativErRust?: boolean; testId: string; fold?: ReactNode }) => (
  <HbCard className="p-5 md:p-6" data-noegletal={testId}>
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
    <p className={cn("mt-2 font-editorial text-3xl font-medium leading-none md:text-4xl", negativErRust && oere < 0 ? "text-hb-rust" : "text-hb-ink")}>
      {kr(oere)}
    </p>
    {linje && <p className="mt-2 text-xs text-hb-ink-soft">{linje}</p>}
    {fold}
  </HbCard>
);

/** Ø3c: forklaringen under «Anerkendt denne måned» — én linje, foldbar med navne og beløb; intet når forskellen er 0. */
const AnerkendtModMrr = ({ dom }: { dom: Extract<DashboardDom, { tom: false }> }) => {
  const f = dom.anerkendtModMrr;
  if (f.forskel_oere === 0) return null;
  const post = (p: { company_id: string; navn: string; oere: number; dag: string }, fortegn: 1 | -1, ord: string) => (
    <li key={p.company_id} className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 text-hb-ink">{p.navn} <span className="text-hb-ink-soft">· {ord} {datoKort(p.dag)}</span></span>
      <span className="shrink-0 tabular-nums">{krMedFortegn(fortegn * p.oere)}</span>
    </li>
  );
  return (
    <details className="mt-2 text-xs text-hb-ink-soft" data-anerkendt-mod-mrr={f.forskel_oere}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="text-hb-evergreen underline-offset-4 hover:underline">{anerkendtModMrrTekst(f)}</span>
      </summary>
      <ul className="mt-2 space-y-1">
        {f.stoppede.map((p) => post(p, 1, "til"))}
        {f.startede.map((p) => post(p, -1, "fra"))}
        {f.rest_oere !== 0 && (
          <li className="flex items-baseline justify-between gap-3">
            <span>afrunding eller prisskift midt i måneden</span>
            <span className="tabular-nums">{krMedFortegn(f.rest_oere)}</span>
          </li>
        )}
        <li className="flex items-baseline justify-between gap-3 border-t border-hb-line pt-1 text-hb-ink">
          <span>anerkendt {kr(f.anerkendt_oere)} − MRR {kr(f.mrr_oere)}</span>
          <span className="tabular-nums">{krMedFortegn(f.forskel_oere)}</span>
        </li>
      </ul>
    </details>
  );
};

const Noegletal = ({ dom }: { dom: Extract<DashboardDom, { tom: false }> }) => {
  const n = dom.noegletal;
  const maaned = maanedsNavn(dom.nuKey);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4" data-oekonomi-noegletal>
      <StortTal testId="mrr" label="MRR" oere={n.mrr_oere} linje={`${n.aktive} betalende${n.gratis_aktive ? ` + ${n.gratis_aktive} gratis` : ""} · ultimo ${maaned}`} />
      <StortTal testId="arr" label="ARR" oere={n.arr_oere} linje="12 × MRR" />
      <StortTal testId="anerkendt" label="Anerkendt denne måned" oere={n.anerkendt_oere} linje={`periodiseret · ${maaned}`} fold={<AnerkendtModMrr dom={dom} />} />
      <StortTal testId="kontant" label="Kontant indgået denne måned" oere={n.kontant_oere} linje="betalinger med dato i måneden" />
      <StortTal testId="kontraheret" label="Kontraheret de næste 12 mdr." oere={n.kontraheret_12_oere} linje="kun det der er kontrakt på" />
      <StortTal testId="forudbetalt" label="Forudbetalt, ikke tjent" oere={n.forudbetalt_oere} linje="betalt forud for perioden" />
      {/* Ø3b: forfaldne betalinger der ikke er kommet (dashboard.ts del 7) — ikke motorens timing-tal. */}
      <StortTal testId="udestaaende" label="Udestående" oere={n.udestaaende_oere} linje={UDESTAAENDE_LINJE} />
    </div>
  );
};

/** Kurven (Ø3d): MRR ultimo som hovedlinje (Mondays tal), anerkendt som anden linje; efter i dag stiplet.
    Skala i venstre side (top, midt, 0), MRR-tallet ved den fulde linjes ende, «uden nye fornyelser» ved den
    stiplede linjes ende, en lodret streg ved i dag — og kontanten som EGEN lille kurve nedenunder med egen top.
    Alt er regnet i dommen (kurveKoordinater); her tegnes kun. Etiketterne står i SVG'en (viewBox-mønstret fra Ø3),
    ordene og tallene omkring den som HTML i husets typografi, placeret efter dommens x/y. */
const Kurve = ({ kurve }: { kurve: KurvePunkt[] }) => {
  const ko = kurveKoordinater(kurve);
  if (ko.mrr.length + ko.mrr_kontraheret.length < 2) return null;
  const B = 100, H = 40, TOP = 3, BUND = 6;
  const yPx = (y: number) => (TOP + y * (H - TOP - BUND)).toFixed(2);
  const yPct = (y: number) => (((TOP + y * (H - TOP - BUND)) / H) * 100).toFixed(2);
  const pts = (p: { x: number; y: number }[]) => p.map((q) => `${(q.x * B).toFixed(2)},${yPx(q.y)}`).join(" ");
  const KB = 100, KH = 12;
  return (
    <div data-oekonomi-kurve={kurve.length} className="grid grid-cols-[3.25rem_1fr] gap-x-2">
      {/* Skalaen — tre niveauer i husets typografi, ud for linjernes y */}
      <div className="relative h-44 md:h-56 text-[11px] tabular-nums text-hb-ink-soft" data-kurve-skala>
        {ko.skala.map((s) => (
          <span key={s.oere} className="absolute right-0 -translate-y-1/2" style={{ top: `${yPct(s.y)}%` }}>{kr(s.oere)}</span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="h-44 w-full md:h-56" aria-hidden>
          {ko.skala.map((s) => (
            <line key={s.oere} x1="0" x2={B} y1={yPx(s.y)} y2={yPx(s.y)} stroke="hsl(var(--hb-line))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {ko.idag && (
            <line x1={(ko.idag.x * B).toFixed(2)} x2={(ko.idag.x * B).toFixed(2)} y1={TOP} y2={H - BUND} stroke="hsl(var(--hb-ink-soft))" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" data-kurve-idag />
          )}
          <polyline points={pts(ko.tjent)} fill="none" stroke="hsl(var(--hb-ink-soft))" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" data-kurve-tjent />
          <polyline points={pts(ko.kontraheret)} fill="none" stroke="hsl(var(--hb-ink-soft))" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" data-kurve-kontraheret />
          <polyline points={pts(ko.mrr)} fill="none" stroke="hsl(var(--hb-evergreen))" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" data-kurve-mrr />
          <polyline points={pts(ko.mrr_kontraheret)} fill="none" stroke="hsl(var(--hb-evergreen))" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" data-kurve-mrr-kontraheret />
          {ko.akse.map((a) => (
            <text key={a.label} x={(a.x * B).toFixed(2)} y={H - 1} fontSize="2.6" textAnchor={a.anker} fill="hsl(var(--hb-ink-soft))" style={{ fontFamily: "inherit" }}>{a.label}</text>
          ))}
        </svg>
        {/* Ordene omkring linjerne — HTML, så de ikke strækkes med SVG'en */}
        {ko.idag && (
          <span className="pointer-events-none absolute top-0 ml-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft" style={{ left: `${(ko.idag.x * 100).toFixed(2)}%` }} data-kurve-idag-tekst>{ko.idag.label}</span>
        )}
        {/* MRR-tallet står OVER den fulde linjes sidste punkt, højrestillet mod i dag-stregen — så det hverken ligger på den stiplede linje eller på «herefter kun kontrakt» */}
        {ko.ende.mrr && (
          <span className="pointer-events-none absolute -translate-x-full -translate-y-full pb-1 pr-1.5 font-editorial text-sm font-medium leading-none text-hb-evergreen" style={{ left: `${(ko.ende.mrr.x * 100).toFixed(2)}%`, top: `${yPct(ko.ende.mrr.y)}%` }} data-kurve-mrr-ende>{kr(ko.ende.mrr.oere)}</span>
        )}
        {/* «uden nye fornyelser» står OVER den stiplede linjes ende (den falder mod nul), fri af aksens «sep 27» */}
        {ko.ende.kontraheret && (
          <span className="pointer-events-none absolute right-0 -translate-y-full pb-2 text-[11px] text-hb-ink-soft" style={{ top: `${yPct(ko.ende.kontraheret.y)}%` }} data-kurve-uden-fornyelser>{ko.ende.kontraheret.label}</span>
        )}
      </div>
      <div />
      <div className="relative mt-1 h-4 text-[11px] tabular-nums text-hb-ink-soft" data-kurve-betalende>
        {ko.akse.map((a) => (
          <span key={a.label} className={cn("absolute", a.anker === "middle" && "-translate-x-1/2", a.anker === "end" && "-translate-x-full")} style={{ left: `${(a.x * 100).toFixed(2)}%` }} title={`${a.betalende} betalende ultimo ${a.label}`}>{a.betalende}</span>
        ))}
      </div>
      {/* Kontanten — egen lille kurve med egen top; en årsbetaling er ikke MRR */}
      <div className="relative mt-8 h-12 text-[11px] tabular-nums text-hb-ink-soft" data-kurve-kontant-skala>
        <span className="absolute right-0 top-0 -translate-y-1/2">{kr(ko.kontant_max_oere)}</span>
        <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
      </div>
      <div className="relative mt-8">
        <p className="absolute -top-5 left-0 text-[10px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Kontant indgået · top {kr(ko.kontant_max_oere)}</p>
        <svg viewBox={`0 0 ${KB} ${KH}`} preserveAspectRatio="none" className="h-12 w-full" aria-hidden data-kurve-kontant>
          <line x1="0" x2={KB} y1={KH} y2={KH} stroke="hsl(var(--hb-line))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {ko.soejler.map((s, i) => (
            <rect key={i} x={(s.x * KB).toFixed(2)} y={((1 - s.hoejde) * KH).toFixed(2)} width={(s.bredde * KB).toFixed(2)} height={(s.hoejde * KH).toFixed(2)} fill="hsl(var(--hb-sage))" />
          ))}
        </svg>
      </div>
      <div />
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-hb-ink-soft">
        <span><span className="mr-1.5 inline-block h-0.5 w-5 bg-hb-evergreen align-middle" />MRR ultimo (Mondays «periodiseret»)</span>
        <span><span className="mr-1.5 inline-block h-px w-5 bg-hb-ink-soft align-middle" />anerkendt pr. måned</span>
        <span><span className="mr-1.5 inline-block h-0.5 w-5 border-t border-dashed border-hb-evergreen align-middle" />kontraheret (efter i dag)</span>
        <span><span className="mr-1.5 inline-block h-3 w-3 bg-hb-sage align-middle" />kontant (egen skala)</span>
        <span>tallene under aksen: betalende ultimo</span>
      </div>
    </div>
  );
};

const BroRaekke = ({ m }: { m: BroMaaned }) => {
  const [aaben, setAaben] = useState(false);
  const harPoster = m.poster.length > 0;
  return (
    <li className="border-t border-hb-line py-3 last:border-b" data-bro-maaned={m.key}>
      <div className="grid grid-cols-[5rem_1fr] items-baseline gap-3 md:grid-cols-[6rem_repeat(6,minmax(0,1fr))_2rem]">
        <span className="text-sm font-medium text-hb-ink">{maanedsLabel(m.key)}</span>
        <div className="grid grid-cols-3 gap-2 text-right text-sm tabular-nums md:contents">
          <Tal label="start" v={m.start_oere} />
          <Tal label="+ ny" v={m.ny_oere} plus />
          <Tal label="+ fornyet op" v={m.fornyet_op_oere} plus />
          <Tal label="− fornyet ned" v={m.fornyet_ned_oere} plus />
          <Tal label="− tabt" v={m.tabt_oere} plus />
          <Tal label="slut" v={m.slut_oere} staerk />
        </div>
        {harPoster ? (
          <button type="button" onClick={() => setAaben((a) => !a)} aria-expanded={aaben} className="justify-self-end text-hb-ink-soft hover:text-hb-ink" aria-label={`${aaben ? "Skjul" : "Vis"} virksomhederne bag ${maanedsLabel(m.key)}`}>
            {aaben ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        ) : <span />}
      </div>
      {aaben && harPoster && (
        <ul className="mt-2 space-y-1 pl-0 text-sm md:pl-[6.75rem]" data-bro-navne>
          {m.poster.map((p, i) => (
            <li key={`${p.company_id}-${p.slags}-${i}`} className="flex items-baseline justify-between gap-4">
              <span className="text-hb-ink">{p.navn} <span className="text-hb-ink-soft">· {broOrd(p.slags)}</span></span>
              <span className={cn("tabular-nums", p.oere < 0 ? "text-hb-rust" : "text-hb-ink")}>{krMedFortegn(p.oere)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

const broOrd = (s: BroMaaned["poster"][number]["slags"]) =>
  s === "ny" ? "ny" : s === "fornyet_op" ? "fornyet op" : s === "fornyet_ned" ? "fornyet ned" : s === "fornyet_uaendret" ? "fornyet" : s === "tabt" ? "tabt" : "gratis";

const Tal = ({ label, v, plus, staerk }: { label: string; v: number; plus?: boolean; staerk?: boolean }) => (
  <span className={cn("block", staerk ? "font-medium text-hb-ink" : nul(v) ? "text-hb-ink-soft/60" : v < 0 ? "text-hb-rust" : "text-hb-ink")}>
    <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft md:hidden">{label}</span>
    {plus ? krMedFortegn(v) : kr(v)}
  </span>
);

const beslutningOrd = (b: RadarBeslutning, ukendtTekst: string) =>
  b === "tilbyd" ? "tilbyd fornyelse" : b === "tilbyd_ikke" ? "tilbyd ikke" : b === "fornyet" ? "fornyet — nyt kontraktår skrevet" : b === "ingen" ? "ingen beslutning endnu" : ukendtTekst;

const Radar = ({ dom }: { dom: Extract<DashboardDom, { tom: false }> }) => {
  const r = dom.radar;
  return (
    <div data-oekonomi-radar={r.raekker.length}>
      <p className="text-sm text-hb-ink-soft">
        Omsætning i spil: <span className="font-medium text-hb-ink">{kr(r.i_spil_oere)}</span> — kontraktår der udløber inden {RADAR_DAGE} dage uden et nyt.
        {r.ukendt && <> {RADAR_UKENDT_TEKST}.</>}
      </p>
      {r.raekker.length === 0 ? (
        <p className="mt-3 text-sm text-hb-ink-soft">Ingen kontraktår udløber de næste {RADAR_DAGE} dage.</p>
      ) : (
        <ul className="mt-3">
          {r.raekker.map((x) => (
            <li key={x.kontrakt_id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-hb-line py-3 last:border-b md:grid-cols-[1fr_7rem_6rem_6rem_14rem]" data-radar-raekke={x.company_id}>
              <span className="text-[15px] font-medium leading-snug text-hb-ink">{x.navn}</span>
              <span className="text-right text-sm tabular-nums text-hb-ink md:text-left">{datoKort(x.periode_slut)} <span className="text-hb-ink-soft">· {x.dage} d.</span></span>
              <span className="text-sm tabular-nums text-hb-ink-soft md:text-right"><span className="md:hidden">pris </span>{kr(x.pris_oere)}</span>
              <span className="text-right text-sm tabular-nums text-hb-ink-soft"><span className="md:hidden">grundpris </span>{x.grundpris_oere != null ? kr(x.grundpris_oere) : "—"}</span>
              <span className={cn("col-span-2 text-sm md:col-span-1 md:text-right", x.beslutning === "tilbyd_ikke" ? "text-hb-rust" : "text-hb-ink-soft")}>{beslutningOrd(x.beslutning, RADAR_UKENDT_TEKST)}{x.note ? ` · ${x.note}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Prisudvikling = ({ dom }: { dom: Extract<DashboardDom, { tom: false }> }) => {
  const p = dom.prisudvikling;
  if (p.raekker.length === 0) return <p className="text-sm text-hb-ink-soft">Ingen virksomhed har to kontraktår endnu.</p>;
  return (
    <div data-oekonomi-prisudvikling={p.raekker.length}>
      <ul>
        <li className="hidden grid-cols-[1fr_8rem_8rem_8rem_8rem] gap-x-4 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft md:grid">
          <span>Virksomhed</span><span className="text-right">grundpris år 1 → 2</span><span className="text-right">Δ</span><span className="text-right">pris år 1 → 2</span><span className="text-right">Δ</span>
        </li>
        {p.raekker.map((r) => (
          <li key={r.company_id} className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-hb-line py-3 last:border-b md:grid-cols-[1fr_8rem_8rem_8rem_8rem]" data-pris-raekke={r.company_id}>
            <span className="col-span-2 text-[15px] font-medium leading-snug text-hb-ink md:col-span-1">{r.navn} <span className="text-sm font-normal text-hb-ink-soft">· {datoKort(r.aar1.periode_start)} → {datoKort(r.aar2.periode_slut)}</span></span>
            <span className="text-sm tabular-nums text-hb-ink-soft md:text-right"><span className="md:hidden">grundpris </span>{r.aar1.grundpris_oere != null ? kr(r.aar1.grundpris_oere) : "—"} → {r.aar2.grundpris_oere != null ? kr(r.aar2.grundpris_oere) : "—"}</span>
            <span className={cn("text-right text-sm tabular-nums", (r.delta_grundpris_oere ?? 0) < 0 ? "text-hb-rust" : "text-hb-ink")}>{r.delta_grundpris_oere != null ? krMedFortegn(r.delta_grundpris_oere) : "—"}</span>
            <span className="text-sm tabular-nums text-hb-ink md:text-right"><span className="md:hidden">pris </span>{kr(r.aar1.pris_oere)} → {kr(r.aar2.pris_oere)}</span>
            <span className={cn("text-right text-sm tabular-nums", r.delta_pris_oere < 0 ? "text-hb-rust" : "text-hb-ink")}>{krMedFortegn(r.delta_pris_oere)}</span>
          </li>
        ))}
        <li className="grid grid-cols-2 gap-x-4 gap-y-1 py-3 md:grid-cols-[1fr_8rem_8rem_8rem_8rem]" data-pris-samlet>
          <span className="col-span-2 text-sm font-medium text-hb-ink md:col-span-1">Samlet ({p.raekker.length} virksomheder)</span>
          <span className="text-sm tabular-nums text-hb-ink-soft md:text-right">{kr(p.samlet.grundpris_aar1)} → {kr(p.samlet.grundpris_aar2)}</span>
          <span className={cn("text-right text-sm tabular-nums", p.samlet.grundpris_aar2 - p.samlet.grundpris_aar1 < 0 ? "text-hb-rust" : "text-hb-ink")}>{krMedFortegn(p.samlet.grundpris_aar2 - p.samlet.grundpris_aar1)}</span>
          <span className="text-sm tabular-nums text-hb-ink md:text-right">{kr(p.samlet.pris_aar1)} → {kr(p.samlet.pris_aar2)}</span>
          <span className={cn("text-right text-sm tabular-nums", p.samlet.pris_aar2 - p.samlet.pris_aar1 < 0 ? "text-hb-rust" : "text-hb-ink")}>{krMedFortegn(p.samlet.pris_aar2 - p.samlet.pris_aar1)}</span>
        </li>
      </ul>
    </div>
  );
};

/** Ø3b: kundeværdien — de 10 største efter samlet betalt (Jonas 17/9: «De fem største er ikke relevante som de står nu»). */
const Kundevaerdi = ({ dom }: { dom: Extract<DashboardDom, { tom: false }> }) => {
  const k = dom.kundevaerdi;
  if (k.top.length === 0) return <p className="text-sm text-hb-ink-soft">Ingen betalinger endnu.</p>;
  return (
    <div data-oekonomi-kundevaerdi={k.top.length}>
      <ul>
        {k.top.map((r, i) => (
          <li key={r.company_id} className="border-t border-hb-line py-3 last:border-b" data-kundevaerdi-raekke={r.company_id}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="min-w-0 text-hb-ink">
                <span className="tabular-nums text-hb-ink-soft">{i + 1}.</span> <span className="font-medium">{r.navn}</span>
                <span className="text-hb-ink-soft"> · {r.kontraktaar} kontraktår · {r.status}</span>
              </span>
              <span className="shrink-0 tabular-nums text-hb-ink">{kr(r.betalt_oere)} <span className="text-hb-ink-soft">· {pct(r.andel)}</span></span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-hb-sage/60"><div className="h-1.5 rounded-full bg-hb-evergreen" style={{ width: `${Math.max(2, Math.round(r.andel * 100))}%` }} /></div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-hb-ink-soft" data-kundevaerdi-tekst>
        {kundevaerdiTekst(k)} <span className="text-hb-ink-soft">({kr(k.betalt_i_alt_oere)} fra {k.kunder} kunder)</span>
      </p>
    </div>
  );
};

const Udestaaende = ({ dom }: { dom: Extract<DashboardDom, { tom: false }> }) => {
  const u = dom.udestaaende;
  return (
    <div className="grid gap-8 md:grid-cols-2" data-oekonomi-udestaaende={u.raekker.length}>
      <div>
        {/* Ø3b: forfaldne betalinger der ikke er kommet — ikke «anerkendt, men ikke betalt» (timing på rater med fast trækdato). */}
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Forfaldent, ikke betalt · {kr(u.i_alt_oere)}</p>
        {u.raekker.length === 0 ? <p className="mt-2 text-sm text-hb-ink-soft">Ingen — alle forfaldne betalinger er kommet.</p> : (
          <ul className="mt-2">
            {u.raekker.map((r) => (
              <li key={r.company_id} className="flex items-baseline justify-between gap-4 border-t border-hb-line py-2.5 text-sm last:border-b" data-udest-raekke={r.company_id}>
                <span className="text-hb-ink">{r.navn} <span className="text-hb-ink-soft">· forfaldent {kr(r.forfaldent_oere)}, betalt {kr(r.betalt_oere)}</span></span>
                <span className="tabular-nums text-hb-rust">{kr(r.udestaaende_oere)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Fejlede træk · {kr(u.fejlede_i_alt_oere)}</p>
        {u.fejlede.length === 0 ? <p className="mt-2 text-sm text-hb-ink-soft">Ingen fejlede træk.</p> : (
          <ul className="mt-2">
            {u.fejlede.map((f, i) => (
              <li key={`${f.company_id}-${f.faktura_nummer ?? i}`} className="flex items-baseline justify-between gap-4 border-t border-hb-line py-2.5 text-sm last:border-b">
                <span className="text-hb-ink">{f.navn} <span className="text-hb-ink-soft">· {f.faktura_nummer ?? f.kilde ?? "træk"}</span></span>
                <span className="tabular-nums text-hb-rust">{kr(f.beloeb_eks_moms_oere)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const Skelet = () => (
  <div className="animate-pulse space-y-4" data-oekonomi="henter">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><div className="h-24 rounded-hb bg-hb-line/60" /><div className="h-24 rounded-hb bg-hb-line/60" /><div className="h-24 rounded-hb bg-hb-line/60" /><div className="h-24 rounded-hb bg-hb-line/60" /><div className="h-24 rounded-hb bg-hb-line/60" /><div className="h-24 rounded-hb bg-hb-line/60" /></div>
    <div className="h-44 rounded-hb bg-hb-line/60" />
  </div>
);

export const OekonomiView = ({ nu = new Date() }: { nu?: Date }) => {
  const query = useOekonomiOverblik();
  const dom = useMemo<DashboardDom | null>(() => (query.data ? dashboardDom(query.data, nu) : null), [query.data, nu]);
  const sektion = "mt-10 md:mt-12";
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 md:px-6" data-oekonomi-side>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{OEKONOMI_EYEBROW}</p>
      <h1 className="mt-2 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{OEKONOMI_TITEL}</h1>
      <p className="mt-2 text-sm text-hb-ink-soft">{OEKONOMI_MOMS_LINJE}{query.data?.hentet_at ? ` Hentet ${new Date(query.data.hentet_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.` : ""}</p>

      {query.isError ? (
        <p className="mt-8 text-sm text-hb-rust" data-oekonomi="fejl">{OEKONOMI_FEJL_TEKST}</p>
      ) : query.isPending || dom === null ? (
        <div className="mt-8"><Skelet /></div>
      ) : dom.tom === true ? (
        <p className="mt-8 text-sm text-hb-ink-soft" data-oekonomi="tom">{dom.tekst}</p>
      ) : (
        <>
          <div className="mt-8"><Noegletal dom={dom} /></div>

          <HbSection eyebrow="Omsætningskurven" title="MRR måned for måned" hairline className={sektion}>
            <p className="mb-4 text-sm text-hb-ink-soft">Fra maj 2025 til 12 måneder frem — MRR ultimo er Mondays «periodiseret omsætning». {FORVENTET_FORNYELSE_KOMMER}</p>
            <Kurve kurve={dom.kurve} />
          </HbSection>

          <HbSection eyebrow="MRR-broen" title="De seneste 12 måneder" hairline className={sektion}>
            <ul data-oekonomi-bro={dom.bro.length}>
              {dom.bro.map((m) => <BroRaekke key={m.key} m={m} />)}
            </ul>
          </HbSection>

          <HbSection eyebrow="Fornyelsesradaren" title={`Udløber inden ${RADAR_DAGE} dage`} hairline className={sektion}>
            <Radar dom={dom} />
          </HbSection>

          <HbSection eyebrow="Prisudvikling" title="År 1 → år 2" hairline className={sektion}>
            <Prisudvikling dom={dom} />
          </HbSection>

          <HbSection eyebrow="Kundeværdi" title="De 10 største kunder" hairline className={sektion}>
            <p className="mb-4 text-sm text-hb-ink-soft">Samlet betalt ekskl. moms siden første betaling — andel af alt, antal kontraktår og status.</p>
            <Kundevaerdi dom={dom} />
          </HbSection>

          <HbSection eyebrow="Udestående" title="Forfaldne betalinger der ikke er kommet" hairline className={sektion}>
            <Udestaaende dom={dom} />
          </HbSection>
        </>
      )}
    </div>
  );
};

export default OekonomiView;
