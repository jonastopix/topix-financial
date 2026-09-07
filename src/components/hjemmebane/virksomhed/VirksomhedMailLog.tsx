import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { cn } from "@/lib/utils";
import {
  MAILLOG_FEJL, MAILLOG_TOM, MAIL_STATUS_LABELS, erMailFejl, nyesteRaekkePrMail, type MailRaekke,
} from "@/lib/mailLog";
import { HbButton } from "../HbButton";
import { HbSection } from "../HbSection";
import { HbTag } from "../HbTag";

/**
 * Blok 8 på virksomhedssiden (7/9): mails til virksomheden — hvad
 * medlemmerne faktisk har fået fra os, uden at gå til admin-loggen og lede.
 *
 * HENTES FØRST NÅR NOGEN KIGGER (EmailTemplatesViews showLog-mønster):
 * loggen er dyb (1.664 rækker over 153 dage, ingen cron rydder op), og
 * siden laver i forvejen sytten hentninger — så knappen tænder queryen.
 *
 * NØGLEN ER MODTAGERENS ADRESSE (besluttet 7/9, lib/mailLog): alle rækker
 * hvor recipient_email er en af virksomhedens adresser — medlemmernes
 * profiles.email og company_invitations.email. Ikke metadata: kun otte af
 * 1.664 rækker bærer company_id, og sent-rækken aldrig.
 *
 * FORMEN ER EmailLogViews: select alt, created_at faldende, én linje pr.
 * mail (nyeste række pr. message_id — en fejlet mail står som fejlet),
 * kolonner + fold-ud. Kolonnerne her er de fire der er bedt om: tidspunkt,
 * skabelon, modtager, status; fold-ud bærer emne, message-id og fejl.
 *
 * RLS, VIGTIGT AT VIDE: email_send_log kan læses af service-role og
 * admin — og af advisor FØRST når migration 20260907180000 er kørt i
 * prod. Indtil da får en advisor uden admin-rolle NUL rækker uden fejl:
 * RLS filtrerer tavst, og PostgREST svarer 200 med en tom liste. Loggen
 * ser da ud som «Ingen mails til denne virksomhed endnu», selv om der er
 * mails. Det kan IKKE skelnes herfra — tom er tom, både for RLS og for en
 * virksomhed uden mails. Ser loggen tom ud for Morten, er det migrationen.
 */
const GRID = "sm:grid-cols-[7rem_1.3fr_1.6fr_7rem_1.5rem]";
const LOFT = 500;

const RaekkeSkelet = () => (
  <li aria-hidden className="px-4 py-3">
    <div className="h-4 w-2/5 animate-pulse rounded bg-hb-line/60" />
    <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-hb-line/40" />
  </li>
);

const StatusTag = ({ status }: { status: string }) => {
  const label = MAIL_STATUS_LABELS[status] || status;
  const klasse =
    status === "sent"
      ? "bg-hb-evergreen/10 text-hb-evergreen"
      : erMailFejl(status)
        ? "bg-hb-rust/10 text-hb-rust"
        : status === "suppressed"
          ? "bg-hb-line/60 text-hb-ink-soft"
          : "border border-hb-line bg-hb-paper text-hb-ink";
  return <HbTag className={cn("px-2 py-0.5 text-[11px]", klasse)}>{label}</HbTag>;
};

