/**
 * VirksomhedGenkoersel — «Prøv at læse filen igen» på en strandet rapport
 * (10/9-2026). Motoren og ordene: src/lib/genkoersel.ts.
 *
 * HVOR: virksomhedssidens rapportafsnit (blok 6), på den udfoldede række —
 * dér ser rådgiveren en strandet rapport. Ikke review-queue, ikke en ny side.
 *
 * TØRKØRSEL: ikke et skridt rådgiveren tager — klikket på én konkret rapport
 * ER beslutningen. Men serverens tørkørsel køres alligevel FØRST, usynligt:
 * afviser serveren (facts, slettet, PDF…), vises grunden i stedet for at
 * køre; advarer den (dublet-gaten kan slette rækken), spørges der én gang i
 * en dialog, før noget overskrives. Ingen advarsel → kørslen starter straks.
 *
 * BAGEFTER: sandheden er rækken efter kørslen (serveren læser den igen), og
 * fladen henter virksomheden OG facts igen, så badgen og tallene skifter uden
 * genindlæsning. Fejler den igen, står serverens grund i toasten — aldrig tom.
 *
 * PDF: knappen tilbydes ikke; grunden står i stedet (pdfjs findes kun i
 * browseren — medlemmet uploader igen).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fejlgrundAfRapport,
  GENKOER_KNAP_TEKST,
  genkoerselAfRapport,
  tolkGenkoerselFejl,
  tolkGenkoerselSvar,
  tolkToerkoersel,
  type GenkoerselBesked,
  type RapportTilGenkoersel,
} from "@/lib/genkoersel";
import { HbButton } from "../HbButton";
import { HbDialog } from "../milestones/HbOverlejring";

const LOG = "[VirksomhedGenkoersel]";

function visBesked(b: GenkoerselBesked) {
  if (b.tone === "success") toast.success(b.tekst, { description: b.beskrivelse });
  else if (b.tone === "warning") toast.warning(b.tekst, { description: b.beskrivelse });
  else if (b.tone === "info") toast.info(b.tekst, { description: b.beskrivelse });
  else toast.error(b.tekst, { description: b.beskrivelse });
}

/** Læser statuskoden og JSON-body'en ud af en FunctionsHttpError (VirksomhedStamdata-mønstret). */
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

async function kaldGenkoer(body: Record<string, unknown>): Promise<{ data: unknown; fejl: GenkoerselBesked | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("genkoer-rapport", {
    body,
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (error) {
    const { status, body: fejlBody } = await laesFejl(error);
    console.error(`${LOG} genkoer-rapport fejlede:`, status, fejlBody, error);
    return { data: null, fejl: tolkGenkoerselFejl(status, fejlBody) };
  }
  return { data, fejl: null };
}

export const GenkoerRapport = ({
  r, harFacts, companyId, onOpdateret,
}: {
  r: RapportTilGenkoersel;
  harFacts: boolean;
  companyId: string;
  onOpdateret: () => Promise<void>;
}) => {
  const queryClient = useQueryClient();
  const [tilstand, setTilstand] = useState<"klar" | "tjekker" | "koerer">("klar");
  const [advarsel, setAdvarsel] = useState<string | null>(null);

  const dom = genkoerselAfRapport(r, harFacts);
  const fejlgrund = fejlgrundAfRapport(r);

  const hentIgen = async () => {
    // Facts går gennem useCompanyFacts (egen nøgle); virksomheden gennem invalider.
    await queryClient.invalidateQueries({ queryKey: ["company-facts", companyId] });
    await onOpdateret();
  };

  const koer = async () => {
    setAdvarsel(null);
    setTilstand("koerer");
    try {
      const { data, fejl } = await kaldGenkoer({ dry_run: false, report_ids: [r.id] });
      const besked = fejl ?? tolkGenkoerselSvar(data, r.id);
      visBesked(besked);
      if (besked.genhent) await hentIgen();
    } finally {
      setTilstand("klar");
    }
  };

  const proev = async () => {
    setTilstand("tjekker");
    try {
      // Tørkørslen først, usynligt: serverens dom og dens dublet-advarsel.
      const { data, fejl } = await kaldGenkoer({ report_ids: [r.id] });
      if (fejl) { visBesked(fejl); return; }
      const toer = tolkToerkoersel(data, r.id);
      if (!toer.kan) {
        visBesked({ tone: "info", tekst: "Filen kan ikke læses igen", beskrivelse: toer.tekst, genhent: true });
        await hentIgen();
        return;
      }
      if (toer.advarsel) { setAdvarsel(toer.advarsel); return; }
      await koer();
    } finally {
      setTilstand((t) => (t === "tjekker" ? "klar" : t));
    }
  };

  return (
    <div className="rounded-hb border border-hb-line bg-hb-paper p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Strandet</p>
      <p className="mt-1 break-words text-sm text-hb-ink">{r.file_name ?? "(uden filnavn)"}</p>
      <p className="mt-1 break-words text-xs text-hb-ink-soft">Fejlede: {fejlgrund}</p>
      {dom.kan ? (
        <HbButton type="button" variant="secondary" className="mt-3 h-9 px-4 text-sm" onClick={() => void proev()} disabled={tilstand !== "klar"}>
          {tilstand === "tjekker" ? "Tjekker…" : tilstand === "koerer" ? "Læser filen…" : GENKOER_KNAP_TEKST}
        </HbButton>
      ) : (
        <p className="mt-2 text-xs text-hb-ink-soft">{dom.tekst}</p>
      )}

      <HbDialog
        open={advarsel !== null}
        onClose={() => { if (tilstand !== "koerer") setAdvarsel(null); }}
        titel="Læs filen igen?"
        beskrivelse={advarsel ?? ""}
        alert
        fod={
          <div className="flex justify-end gap-2">
            <HbButton type="button" variant="secondary" className="h-10 px-5" onClick={() => setAdvarsel(null)} disabled={tilstand === "koerer"}>Annuller</HbButton>
            <HbButton type="button" className="h-10 px-5" onClick={() => void koer()} disabled={tilstand === "koerer"}>
              {tilstand === "koerer" ? "Læser filen…" : "Læs filen igen alligevel"}
            </HbButton>
          </div>
        }
      >
        <p className="text-sm text-hb-ink-soft">Lander genkørslen på samme periode som den anden rapport, sletter kæden denne række. Tallene fra den anden rapport røres ikke.</p>
      </HbDialog>
    </div>
  );
};
