import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ANSOEGNING_MAILS_KEY, hentAnsoegningMails } from "@/hooks/ansoegninger";
import { danskTidspunkt } from "@/lib/ansoegninger/ansoegningVisning";
import { MAIL_ORD, MAIL_STATUS_ORD } from "@/lib/ansoegninger/ansoegningSpor";

/**
 * «Mails» på ansøgningens side (Jonas 18/9, prøven pkt. 7): rykkerkøen viser kun køens rækker —
 * kvitteringen, bekræftelsen af samtalen og aftalelinket sendes uden om køen og var usynlige.
 * Her står ALT der er sendt til ansøgeren (og om jer), med tid, status og vej (straks/køen).
 */
export const AnsoegningMails = ({ ansoegningId }: { ansoegningId: string }) => {
  const q = useQuery({ queryKey: [...ANSOEGNING_MAILS_KEY(ansoegningId)], queryFn: () => hentAnsoegningMails(ansoegningId), staleTime: 30_000 });
  if (q.isPending) return <p className="text-sm text-hb-ink-soft">Henter mails…</p>;
  if (q.isError) return <p className="text-sm text-hb-rust" data-mails="fejl">Kunne ikke læse mailloggen ({(q.error as Error).message}).</p>;
  if (q.data.length === 0) return <p className="text-sm text-hb-ink-soft" data-mails={0}>Ingen mails endnu.</p>;
  return (
    <ul className="divide-y divide-hb-line text-sm" data-mails={q.data.length}>
      {q.data.map((m, i) => {
        const vej = m.metadata && typeof m.metadata.vej === "string" ? m.metadata.vej : null;
        const ok = m.status === "sent";
        return (
          <li key={i} className={cn("py-2", ok ? "text-hb-ink" : "text-hb-rust")}>
            <span className={cn("mr-2 inline-block rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.1em]", ok ? "bg-hb-evergreen/10 text-hb-evergreen" : "bg-hb-rust/10 text-hb-rust")}>{MAIL_STATUS_ORD[m.status] ?? m.status}</span>
            {MAIL_ORD[m.template_name] ?? m.template_name} · {danskTidspunkt(m.created_at)} · til {m.recipient_email}
            {vej === "straks" ? " · straks" : vej === "koe" ? " · fra køen" : ""}
            {!ok && m.error_message ? <span className="block text-xs">{m.error_message}</span> : null}
          </li>
        );
      })}
    </ul>
  );
};
