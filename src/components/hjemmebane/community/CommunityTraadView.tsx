import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  hentSvar,
  hentTraad,
  registrerVisning,
  type CommunitySvar,
} from "@/lib/hjemmebane/communityApi";

/** Trådsiden (/community/:id) — LÆSE-leddet: tråden med sine svar,
    kronologisk. Composer og svar-knap kommer i et senere led.
    Ikke-fundet håndteres blødt (EventDetailView-mønstret: venlig tekst +
    tilbage-link, ingen throw) — og tom kan også betyde "ingen adgang";
    de to kan bevidst ikke skelnes (jf. communityApi.hentTraad). */

const BackLink = () => (
  <Link
    to="/community"
    className="inline-flex items-center gap-1.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
  >
    <ArrowLeft className="h-4 w-4" /> Tilbage til fællesskabet
  </Link>
);

const fmtDato = (iso: string): string =>
  new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

/** Samme avatar-form som feedet (ParticipantAvatar-mønstret). */
const ForfatterAvatar = ({ navn, avatarUrl }: { navn: string | null; avatarUrl: string | null }) =>
  avatarUrl ? (
    <img
      src={avatarUrl}
      alt={navn ?? "Medlem"}
      className="h-9 w-9 shrink-0 rounded-full border border-hb-line object-cover"
    />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-sm text-hb-ink-soft">
      {(navn ?? "?").charAt(0)}
    </span>
  );

const SvarRaekke = ({ svar }: { svar: CommunitySvar }) => (
  <li className="flex items-start gap-4 border-t border-hb-line py-5 last:border-b">
    <ForfatterAvatar navn={svar.forfatter_navn} avatarUrl={svar.forfatter_avatar_url} />
    <div className="min-w-0 flex-1">
      <p className="text-sm text-hb-ink">
        <span className="font-medium">{svar.forfatter_navn ?? "Medlem"}</span>
        <span className="text-hb-ink-soft"> · {fmtDato(svar.created_at)}</span>
      </p>
      {/* Ren tekst i dette led — composeren og HTML-håndteringen kommer i
          et senere led, og indtil da renderes intet indhold som markup. */}
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-hb-ink">{svar.indhold}</p>
    </div>
  </li>
);

export const CommunityTraadView = ({ traadId }: { traadId: string }) => {
  const traadQuery = useQuery({
    queryKey: ["community", "traad", traadId],
    queryFn: () => hentTraad(traadId),
  });
  const svarQuery = useQuery({
    queryKey: ["community", "svar", traadId],
    queryFn: () => hentSvar(traadId),
  });

  // En visning er en bivirkning af at kigge, ikke en handling — fejl fra
  // registreringen må ALDRIG nå brugeren (RPC'en er selv stille ved
  // manglende adgang; her sluges også netværksfejl).
  useEffect(() => {
    if (traadId) registrerVisning(traadId).catch(() => {});
  }, [traadId]);

  if (traadQuery.isLoading) {
    return (
      <div>
        <BackLink />
        <div className="mt-8 h-6 w-1/2 animate-pulse rounded bg-hb-line/60" />
        <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-hb-line/40" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-hb-line/40" />
      </div>
    );
  }

  const traad = traadQuery.data;
  if (!traad) {
    return (
      <div>
        <BackLink />
        <p className="mt-8 text-sm text-hb-ink-soft">
          Tråden findes ikke — eller den er ikke længere åben.
        </p>
      </div>
    );
  }

  const svar = svarQuery.data ?? [];

  return (
    <div>
      <BackLink />

      <article className="mt-8">
        <div className="flex items-center gap-4">
          <ForfatterAvatar navn={traad.forfatter_navn} avatarUrl={traad.forfatter_avatar_url} />
          <p className="text-sm text-hb-ink">
            <span className="font-medium">{traad.forfatter_navn ?? "Medlem"}</span>
            <span className="text-hb-ink-soft"> · {fmtDato(traad.created_at)}</span>
          </p>
        </div>
        <h1 className="mt-4 font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">
          {traad.titel}
        </h1>
        {/* Ren tekst i dette led — composeren og HTML-håndteringen kommer i
            et senere led; dangerouslySetInnerHTML bruges bevidst ikke. */}
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-hb-ink">
          {traad.indhold}
        </p>
      </article>

      <section className="mt-10">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Svar</p>
        {svarQuery.isLoading ? (
          <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-hb-line/40" />
        ) : svar.length === 0 ? (
          <p className="mt-4 text-sm text-hb-ink-soft">Ingen svar endnu.</p>
        ) : (
          <ul className="mt-4 list-none">
            {svar.map((s) => (
              <SvarRaekke key={s.id} svar={s} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
