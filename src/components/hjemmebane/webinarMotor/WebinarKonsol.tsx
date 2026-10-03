import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HbSection } from "@/components/hjemmebane/HbSection";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbTextarea } from "@/components/hjemmebane/admin/HbField";
import { useAuth } from "@/hooks/useAuth";
import { useIRummet, useKonsolSession, useServerForskydning, useSpoergsmaalKoe, useSvarSpoergsmaal } from "@/hooks/webinarKonsol";
import {
  erUbesvaret,
  KONSOL_SVAR_MAKS,
  konsolFejlArt,
  konsolPosition,
  type KonsolSpoergsmaal,
  leveringTekst,
  OPSAETNING_STI,
  posTekst,
  RUM_ORD,
  sorterKoe,
  visSvarfelt,
} from "@/lib/webinarMotorAdmin/konsol";
import { tidskode } from "@/lib/webinarMotorAdmin/opsaetning";
import { sessionTekst } from "@/lib/webinarRum/links";

/**
 * /webinar/motor/session/:id — værtskonsollen, MINIMAL (3/10-2026,
 * docs/webinarmotor.md §7.7). Sessionens titel, tid og rum (motorens
 * positionDom på serverens ur), antal i rummet nu, og spørgsmålskøen hentet
 * hvert 10. sekund (ingen Realtime) med ét svarfelt pr. ubesvaret spørgsmål.
 * Alle hooks står i topblokken (React #310); rækkerne er rene props-komponenter.
 */
const MIGRATION_TEKST = "Konsollen virker, når migrationen er kørt.";

export const WebinarKonsol = ({ sessionId }: { sessionId: string | undefined }) => {
  const { erTjenestekonto } = useAuth();
  const session = useKonsolSession(sessionId);
  const ur = useServerForskydning();
  const [nu, setNu] = useState(() => Date.now());
  const forskydning = ur.data ?? null;
  const iRummet = useIRummet(sessionId, () => Date.now() + (forskydning ?? 0));
  const koe = useSpoergsmaalKoe(sessionId);
  const svar = useSvarSpoergsmaal(sessionId);
  const [udkast, setUdkast] = useState<Record<string, string>>({});
  const [fejl, setFejl] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = window.setInterval(() => setNu(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const send = async (id: string) => {
    setFejl((f) => ({ ...f, [id]: "" }));
    try {
      await svar.mutateAsync({ id, svar: udkast[id] ?? "" });
      setUdkast((u) => ({ ...u, [id]: "" }));
    } catch (e) {
      setFejl((f) => ({ ...f, [id]: e instanceof Error ? e.message : "Det gik ikke." }));
    }
  };

  const migrationMangler = (session.isError && konsolFejlArt(session.error) === "migration") || (koe.isError && konsolFejlArt(koe.error) === "migration");

  if (migrationMangler) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 md:px-6" data-webinar-konsol="migration">
        <HbSection eyebrow="Webinarmotoren" title="Værtskonsollen" hairline className="mt-10 md:mt-12">
          <p className="text-sm text-hb-ink-soft">{MIGRATION_TEKST}</p>
        </HbSection>
      </div>
    );
  }

  const s = session.data ?? null;
  const pos = s
    ? konsolPosition(
        { starterMs: Date.parse(s.starter_at), varighedSek: s.webinar.varighed_sek, introSek: s.webinar.intro_sek, lobbyMin: s.webinar.lobby_min, exitrumMin: s.webinar.exitrum_min, status: s.status },
        nu,
        forskydning ?? 0,
      )
    : null;
  const liste = sorterKoe(koe.data ?? []);
  const ubesvarede = liste.filter(erUbesvaret).length;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 md:px-6" data-webinar-konsol>
      <HbSection eyebrow="Værtskonsollen" title={s?.webinar.titel ?? "Session"} hairline className="mt-10 md:mt-12">
        <p className="mb-4 text-sm">
          <Link to={OPSAETNING_STI} className="text-hb-ink-soft underline underline-offset-2">Tilbage til opsætningen</Link>
        </p>
        {session.isPending ? (
          <div className="h-16 animate-pulse rounded-hb bg-hb-line/60" />
        ) : session.isError ? (
          <p className="text-sm text-hb-rust">Sessionen kunne ikke hentes.</p>
        ) : !s || !pos ? (
          <p className="text-sm text-hb-ink-soft">Sessionen findes ikke.</p>
        ) : (
          <HbCard className="p-5 md:p-6">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-hb-ink-soft">Tid</dt>
                <dd className="text-hb-ink first-letter:uppercase">{sessionTekst(s.starter_at)}{s.intern ? " · intern prøve" : ""}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-hb-ink-soft">Rum</dt>
                <dd className="text-hb-ink" data-konsol-rum={pos.rum}>
                  {RUM_ORD[pos.rum]}
                  {pos.rum === "afspilning" ? ` · ${tidskode(pos.forventetPosSek)} af ${tidskode(s.webinar.varighed_sek)}` : ""}
                  {pos.rum === "foer_lobby" || pos.rum === "lobby" ? ` · starter om ${tidskode(pos.sekTilStart)}` : ""}
                </dd>
                {forskydning === null && <dd className="text-xs text-hb-ink-soft">Efter dit ur — serverens ur kan ikke læses endnu.</dd>}
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-hb-ink-soft">I rummet nu</dt>
                <dd className="text-hb-ink" data-konsol-i-rummet>{iRummet.isError ? "—" : iRummet.data ?? "…"}</dd>
              </div>
            </dl>
          </HbCard>
        )}
      </HbSection>

      <HbSection eyebrow="Spørgsmål" title={ubesvarede > 0 ? `${ubesvarede} ubesvarede` : "Spørgsmålskøen"} hairline className="mt-10">
        <p className="mb-4 text-xs text-hb-ink-soft">Opdateres hvert 10. sekund. Svaret vises for seeren ved næste puls, hvis seeren stadig er i rummet — der sendes intet på mail.</p>
        {koe.isPending ? (
          <div className="h-16 animate-pulse rounded-hb bg-hb-line/60" />
        ) : koe.isError ? (
          <p className="text-sm text-hb-rust">Spørgsmålene kunne ikke hentes.</p>
        ) : liste.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">Ingen spørgsmål endnu.</p>
        ) : (
          <ul data-konsol-koe={liste.length}>
            {liste.map((q) => (
              <SpoergsmaalRaekke
                key={q.id}
                q={q}
                kanSvare={visSvarfelt(q, erTjenestekonto)}
                udkast={udkast[q.id] ?? ""}
                fejl={fejl[q.id] ?? ""}
                travl={svar.isPending && svar.variables?.id === q.id}
                onUdkast={(v) => setUdkast((u) => ({ ...u, [q.id]: v }))}
                onSend={() => void send(q.id)}
              />
            ))}
          </ul>
        )}
      </HbSection>
    </div>
  );
};

