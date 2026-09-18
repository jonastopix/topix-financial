import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { INDGANGS_PRISPUNKTER_OERE, STANDARD_PRISNIVEAU_OERE } from "@/lib/indgangspris";
import { gemNoteOgPris } from "@/hooks/ansoegninger";
import { afgoerForhaandsvisning, type ForhaandsvisningSvar } from "@/lib/hjemmebane/forhaandsvisning";
import { HbButton } from "../HbButton";

/** «Send til underskrift» (UDKAST 18/9). Rådgiveren vælger prisniveauet
    aftalen skal lyde på, og kaldet går til send-til-underskrift (Bucket A),
    som fastfryser teksten, sender linkmailen og skriver sporet. Samme form
    som SaetPrisniveau i VirksomhedStamdata. Findes der allerede en åben
    aftale, spørger vi før den erstattes.

    EJEREN er enten en VIRKSOMHED (companyId — virksomhedssiden, som før)
    eller en ANSØGNING (ansoegningId — ansøgningens side; generalprøvens
    brist 1, 18/9): functionen tager allerede `ansoegning_id` fra trinnene
    «afholdt» og «aftalegrundlag_sendt» og flytter selv motorens trin
    («tilbud»), så rykkerne i aftalegrundlags-trappen peger på aftalen.

    PRISEN på en ansøgning: én pris, ét sted — functionen læser
    ansoegninger.pris_oere og afviser (409 pris_saettes_paa_ansoegningen) et
    prisniveau der afviger. Derfor skrives prisniveauet på ansøgningen FØR
    kaldet (gemNoteOgPris — samme skrivning som notefeltet), og
    forhåndsvisningen sender intet prisniveau for en ansøgning, så den viser
    den pris der står. */

/** Præcis én ejer: virksomhedens id eller ansøgningens id. */
export type UnderskriftEjer = { companyId: string; ansoegningId?: undefined } | { ansoegningId: string; companyId?: undefined };

/** Body-feltet for ejeren — functionen kræver præcis én af de to. */
function ejerBody(ejer: UnderskriftEjer): Record<string, string> {
  return ejer.ansoegningId !== undefined ? { ansoegning_id: ejer.ansoegningId } : { company_id: ejer.companyId };
}

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


