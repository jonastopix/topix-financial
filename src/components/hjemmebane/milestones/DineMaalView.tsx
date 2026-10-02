import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { supabase } from "@/integrations/supabase/client";
import { useDineMaalGrundlag, useDineMaalSkrivning } from "@/hooks/dineMaalGrundlag";
import { dineMaalDom, doemMaalFristModSkridt, lokalDatoStreng, TILFOEJ_SKRIDT_FEJL_TEKST, TILFOEJ_SKRIDT_OK_TEKST, type SkridtTilDineMaal } from "@/lib/hjemmebane/dineMaal";
import type { MaalRaekke } from "@/lib/hjemmebane/planen";
import { maalKort, skarptForslag, type MaalKort as MaalKortDom } from "@/lib/hjemmebane/maalTal";
import type { RetningNoegle } from "@/lib/hjemmebane/maalRetning";
import {
  AFVENTER_MIGRATION_TEKST,
  chipTone,
  DINE_MAAL_FEJL_TEKST,
  DINE_MAAL_OVERSKRIFT,
  eyebrowTekst,
  hovedLinje,
  KVARTALSTJEK_FEJLEDE_TEKST,
  PROEV_IGEN,
  REJSEN_ORD,
  statusChips,
  TALLENE_FEJLEDE_TEKST,
} from "@/lib/hjemmebane/dineMaalFlade";
import { HbAdvisorCompanyPrompt } from "../HbAdvisorCompanyPrompt";
import { HbSection } from "../HbSection";
import { HbCard } from "../HbCard";
import { HbStedsSaetning } from "../HbStedsSaetning";
import { HbMaalRaekke } from "./HbMaalRaekke";
import { HbMaalForklaring } from "./HbMaalForklaring";
import { useMilestones, type Milestone } from "./useMilestones";
import { SletMilestoneDialog } from "./MilestoneDialoger";
import { JeresRetning } from "./JeresRetning";
import { Chip, MaalKort, TomPladsKort } from "./MaalKort";
import { Rejsen } from "./Rejsen";
import { SaetMaalGuide, type GuideTilstand } from "./SaetMaalGuide";
import { RedigerMaalDialog } from "./RedigerMaalDialog";
import { BekraeftMaalKort, type BekraeftHandling, type KvartalHandling } from "./BekraeftMaalKort";
import { aktiverFelter, BEKRAEFT_ORD, KVARTAL_ORD, statusEfterKvartalValg, type Kvartal } from "@/lib/hjemmebane/maalBekraeft";