interface RaekkeProps {
  q: KonsolSpoergsmaal;
  /** visSvarfelt: ubesvaret OG ikke en tjenestekonto. */
  kanSvare: boolean;
  udkast: string;
  fejl: string;
  travl: boolean;
  onUdkast: (v: string) => void;
  onSend: () => void;
}

/** Ét spørgsmål. Ingen hooks — al tilstand bor i konsollen. */
function SpoergsmaalRaekke({ q, kanSvare, udkast, fejl, travl, onUdkast, onSend }: RaekkeProps) {
  const feltId = `konsol-svar-${q.id}`;
  return (
    <li className="border-t border-hb-line py-4 last:border-b" data-konsol-spoergsmaal={q.status}>
      <p className="text-xs uppercase tracking-[0.1em] text-hb-ink-soft">
        {q.fornavn ?? "Seer"} · {posTekst(q.pos_sek)}{q.art === "haand" ? " · hånd oppe" : ""} · {leveringTekst(q)}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-hb-ink">{q.tekst}</p>
      {q.svar_tekst && (
        <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-hb-line pl-3 text-sm text-hb-ink-soft">{q.svar_tekst}</p>
      )}
      {kanSvare && (
        <div className="mt-3">
          <label htmlFor={feltId} className="sr-only">Dit svar</label>
          <HbTextarea id={feltId} rows={2} maxLength={KONSOL_SVAR_MAKS} value={udkast} onChange={(e) => onUdkast(e.target.value)} placeholder="Dit svar" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <HbButton onClick={onSend} disabled={travl}>{travl ? "Sender …" : "Svar"}</HbButton>
            <span className="text-xs text-hb-ink-soft">{udkast.trim().length}/{KONSOL_SVAR_MAKS}</span>
            {fejl && <span className="text-sm text-hb-rust" role="alert">{fejl}</span>}
          </div>
        </div>
      )}
    </li>
  );
}
