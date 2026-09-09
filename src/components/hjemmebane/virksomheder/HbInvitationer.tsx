import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { erGyldigEmail, invitationTekst, invitationsTal, invitationsTalTekst } from "@/lib/invitationer";
import {
  INVITATIONER_KEY, gensendInvitation, hentInvitationer, invaliderInvitationer, opretInvitation, sletInvitation, type AabenInvitation,
} from "@/hooks/invitationer";
import { HbButton } from "../HbButton";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { HbDialog } from "../milestones/HbOverlejring";
import { HbField, HbInput, HbSelect } from "../admin/HbField";

/**
 * Invitationerne i det nye design (Jonas 9/9: «Invitationer skal være en del
 * af platformen»). Én fælles komponent, to steder:
 *   - /virksomheder (HbInvitationer): «Åbne invitationer · N» på tværs,
 *     ældste øverst, gensend og slet pr. række, «Inviter»-knappen, og
 *     tallene som én linje. Det er (a) i analysen: en invitation handler
 *     om at få nogen ind i en virksomhed, og listen er virksomhedernes sted.
 *   - virksomhedssiden (InvitationHandlinger + InviterKnap): de samme
 *     handlinger på blokken der allerede fandtes (b).
 * Dommene bor i lib/invitationer; skrivevejen i hooks/invitationer.
 * /members røres ikke — den bærer otte andre ting.
 */

const formatDato = (iso: string): string =>
  new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long", timeZone: "Europe/Copenhagen" });