/**
 * «Dine mål» — /milestones (fladen 1/10-2026; designet Jonas sagde ja til kl.
 * 21:04, «Jeres retning» 22:37; docs/dine-maal-design.md §8). Afløser fase 3-siden
 * (16/9) — listen med skyder og blandet procent. Siden, oppefra:
 *   1. Hovedet: eyebrow «Dine mål · <måned år>», «Hvor I er på vej hen», «N mål
 *      for de næste 12 måneder · M plads ledig» og status-chips fra motoren.
 *   2. «Jeres retning» — de tre svar fra handoutet (JeresRetning).
 *   3. MÅLKORTENE (1–3, MaalKort) i et gitter + den stiplede plads (TomPladsKort).
 *   4. «Rejsen» — motorens 12-måneders tidslinje (Rejsen).
 *   Nået og parkeret står foldet nederst som før (HbMaalRaekke — Genåbn/Aktivér/Slet).
 *
 * MOTOREN REGNER ALT (lib/hjemmebane/maalTal gennem hooks/dineMaalGrundlag:
 * kort, tidslinje, retning, måneder); fladen tegner. Handlingernes dom er
 * stadig dineMaal.dineMaalDom (→ planen → milepaelDom): kanParkere, kanMarkere-
 * Naaet, kanSlette, kanTilfoejeSkridt — og skridt-linjerne under «N skridt mere».
 *
 * HVEM EJER MÅLENE — uændret (Jonas 16/9: «det er medlemmernes virksomheder»):
 * de gamle skriveveje genbruges ordret — useMilestones' markerNaaet, opdaterFelt
 * (parkér, aktivér, genåbn, redigér: titel/frist/tastet tal), slet; opgave-luk
 * («Gjort»), skridt-tilfoej («Tilføj skridt» og guidens trin 3). NYT er guiden
 * (SaetMaalGuide), som opretter og gør skarpt gennem dineMaalGrundlag's
 * opretMaalMedTal/goerMaalSkarpt (bogført klientskriver, maalSkriv.guard) og
 * gemmer retningen gennem gemRetning. Rådgiveren ser siden for en virksomhed
 * (companyId fra useAuth) og kan det samme som i dag.
 *
 * Ingen confirm(): slet bekræftes i siden (SletMilestoneDialog). Fejl og tomme
 * tilstande er rolige (kraevRaekker/HentningsFejl bag hooken; «Prøv igen»).
 *
 * Rådets fund (1/10 aften): (3) rådgiveren LÆSER retningen, retter den ikke
 * (gemRetning skriver på den indloggedes eget user_id — kanRette = !isAdvisor);
 * (6) retningen tegnes først, når dens egen hentning er færdig (retningHenter),
 * og en tom kladde gemmes aldrig oven på svar; (7) ved fejl i mål-hentningen
 * vises hverken hovedlinje eller chips; (12) et kort uden dom får ALLE
 * handlinger false (fail-closed); (13) «Redigér» holder sig åben, når
 * opdaterFelt svarer nej; (14) «Skrevet af en anden i virksomheden», når
 * retningens række ikke er den indloggedes; (16) `nu` er hookets tikkende ur —
 * guiden får ÅBNINGSTIDSPUNKTET, så dens nulstilling ikke tikker; (21) «Gør
 * målet skarpt» er låst, når den rå række mangler.
 *
 * SKIVE 3 (2/10-2026, Jonas' svar 1/10 kl. 22:04–22:09; maalBekraeft.ts):
 * ØVERST — før hovedet — står BekraeftMaalKort: nye forslag («Det er vores
 * mål» / «Ikke nu»), de gamle mål («Er det stadig jeres mål?» — Behold / Slip)
 * og kvartalstjekkene (Behold · Justér tal og dato · Parkér · Nået).
 * Skrivningerne er hookets (skriv.bekraeft/slip/markerNaaet/registrerKvartalstjek
 * — medlemmets klientvej, samme RLS); kvartalstjekkets «Nået» går gennem
 * hookets GUARDEDE markerNaaet (ok/grund — som forsiden; rådets fund 1:
 * useMilestones.markerNaaet svarer void og sluger fejlen, så rækken ville
 * blive skrevet efter en fejlet handling), og rækken registreres KUN efter ok;
 * målkortets «Markér som nået» går stadig gennem useMilestones (fejringen).
 * «Justér» åbner RedigerMaalDialog, og tjekket registreres som 'justeret'
 * FØRST når dialogen har gemt (kvartalEfterGem). Fejler kvartalstjek-
 * hentningen (kvartalstjekFejlede — ikke «tabellen mangler»), tegnes INTET
 * tjek (fund 6: uden de registrerede rækker ville et taget tjek vises igen),
 * og siden siger det med KVARTALSTJEK_FEJLEDE_TEKST.
 * «Aktivér» under Parkeret (fund 13) og «Genåbn» under Nået (runde 2, fund 3):
 * er målet ubekræftet, er klikket også bekræftelsen — aktiverFelter skriver
 * bekraeftet_at/bekraeftet_af med status. Kvartalstjekkets «Nået» fejrer som
 * målkortets (useMilestones.fejr — runde 2, fund 7), efter ok og før rækken;
 * før rækken dømmes doemKvartalstjek (= policyen), så grunden vises (fund 9).
 * «Justér» nulstilles ved luk uden gem (kvartalEfterGem → null i onClose), så
 * en senere «Redigér» aldrig registrerer et tjek, der ikke blev taget (fund 2).
 * Rådgiveren læser kortene (kanKlikke = !rawAdvisor — som retningen).
 * Kortene (g.kort) er KUN de bekræftede aktive mål; pladsen dømmes af
 * databasens tælling, og «Plads, når I har taget stilling» står, når de
 * ubekræftede fylder (dom.pladsOptagetAfUbekraeftede). Hovedlinjen tæller
 * databasens aktive: «N mål … · M venter på jeres ja · pladsen» (fund 3).
 *
 * Rådets runde 2: (2) «kan rette retningen» dømmes af den RÅ rådgiverrolle
 * (useAuth's isAdvisor, som HbMemberShell's hjerteslag) — ikke af «Se som
 * medlem»: gemRetning skriver på den indloggedes eget user_id, og i «Se som
 * medlem» er rådgiveren stadig rådgiver; (7) guidens frosne `nu` gives videre
 * til opret/goerSkarpt, så dommen ikke skifter ved midnat, mens guiden er åben.
 */

