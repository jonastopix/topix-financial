import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { INDGANGS_PRISPUNKTER_OERE } from "@/lib/indgangspris";
import { HbButton } from "../HbButton";

/** «Send til underskrift» på virksomhedssiden (UDKAST 18/9). Rådgiveren
    vælger prisniveauet aftalen skal lyde på, og kaldet går til
    send-til-underskrift (Bucket A), som fastfryser teksten, sender linkmailen
    og skriver sporet. Samme form som SaetPrisniveau i VirksomhedStamdata.
    Findes der allerede en åben aftale, spørger vi før den erstattes. */

function formatKr(oere: number): string {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(oere / 100) + " kr.";
}

async function laesFejl(error: unknown): Promise<{ status: number | null; body: Record<string, unknown> | null }> {
  const ctx = (error as { context?: Response } | null)?.context;
  try {
    const t = await ctx?.text();
    return { status: ctx?.status ?? null, body: t ? (JSON.parse(t) as Record<string, unknown>) : null };
  } catch {
    return { status: ctx?.status ?? null, body: null };
  }
}

/** Forhåndsvisningen: den udfyldte tekst i et nyt vindue — som ren tekst, aldrig HTML fra data. */
function visForhaandsvisning(svar: { titel?: string; skabelon?: string; tekst?: string; manglende?: string[]; tomme?: string[]; kan_sendes?: boolean; til?: string | null }) {
  const w = window.open("", "_blank", "noopener,width=820,height=900");
  if (!w) return toast.error("Browseren blokerede vinduet — tillad pop-ups for at se dokumentet.");
  const advarsel = svar.kan_sendes
    ? `KAN SENDES (til ${svar.til ?? "?"}). Dette er en forhåndsvisning — intet er sendt.`
    : `KAN IKKE SENDES: ${[...(svar.manglende ?? []).map((m) => `{{${m}}} kendes ikke`), ...(svar.tomme ?? []).map((t) => `{{${t}}} er tom`), ...(svar.til ? [] : ["ingen kontaktmail"])].join(" · ")}`;
  w.document.title = `Forhåndsvisning — ${svar.skabelon ?? ""}`;
  const pre = w.document.createElement("pre");
  pre.style.cssText = "white-space:pre-wrap;font:15px/1.6 Georgia,serif;max-width:720px;margin:32px auto;padding:0 24px";
  pre.textContent = `[${advarsel}]\n\n${svar.titel ?? ""}\n${svar.skabelon ?? ""}\n\n${svar.tekst ?? ""}`;
  w.document.body.appendChild(pre);
}

export const SendTilUnderskrift = ({ companyId, onOpdateret }: { companyId: string; onOpdateret: () => Promise<void> }) => {
  const [arbejder, setArbejder] = useState<number | null>(null);
  const [viser, setViser] = useState<number | null>(null);
  // Forhåndsvis (18/9): samme kald med forhaandsvis: true — intet skrives, intet sendes.
  const forhaandsvis = async (oere: number) => {
    setViser(oere);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-til-underskrift", {
        body: { company_id: companyId, prisniveau_oere: oere, forhaandsvis: true },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) {
        const { status, body } = await laesFejl(error);
        console.error("[SendTilUnderskrift] forhåndsvisning fejlede:", status, body, error);
        return toast.error("Kunne ikke bygge forhåndsvisningen", { description: typeof body?.error === "string" ? body.error : `(${status ?? "?"})` });
      }
      visForhaandsvisning(data ?? {});
    } finally {
      setViser(null);
    }
  };
  const send = async (oere: number, erstat = false) => {
    setArbejder(oere);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-til-underskrift", {
        body: { company_id: companyId, prisniveau_oere: oere, erstat },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) {
        const { status, body } = await laesFejl(error);
        const kode = typeof body?.error === "string" ? body.error : null;
        if (kode === "aftale_allerede_sendt" && !erstat) {
          if (window.confirm("Der er allerede sendt et aftalegrundlag, som ikke er underskrevet. Skal det trækkes tilbage og et nyt sendes?")) {
            setArbejder(null);
            await send(oere, true);
          }
          return;
        }
        const tekst =
          kode === "ingen_kontakt_email" ? "Virksomheden har ingen kontaktmail — sæt den først."
          : kode === "skabelon_er_pladsholder" ? "Skabelonen er stadig udkastets pladsholder — indsæt den rigtige tekst først."
          : kode === "pladsholdere_mangler" ? `Skabelonen har pladsholdere uden værdi: ${(body?.manglende as string[] | undefined)?.join(", ") ?? "?"}.`
          : kode === "felter_tomme" ? `Virksomheden mangler: ${(body?.tomme as string[] | undefined)?.join(", ") ?? "?"}.`
          : kode === "link_mail_fejlede" ? "Mailen kunne ikke sendes — aftalen er trukket tilbage igen. Prøv om lidt."
          : `Kunne ikke sende (${status ?? "?"}).`;
        console.error("[SendTilUnderskrift] send-til-underskrift fejlede:", status, body, error);
        toast.error("Aftalegrundlaget blev ikke sendt", { description: tekst });
        return;
      }
      const til = typeof data?.til === "string" ? data.til : "kontaktmailen";
      toast.success("Aftalegrundlaget er sendt til underskrift", { description: `Linket er sendt til ${til} og gælder i 21 dage.` });
      await onOpdateret();
    } finally {
      setArbejder(null);
    }
  };
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <span className="text-xs text-hb-ink-soft">Send aftalegrundlaget til e-underskrift — vælg prisniveau:</span>
      {INDGANGS_PRISPUNKTER_OERE.map((oere) => (
        <HbButton key={oere} type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => void send(oere)} disabled={arbejder !== null || viser !== null}>
          {arbejder === oere ? "Sender…" : `${formatKr(oere)} ekskl. moms`}
        </HbButton>
      ))}
      <span className="text-xs text-hb-ink-soft">·</span>
      {INDGANGS_PRISPUNKTER_OERE.map((oere) => (
        <button key={`vis-${oere}`} type="button" onClick={() => void forhaandsvis(oere)} disabled={arbejder !== null || viser !== null} className="text-xs text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50" data-forhaandsvis={oere}>
          {viser === oere ? "Bygger…" : `Forhåndsvis ${formatKr(oere)}`}
        </button>
      ))}
    </span>
  );
};