/** Gensend + slet for én åben invitation. Slet er to klik, som listen. */
export const InvitationHandlinger = ({ inv, companyId }: { inv: { id: string; email: string }; companyId: string | null }) => {
  const queryClient = useQueryClient();
  const [bekraeftSlet, setBekraeftSlet] = useState(false);
  const skriv = useMutation({
    mutationFn: async (handling: () => Promise<void>) => {
      await handling();
      await invaliderInvitationer(queryClient, companyId);
    },
    onError: (e: Error) => toast.error("Det lykkedes ikke", { description: e.message }),
  });
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      <button
        type="button"
        disabled={skriv.isPending}
        onClick={() => skriv.mutate(async () => { await gensendInvitation(inv.email); toast.success(`Invitation gensendt til ${inv.email}`); })}
        className="inline-flex items-center gap-1 text-hb-evergreen underline-offset-4 hover:underline disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" /> Gensend
      </button>
      {bekraeftSlet ? (
        <button
          type="button"
          disabled={skriv.isPending}
          onClick={() => skriv.mutate(async () => { await sletInvitation(inv.id); setBekraeftSlet(false); toast.success(`Invitationen til ${inv.email} er slettet`); })}
          className="font-medium text-hb-rust underline-offset-4 hover:underline"
        >
          Slet, helt sikkert
        </button>
      ) : (
        <button type="button" onClick={() => setBekraeftSlet(true)} title="Slet" aria-label="Slet" className="rounded-full p-1 text-hb-ink-soft transition-colors hover:bg-hb-sage/50 hover:text-hb-rust">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
};

/** «Inviter»: e-mail + valgfri virksomhed. Med fast virksomhed (virksomhedssiden)
    er valget låst. */
export const InviterKnap = ({ companyId, virksomheder, label = "Inviter" }: {
  companyId?: string;
  virksomheder?: { id: string; name: string }[];
  label?: string;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [aaben, setAaben] = useState(false);
  const [email, setEmail] = useState("");
  const [valgtCompany, setValgtCompany] = useState(companyId ?? "");
  const opslag = useQuery({ queryKey: [...INVITATIONER_KEY], queryFn: hentInvitationer, enabled: aaben && !virksomheder && !companyId, staleTime: 60_000 });
  const liste = virksomheder ?? opslag.data?.virksomheder ?? [];
  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Ikke logget ind");
      const r = await opretInvitation({ email, companyId: valgtCompany || null, invitedBy: user.id });
      await invaliderInvitationer(queryClient, valgtCompany || null);
      return r;
    },
    onSuccess: (r) => {
      toast.success(r.gensendt ? `Invitation gensendt til ${email.trim()}` : `Invitation sendt til ${email.trim()}`);
      setAaben(false);
      setEmail("");
      if (!companyId) setValgtCompany("");
    },
    onError: (e: Error) => toast.error("Invitationen blev ikke sendt", { description: e.message }),
  });
  return (
    <>
      <HbButton type="button" variant="secondary" className="h-9 gap-1.5 px-4 text-sm" onClick={() => setAaben(true)}>
        <UserPlus className="h-4 w-4" /> {label}
      </HbButton>
      <HbDialog
        open={aaben}
        onClose={() => setAaben(false)}
        titel="Inviter"
        beskrivelse={companyId ? "Personen tilknyttes virksomheden ved tilmelding." : "Vælg en virksomhed, eller lad personen oprette sin egen ved tilmelding."}
        fod={
          <div className="flex justify-end gap-2">
            <HbButton type="button" variant="secondary" className="h-10 px-5" onClick={() => setAaben(false)} disabled={send.isPending}>Annuller</HbButton>
            <HbButton type="button" className="h-10 px-5" onClick={() => send.mutate()} disabled={send.isPending || !erGyldigEmail(email)}>Send invitation</HbButton>
          </div>
        }
      >
        <div className="space-y-4">
          <HbField label="E-mail" htmlFor="inv-email">
            <HbInput id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@virksomhed.dk" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && erGyldigEmail(email)) send.mutate(); }} />
          </HbField>
          {!companyId && (
            <HbField label="Virksomhed" htmlFor="inv-virksomhed">
              <HbSelect id="inv-virksomhed" value={valgtCompany} onChange={(e) => setValgtCompany(e.target.value)}>
                <option value="">Ingen — opretter selv virksomhed</option>
                {liste.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </HbSelect>
            </HbField>
          )}
        </div>
      </HbDialog>
    </>
  );
};

/** Sektionen på /virksomheder. */
export const HbInvitationer = () => {
  const { user, isAdvisor } = useAuth();
  const query = useQuery({ queryKey: [...INVITATIONER_KEY], queryFn: hentInvitationer, enabled: !!user && !!isAdvisor, staleTime: 60_000 });
  const nu = new Date();
  const d = query.data;
  const tal = d ? invitationsTal(d.virksomheder.map((c) => c.id), d.alle, d.medlemmerPrVirksomhed) : null;

  const Raekke = ({ inv }: { inv: AabenInvitation }) => {
    const t = invitationTekst(inv, inv.sidstSendtAt, nu, formatDato);
    return (
      <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-hb-ink">{inv.email}</span>
          <span className="block text-xs text-hb-ink-soft">
            {inv.company_id && inv.virksomhedNavn ? (
              <Link to={`/virksomhed/${inv.company_id}`} className="text-hb-evergreen underline-offset-4 hover:underline">{inv.virksomhedNavn}</Link>
            ) : (
              "Ingen virksomhed — opretter selv"
            )}
            {" · "}
            <span className={cn(t.gammel && "font-medium text-hb-rust")}>{t.tekst}</span>
          </span>
        </span>
        <InvitationHandlinger inv={inv} companyId={inv.company_id} />
      </li>
    );
  };

  return (
    <HbSection eyebrow={`Åbne invitationer${d ? ` · ${d.aabne.length}` : ""}`} hairline className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-hb-ink-soft">
          {query.isError ? "Invitationerne kunne ikke hentes." : tal ? invitationsTalTekst(tal) : "Henter…"}
        </p>
        <InviterKnap virksomheder={d?.virksomheder} />
      </div>
      {d && (
        <HbCard className="px-5 py-1">
          {d.aabne.length > 0 ? (
            <ul className="divide-y divide-hb-line">{d.aabne.map((inv) => <Raekke key={inv.id} inv={inv} />)}</ul>
          ) : (
            <p className="py-3 text-sm text-hb-ink-soft">Ingen åbne invitationer.</p>
          )}
        </HbCard>
      )}
    </HbSection>
  );
};
