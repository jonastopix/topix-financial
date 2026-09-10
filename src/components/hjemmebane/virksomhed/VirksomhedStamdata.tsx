import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { bedOmSletning, fortrydSletning, omdoebVirksomhed, type VirksomhedsData } from "@/hooks/useVirksomhed";
import { INDGANGS_PRISPUNKTER_OERE } from "@/lib/indgangspris";
import type { Fornyelsesbeslutning } from "@/lib/fornyelse";
import {
  afgoerSletKnap,
  bilagTekst,
  tolkPrisFejl,
  tolkPrisSvar,
  validerVirksomhedsnavn,
  type PrisBesked,
} from "@/lib/virksomhedsStamdata";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbDialog } from "../milestones/HbOverlejring";
import { HbField, HbInput } from "../admin/HbField";

/** De tre stamdata-handlinger på virksomhedssiden (10/9, fra /members):
    omdøb i «Aftalen», prisniveau på Prisniveau-linjen, slet i en farlig zone
    nederst — samme mønster som medlemmets «Forlad virksomhed» (Settings:
    rød ramme, «kan ikke fortrydes», bekræft ved at skrive navnet).
    Dommene og ordene bor i lib/virksomhedsStamdata; skrivevejene i
    hooks/useVirksomhed. Efter hver skrivning AWAITes hookens invalider FØR
    dialogen lukkes (EditCompanyDialog-fælden, OVERLEVERING DEL 4). */

const formatKr = (oere: number): string => `${new Intl.NumberFormat("da-DK").format(oere / 100)} kr.`;

const visBesked = (b: PrisBesked) => {
  if (b.tone === "success") toast.success(b.tekst, { description: b.beskrivelse });
  else if (b.tone === "warning") toast.warning(b.tekst, { description: b.beskrivelse });
  else if (b.tone === "info") toast.info(b.tekst, { description: b.beskrivelse });
  else toast.error(b.tekst, { description: b.beskrivelse });
};

/** Læser statuskoden og JSON-body'en ud af en FunctionsHttpError (IndgangsSektion-mønstret). */
async function laesFejl(error: unknown): Promise<{ status: number | null; body: Record<string, unknown> | null }> {
  const ctx = (error as { context?: Response }).context;
  let status: number | null = null;
  let body: Record<string, unknown> | null = null;
  try {
    status = typeof ctx?.status === "number" ? ctx.status : null;
    body = (await ctx?.json?.()) ?? null;
  } catch {
    /* body var ikke JSON — status er nok */
  }
  return { status, body };
}

// ── Omdøb ──

export const OmdoebVirksomhed = ({ companyId, navn, onOpdateret }: { companyId: string; navn: string; onOpdateret: () => Promise<void> }) => {
  const [aaben, setAaben] = useState(false);
  const [vaerdi, setVaerdi] = useState(navn);
  const dom = validerVirksomhedsnavn(vaerdi, navn);
  const gem = useMutation({
    mutationFn: async () => {
      if (dom.ok === false) throw new Error(dom.fejl);
      await omdoebVirksomhed(companyId, dom.navn);
      await onOpdateret();
      return dom.navn;
    },
    onSuccess: (nyt) => {
      toast.success(`Virksomheden hedder nu «${nyt}»`);
      setAaben(false);
    },
    onError: (e: Error) => toast.error("Navnet blev ikke gemt", { description: e.message }),
  });
  return (
    <>
      <button type="button" onClick={() => { setVaerdi(navn); setAaben(true); }} className="text-xs text-hb-evergreen underline-offset-4 hover:underline">
        Omdøb
      </button>
      <HbDialog
        open={aaben}
        onClose={() => setAaben(false)}
        titel="Omdøb virksomhed"
        beskrivelse={`Nuværende navn: ${navn}`}
        fod={
          <div className="flex justify-end gap-2">
            <HbButton type="button" variant="secondary" className="h-10 px-5" onClick={() => setAaben(false)} disabled={gem.isPending}>Annuller</HbButton>
            <HbButton type="button" className="h-10 px-5" onClick={() => gem.mutate()} disabled={gem.isPending || !dom.ok}>Gem navn</HbButton>
          </div>
        }
      >
        {/* Fejlen vises kun når man har skrevet noget andet end det gamle — et tomt eller uændret felt er ikke en fejl, bare en knap der ikke er aktiv. */}
        <HbField label="Nyt navn" htmlFor="omdoeb-navn" error={dom.ok === false && vaerdi.trim() !== "" && vaerdi.trim() !== navn.trim() ? dom.fejl : undefined}>
          <HbInput
            id="omdoeb-navn"
            value={vaerdi}
            onChange={(e) => setVaerdi(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && dom.ok && !gem.isPending) gem.mutate(); }}
          />
        </HbField>
      </HbDialog>
    </>
  );
};

// ── Prisniveau ──