/** Fail-closed (fund 12): et kort, dommen ikke kender, kan intet. */
const INGEN_HANDLINGER = { kanMarkereNaaet: false, kanGenaabne: false, kanParkere: false, kanAktivere: false, kanSlette: false, kanSaetteFremdrift: false, kanTilfoejeSkridt: false } as const;
const GUIDE_NY: GuideTilstand = { art: "ny" };

/** useMilestones' række → planens form (deadline som «YYYY-MM-DD»). */
const tilMaalRaekke = (m: Milestone): MaalRaekke => ({
  id: m.id,
  title: m.title,
  status: m.dbStatus ?? "active",
  progress: m.progress,
  deadline: m.deadline ? m.deadline.toISOString().slice(0, 10) : null,
  category: m.category,
  source: m.source,
  progress_updated_at: m.progress_updated_at,
  completed_at: m.completed_at,
  created_at: m.created_at,
  // Skive 3: bekræftelsen følger med til dommen (undefined = kolonnen ikke læst).
  ...("bekraeftet_at" in m ? { bekraeftet_at: m.bekraeftet_at ?? null } : {}),
});

const fejlBesked = async (error: { message: string; context?: { json?: () => Promise<{ error?: string }> } }): Promise<string> => {
  let besked = error.message;
  try {
    const svar = await error.context?.json?.();
    if (svar?.error) besked = svar.error;
  } catch { /* behold error.message */ }
  return besked;
};

const fokus = "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2";

