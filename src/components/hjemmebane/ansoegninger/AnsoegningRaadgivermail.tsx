import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { KONTAKT_ADRESSE } from "@/lib/kontaktadresse";
import { danskTidspunkt } from "@/lib/ansoegninger/ansoegningVisning";
import { afgoerRaadgivermail, RAADGIVERMAIL_LABEL, raadgivermailTekst, type MailLogRaekke } from "@/lib/ansoegninger/raadgivermailStatus";

/** Én linje på ansøgningen (generalprøvens brist 7): kom mailen til kontakt@ af sted?
    Læser email_send_log (rådgivere har SELECT): ansøgningens egne rækker (label +
    metadata.ansoegning_id) og bounces/klager på kontaktadressen. Dommen er ren
    (raadgivermailStatus.ts). Fejler opslaget, siges det — aldrig et gæt. */
export const AnsoegningRaadgivermail = ({ ansoegningId }: { ansoegningId: string }) => {
  const q = useQuery({
    queryKey: ["ansoegning-raadgivermail", ansoegningId],
    queryFn: async () => {
      const FELTER = "status, created_at, error_message, recipient_email, template_name, metadata";
      const egne = kraevRaekker(
        await supabase.from("email_send_log").select(FELTER).eq("template_name", RAADGIVERMAIL_LABEL).contains("metadata", { ansoegning_id: ansoegningId }).order("created_at", { ascending: false }).limit(10),
        "email_send_log",
      ) as MailLogRaekke[];
      const haendelser = kraevRaekker(
        await supabase.from("email_send_log").select(FELTER).eq("recipient_email", KONTAKT_ADRESSE).in("status", ["bounced", "complained"]).order("created_at", { ascending: false }).limit(20),
        "email_send_log",
      ) as MailLogRaekke[];
      return afgoerRaadgivermail(egne, ansoegningId, haendelser);
    },
    staleTime: 60_000,
  });
  if (q.isPending) return null;
  if (q.isError) return <p className="mt-1 text-xs text-hb-rust" data-raadgivermail="fejl">Mail til jer: kunne ikke læse mailloggen ({(q.error as Error).message}).</p>;
  const d = q.data;
  const rust = d.tilstand === "fejlet" || d.tilstand === "sendt_men_bouncet";
  return <p className={rust ? "mt-1 text-xs text-hb-rust" : "mt-1 text-xs text-hb-ink-soft"} data-raadgivermail={d.tilstand}>{raadgivermailTekst(d, danskTidspunkt)}</p>;
};
