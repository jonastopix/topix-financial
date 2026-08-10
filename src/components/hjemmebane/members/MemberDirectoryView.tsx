import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listMemberDirectory, type MemberProfile } from "@/lib/hjemmebane/memberProfile";
import { HbCard } from "../HbCard";

/** Medlemsoversigten (/medlemmer): hele netværket som kort-grid med
    klient-side søgning — 31 medlemmer er for lidt til server-søgning.
    Rådgivere sidst under egen hårstreg. Tom søgning er en sætning,
    aldrig et tal (samme princip som deltagerlisten). */

const matchesQuery = (profile: MemberProfile, query: string): boolean => {
  const q = query.trim().toLocaleLowerCase("da");
  if (!q) return true;
  return [
    profile.full_name,
    profile.company_name ?? "",
    profile.industry_label ?? "",
    ...profile.expertise,
  ].some((field) => field.toLocaleLowerCase("da").includes(q));
};

/** Avatar efter forsidens afsender-portræt, i kortstørrelse. */
const CardAvatar = ({ profile }: { profile: MemberProfile }) =>
  profile.avatar_url ? (
    <img
      src={profile.avatar_url}
      alt={profile.full_name}
      className="h-11 w-11 shrink-0 rounded-full border border-hb-line object-cover"
    />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-lg text-hb-ink-soft">
      {profile.full_name.charAt(0)}
    </span>
  );

const ProfileCard = ({ profile }: { profile: MemberProfile }) => {
  // Virksomhed/branche vises uanset rolle (#252-lærdommen: rolle må aldrig
  // fortrænge virksomheden). Ingen "Rådgiver"-tekst på kortet — rådgiverne
  // står allerede under overskriften "Dine rådgivere".
  const metaLine = [profile.company_name, profile.industry_label].filter(Boolean).join(" · ");
  return (
    <li>
      <Link to={`/medlemmer/${profile.user_id}`} className="block h-full">
        <HbCard className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <CardAvatar profile={profile} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium leading-snug text-hb-ink">
                {profile.full_name}
              </p>
              {metaLine && <p className="truncate text-xs text-hb-ink-soft">{metaLine}</p>}
            </div>
          </div>
          {profile.expertise.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {profile.expertise.map((tag) => (
                <span key={tag} className="rounded-full bg-hb-sage/30 px-2 py-0.5 text-[11px] text-hb-ink">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </HbCard>
      </Link>
    </li>
  );
};

const CardSkeleton = () => (
  <li aria-hidden>
    <div className="rounded-hb border border-hb-line bg-hb-surface p-4">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-hb-line/40" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-3/5 animate-pulse rounded bg-hb-line/60" />
          <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-hb-line/40" />
        </div>
      </div>
    </div>
  </li>
);

export const MemberDirectoryView = () => {
  const [query, setQuery] = useState("");

  const directoryQuery = useQuery({
    queryKey: ["member-directory"],
    queryFn: listMemberDirectory,
    staleTime: 5 * 60_000,
  });

  const filtered = (directoryQuery.data ?? []).filter((p) => matchesQuery(p, query));
  const members = filtered.filter((p) => !p.is_advisor);
  const advisors = filtered.filter((p) => p.is_advisor);

  return (
    <div>
      {/* ── Header (Events-mønstret): fladens navn som eyebrow, en
          SÆTNING som rubrik. ── */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Netværket</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Folk der står, hvor du står.
        </h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Find de andre medlemmer — se hvad de er gode til, og tag fat i dem der ved noget, du mangler.
        </p>
      </section>

      <div className="mt-10">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søg på navn, virksomhed, branche eller kompetence…"
          className="w-full max-w-md rounded-full border border-hb-line bg-hb-surface px-5 py-2.5 text-sm text-hb-ink placeholder:text-hb-ink-soft focus:outline-none focus:ring-2 focus:ring-hb-evergreen/40"
        />
      </div>

      {directoryQuery.isLoading ? (
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </ul>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-hb-ink-soft">Ingen match på "{query.trim()}"</p>
      ) : (
        <>
          {members.length > 0 && (
            <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {members.map((p) => (
                <ProfileCard key={p.user_id} profile={p} />
              ))}
            </ul>
          )}

          {/* Rådgiverne sidst, under egen hårstreg — de er en anden slags
              hjælp end et medlemsnetværk, og skal ikke blandes ind. */}
          {advisors.length > 0 && (
            <div className="mt-12 border-t border-hb-line pt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-hb-ink-soft">
                Dine rådgivere
              </p>
              <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {advisors.map((p) => (
                  <ProfileCard key={p.user_id} profile={p} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};