export const SendTilUnderskrift = ({ onOpdateret, ...ejer }: UnderskriftEjer & { onOpdateret: () => Promise<void> }) => {
  const erAnsoegning = ejer.ansoegningId !== undefined;
  const [arbejder, setArbejder] = useState<number | null>(null);
  const [viser, setViser] = useState<number | null>(null);
  // Prisen er et FORUDFYLDT, synligt valg (Jonas 18/9: «50k er default … jeg vil gerne kunne ændre den»):
  // står ved knappen, kan skiftes til 40.000 — og ingen aftale sendes uden.
  const [valgtOere, setValgtOere] = useState<number>(STANDARD_PRISNIVEAU_OERE);
  // Forhåndsvisningen vises I FLADEN (18/9 aften): window.open efter await blokeres af browseren
  // uanset pop-up-indstillingen (klikket er ikke længere brugerens handling). Ren tekst, aldrig HTML fra data.
  const [forhaandsvisning, setForhaandsvisning] = useState<{ oere: number; svar: ForhaandsvisningSvar } | null>(null);
  // Forhåndsvis (18/9): samme kald med forhaandsvis: true — intet skrives, intet sendes.
  // For en ansøgning sendes intet prisniveau: functionen bruger den pris der står på ansøgningen.
  const forhaandsvis = async (oere: number) => {
    setViser(oere);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-til-underskrift", {
        body: { ...ejerBody(ejer), prisniveau_oere: erAnsoegning ? null : oere, forhaandsvis: true },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) {
        const { status, body } = await laesFejl(error);
        console.error("[SendTilUnderskrift] forhåndsvisning fejlede:", status, body, error);
        return toast.error("Kunne ikke bygge forhåndsvisningen", { description: typeof body?.error === "string" ? body.error : `(${status ?? "?"})` });
      }
      setForhaandsvisning({ oere, svar: (data ?? {}) as ForhaandsvisningSvar });
    } finally {
      setViser(null);
    }
  };
  const send = async (oere: number, erstat = false, bekraeftNyVirksomhed = false) => {
    setArbejder(oere);
    try {
      if (ejer.ansoegningId !== undefined) {
        // Én pris, ét sted: prisniveauet skrives på ansøgningen FØR kaldet (motoren læser
        // pris_oere ved «underskrevet»; functionen afviser et afvigende prisniveau).
        await gemNoteOgPris(ejer.ansoegningId, { pris_oere: oere });
      }
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-til-underskrift", {
        body: { ...ejerBody(ejer), prisniveau_oere: oere, erstat, bekraeft_ny_virksomhed: bekraeftNyVirksomhed },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) {
        const { status, body } = await laesFejl(error);
        const kode = typeof body?.error === "string" ? body.error : null;
        if (kode === "aftale_allerede_sendt" && !erstat) {
          if (window.confirm("Der er allerede sendt et aftalegrundlag, som ikke er underskrevet. Skal det trækkes tilbage og et nyt sendes?")) {
            setArbejder(null);
            await send(oere, true, bekraeftNyVirksomhed);
          }
          return;
        }
        // Pengekæden (C's recon 18/9): mailen er kontakt på en virksomhed i forvejen → et BEVIDST valg.
        if (kode === "mail_findes_som_kontakt" && !bekraeftNyVirksomhed) {
          const navne = ((body?.virksomheder as { name: string; status: string | null }[] | undefined) ?? []).map((v) => `«${v.name}» (${v.status ?? "status ukendt"})`).join(", ");
          if (window.confirm(`Ansøgerens mail er allerede kontaktperson på ${navne || "en virksomhed"}. Sendes aftalen, oprettes EN NY virksomhed med samme kontaktperson ved underskriften. Er det rigtigt — er det en ny virksomhed?`)) {
            setArbejder(null);
            await send(oere, erstat, true);
          }
          return;
        }
        const tekst =
          kode === "ingen_kontakt_email" ? "Virksomheden har ingen kontaktmail — sæt den først."
          : kode === "skabelon_er_pladsholder" ? "Skabelonen er stadig udkastets pladsholder — indsæt den rigtige tekst først."
          : kode === "pladsholdere_mangler" ? `Skabelonen har pladsholdere uden værdi: ${(body?.manglende as string[] | undefined)?.join(", ") ?? "?"}.`
          : kode === "felter_tomme" ? `Virksomheden mangler: ${(body?.tomme as string[] | undefined)?.join(", ") ?? "?"}.`
          : kode === "link_mail_fejlede" ? "Mailen kunne ikke sendes — aftalen er trukket tilbage igen. Prøv om lidt."
          : kode === "ansoegning_forkert_trin" ? `Aftalegrundlaget kan først sendes efter samtalen — ansøgningen står på «${typeof body?.trin === "string" ? body.trin : "?"}».`
          : kode === "ansoegning_ikke_indsendt" ? "Ansøgningen er ikke sendt ind endnu."
          : kode === "pris_saettes_paa_ansoegningen" ? "Prisen på ansøgningen er en anden — sæt den først."
          : kode === "ukendt_ansoegning" ? "Ansøgningen findes ikke."
          : kode === "cvr_findes_som_virksomhed" ? `CVR-nummeret er allerede virksomheden ${((body?.virksomheder as { name: string }[] | undefined) ?? []).map((v) => `«${v.name}»`).join(", ") || "i basen"}. Send ikke en ny aftale — kobl ansøgningen til den eksisterende virksomhed, eller ret CVR-nummeret først.`
          : `Kunne ikke sende (${status ?? "?"}).`;
        console.error("[SendTilUnderskrift] send-til-underskrift fejlede:", status, body, error);
        toast.error("Aftalegrundlaget blev ikke sendt", { description: tekst });
        return;
      }
      const til = typeof data?.til === "string" ? data.til : "kontaktmailen";
      // Ansøgningsvejen: aftalen ER sendt og mailen gået, men motorens «tilbud» kan være afvist —
      // så står trinnet forkert, og rådgiveren skal vide det (functionen melder det i `motor`).
      const motor = (data?.motor ?? null) as { ok?: boolean; grund?: string; til?: string } | null;
      if (erAnsoegning && motor !== null && motor.ok === false) {
        toast.warning("Aftalegrundlaget er sendt — men trinnet blev ikke flyttet", { description: `Linket er sendt til ${til}. Motoren sagde: ${motor.grund ?? "ukendt fejl"}. Sæt trinnet i hånden.` });
      } else {
        toast.success("Aftalegrundlaget er sendt til underskrift", { description: `Linket er sendt til ${til} og gælder i 21 dage.${erAnsoegning && motor?.til ? ` Ansøgningen står nu på «${motor.til}».` : ""}` });
      }
      await onOpdateret();
    } finally {
      setArbejder(null);
    }
  };
  const dom = forhaandsvisning ? afgoerForhaandsvisning(forhaandsvisning.svar) : null;
  return (
    <div className="mt-1" data-send-til-underskrift={erAnsoegning ? "ansoegning" : "virksomhed"}>
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-hb-ink-soft">{erAnsoegning ? "Send aftalegrundlaget til e-underskrift — prisen sættes på ansøgningen:" : "Send aftalegrundlaget til e-underskrift:"}</span>
      <span className="flex items-center gap-2 text-xs text-hb-ink" data-pris-valg>
        {INDGANGS_PRISPUNKTER_OERE.map((oere) => (
          <label key={oere} className="flex items-center gap-1">
            <input type="radio" name={`prisniveau-${ejer.ansoegningId ?? ejer.companyId}`} value={oere} checked={valgtOere === oere} onChange={() => setValgtOere(oere)} disabled={arbejder !== null || viser !== null} />
            <span>{formatKr(oere)}{oere === STANDARD_PRISNIVEAU_OERE ? " (standard)" : ""}</span>
          </label>
        ))}
        <span className="text-hb-ink-soft">ekskl. moms</span>
      </span>
      <HbButton type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => void send(valgtOere)} disabled={arbejder !== null || viser !== null} data-send-aftale={valgtOere}>
        {arbejder !== null ? "Sender…" : `Send til e-underskrift — ${formatKr(valgtOere)}`}
      </HbButton>
      <button type="button" onClick={() => void forhaandsvis(valgtOere)} disabled={arbejder !== null || viser !== null} className="text-xs text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50" data-forhaandsvis={valgtOere}>
        {viser !== null ? "Bygger…" : "Forhåndsvis"}
      </button>
    </span>
    {forhaandsvisning && dom && (
      <div className="mt-3 rounded-hb border border-hb-line bg-hb-surface p-4" data-forhaandsvisning={forhaandsvisning.oere}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className={dom.kanSendes ? "text-sm font-medium text-hb-evergreen" : "text-sm font-medium text-hb-rust"}>{dom.linje}</p>
          <button type="button" onClick={() => setForhaandsvisning(null)} className="text-xs text-hb-ink-soft underline-offset-4 hover:underline" data-forhaandsvisning-luk>
            Luk
          </button>
        </div>
        <p className="mt-2 text-xs text-hb-ink-soft">Forhåndsvisning af {formatKr(forhaandsvisning.oere)} ekskl. moms · {dom.skabelon}</p>
        {dom.titel && <p className="mt-3 font-editorial text-xl font-medium text-hb-ink">{dom.titel}</p>}
        {/* Ren tekst: React escaper — der sættes aldrig HTML fra data ind. */}
        <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap font-editorial text-[15px] leading-relaxed text-hb-ink">{dom.tekst}</pre>
      </div>
    )}
    </div>
  );
};