export const DineMaalView = () => {
  const { user, companyId, isAdvisor: rawAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const isAdvisor = rawAdvisor && !viewingAsMember;
  const queryClient = useQueryClient();

  // De gamle skriveveje (medlemmet ejer sine mål — RLS uændret).
  const { milestones, loading, markerNaaet, slet, opdaterFelt, genhent, fejr } = useMilestones({
    userId: user?.id ?? null,
    companyId: companyId ?? null,
    isAdvisor,
  });
  // Motoren: kort, tidslinje, retning og de målte måneder (til guiden).
  const g = useDineMaalGrundlag(companyId ?? undefined);
  const skriv = useDineMaalSkrivning({ companyId, efter: genhent });
  // Fund 16: hookets tikkende ur — ikke et Date frosset ved mount.
  const nu = g.nu;

  // «Gjort» på et skridt — opgave-luk (udfald done); fremdriften skrives af
  // functionen (rykMaalFremdrift), så begge kilder genhentes bagefter.
  const gjortMutation = useMutation({
    mutationFn: async (opgaveId: string) => {
      const { error } = await supabase.functions.invoke("opgave-luk", { body: { opgaveId, udfald: "done" } });
      if (error) throw new Error(await fejlBesked(error));
    },
    onSuccess: async () => {
      toast.success("Skridtet er gjort");
      await queryClient.invalidateQueries({ queryKey: ["dine-maal"] });
      await queryClient.invalidateQueries({ queryKey: ["boardroom"] });
      genhent();
    },
    onError: (e: Error) => toast.error("Skridtet blev ikke lukket", { description: e.message }),
  });

  // «Tilføj skridt» (skridt-tilfoej, 17/9) — kortets formular og guidens trin 3.
  const tilfoejMutation = useMutation({
    mutationFn: async (input: { maalId: string; titel: string; dueDate: string }) => {
      const { error } = await supabase.functions.invoke("skridt-tilfoej", { body: { companyId, ...input } });
      if (error) throw new Error(await fejlBesked(error));
    },
    onSuccess: async () => {
      toast.success(TILFOEJ_SKRIDT_OK_TEKST);
      await queryClient.invalidateQueries({ queryKey: ["dine-maal"] });
      await queryClient.invalidateQueries({ queryKey: ["boardroom"] });
      genhent();
    },
  });
  const tilfoejSkridt = async (maalId: string, titel: string, dueDate: string): Promise<string | null> => {
    try {
      await tilfoejMutation.mutateAsync({ maalId, titel, dueDate });
      return null;
    } catch (e) {
      const besked = e instanceof Error ? e.message : String(e);
      toast.error(TILFOEJ_SKRIDT_FEJL_TEKST, { description: besked });
      return besked;
    }
  };

  // Guiden bærer sit ÅBNINGSTIDSPUNKT (fund 16/20): dens nulstilling afhænger af `nu`, som derfor ikke må tikke, mens den er åben.
  const [guide, setGuide] = useState<{ tilstand: GuideTilstand; nu: Date } | null>(null);
  const [redigerId, setRedigerId] = useState<string | null>(null);
  // Skive 3: et kvartalstjek, hvis «Justér» åbnede redigeringen — registreres som 'justeret', når dialogen har gemt.
  const [kvartalEfterGem, setKvartalEfterGem] = useState<{ maalId: string; kvartal: Kvartal } | null>(null);
  const [sletId, setSletId] = useState<string | null>(null);
  const aabnGuide = (tilstand: GuideTilstand) => setGuide({ tilstand, nu: new Date() });
  // Runde 2, fund 7: guidens frosne åbningstidspunkt bærer også dommen i skriverne.
  const guideNu = guide?.nu ?? nu;

  // Handlingernes dom (uændret): dineMaalDom → planen → milepaelDom.
  const skridtTilDom = useMemo<SkridtTilDineMaal[]>(
    () => (g.grundlag?.skridt ?? []).map((s) => ({ id: s.id, title: s.title, status: s.status, due_date: s.due_date, maal_id: s.maal_id, closed_at: s.closed_at ?? null, source_type: s.source_type ?? null })),
    [g.grundlag?.skridt],
  );
  const dom = useMemo(() => dineMaalDom(milestones.map(tilMaalRaekke), skridtTilDom, nu), [milestones, skridtTilDom, nu]);
  const forMedlemAf = useMemo(() => new Map([...dom.aktive, ...dom.parkerede, ...dom.naaede].map((x) => [x.plan.maal.id, x])), [dom]);
  const msAf = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);
  const maalMedTalAf = useMemo(() => new Map((g.grundlag?.maal ?? []).map((m) => [m.id, m])), [g.grundlag?.maal]);

  const tilSletning: Milestone | null = milestones.find((m) => m.id === sletId) ?? null;
  // Redigér: de aktive kort står i g.kort; et parkeret/nået mål (rækkerne nederst) får sit kort af motoren på stedet.
  const tilRedigering: MaalKortDom | null = useMemo(() => {
    if (!redigerId) return null;
    const aktivt = g.kort.find((k) => k.id === redigerId);
    if (aktivt) return aktivt;
    const raa = maalMedTalAf.get(redigerId);
    return raa && g.grundlag ? maalKort(raa, g.grundlag.skridt, g.grundlag.maaneder, nu) : null;
  }, [redigerId, g.kort, g.grundlag, maalMedTalAf, nu]);

  const skridtUnder = (maalId: string) => skridtTilDom.filter((s) => s.maal_id === maalId);
  const maalFristGrund = (maalId: string, dato: string | null): string | null => {
    const d = doemMaalFristModSkridt(dato, skridtUnder(maalId));
    return d.ok === false ? d.grund : null;
  };
  /** Svarer med fejlteksten ordret, eller null ved ja (fund 13) — dialogen holder sig åben ved nej. */
  const opdaterMaalFelt = async (id: string, fields: Record<string, unknown>): Promise<string | null> => {
    if ("deadline" in fields) {
      const grund = maalFristGrund(id, fields.deadline ? lokalDatoStreng(fields.deadline as Date) : null);
      if (grund) { toast.error("Målets frist blev ikke ændret", { description: grund }); return grund; }
    }
    const svar = await opdaterFelt(id, fields);
    if (svar.ok === false) return svar.grund;
    await queryClient.invalidateQueries({ queryKey: ["dine-maal"] });
    return null;
  };
  // «Markér som nået» — useMilestones' skriver (status completed, fejringen) + motorens nøgler gøres forældede.
  const markerNaaetOgRyd = async (id: string) => {
    await markerNaaet(id);
    await queryClient.invalidateQueries({ queryKey: ["dine-maal"] });
  };
  const busy = gjortMutation.isPending || tilfoejMutation.isPending;

  // Skive 3 — bekræftelsen og kvartalstjekket (medlemmets klientvej; rådgiveren læser).
  const kanBekraefte = !rawAdvisor;
  const bekraeftHandling = async (maalId: string, handling: BekraeftHandling): Promise<string | null> => {
    if (!user || !companyId) return "Du er ikke logget ind";
    if (!kanBekraefte) return BEKRAEFT_ORD.kunMedlemmet;
    const s = handling === "bekraeft" ? await skriv.bekraeft({ maalId, userId: user.id, nu: new Date() }) : await skriv.slip({ maalId });
    if (s.ok === false) return s.grund;
    toast.success(handling === "bekraeft" ? BEKRAEFT_ORD.bekraeftet : BEKRAEFT_ORD.slippet);
    return null;
  };
  const registrerKvartal = async (maalId: string, kvartal: Kvartal, valg: KvartalHandling["valg"]): Promise<string | null> => {
    if (!user || !companyId) return "Du er ikke logget ind";
    // Runde 2, fund 9: klientens dom (= policyens) FØR INSERT'en, på målet som det står EFTER handlingen —
    // grunden («ikke forfaldent», «allerede besvaret» …) vises i stedet for en generisk fejl.
    const raa = maalMedTalAf.get(maalId);
    const s = await skriv.registrerKvartalstjek({
      maalId, companyId, userId: user.id, kvartal, valg,
      maal: raa ? { id: raa.id, status: statusEfterKvartalValg(raa.status, valg), bekraeftet_at: raa.bekraeftet_at } : null,
      tjek: g.grundlag?.kvartalstjek ?? [],
      nu: new Date(),
    });
    if (s.ok === false) return s.grund;
    toast.success(KVARTAL_ORD.registreret);
    return null;
  };
  const kvartalHandling = async (h: KvartalHandling): Promise<string | null> => {
    if (!kanBekraefte) return BEKRAEFT_ORD.kunMedlemmet;
    // Handlingen FØR rækken (filhovedet i dineMaalGrundlag.registrerKvartalstjek).
    if (h.valg === "parkeret") {
      const s = await skriv.slip({ maalId: h.maalId });
      if (s.ok === false) return s.grund;
    } else if (h.valg === "naaet") {
      // Fund 1: den GUARDEDE skriver (ok/grund, status 'active' → 'completed', nul rækker = fejl) — rækken kun efter ok.
      const s = await skriv.markerNaaet({ maalId: h.maalId });
      if (s.ok === false) return s.grund;
      // Runde 2, fund 7: SAMME fejring som målkortets «Markér som nået» (useMilestones.fejr) — efter ok, før rækken.
      fejr(msAf.get(h.maalId)?.title ?? maalMedTalAf.get(h.maalId)?.title ?? "");
    }
    return registrerKvartal(h.maalId, h.kvartal, h.valg);
  };
  const aabnJuster = (maalId: string, kvartal: Kvartal) => {
    setKvartalEfterGem({ maalId, kvartal });
    setRedigerId(maalId);
  };

  if (isAdvisor && !companyId) {
    return <HbAdvisorCompanyPrompt />;
  }

  const kort = g.kort;
  const chips = statusChips(kort);
  const henter = loading || g.isLoading;
  const tomPlads = !dom.overGraensen && dom.kanOprette;
  // Fund 3 + runde 2 fund 2: rådgiveren retter ikke retningen — heller ikke i «Se som medlem» (den RÅ rolle).
  const kanRetteRetning = !rawAdvisor;
  const retningSkrevetAfAnden = !!g.retning?.userId && !!user && g.retning.userId !== user.id;
  const gemRetning = async (svar: Record<RetningNoegle, string>): Promise<string | null> => {
    if (!user || !companyId) return "Du er ikke logget ind";
    if (!kanRetteRetning) return "Kun virksomheden kan skrive sin retning";
    const s = await skriv.gemRetning({ companyId, userId: user.id, svar });
    if (s.ok === false) return s.grund;
    toast.success("Jeres retning er gemt");
    return null;
  };

  const raekke = (x: (typeof dom.aktive)[number]) => {
    const ms = msAf.get(x.plan.maal.id);
    if (!ms) return null;
    return (
      <HbMaalRaekke
        key={ms.id}
        x={x}
        ms={ms}
        busy={busy}
        onAabn={() => setRedigerId(ms.id)}
        onFremgang={() => undefined}
        onNaaet={() => void markerNaaetOgRyd(ms.id)}
        // Genåbn/aktivér: status active — det fjerde aktive afvises af databasen (husets tekst via maalFejlTekst).
        // Fund 13 + runde 2 fund 3: BEGGE er et klik — et ubekræftet mål (et nået, ubekræftet mål fra før skive 3,
        // eller et parkeret forslag) bekræftes i samme skrivning (medlemmet; rådgiveren får kun status).
        onGenaabn={() => void opdaterMaalFelt(ms.id, aktiverFelter(ms, rawAdvisor ? null : (user?.id ?? null), new Date()))}
        onAktiver={() => void opdaterMaalFelt(ms.id, aktiverFelter(ms, rawAdvisor ? null : (user?.id ?? null), new Date()))}
        onParker={() => void opdaterMaalFelt(ms.id, { status: "parked" })}
        onSlet={() => setSletId(ms.id)}
        onSkridtGjort={(id) => gjortMutation.mutate(id)}
        onTilfoejSkridt={tilfoejSkridt}
      />
    );
  };

  return (
    <div data-dine-maal-aktive={kort.length} data-dine-maal-over-graensen={dom.overGraensen ? "1" : "0"} data-dine-maal-ubekraeftede={g.bekraeftelser.forslag.length + g.bekraeftelser.gamle.length}>
      {/* ── 0. Skive 3: forslag, gamle mål og kvartalstjek — kræver medlemmets klik, før alt andet ── */}
      {!henter && !g.isError && (
        <BekraeftMaalKort
          bekraeftelser={g.bekraeftelser}
          kvartalstjek={g.kvartalstjekFejlede ? [] : g.kvartalstjek}
          kanKlikke={kanBekraefte}
          onBekraeft={bekraeftHandling}
          onKvartal={kvartalHandling}
          onJuster={aabnJuster}
          className="mb-8"
        />
      )}

      {/* Fund 6: kvartalstjek-hentningen fejlede — ingen tjek tegnes (ovenfor), og det siges. */}
      {!henter && !g.isError && g.kvartalstjekFejlede && <p className="mb-6 text-sm text-hb-rust" data-kvartalstjek-fejlede>{KVARTALSTJEK_FEJLEDE_TEKST}</p>}

      {/* ── 1. Hovedet ── */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{eyebrowTekst(nu)}</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{DINE_MAAL_OVERSKRIFT}</h1>
        {/* Stedsætningen under h1 (rådets fund 7, 2/10): eyebrow → h1 → én sætning; hovedlinjen og chips under er status, ikke intro. */}
        <HbStedsSaetning sti="/milestones" className="mt-3" />
        {!henter && !g.isError && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className={cn("text-sm", dom.overGraensen ? "font-medium text-hb-rust" : "text-hb-ink-soft")} data-hoved-linje>{hovedLinje(kort.length, dom.ubekraeftede.length)}</p>
            {chips.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Status på målene">
                {chips.map((c) => (
                  <li key={c.status}>
                    <Chip tone={chipTone(c.status)} data-status-chip={c.status}>{c.tekst}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {dom.overGraensen && !henter && !g.isError && <p className="mt-1 text-sm text-hb-rust" data-graense-tekst>{dom.graenseTekst}</p>}
      </section>

      {/* ── 2. Jeres retning ── */}
      <div className="mt-8">
        <JeresRetning
          retning={g.retning}
          isLoading={(henter || g.retningHenter) && !g.retning}
          fejlede={g.retningFejlede}
          onGem={gemRetning}
          kanRette={kanRetteRetning}
          skrevetAfAnden={retningSkrevetAfAnden}
        />
      </div>

      {/* ── 3. Målene ── */}
      <HbSection eyebrow="Jeres mål" hairline className="mt-10">
        {g.isError ? (
          <HbCard className="p-5" data-dine-maal="fejl">
            <p className="text-sm text-hb-rust">
              {DINE_MAAL_FEJL_TEKST}{" "}
              <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ["dine-maal"] })} className={cn("underline-offset-4 hover:underline", fokus)}>{PROEV_IGEN}</button>
            </p>
          </HbCard>
        ) : henter ? (
          <div className="grid gap-4 md:grid-cols-3" aria-busy="true" data-dine-maal="henter">
            {[0, 1, 2].map((i) => (
              <HbCard key={i} className="min-h-[18rem] p-5 md:p-6">
                <div className="animate-pulse">
                  <div className="h-5 w-24 rounded-full bg-hb-line/70" />
                  <div className="mt-4 h-6 w-4/5 rounded bg-hb-line/70" />
                  <div className="mt-5 h-10 w-2/3 rounded bg-hb-line/70" />
                  <div className="mt-5 h-1.5 w-full rounded-full bg-hb-line" />
                  <div className="mt-8 h-4 w-1/2 rounded bg-hb-line/60" />
                </div>
              </HbCard>
            ))}
          </div>
        ) : (
          <>
            {g.afventerMigration && <p className="-mt-2 mb-3 text-sm text-hb-ink-soft" data-afventer-migration>{AFVENTER_MIGRATION_TEKST}</p>}
            {g.tallenFejlede && !g.afventerMigration && <p className="-mt-2 mb-3 text-sm text-hb-ink-soft" data-tallene-fejlede>{TALLENE_FEJLEDE_TEKST}</p>}
            {kort.length === 0 && (
              <div className="mb-5 max-w-2xl" data-dine-maal="tom">
                <HbMaalForklaring />
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-maal-gitter>
              {kort.map((k) => {
                const x = forMedlemAf.get(k.id);
                const handlinger = x?.handlinger ?? INGEN_HANDLINGER;
                const raa = maalMedTalAf.get(k.id);
                return (
                  <MaalKort
                    key={k.id}
                    kort={k}
                    handlinger={handlinger}
                    skridtLinjer={x?.skridtLinjer ?? []}
                    busy={busy}
                    onGjort={(id) => gjortMutation.mutate(id)}
                    onTilfoejSkridt={tilfoejSkridt}
                    onRediger={() => setRedigerId(k.id)}
                    onParker={() => void opdaterMaalFelt(k.id, { status: "parked" })}
                    onNaaet={() => void markerNaaetOgRyd(k.id)}
                    onSlet={() => setSletId(k.id)}
                    onGoerSkarpt={raa ? () => aabnGuide({ art: "skarpt", maalId: k.id, titel: k.titel, forslag: skarptForslag(raa), frist: k.frist }) : null}
                  />
                );
              })}
              {tomPlads && <TomPladsKort onSaetMaal={() => aabnGuide(GUIDE_NY)} />}
              {/* Skive 3: pladsen er optaget af ubekræftede mål (databasens tælling) — sig det, lov ingen plads. */}
              {!tomPlads && dom.pladsOptagetAfUbekraeftede && (
                <div className="flex min-h-[14rem] items-center rounded-hb border border-dashed border-hb-ink/25 p-5 md:p-6" data-maal-plads-optaget>
                  <p className="text-sm text-hb-ink-soft">{BEKRAEFT_ORD.pladsOptaget}</p>
                </div>
              )}
            </div>
          </>
        )}
      </HbSection>

      {/* ── 4. Rejsen ── */}
      {!henter && !g.isError && g.tidslinje && (
        <HbSection eyebrow={REJSEN_ORD.eyebrow} title={REJSEN_ORD.titel} hairline className="mt-12">
          <Rejsen tidslinje={g.tidslinje} />
        </HbSection>
      )}

      {/* ── Nået: historik med dato — foldet ── */}
      {!loading && dom.naaede.length > 0 && (
        <HbSection eyebrow={`Nået · ${dom.naaede.length}`} hairline className="mt-12">
          <details data-dine-maal-naaede={dom.naaede.length}>
            <summary className={cn("cursor-pointer text-sm text-hb-ink-soft", fokus)}>Vis de nåede mål</summary>
            <HbCard className="mt-3 px-5 py-2">
              <ul className="divide-y divide-hb-line">{dom.naaede.map(raekke)}</ul>
            </HbCard>
          </details>
        </HbSection>
      )}

      {/* ── Parkeret — foldet ── */}
      {!loading && dom.parkerede.length > 0 && (
        <HbSection eyebrow={`Parkeret · ${dom.parkerede.length}`} hairline className="mt-12">
          <details data-dine-maal-parkerede={dom.parkerede.length}>
            <summary className={cn("cursor-pointer text-sm text-hb-ink-soft", fokus)}>Vis de parkerede mål</summary>
            <HbCard className="mt-3 px-5 py-2">
              <ul className="divide-y divide-hb-line">{dom.parkerede.map(raekke)}</ul>
            </HbCard>
          </details>
        </HbSection>
      )}

      {/* ── Guiden (opret / gør skarpt), redigér og slet ── */}
      <SaetMaalGuide
        open={guide !== null}
        onClose={() => setGuide(null)}
        tilstand={guide?.tilstand ?? GUIDE_NY}
        maaneder={g.grundlag?.maaneder ?? null}
        nu={guideNu}
        onOpret={async (input) => {
          if (!user || !companyId) return { ok: false, grund: "Du er ikke logget ind", afventerMigration: false };
          const s = await skriv.opret({ companyId, userId: user.id, input, nu: guideNu, maaneder: g.grundlag?.maaneder ?? null });
          if (s.ok) toast.success("Målet er sat");
          return s;
        }}
        onGoerSkarpt={async (maalId, input) => {
          const s = await skriv.goerSkarpt({ maalId, input, nu: guideNu, maaneder: g.grundlag?.maaneder ?? null });
          if (s.ok) toast.success("Målet er gjort skarpt");
          return s;
        }}
        onTilfoejSkridt={tilfoejSkridt}
      />
      <RedigerMaalDialog
        kort={tilRedigering}
        open={tilRedigering !== null}
        onClose={() => { setRedigerId(null); setKvartalEfterGem(null); }}
        nu={nu}
        doemFrist={(dato) => (tilRedigering ? maalFristGrund(tilRedigering.id, dato) : null)}
        tastetTal={tilRedigering ? (maalMedTalAf.get(tilRedigering.id)?.current_value ?? null) : null}
        enhed={tilRedigering ? (maalMedTalAf.get(tilRedigering.id)?.unit ?? null) : null}
        onGem={async (felter) => {
          if (!tilRedigering) return "Målet findes ikke længere — genindlæs siden.";
          const grund = await opdaterMaalFelt(tilRedigering.id, felter);
          // Skive 3: «Justér tal og dato» fra et kvartalstjek — registreres som 'justeret' FØRST når gemt.
          if (!grund && kvartalEfterGem?.maalId === tilRedigering.id) {
            const k = kvartalEfterGem;
            setKvartalEfterGem(null);
            const r = await registrerKvartal(k.maalId, k.kvartal, "justeret");
            if (r) toast.error(r);
          }
          return grund;
        }}
      />
      <SletMilestoneDialog
        ms={tilSletning}
        open={!!tilSletning}
        onOpenChange={(v) => { if (!v) setSletId(null); }}
        onSlet={() => {
          if (tilSletning) {
            void (async () => {
              await slet(tilSletning.id, tilSletning.title);
              await queryClient.invalidateQueries({ queryKey: ["dine-maal"] });
            })();
          }
          setSletId(null);
        }}
      />
    </div>
  );
};