export const VirksomhedMailLog = ({ companyId, adresser }: { companyId: string; adresser: string[] }) => {
  const [visLog, setVisLog] = useState(false);
  const [udfoldet, setUdfoldet] = useState<string | null>(null);

  const logQuery = useQuery({
    queryKey: ["virksomhed", companyId, "mail-log", adresser],
    queryFn: async () => {
      if (adresser.length === 0) return [] as MailRaekke[];
      const raekker = kraevRaekker(
        await supabase
          .from("email_send_log")
          .select("*")
          .in("recipient_email", adresser)
          .order("created_at", { ascending: false })
          .limit(LOFT),
        "email_send_log",
      ) as MailRaekke[];
      return nyesteRaekkePrMail(raekker);
    },
    enabled: visLog,
    staleTime: 60_000,
  });

  const rows = logQuery.data ?? [];

  return (
    <HbSection id="section-mails" eyebrow="Mails til virksomheden" hairline className="mt-12 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-hb-ink-soft">
          {adresser.length === 0
            ? "Virksomheden har ingen kendte adresser — ingen medlemmer og ingen invitationer."
            : `Alt vi har sendt til ${adresser.length === 1 ? "virksomhedens adresse" : `virksomhedens ${adresser.length} adresser`} — medlemmer og invitationer.`}
        </p>
        <HbButton variant="secondary" className="h-9 shrink-0 px-4 text-sm" onClick={() => setVisLog((v) => !v)} disabled={adresser.length === 0}>
          {visLog ? "Skjul mails" : "Vis mails"}
        </HbButton>
      </div>

      {visLog && (
        <div className="mt-4 overflow-hidden rounded-hb border border-hb-line bg-hb-surface">
          <div className={cn("hidden border-b border-hb-line px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft sm:grid sm:gap-x-4", GRID)}>
            <span>Tidspunkt</span>
            <span>Skabelon</span>
            <span>Modtager</span>
            <span>Status</span>
            <span />
          </div>
          {logQuery.isLoading ? (
            <ul className="divide-y divide-hb-line">
              <RaekkeSkelet />
              <RaekkeSkelet />
              <RaekkeSkelet />
            </ul>
          ) : logQuery.isError ? (
            // Fejl er ikke tom (7/9): samme linje som de fem flader rettet i dag.
            <p className="px-4 py-10 text-center text-sm text-hb-rust">{MAILLOG_FEJL}</p>
          ) : rows.length === 0 ? (
            // Tom er tom — MEN se filhovedet: for en advisor uden admin før
            // migration 20260907180000 er kørt, ser RLS-filtreret præcis sådan ud.
            <p className="px-4 py-10 text-center text-sm text-hb-ink-soft">{MAILLOG_TOM}</p>
          ) : (
            <ul className="divide-y divide-hb-line">
              {rows.map((row) => {
                const erUdfoldet = udfoldet === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setUdfoldet(erUdfoldet ? null : row.id)}
                      aria-expanded={erUdfoldet}
                      className={cn(
                        "grid w-full grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors sm:items-center",
                        GRID,
                        erUdfoldet ? "bg-hb-sage/20" : "hover:bg-hb-sage/20",
                      )}
                    >
                      <p className="whitespace-nowrap text-xs text-hb-ink-soft">
                        {format(new Date(row.created_at), "d. MMM HH:mm", { locale: da })}
                      </p>
                      <p className="truncate text-xs text-hb-ink">{row.template_name}</p>
                      <p className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-hb-ink">
                        {row.is_test && <FlaskConical className="h-3.5 w-3.5 shrink-0 text-hb-ink-soft" aria-label="Testmail" />}
                        <span className="truncate">{row.recipient_email}</span>
                      </p>
                      <div>
                        <StatusTag status={row.status} />
                      </div>
                      <span className="hidden justify-self-end text-hb-ink-soft sm:block">
                        {erUdfoldet ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </span>
                    </button>
                    {erUdfoldet && (
                      <div className="space-y-1.5 border-t border-hb-line/60 bg-hb-sage/10 px-4 py-3 text-xs text-hb-ink">
                        <p><span className="font-medium text-hb-ink-soft">Emne:</span> {row.subject || "—"}</p>
                        <p><span className="font-medium text-hb-ink-soft">Tidspunkt:</span> {format(new Date(row.created_at), "d. MMMM yyyy HH:mm:ss", { locale: da })}</p>
                        <p><span className="font-medium text-hb-ink-soft">Message-ID:</span> {row.message_id || "—"}</p>
                        {row.error_message && (
                          <p><span className="font-medium text-hb-rust">Fejl:</span> {row.error_message}</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!logQuery.isLoading && !logQuery.isError && rows.length > 0 && (
            <p className="border-t border-hb-line px-4 py-2 text-xs text-hb-ink-soft">
              {rows.length} {rows.length === 1 ? "mail" : "mails"}
              {rows.length >= LOFT ? ` · viser de seneste ${LOFT} rækker` : ""}
            </p>
          )}
        </div>
      )}
    </HbSection>
  );
};