export const SaetPrisniveau = ({ companyId, onOpdateret }: { companyId: string; onOpdateret: () => Promise<void> }) => {
  const [arbejder, setArbejder] = useState<number | null>(null);
  const saet = async (oere: number) => {
    setArbejder(oere);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("saet-indgangs-prisniveau", {
        body: { company_id: companyId, prisniveau_oere: oere },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      let besked: PrisBesked;
      if (error) {
        const { status, body } = await laesFejl(error);
        besked = tolkPrisFejl(status, body);
        console.error("[VirksomhedStamdata] saet-indgangs-prisniveau fejlede:", status, body, error);
      } else {
        besked = tolkPrisSvar(data);
      }
      visBesked(besked);
      if (besked.genhent) await onOpdateret();
    } finally {
      setArbejder(null);
    }
  };
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <span className="text-xs text-hb-ink-soft">Sæt prisniveau — betalingsmailen sendes i samme kald:</span>
      {INDGANGS_PRISPUNKTER_OERE.map((oere) => (
        <HbButton key={oere} type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => void saet(oere)} disabled={arbejder !== null}>
          {arbejder === oere ? "Gemmer…" : formatKr(oere)}
        </HbButton>
      ))}
    </span>
  );
};

// ── Farlig zone: slet virksomheden (vej 1) ──

export const FarligZone = ({ d, onOpdateret }: { d: VirksomhedsData; onOpdateret: () => Promise<void> }) => {
  const { isAdmin } = useAuth();
  const [aaben, setAaben] = useState(false);
  const [bekraeft, setBekraeft] = useState("");
  const c = d.company;
  const dom = afgoerSletKnap(
    {
      contract_end_date: c.contract_end_date,
      offboarding_requested_at: c.offboarding_requested_at ?? null,
      beslutning: (d.fornyelse?.beslutning as Fornyelsesbeslutning | undefined) ?? null,
      status: c.status,
      data_slettet_at: c.data_slettet_at ?? null,
      data_slettet_vej: c.data_slettet_vej ?? null,
      subscription_status: c.subscription_status,
      subscription_current_period_end: c.subscription_current_period_end,
    },
    new Date(),
  );
  const bilag = bilagTekst(d.perioder.length, d.traek.length, d.betalingslink !== null);
  const bed = useMutation({
    mutationFn: async () => { await bedOmSletning(c.id); await onOpdateret(); },
    onSuccess: () => { toast.success("Der er bedt om sletning. Fristen er 7 dage — indtil da kan det fortrydes."); setAaben(false); setBekraeft(""); },
    onError: (e: Error) => toast.error("Sletningen blev ikke bedt om", { description: e.message }),
  });
  const fortryd = useMutation({
    mutationFn: async () => { await fortrydSletning(c.id); await onOpdateret(); },
    onSuccess: () => toast.success("Sletningen er fortrudt — data bliver."),
    onError: (e: Error) => toast.error("Kunne ikke fortryde", { description: e.message }),
  });
  if (!isAdmin) return null;
  return (
    <HbSection eyebrow="Farlig zone" hairline className="mt-14">
      <HbCard className="border-hb-rust/40 p-5">
        <p className="text-sm font-medium text-hb-ink">Slet virksomheden</p>
        <p className="mt-1 max-w-2xl text-sm text-hb-ink-soft">{dom.tekst}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {dom.tilstand === "kan_bede" && (
            <HbButton type="button" variant="secondary" className="h-9 border-hb-rust/50 px-4 text-sm text-hb-rust hover:bg-hb-rust/10" onClick={() => setAaben(true)}>
              Slet virksomheden
            </HbButton>
          )}
          {dom.tilstand === "anmodet" && dom.kanFortryde && (
            <HbButton type="button" variant="secondary" className="h-9 px-4 text-sm" onClick={() => fortryd.mutate()} disabled={fortryd.isPending}>
              {fortryd.isPending ? "Fortryder…" : "Fortryd sletningen"}
            </HbButton>
          )}
        </div>
      </HbCard>
      <HbDialog
        open={aaben}
        onClose={() => { if (!bed.isPending) { setAaben(false); setBekraeft(""); } }}
        titel={`Slet ${c.name}?`}
        alert
        beskrivelse="Det sker ikke nu: slettefunktionen sletter medlemsdata om 7 dage, og indtil da kan det fortrydes her på siden."
        fod={
          <div className="flex justify-end gap-2">
            <HbButton type="button" variant="secondary" className="h-10 px-5" onClick={() => { setAaben(false); setBekraeft(""); }} disabled={bed.isPending}>Annuller</HbButton>
            <HbButton type="button" className="h-10 bg-hb-rust px-5 hover:bg-hb-rust/90" onClick={() => bed.mutate()} disabled={bed.isPending || bekraeft.trim() !== c.name.trim()}>
              {bed.isPending ? "Beder om sletning…" : "Bed om sletning"}
            </HbButton>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-hb-ink">
          <p>Rapporter, tal, handouts, milepæle, samtaler, filer og brugerkonti slettes. {bilag}</p>
          {d.medlemmer.length > 0 && (
            <p>{d.medlemmer.length} {d.medlemmer.length === 1 ? "bruger mister" : "brugere mister"} sin konto. En bruger der også bærer en anden virksomhed, stopper sletningen af hele virksomheden.</p>
          )}
          {c.contract_end_date && new Date(c.contract_end_date) > new Date() && (
            <p className="text-hb-rust">Kontrakten er stadig aktiv (slut {new Date(c.contract_end_date).toLocaleDateString("da-DK")}). Sletningen sker alligevel.</p>
          )}
          <HbField label={`Skriv «${c.name}» for at bekræfte`} htmlFor="slet-bekraeft">
            <HbInput id="slet-bekraeft" value={bekraeft} onChange={(e) => setBekraeft(e.target.value)} autoFocus />
          </HbField>
        </div>
      </HbDialog>
    </HbSection>
  );
};
